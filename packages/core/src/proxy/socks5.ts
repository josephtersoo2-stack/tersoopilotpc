import net from 'node:net';

import { BufferedSocketReader } from './streamUtil';
import type { UpstreamConfig } from './types';

/**
 * Parses client SOCKS5 handshake (greeting and CONNECT request).
 */
export async function handleSocks5ClientHandshake(
  clientReader: BufferedSocketReader,
  clientSocket: net.Socket,
  timeoutMs = 15000,
): Promise<{ targetHost: string; targetPort: number }> {
  // 1. Read greeting: [ver, nmethods]
  const greetingHeader = await clientReader.readN(2, timeoutMs);
  if (greetingHeader[0] !== 0x05) {
    throw new Error(`Unsupported SOCKS version: ${greetingHeader[0]}`);
  }
  const nmethods = greetingHeader[1] ?? 0;
  await clientReader.readN(nmethods, timeoutMs);

  // Reply: SOCKS5 with NO_AUTH (0x00)
  clientSocket.write(Buffer.from([0x05, 0x00]));

  // 2. Read request: [ver, cmd, rsv, atyp]
  const reqHeader = await clientReader.readN(4, timeoutMs);
  if (reqHeader[0] !== 0x05) {
    throw new Error(`Invalid SOCKS5 request version: ${reqHeader[0]}`);
  }

  const cmd = reqHeader[1];
  if (cmd !== 0x01) {
    // Command not supported (0x07)
    clientSocket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    throw new Error(`Unsupported SOCKS5 command: ${cmd} (only CONNECT 0x01 supported)`);
  }

  const atyp = reqHeader[3];
  let targetHost = '';

  if (atyp === 0x01) {
    // IPv4
    const ipBuf = await clientReader.readN(4, timeoutMs);
    targetHost = Array.from(ipBuf).join('.');
  } else if (atyp === 0x03) {
    // Domain name: 1 byte length followed by domain string
    const lenBuf = await clientReader.readN(1, timeoutMs);
    const domainLen = lenBuf[0] ?? 0;
    const domainBuf = await clientReader.readN(domainLen, timeoutMs);
    targetHost = domainBuf.toString('utf-8');
  } else if (atyp === 0x04) {
    // IPv6: 16 bytes
    const ipv6Buf = await clientReader.readN(16, timeoutMs);
    const groups: string[] = [];
    for (let i = 0; i < 8; i++) {
      groups.push(ipv6Buf.readUInt16BE(i * 2).toString(16));
    }
    targetHost = groups.join(':');
  } else {
    throw new Error(`Unsupported SOCKS5 address type: ${atyp}`);
  }

  const portBuf = await clientReader.readN(2, timeoutMs);
  const targetPort = portBuf.readUInt16BE(0);

  return { targetHost, targetPort };
}

/**
 * Sends success reply to SOCKS5 client.
 */
export function sendSocks5SuccessReply(clientSocket: net.Socket): void {
  // SOCKS5 reply: [ver=5, rep=0 (success), rsv=0, atyp=1 (ipv4), 0,0,0,0, 0,0]
  clientSocket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
}

/**
 * Connects to upstream SOCKS5 proxy server and establishes a tunnel to targetHost:targetPort.
 */
export async function connectSocks5Upstream(
  upstream: UpstreamConfig,
  targetHost: string,
  targetPort: number,
  timeoutMs = 15000,
): Promise<{ socket: net.Socket; reader: BufferedSocketReader }> {
  const sock = net.connect(upstream.port, upstream.host);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`Timeout connecting to upstream SOCKS5 proxy ${upstream.host}:${upstream.port}`));
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

  // 1. Send greeting with supported methods
  const hasAuth = Boolean(upstream.username);
  if (hasAuth) {
    // Support both NO_AUTH (0x00) and USER_PASS (0x02)
    sock.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
  } else {
    sock.write(Buffer.from([0x05, 0x01, 0x00]));
  }

  // 2. Read server method choice: [0x05, method]
  const choice = await reader.readN(2, timeoutMs);
  if (choice[0] !== 0x05) {
    sock.destroy();
    throw new Error(`Upstream SOCKS5 handshake invalid version: ${choice[0]}`);
  }

  const selectedMethod = choice[1];
  if (selectedMethod === 0xff) {
    sock.destroy();
    throw new Error('Upstream SOCKS5 proxy rejected authentication methods (0xFF)');
  }

  if (selectedMethod === 0x02) {
    // RFC 1929 username/password auth
    const uBuf = Buffer.from(upstream.username ?? '', 'utf-8');
    const pBuf = Buffer.from(upstream.password ?? '', 'utf-8');

    const authReq = Buffer.concat([
      Buffer.from([0x01, uBuf.length]),
      uBuf,
      Buffer.from([pBuf.length]),
      pBuf,
    ]);
    sock.write(authReq);

    const authReply = await reader.readN(2, timeoutMs);
    if (authReply[1] !== 0x00) {
      sock.destroy();
      throw new Error('PROXY_AUTH_FAILED: Upstream SOCKS5 authentication failed');
    }
  }

  // 3. Send CONNECT request to upstream
  const isIpv4 = net.isIPv4(targetHost);
  const isIpv6 = net.isIPv6(targetHost);

  let targetBuf: Buffer;
  let atyp: number;

  if (isIpv4) {
    atyp = 0x01;
    targetBuf = Buffer.from(targetHost.split('.').map((octet) => Number.parseInt(octet, 10)));
  } else if (isIpv6) {
    atyp = 0x04;
    // Parse IPv6 to 16 bytes
    targetBuf = Buffer.alloc(16);
    const groups = targetHost.split(':');
    for (let i = 0; i < 8; i++) {
      targetBuf.writeUInt16BE(Number.parseInt(groups[i] ?? '0', 16), i * 2);
    }
  } else {
    // Domain name
    atyp = 0x03;
    const domain = Buffer.from(targetHost, 'utf-8');
    targetBuf = Buffer.concat([Buffer.from([domain.length]), domain]);
  }

  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(targetPort, 0);

  const connectReq = Buffer.concat([
    Buffer.from([0x05, 0x01, 0x00, atyp]),
    targetBuf,
    portBuf,
  ]);
  sock.write(connectReq);

  // 4. Read reply from upstream: [0x05, rep, 0x00, atyp]
  const reply = await reader.readN(4, timeoutMs);
  if (reply[1] !== 0x00) {
    sock.destroy();
    throw new Error(`SOCKS5_CONNECT_FAILED: Upstream proxy connection error code ${reply[1]}`);
  }

  // Drain bound address returned by server
  const replyAtyp = reply[3];
  if (replyAtyp === 0x01) {
    await reader.readN(4 + 2, timeoutMs); // 4 bytes IPv4 + 2 bytes port
  } else if (replyAtyp === 0x03) {
    const len = (await reader.readN(1, timeoutMs))[0] ?? 0;
    await reader.readN(len + 2, timeoutMs); // len domain + 2 bytes port
  } else if (replyAtyp === 0x04) {
    await reader.readN(16 + 2, timeoutMs); // 16 bytes IPv6 + 2 bytes port
  }

  return { socket: sock, reader };
}
