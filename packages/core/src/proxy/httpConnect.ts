import net from 'node:net';
import tls from 'node:tls';

import { BufferedSocketReader } from './streamUtil';
import type { UpstreamConfig } from './types';

/**
 * Connects to an upstream HTTP or HTTPS proxy and issues an HTTP CONNECT command
 * to establish a TCP tunnel to targetHost:targetPort.
 */
export async function connectHttpUpstream(
  upstream: UpstreamConfig,
  targetHost: string,
  targetPort: number,
  timeoutMs = 15000,
): Promise<{ socket: net.Socket; reader: BufferedSocketReader }> {
  let sock: net.Socket;

  if (upstream.protocol === 'https') {
    sock = tls.connect({
      host: upstream.host,
      port: upstream.port,
      servername: upstream.host,
      // Certificate validation stays on. Disabling it means anyone able to
      // intercept the connection to the upstream proxy can read the tunneled
      // traffic and the credentials in Proxy-Authorization, and can present
      // themselves as the proxy. Set NODE_EXTRA_CA_CERTS for a private CA.
      rejectUnauthorized: true,
    });
  } else {
    sock = net.connect(upstream.port, upstream.host);
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`Timeout connecting to upstream HTTP proxy ${upstream.host}:${upstream.port}`));
    }, timeoutMs);

    sock.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    sock.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const reader = new BufferedSocketReader(sock);

  // Build CONNECT request
  const hostHeader = `${targetHost}:${targetPort}`;
  let req = `CONNECT ${hostHeader} HTTP/1.1\r\nHost: ${hostHeader}\r\n`;

  if (upstream.username) {
    const creds = `${upstream.username}:${upstream.password ?? ''}`;
    const b64 = Buffer.from(creds, 'utf-8').toString('base64');
    req += `Proxy-Authorization: Basic ${b64}\r\n`;
  }

  req += 'Proxy-Connection: Keep-Alive\r\n\r\n';
  sock.write(req);

  // Read response headers
  const responseHeader = await reader.readUntil('\r\n\r\n', 65536, timeoutMs);
  const statusLine = responseHeader.split('\r\n')[0] ?? '';

  if (!/^HTTP\/1\.[01]\s+200/i.test(statusLine)) {
    sock.destroy();
    if (statusLine.includes('407')) {
      throw new Error(`PROXY_AUTH_FAILED: HTTP proxy authentication required/failed (${statusLine})`);
    }
    throw new Error(`HTTP_CONNECT_FAILED: Upstream HTTP proxy returned ${statusLine}`);
  }

  return { socket: sock, reader };
}

/**
 * Handles incoming client HTTP CONNECT request and sends 200 Connection Established.
 */
export async function handleHttpClientHandshake(
  clientReader: BufferedSocketReader,
  clientSocket: net.Socket,
  timeoutMs = 15000,
): Promise<{ targetHost: string; targetPort: number }> {
  const head = await clientReader.readUntil('\r\n\r\n', 65536, timeoutMs);
  const firstLine = head.split('\r\n')[0] ?? '';
  const match = firstLine.match(/^CONNECT\s+([^:\s]+):(\d+)\s+HTTP\//i);

  if (!match) {
    clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    throw new Error(`Invalid HTTP CONNECT request: ${firstLine}`);
  }

  const targetHost = match[1] ?? '';
  const targetPort = Number.parseInt(match[2] ?? '', 10);

  return { targetHost, targetPort };
}

/**
 * Sends HTTP 200 Connection Established reply to client.
 */
export function sendHttpSuccessReply(clientSocket: net.Socket): void {
  clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
}
