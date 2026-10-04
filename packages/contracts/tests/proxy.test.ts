import { describe, expect, it } from 'vitest';

import {
  HealthResult,
  ImportReport,
  LeaseSummary,
  ProxyBulkImportInput,
  ProxyCreateInput,
  ProxySummary,
} from '../src/proxy';

describe('Contracts: Proxy', () => {
  const proxyId = '123e4567-e89b-12d3-a456-426614174000';
  const profileId = '223e4567-e89b-12d3-a456-426614174000';
  const leaseId = '323e4567-e89b-12d3-a456-426614174000';

  it('validates ProxySummary', () => {
    const summary = {
      id: proxyId,
      protocol: 'socks5',
      host: '1.2.3.4',
      port: 1080,
      username: 'user1',
      geoCountry: 'US',
      geoCity: 'New York',
      geoTz: 'America/New_York',
      geoIsp: 'Comcast',
      exitIp: '1.2.3.4',
      status: 'healthy',
      statusReason: null,
      lastCheckedAt: 1727500000000,
      lastLatencyMs: 45,
      createdAt: 1727500000000,
    };
    expect(ProxySummary.parse(summary)).toEqual(summary);
  });

  it('validates ProxyCreateInput and port boundaries', () => {
    const valid = {
      protocol: 'http',
      host: 'proxy.example.com',
      port: 8080,
      username: 'u',
      password: 'p',
    };
    expect(ProxyCreateInput.parse(valid)).toEqual(valid);
    expect(() => ProxyCreateInput.parse({ ...valid, port: 0 })).toThrow();
    expect(() => ProxyCreateInput.parse({ ...valid, port: 70000 })).toThrow();
  });

  it('validates ProxyBulkImportInput refine condition', () => {
    expect(ProxyBulkImportInput.parse({ text: '1.2.3.4:8080' }).text).toBe('1.2.3.4:8080');
    expect(ProxyBulkImportInput.parse({ filePath: '/path/to/file' }).filePath).toBe(
      '/path/to/file',
    );
    expect(() => ProxyBulkImportInput.parse({})).toThrow();
  });

  it('validates LeaseSummary', () => {
    const lease = {
      id: leaseId,
      proxyId,
      profileId,
      state: 'active',
      acquiredAt: 1727500000000,
      expiresAt: 1727521600000,
      heartbeatAt: 1727500000000,
    };
    expect(LeaseSummary.parse(lease)).toEqual(lease);
  });

  it('validates HealthResult', () => {
    const health = {
      proxyId,
      ok: true,
      latencyMs: 120,
      exitIp: '1.2.3.4',
      geo: {
        country: 'US',
        city: 'Miami',
        tz: 'America/New_York',
        isp: 'ATT',
        lat: 25.7617,
        lng: -80.1918,
      },
      webrtcSafe: true,
      dnsSafe: true,
      error: null,
    };
    expect(HealthResult.parse(health)).toEqual(health);
  });
});
