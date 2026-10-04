import crypto from 'node:crypto';
import net from 'node:net';

import { connectHttpUpstream } from './httpConnect';
import {
  FORWARDER_USERNAME,
  buildAuthenticatedProxyUrl,
  createForwarderToken,
  secretsMatch,
} from './proxyUrl';
import { connectSocks5Upstream, sendSocks5SuccessReply } from './socks5';
import { BufferedSocketReader } from './streamUtil';
import type { ForwarderCredentials, ForwarderHandle, UpstreamConfig } from './types';

interface ForwarderInstance {
  handle: ForwarderHandle;
  server: net.Server;
  activeSockets: Set<net.Socket>;
}

export interface LocalForwarderStartOptions {
  upstream: UpstreamConfig;
  bind?: string | undefined;
  timeoutMs?: number | undefined;
  /** Supply a token to make the value deterministic in tests. */
  authToken?: string | undefined;
  /** Hard cap on simultaneous client connections. */
  maxConnections?: number | undefined;
  /** Idle timeout for an established tunnel, in ms. */
  idleTimeoutMs?: number | undefined;
}

const DEFAULT_MAX_CONNECTIONS = 256;
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** A socket carrying its current idle-reaper handle. */
type IdleCapableSocket = net.Socket & { __tersooIdle?: NodeJS.Timeout | undefined };

export class LocalForwarder {
  private instances = new Map<string, ForwarderInstance>();

  getBoundCount(): number {
    return this.instances.size;
  }

  /**
   * Starts a local proxy forwarder.
   *
   * The forwarder accepts SOCKS5 or HTTP CONNECT on loopback and tunnels to the
   * authenticated upstream proxy. Clients must present the per-instance token
   * minted here; an unauthenticated client is rejected before any upstream
   * connection is opened, so a local process cannot spend the account's proxy
   * bandwidth or borrow the profile's exit IP.
   */
  async start(input: LocalForwarderStartOptions): Promise<ForwarderHandle> {
    const id = crypto.randomUUID();
    const bind = input.bind ?? '127.0.0.1';
    const timeoutMs = input.timeoutMs ?? 15000;
    const maxConnections = input.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
    const idleTimeoutMs = input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

    assertLoopbackBind(bind);

    const token = input.authToken ?? createForwarderToken();
    const credentials: ForwarderCredentials = {
      username: FORWARDER_USERNAME,
      password: token,
    };

    const activeSockets = new Set<net.Socket>();

    const server = net.createServer((client) => {
      if (activeSockets.size >= maxConnections) {
        client.destroy();
        return;
      }

      activeSockets.add(client);
      const cleanupClient = () => {
        activeSockets.delete(client);
      };
      client.once('close', cleanupClient);
      client.once('error', cleanupClient);

      this.handleClient(client, input.upstream, credentials, activeSockets, timeoutMs, idleTimeoutMs).catch(
        () => {
          client.destroy();
        },
      );
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, bind, () => resolve());
    });

    const port = (server.address() as net.AddressInfo).port;

    const stop = async (): Promise<void> => {
      this.instances.delete(id);
      for (const socket of activeSockets) {
        socket.destroy();
      }
      activeSockets.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    };

    const handle: ForwarderHandle = {
      id,
      port,
      bind,
      credentials,
      proxyUrl: buildAuthenticatedProxyUrl(port, credentials),
      stop,
    };

    this.instances.set(id, {
      handle,
      server,
      activeSockets,
    });

    return handle;
  }

  async stop(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;
    await instance.handle.stop();
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.instances.keys());
    await Promise.allSettled(ids.map((id) => this.stop(id)));
  }

  getHandle(id: string): ForwarderHandle | undefined {
    return this.instances.get(id)?.handle;
  }

  getActiveCount(): number {
    return this.instances.size;
  }

  private async handleClient(
    client: net.Socket,
    upstream: UpstreamConfig,
    credentials: ForwarderCredentials,
    activeSockets: Set<net.Socket>,
    timeoutMs: number,
    idleTimeoutMs: number,
  ): Promise<void> {
    const clientReader = new BufferedSocketReader(client);

    // Read first byte to detect protocol (0x05 for SOCKS5, ASCII 'C' (0x43) for CONNECT)
    const firstByteBuf = await clientReader.readN(1, timeoutMs);
    const firstByte = firstByteBuf[0];

    let targetHost = '';
    let targetPort = 0;
    let isSocks = false;

    if (firstByte === 0x05) {
      isSocks = true;
      // SOCKS5 greeting
      const nmethodsBuf = await clientReader.readN(1, timeoutMs);
      const nmethods = nmethodsBuf[0] ?? 0;
      const methods = await clientReader.readN(nmethods, timeoutMs);

      // Only username/password (0x02) is offered. NO_AUTH is never accepted:
      // that was the vulnerability this replaces.
      if (!methods.includes(0x02)) {
        client.write(new Uint8Array([0x05, 0xff]));
        throw new Error('FORWARDER_AUTH_REQUIRED: SOCKS5 client does not support username/password auth');
      }
      client.write(new Uint8Array([0x05, 0x02]));

      await this.authenticateSocksClient(clientReader, client, credentials, timeoutMs);

      const reqHeader = await clientReader.readN(4, timeoutMs);
      const cmd = reqHeader[1];
      if (cmd !== 0x01) {
        client.write(new Uint8Array([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        throw new Error(`Command ${cmd} not supported`);
      }

      const atyp = reqHeader[3];
      if (atyp === 0x01) {
        const ipBuf = await clientReader.readN(4, timeoutMs);
        targetHost = Array.from(ipBuf).join('.');
      } else if (atyp === 0x03) {
        const len = (await clientReader.readN(1, timeoutMs))[0] ?? 0;
        const dom = await clientReader.readN(len, timeoutMs);
        targetHost = dom.toString('utf-8');
      } else if (atyp === 0x04) {
        const ipv6Buf = await clientReader.readN(16, timeoutMs);
        const groups: string[] = [];
        for (let i = 0; i < 8; i++) {
          groups.push(ipv6Buf.readUInt16BE(i * 2).toString(16));
        }
        targetHost = groups.join(':');
      } else {
        throw new Error(`Unsupported address type: ${atyp}`);
      }

      const pBuf = await clientReader.readN(2, timeoutMs);
      targetPort = pBuf.readUInt16BE(0);
    } else if (firstByte === 0x43) {
      // 'C' of CONNECT
      const rest = await clientReader.readUntil('\r\n\r\n', 65536, timeoutMs);
      const fullHeader = `C${rest}`;
      const firstLine = fullHeader.split('\r\n')[0] ?? '';
      const match = firstLine.match(/^CONNECT\s+([^:\s]+):(\d+)\s+HTTP\//i);
      if (!match) {
        client.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        throw new Error(`Invalid HTTP CONNECT: ${firstLine}`);
      }
      targetHost = match[1] ?? '';
      targetPort = Number.parseInt(match[2] ?? '', 10);

      this.authenticateHttpClient(fullHeader, client, credentials);
    } else {
      client.destroy();
      throw new Error(`Unrecognized client protocol start byte: ${firstByte}`);
    }

    // Connect to upstream proxy only after the client has authenticated.
    const { socket: upstreamSock, reader: upstreamReader } = await this.connectUpstream(
      upstream,
      targetHost,
      targetPort,
      timeoutMs,
    );

    activeSockets.add(upstreamSock);
    const cleanupUpstream = () => {
      activeSockets.delete(upstreamSock);
    };
    upstreamSock.once('close', cleanupUpstream);
    upstreamSock.once('error', cleanupUpstream);

    if (isSocks) {
      sendSocks5SuccessReply(client);
    } else {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    }

    const clientRemainder = clientReader.release();
    if (clientRemainder.length > 0) {
      upstreamSock.write(new Uint8Array(clientRemainder));
    }

    const upstreamRemainder = upstreamReader.release();
    if (upstreamRemainder.length > 0) {
      client.write(new Uint8Array(upstreamRemainder));
    }

    // Reset the idle timer on activity so long-lived browsing sessions survive
    // while abandoned tunnels are reclaimed.
    const touch = () => {
      armIdle(client, upstreamSock, idleTimeoutMs);
    };
    client.on('data', touch);
    upstreamSock.on('data', touch);
    armIdle(client, upstreamSock, idleTimeoutMs);

    client.pipe(upstreamSock).pipe(client);

    client.on('error', () => {
      upstreamSock.destroy();
    });
    upstreamSock.on('error', () => {
      client.destroy();
    });
  }

  /**
   * RFC 1929 username/password sub-negotiation against the client.
   */
  private async authenticateSocksClient(
    reader: BufferedSocketReader,
    client: net.Socket,
    credentials: ForwarderCredentials,
    timeoutMs: number,
  ): Promise<void> {
    const header = await reader.readN(2, timeoutMs);
    const ver = header[0];
    const ulen = header[1] ?? 0;

    if (ver !== 0x01) {
      throw new Error(`Unsupported SOCKS5 auth version: ${ver}`);
    }

    const username = (await reader.readN(ulen, timeoutMs)).toString('utf-8');
    const plen = (await reader.readN(1, timeoutMs))[0] ?? 0;
    const password = (await reader.readN(plen, timeoutMs)).toString('utf-8');

    const userOk = secretsMatch(username, credentials.username);
    const passOk = secretsMatch(password, credentials.password);

    if (!userOk || !passOk) {
      client.write(new Uint8Array([0x01, 0x01]));
      throw new Error('FORWARDER_AUTH_FAILED: SOCKS5 client presented invalid forwarder credentials');
    }

    client.write(new Uint8Array([0x01, 0x00]));
  }

  /**
   * Requires `Proxy-Authorization: Basic` matching the instance token.
   */
  private authenticateHttpClient(
    headerText: string,
    client: net.Socket,
    credentials: ForwarderCredentials,
  ): void {
    const match = headerText.match(/^proxy-authorization:\s*Basic\s+(\S+)\s*$/im);
    if (!match) {
      client.write(
        'HTTP/1.1 407 Proxy Authentication Required\r\n' +
          'Proxy-Authenticate: Basic realm="tersoopilot"\r\n\r\n',
      );
      throw new Error('FORWARDER_AUTH_REQUIRED: HTTP CONNECT client did not present Proxy-Authorization');
    }

    let decoded = '';
    try {
      decoded = Buffer.from(match[1] ?? '', 'base64').toString('utf-8');
    } catch {
      decoded = '';
    }

    const sep = decoded.indexOf(':');
    const username = sep === -1 ? decoded : decoded.slice(0, sep);
    const password = sep === -1 ? '' : decoded.slice(sep + 1);

    if (!secretsMatch(username, credentials.username) || !secretsMatch(password, credentials.password)) {
      client.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      throw new Error('FORWARDER_AUTH_FAILED: HTTP CONNECT client presented invalid forwarder credentials');
    }
  }

  private async connectUpstream(
    upstream: UpstreamConfig,
    targetHost: string,
    targetPort: number,
    timeoutMs: number,
  ): Promise<{ socket: net.Socket; reader: BufferedSocketReader }> {
    if (upstream.protocol === 'socks5') {
      return connectSocks5Upstream(upstream, targetHost, targetPort, timeoutMs);
    }
    return connectHttpUpstream(upstream, targetHost, targetPort, timeoutMs);
  }
}

function assertLoopbackBind(bind: string): void {
  const allowed = new Set(['127.0.0.1', '::1', 'localhost']);
  if (!allowed.has(bind)) {
    throw new Error(
      `Refusing to bind the credentialed proxy forwarder to a non-loopback address: ${bind}`,
    );
  }
}

function armIdle(a: net.Socket, b: net.Socket, timeoutMs: number): void {
  const sockets = [a, b] as IdleCapableSocket[];
  for (const s of sockets) {
    if (s.__tersooIdle) clearTimeout(s.__tersooIdle);
  }
  const timer = setTimeout(() => {
    for (const s of sockets) {
      if (s.__tersooIdle) clearTimeout(s.__tersooIdle);
      s.__tersooIdle = undefined;
      s.destroy();
    }
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  for (const s of sockets) s.__tersooIdle = timer;
}
