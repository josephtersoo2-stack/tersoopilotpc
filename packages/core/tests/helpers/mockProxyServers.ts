import net from 'node:net';

export interface MockSocks5ServerOptions {
  username?: string;
  password?: string;
}

export interface MockHttpProxyServerOptions {
  username?: string;
  password?: string;
}

/**
 * Creates a mock destination TCP echo server.
 */
export async function createMockDestinationServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const server = net.createServer((socket) => {
    socket.pipe(socket);
  });

  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const port = (server.address() as net.AddressInfo).port;

  return {
    port,
    close: () => new Promise<void>((res) => server.close(() => res())),
  };
}

/**
 * Creates a mock SOCKS5 proxy server supporting optional RFC 1929 authentication.
 */
export async function createMockSocks5Server(opts?: MockSocks5ServerOptions): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const activeSockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    activeSockets.add(client);
    client.once('close', () => activeSockets.delete(client));

    let state: 'greeting' | 'auth' | 'request' | 'piping' = 'greeting';

    client.on('data', (rawChunk: Buffer | string) => {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);

      if (state === 'greeting') {
        const ver = chunk[0];
        if (ver !== 0x05) return client.destroy();
        if (opts?.username) {
          // Require USER/PASS (0x02)
          state = 'auth';
          client.write(new Uint8Array([0x05, 0x02]));
        } else {
          // NO_AUTH (0x00)
          state = 'request';
          client.write(new Uint8Array([0x05, 0x00]));
        }
        return;
      }

      if (state === 'auth') {
        const subVer = chunk[0];
        if (subVer !== 0x01) return client.destroy();
        const uLen = chunk[1] ?? 0;
        const user = chunk.subarray(2, 2 + uLen).toString('utf-8');
        const pLen = chunk[2 + uLen] ?? 0;
        const pass = chunk.subarray(3 + uLen, 3 + uLen + pLen).toString('utf-8');

        if (user === opts?.username && pass === opts?.password) {
          state = 'request';
          client.write(new Uint8Array([0x01, 0x00])); // success
        } else {
          client.write(new Uint8Array([0x01, 0x01])); // fail
          client.destroy();
        }
        return;
      }

      if (state === 'request') {
        state = 'piping';
        const cmd = chunk[1];
        if (cmd !== 0x01) return client.destroy();
        const atyp = chunk[3];
        let targetHost = '';
        let portOffset = 4;

        if (atyp === 0x01) {
          targetHost = Array.from(chunk.subarray(4, 8)).join('.');
          portOffset = 8;
        } else if (atyp === 0x03) {
          const len = chunk[4] ?? 0;
          targetHost = chunk.subarray(5, 5 + len).toString('utf-8');
          portOffset = 5 + len;
        }
        const targetPort = chunk.readUInt16BE(portOffset);

        const upstream = net.connect(targetPort, targetHost, () => {
          client.write(new Uint8Array([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          client.pipe(upstream).pipe(client);
        });
        activeSockets.add(upstream);
        upstream.once('close', () => activeSockets.delete(upstream));
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
      }
    });
  });

  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const port = (server.address() as net.AddressInfo).port;

  return {
    port,
    close: async () => {
      for (const s of activeSockets) s.destroy();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}

/**
 * Creates a mock HTTP proxy server supporting HTTP CONNECT with optional Basic Auth.
 */
export async function createMockHttpProxyServer(opts?: MockHttpProxyServerOptions): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const activeSockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    activeSockets.add(client);
    client.once('close', () => activeSockets.delete(client));

    let headerBuf = '';

    const onData = (chunk: Buffer | string) => {
      headerBuf += chunk.toString();
      if (headerBuf.includes('\r\n\r\n')) {
        client.off('data', onData);

        const lines = headerBuf.split('\r\n');
        const firstLine = lines[0] ?? '';
        const match = firstLine.match(/^CONNECT\s+([^:\s]+):(\d+)\s+HTTP\//i);
        if (!match) {
          client.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          return client.destroy();
        }

        const targetHost = match[1] ?? '';
        const targetPort = Number.parseInt(match[2] ?? '', 10);

        // Check auth
        if (opts?.username) {
          const authLine = lines.find((l) => /^Proxy-Authorization:\s+Basic\s+/i.test(l));
          if (!authLine) {
            client.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
            return client.destroy();
          }
          const expected = Buffer.from(`${opts.username}:${opts.password ?? ''}`).toString('base64');
          if (!authLine.includes(expected)) {
            client.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
            return client.destroy();
          }
        }

        const upstream = net.connect(targetPort, targetHost, () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          client.pipe(upstream).pipe(client);
        });

        activeSockets.add(upstream);
        upstream.once('close', () => activeSockets.delete(upstream));
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
      }
    };

    client.on('data', onData);
  });

  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const port = (server.address() as net.AddressInfo).port;

  return {
    port,
    close: async () => {
      for (const s of activeSockets) s.destroy();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}
