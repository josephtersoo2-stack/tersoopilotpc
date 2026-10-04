import http from 'node:http';
import type net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HealthProbe } from '../src/proxy/HealthProbe';
import { createMockHttpProxyServer, createMockSocks5Server } from './helpers/mockProxyServers';

describe('Ticket 2.3: HealthProbe (Exit IP, Latency, Geo)', () => {
  let probe: HealthProbe;
  let mockGeoServer: http.Server;
  let mockGeoPort: number;

  beforeEach(async () => {
    probe = new HealthProbe();

    // Mock Geo HTTP service
    mockGeoServer = http.createServer((req, res) => {
      if (req.url?.includes('error')) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      const payload = JSON.stringify({
        status: 'success',
        query: '198.51.100.42',
        country: 'Germany',
        city: 'Frankfurt',
        timezone: 'Europe/Berlin',
        isp: 'Hetzner Online GmbH',
        lat: 50.1109,
        lon: 8.6821,
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      });
      res.end(payload);
    });

    await new Promise<void>((resolve) => {
      mockGeoServer.listen(0, '127.0.0.1', () => resolve());
    });
    mockGeoPort = (mockGeoServer.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => mockGeoServer.close(() => resolve()));
  });

  it('probes a healthy SOCKS5 proxy and extracts geo and latency', async () => {
    const mockSocks = await createMockSocks5Server();
    try {
      const result = await probe.probe({
        proxyId: 'prx-socks-1',
        protocol: 'socks5',
        host: '127.0.0.1',
        port: mockSocks.port,
        endpointUrl: `http://127.0.0.1:${mockGeoPort}/json`,
      });

      expect(result.ok).toBe(true);
      expect(result.proxyId).toBe('prx-socks-1');
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.exitIp).toBe('198.51.100.42');
      expect(result.geo).toEqual({
        country: 'Germany',
        city: 'Frankfurt',
        tz: 'Europe/Berlin',
        isp: 'Hetzner Online GmbH',
        lat: 50.1109,
        lng: 8.6821,
      });
      expect(result.error).toBeNull();
    } finally {
      await mockSocks.close();
    }
  });

  it('probes a healthy HTTP proxy with credentials and extracts geo', async () => {
    const mockHttp = await createMockHttpProxyServer({
      username: 'probe_user',
      password: 'probe_password',
    });

    try {
      const result = await probe.probe({
        proxyId: 'prx-http-1',
        protocol: 'http',
        host: '127.0.0.1',
        port: mockHttp.port,
        username: 'probe_user',
        password: 'probe_password',
        endpointUrl: `http://127.0.0.1:${mockGeoPort}/json`,
      });

      expect(result.ok).toBe(true);
      expect(result.exitIp).toBe('198.51.100.42');
      expect(result.geo.country).toBe('Germany');
      expect(result.geo.city).toBe('Frankfurt');
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    } finally {
      await mockHttp.close();
    }
  });

  it('reports failure when proxy authentication fails', async () => {
    const mockHttp = await createMockHttpProxyServer({
      username: 'correct_user',
      password: 'correct_password',
    });

    try {
      const result = await probe.probe({
        proxyId: 'prx-fail-auth',
        protocol: 'http',
        host: '127.0.0.1',
        port: mockHttp.port,
        username: 'correct_user',
        password: 'WRONG_PASSWORD',
        endpointUrl: `http://127.0.0.1:${mockGeoPort}/json`,
      });

      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBeNull();
      expect(result.exitIp).toBeNull();
      expect(result.geo.country).toBeNull();
      expect(result.error).toContain('PROXY_AUTH_FAILED');
    } finally {
      await mockHttp.close();
    }
  });

  it('reports failure when proxy server is unreachable', async () => {
    const result = await probe.probe({
      proxyId: 'prx-dead',
      protocol: 'socks5',
      host: '127.0.0.1',
      port: 59999, // Unused port
      endpointUrl: `http://127.0.0.1:${mockGeoPort}/json`,
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeNull();
    expect(result.exitIp).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it('reports failure when geo endpoint returns HTTP 500 error', async () => {
    const mockSocks = await createMockSocks5Server();
    try {
      const result = await probe.probe({
        proxyId: 'prx-endpoint-error',
        protocol: 'socks5',
        host: '127.0.0.1',
        port: mockSocks.port,
        endpointUrl: `http://127.0.0.1:${mockGeoPort}/error`,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Probe endpoint returned HTTP status 500');
    } finally {
      await mockSocks.close();
    }
  });
});
