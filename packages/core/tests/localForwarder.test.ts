import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalForwarder } from '../src/proxy/LocalForwarder';
import { BufferedSocketReader } from '../src/proxy/streamUtil';
import {
  createMockDestinationServer,
  createMockHttpProxyServer,
  createMockSocks5Server,
} from './helpers/mockProxyServers';

describe('Ticket 2.2: LocalForwarder (SOCKS5 + HTTP CONNECT)', () => {
  let forwarder: LocalForwarder;
  let echoServer: { port: number; close: () => Promise<void> };

  beforeEach(async () => {
    forwarder = new LocalForwarder();
    echoServer = await createMockDestinationServer();
  });

  afterEach(async () => {
    await forwarder.stopAll();
    await echoServer.close();
  });

  /**
   * Helper simulating Chrome's SOCKS5 client connecting to 127.0.0.1:forwarderPort
   *
   * The forwarder requires the per-instance credentials minted at start(), so
   * the simulated client performs the RFC 1929 username/password
   * sub-negotiation exactly as Chromium does.
   */
  async function simulateChromeSocks5Connection(
    forwarderPort: number,
    targetPort: number,
    credentials: { username: string; password: string },
  ): Promise<net.Socket> {
    const client = net.connect(forwarderPort, '127.0.0.1');

    await new Promise<void>((res, rej) => {
      client.once('connect', res);
      client.once('error', rej);
    });

    const reader = new BufferedSocketReader(client);

    // 1. SOCKS5 greeting offering only username/password auth (0x02)
    client.write(new Uint8Array([0x05, 0x01, 0x02]));
    const greetingReply = await reader.readN(2);
    expect(greetingReply[0]).toBe(0x05);
    expect(greetingReply[1]).toBe(0x02);

    // 2. RFC 1929 username/password sub-negotiation
    const user = Buffer.from(credentials.username, 'utf-8');
    const pass = Buffer.from(credentials.password, 'utf-8');
    const authReq = Buffer.concat([
      Buffer.from([0x01, user.length]),
      user,
      Buffer.from([pass.length]),
      pass,
    ]);
    client.write(new Uint8Array(authReq));
    const authReply = await reader.readN(2);
    expect(authReply[0]).toBe(0x01);
    expect(authReply[1]).toBe(0x00);

    // 3. SOCKS5 connect to 127.0.0.1:targetPort
    const req = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1]),
      Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]),
    ]);
    client.write(new Uint8Array(req));

    const connectReply = await reader.readN(10);
    expect(connectReply[0]).toBe(0x05);
    expect(connectReply[1]).toBe(0x00); // 0x00 = success

    reader.release();
    return client;
  }

  /**
   * Helper simulating HTTP CONNECT client
   */
  async function simulateHttpClientConnection(
    forwarderPort: number,
    targetPort: number,
    credentials: { username: string; password: string },
  ): Promise<net.Socket> {
    const client = net.connect(forwarderPort, '127.0.0.1');

    await new Promise<void>((res, rej) => {
      client.once('connect', res);
      client.once('error', rej);
    });

    const reader = new BufferedSocketReader(client);

    const basic = Buffer.from(`${credentials.username}:${credentials.password}`, 'utf-8').toString(
      'base64',
    );
    client.write(
      `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${targetPort}\r\n` +
        `Proxy-Authorization: Basic ${basic}\r\n\r\n`,
    );
    const resp = await reader.readUntil('\r\n\r\n');
    expect(resp).toContain('200 Connection Established');

    reader.release();
    return client;
  }

  it('tunnels Chrome SOCKS5 client to authenticated upstream SOCKS5 proxy', async () => {
    const mockUpstream = await createMockSocks5Server({
      username: 'alice',
      password: 'secret_socks_password',
    });

    try {
      const handle = await forwarder.start({
        upstream: {
          protocol: 'socks5',
          host: '127.0.0.1',
          port: mockUpstream.port,
          username: 'alice',
          password: 'secret_socks_password',
        },
      });

      expect(handle.port).toBeGreaterThan(0);
      expect(forwarder.getActiveCount()).toBe(1);

      // Connect through forwarder
      const client = await simulateChromeSocks5Connection(handle.port, echoServer.port, handle.credentials);

      // Verify echo communication
      const payload = Buffer.from('Hello through SOCKS5 tunnel!');
      const received = await new Promise<Buffer>((resolve) => {
        client.once('data', (d) => resolve(Buffer.from(d)));
        client.write(new Uint8Array(payload));
      });

      expect(received.toString()).toBe('Hello through SOCKS5 tunnel!');
      client.destroy();
    } finally {
      await mockUpstream.close();
    }
  });

  it('tunnels Chrome SOCKS5 client to authenticated upstream HTTP proxy', async () => {
    const mockUpstream = await createMockHttpProxyServer({
      username: 'bob',
      password: 'secret_http_password',
    });

    try {
      const handle = await forwarder.start({
        upstream: {
          protocol: 'http',
          host: '127.0.0.1',
          port: mockUpstream.port,
          username: 'bob',
          password: 'secret_http_password',
        },
      });

      const client = await simulateChromeSocks5Connection(handle.port, echoServer.port, handle.credentials);

      const payload = Buffer.from('Hello through HTTP CONNECT tunnel!');
      const received = await new Promise<Buffer>((resolve) => {
        client.once('data', (d) => resolve(Buffer.from(d)));
        client.write(new Uint8Array(payload));
      });

      expect(received.toString()).toBe('Hello through HTTP CONNECT tunnel!');
      client.destroy();
    } finally {
      await mockUpstream.close();
    }
  });

  it('accepts HTTP CONNECT client and forwards to upstream SOCKS5 proxy', async () => {
    const mockUpstream = await createMockSocks5Server({
      username: 'charlie',
      password: 'socks_password',
    });

    try {
      const handle = await forwarder.start({
        upstream: {
          protocol: 'socks5',
          host: '127.0.0.1',
          port: mockUpstream.port,
          username: 'charlie',
          password: 'socks_password',
        },
      });

      const client = await simulateHttpClientConnection(handle.port, echoServer.port, handle.credentials);

      const payload = Buffer.from('HTTP client to SOCKS5 upstream');
      const received = await new Promise<Buffer>((resolve) => {
        client.once('data', (d) => resolve(Buffer.from(d)));
        client.write(new Uint8Array(payload));
      });

      expect(received.toString()).toBe('HTTP client to SOCKS5 upstream');
      client.destroy();
    } finally {
      await mockUpstream.close();
    }
  });

  it('fails gracefully when upstream SOCKS5 authentication fails', async () => {
    const mockUpstream = await createMockSocks5Server({
      username: 'valid_user',
      password: 'valid_password',
    });

    try {
      const handle = await forwarder.start({
        upstream: {
          protocol: 'socks5',
          host: '127.0.0.1',
          port: mockUpstream.port,
          username: 'valid_user',
          password: 'WRONG_PASSWORD',
        },
      });

      const client = net.connect(handle.port, '127.0.0.1');
      await new Promise<void>((res) => client.once('connect', res));

      const reader = new BufferedSocketReader(client);
      client.write(new Uint8Array([0x05, 0x01, 0x00]));
      await reader.readN(2);

      // Send CONNECT request
      const req = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1]),
        Buffer.from([(echoServer.port >> 8) & 0xff, echoServer.port & 0xff]),
      ]);
      client.write(new Uint8Array(req));

      // Should disconnect / error
      const closedOrError = await new Promise<boolean>((resolve) => {
        client.on('close', () => resolve(true));
        client.on('error', () => resolve(true));
      });

      expect(closedOrError).toBe(true);
      reader.release();
    } finally {
      await mockUpstream.close();
    }
  });

  it('stops individual handle and releases listening port', async () => {
    const mockUpstream = await createMockSocks5Server();
    try {
      const handle = await forwarder.start({
        upstream: {
          protocol: 'socks5',
          host: '127.0.0.1',
          port: mockUpstream.port,
        },
      });

      expect(forwarder.getActiveCount()).toBe(1);
      await forwarder.stop(handle.id);
      expect(forwarder.getActiveCount()).toBe(0);

      // Attempting to connect to stopped port should fail
      await expect(
        new Promise<void>((resolve, reject) => {
          const s = net.connect(handle.port, '127.0.0.1');
          s.once('connect', () => {
            s.destroy();
            resolve();
          });
          s.once('error', reject);
        }),
      ).rejects.toThrow();
    } finally {
      await mockUpstream.close();
    }
  });

  it('stopAll terminates all running forwarder instances', async () => {
    const mockUpstream = await createMockSocks5Server();
    try {
      await forwarder.start({
        upstream: { protocol: 'socks5', host: '127.0.0.1', port: mockUpstream.port },
      });
      await forwarder.start({
        upstream: { protocol: 'socks5', host: '127.0.0.1', port: mockUpstream.port },
      });

      expect(forwarder.getActiveCount()).toBe(2);
      await forwarder.stopAll();
      expect(forwarder.getActiveCount()).toBe(0);
    } finally {
      await mockUpstream.close();
    }
  });
});
