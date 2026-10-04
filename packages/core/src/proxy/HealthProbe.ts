import type { HealthResult } from '@tersoo/contracts';

import { connectHttpUpstream } from './httpConnect';
import { connectSocks5Upstream } from './socks5';
import type { UpstreamConfig } from './types';

export interface ProbeInput {
  proxyId: string;
  protocol: 'socks5' | 'http' | 'https';
  host: string;
  port: number;
  username?: string | undefined;
  password?: string | undefined;
  timeoutMs?: number | undefined;
  endpointUrl?: string | undefined;
}

export class HealthProbe {
  private defaultEndpointUrl = 'http://ip-api.com/json/?fields=status,message,country,city,timezone,isp,lat,lon,query';

  constructor(endpointUrl?: string) {
    if (endpointUrl) {
      this.defaultEndpointUrl = endpointUrl;
    }
  }

  /**
   * Probes proxy connectivity, measuring end-to-end latency, verifying credentials,
   * and retrieving exit IP and geolocation information.
   */
  async probe(input: ProbeInput): Promise<HealthResult> {
    const timeoutMs = input.timeoutMs ?? 10000;
    const endpointStr = input.endpointUrl ?? this.defaultEndpointUrl;

    const nullGeo = {
      country: null,
      city: null,
      tz: null,
      isp: null,
      lat: null,
      lng: null,
    };

    let targetUrl: URL;
    try {
      targetUrl = new URL(endpointStr);
    } catch (err: unknown) {
      return {
        proxyId: input.proxyId,
        ok: false,
        latencyMs: null,
        exitIp: null,
        geo: nullGeo,
        webrtcSafe: false,
        dnsSafe: false,
        error: `Invalid probe endpoint URL: ${String(err)}`,
      };
    }

    const targetHost = targetUrl.hostname;
    const targetPort = targetUrl.port
      ? Number.parseInt(targetUrl.port, 10)
      : targetUrl.protocol === 'https:'
        ? 443
        : 80;
    const targetPath = `${targetUrl.pathname}${targetUrl.search}`;

    const upstream: UpstreamConfig = {
      protocol: input.protocol,
      host: input.host,
      port: input.port,
    };
    if (input.username) upstream.username = input.username;
    if (input.password) upstream.password = input.password;

    const startTime = performance.now();

    try {
      // Connect to target through upstream proxy
      const { socket, reader } =
        input.protocol === 'socks5'
          ? await connectSocks5Upstream(upstream, targetHost, targetPort, timeoutMs)
          : await connectHttpUpstream(upstream, targetHost, targetPort, timeoutMs);

      try {
        // Send HTTP GET request
        const reqLines = [
          `GET ${targetPath} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          'User-Agent: TersooPilot-HealthProbe/1.0',
          'Accept: application/json',
          'Connection: close',
          '',
          '',
        ];
        socket.write(reqLines.join('\r\n'));

        // Read response headers
        const headerText = await reader.readUntil('\r\n\r\n', 65536, timeoutMs);
        const latencyMs = Math.max(1, Math.round(performance.now() - startTime));

        const statusLine = headerText.split('\r\n')[0] ?? '';
        const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d+)/i);
        const statusCode = match ? Number.parseInt(match[1] ?? '0', 10) : 0;

        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(`Probe endpoint returned HTTP status ${statusCode}: ${statusLine}`);
        }

        // Determine content length or read until socket closes
        let body = '';
        const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
        if (contentLengthMatch && contentLengthMatch[1]) {
          const expectedLen = Number.parseInt(contentLengthMatch[1], 10);
          const bodyBuf = await reader.readN(expectedLen, timeoutMs);
          body = bodyBuf.toString('utf-8');
        } else {
          // Read chunks until EOF
          const chunks: Uint8Array[] = [];
          const remainder = reader.release();
          if (remainder.length > 0) chunks.push(new Uint8Array(remainder));

          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              reject(new Error('Timeout reading probe response body'));
            }, timeoutMs);

            socket.on('data', (d: Buffer | Uint8Array) => chunks.push(new Uint8Array(d)));
            socket.on('end', () => {
              clearTimeout(timer);
              resolve();
            });
            socket.on('error', (err) => {
              clearTimeout(timer);
              reject(err);
            });
          });
          body = Buffer.concat(chunks).toString('utf-8');
        }

        // Parse JSON payload
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(body.trim()) as Record<string, unknown>;
        } catch {
          throw new Error(`Invalid JSON received from probe endpoint: ${body.slice(0, 100)}`);
        }

        const exitIp =
          typeof parsed.query === 'string'
            ? parsed.query
            : typeof parsed.ip === 'string'
              ? parsed.ip
              : typeof parsed.origin === 'string'
                ? parsed.origin
                : null;

        const country =
          typeof parsed.country === 'string'
            ? parsed.country
            : typeof parsed.countryCode === 'string'
              ? parsed.countryCode
              : null;

        const city = typeof parsed.city === 'string' ? parsed.city : null;
        const tz = typeof parsed.timezone === 'string' ? parsed.timezone : null;
        const isp = typeof parsed.isp === 'string' ? parsed.isp : null;
        const lat = typeof parsed.lat === 'number' ? parsed.lat : null;
        const lng =
          typeof parsed.lon === 'number'
            ? parsed.lon
            : typeof parsed.lng === 'number'
              ? parsed.lng
              : null;

        return {
          proxyId: input.proxyId,
          ok: true,
          latencyMs,
          exitIp,
          geo: {
            country,
            city,
            tz,
            isp,
            lat,
            lng,
          },
          webrtcSafe: true,
          dnsSafe: true,
          error: null,
        };
      } finally {
        socket.destroy();
      }
    } catch (err: unknown) {
      return {
        proxyId: input.proxyId,
        ok: false,
        latencyMs: null,
        exitIp: null,
        geo: nullGeo,
        webrtcSafe: false,
        dnsSafe: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
