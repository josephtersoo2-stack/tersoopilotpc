import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { HealthResult } from '@tersoo/contracts';
import { loadConfig } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import type { HealthProbe, ProbeInput } from '../src/proxy/HealthProbe';
import { ProxyBroker } from '../src/proxy/ProxyBroker';
import { MemorySecretDriver, SecretVault } from '../src/secrets/SecretVault';
import { ProxyService } from '../src/services/ProxyService';
import { ProxyError } from '../src/util/errors';

class MockHealthProbe implements Partial<HealthProbe> {
  public mockResult: HealthResult = {
    proxyId: '',
    ok: true,
    latencyMs: 120,
    exitIp: '198.51.100.1',
    geo: {
      country: 'US',
      city: 'Chicago',
      tz: 'America/Chicago',
      isp: 'Test ISP',
      lat: 41.8781,
      lng: -87.6298,
    },
    webrtcSafe: true,
    dnsSafe: true,
    error: null,
  };

  async probe(input: ProbeInput): Promise<HealthResult> {
    return {
      ...this.mockResult,
      proxyId: input.proxyId,
    };
  }
}

describe('Ticket 2.7: ProxyService (IPC & Operations)', () => {
  let tempDir: string;
  let activeDbs: Array<{ close: () => void }> = [];
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-proxysvc-test-'));
    activeDbs = [];
  });

  afterEach(async () => {
    for (const db of activeDbs) {
      db.close();
    }
    activeDbs = [];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function setupService() {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    activeDbs.push(db);
    const repos = new Repos(db);
    const events = new EventBus();
    const secrets = new SecretVault(new MemorySecretDriver());
    const broker = new ProxyBroker(repos.leases, repos.proxies, config);
    const health = new MockHealthProbe() as unknown as HealthProbe;

    // Seed preset
    await repos.presets.create({
      id: 'pre-1',
      name: 'Default',
      platform: 'windows',
      bundle: '{}',
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const service = new ProxyService({
      repos,
      broker,
      health,
      secrets,
      events,
    });

    return { config, db, repos, events, secrets, broker, health: health as unknown as MockHealthProbe, service };
  }

  it('creates a proxy securely, storing credentials in SecretVault', async () => {
    const { service, secrets, repos } = await setupService();

    const created = await service.create({
      protocol: 'socks5',
      host: '127.0.0.1',
      port: 1080,
      username: 'user1',
      password: 'secretPassword123',
    });

    expect(created.id).toBeDefined();
    expect(created.protocol).toBe('socks5');
    expect(created.host).toBe('127.0.0.1');
    expect(created.port).toBe(1080);
    expect(created.username).toBe('user1');
    expect(created.status).toBe('unknown');

    // Password must be retrieved from vault, NOT database
    const savedPassword = await secrets.getProxyPassword(created.id);
    expect(savedPassword).toBe('secretPassword123');

    // In DB, row exists and password_ref is stored
    const row = await repos.proxies.get(created.id);
    expect(row).toBeDefined();
    expect(row?.password_ref).toContain(created.id);

    // Reject duplicate endpoint
    await expect(
      service.create({
        protocol: 'socks5',
        host: '127.0.0.1',
        port: 1080,
        username: 'user1',
      }),
    ).rejects.toThrow(ProxyError);
  });

  it('lists proxies with filters and maps to ProxySummary', async () => {
    const { service } = await setupService();

    await service.create({ protocol: 'socks5', host: '10.0.0.1', port: 1080 });
    await service.create({ protocol: 'http', host: '10.0.0.2', port: 8080 });

    const all = await service.list();
    expect(all.length).toBe(2);

    const httpOnly = await service.list({ protocol: 'http' });
    expect(httpOnly.length).toBe(1);
    expect(httpOnly[0]?.host).toBe('10.0.0.2');
  });

  it('imports proxies in bulk, skips duplicates and handles errors', async () => {
    const { service, secrets, repos } = await setupService();

    // Pre-create one proxy to test existing DB duplicate detection
    await service.create({
      protocol: 'socks5',
      host: '1.1.1.1',
      port: 1080,
      username: 'u1',
    });

    const bulkText = [
      'socks5://u1:p1@1.1.1.1:1080', // Duplicate of DB proxy
      'http://u2:p2@2.2.2.2:8080',   // Valid
      'http://u2:p2@2.2.2.2:8080',   // Duplicate within text
      'socks5://3.3.3.3:1080',       // Valid without auth
      'invalid-line-without-port',   // Error
    ].join('\n');

    const report = await service.importBulk({
      text: bulkText,
      format: 'auto',
    });

    expect(report.parsed).toBe(4);
    expect(report.imported).toBe(2); // 2.2.2.2:8080 and 3.3.3.3:1080
    expect(report.skipped).toBe(2);  // 1 within text + 1 in DB
    expect(report.errors.length).toBe(1);
    expect(report.errors[0]?.line).toBe(5);

    // Verify password was stored for imported 2.2.2.2
    const importedProxy = (await repos.proxies.list()).find((p) => p.host === '2.2.2.2');
    expect(importedProxy).toBeDefined();
    if (importedProxy) {
      const pass = await secrets.getProxyPassword(importedProxy.id);
      expect(pass).toBe('p2');
    }
  });

  it('runs health check on a proxy, updates database and emits event', async () => {
    const { service, events, health, repos } = await setupService();

    const created = await service.create({
      protocol: 'socks5',
      host: '4.4.4.4',
      port: 1080,
      username: 'u4',
      password: 'p4',
    });

    let eventEmitted = false;
    events.on('proxy.health_changed', (payload) => {
      if (payload.proxyId === created.id && payload.status === 'healthy') {
        eventEmitted = true;
      }
    });

    const result = await service.check(created.id);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(120);
    expect(result.exitIp).toBe('198.51.100.1');
    expect(result.geo.country).toBe('US');
    expect(eventEmitted).toBe(true);

    const updatedRow = await repos.proxies.get(created.id);
    expect(updatedRow?.status).toBe('healthy');
    expect(updatedRow?.last_latency_ms).toBe(120);
    expect(updatedRow?.exit_ip).toBe('198.51.100.1');
    expect(updatedRow?.geo_country).toBe('US');

    // Test slow status (> 2500ms)
    health.mockResult = {
      ...health.mockResult,
      ok: true,
      latencyMs: 3000,
    };
    await service.check(created.id);
    const slowRow = await repos.proxies.get(created.id);
    expect(slowRow?.status).toBe('slow');

    // Test auth_error status
    health.mockResult = {
      ...health.mockResult,
      ok: false,
      error: '407 Proxy Authentication Required',
    };
    await service.check(created.id);
    const authErrRow = await repos.proxies.get(created.id);
    expect(authErrRow?.status).toBe('auth_error');

    // Test dead status
    health.mockResult = {
      ...health.mockResult,
      ok: false,
      error: 'Connection refused (ECONNREFUSED)',
    };
    await service.check(created.id);
    const deadRow = await repos.proxies.get(created.id);
    expect(deadRow?.status).toBe('dead');
  });

  it('assigns, swaps, and releases proxy leases with event emission', async () => {
    const { service, repos, events } = await setupService();

    // Create profile
    const profile = await repos.profiles.create({
      id: crypto.randomUUID(),
      name: 'Profile 1',
      tags: '[]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seed1',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p1'),
      state: 'idle',
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_launched_at: null,
    });

    const p1 = await service.create({ protocol: 'socks5', host: '5.5.5.1', port: 1080 });
    const p2 = await service.create({ protocol: 'socks5', host: '5.5.5.2', port: 1080 });

    // Mark both as healthy
    await repos.proxies.updateStatus(p1.id, 'healthy');
    await repos.proxies.updateStatus(p2.id, 'healthy');

    const acquiredEvents: string[] = [];
    events.on('lease.acquired', (payload) => {
      acquiredEvents.push(payload.proxyId);
    });

    // 1. Assign manual
    const lease1 = await service.assign({
      profileId: profile.id,
      strategy: 'manual',
      proxyId: p1.id,
    });
    expect(lease1.proxyId).toBe(p1.id);
    expect(lease1.state).toBe('active');
    expect(acquiredEvents).toContain(p1.id);

    // 2. Swap proxy for profile
    const lease2 = await service.swap(profile.id);
    expect(lease2.proxyId).toBe(p2.id); // Must acquire p2 since p1 was excluded
    expect(acquiredEvents).toContain(p2.id);

    // 3. Release lease
    let releasedEvent = false;
    events.on('lease.released', (payload) => {
      if (payload.profileId === profile.id && payload.leaseId === lease2.id) {
        releasedEvent = true;
      }
    });

    await service.release(profile.id);
    expect(releasedEvent).toBe(true);

    const active = await repos.leases.getActiveForProfile(profile.id);
    expect(active).toBeUndefined();
  });

  it('deletes proxy and secret, preventing deletion if currently leased', async () => {
    const { service, repos, secrets } = await setupService();

    const profile = await repos.profiles.create({
      id: crypto.randomUUID(),
      name: 'Profile Del',
      tags: '[]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seed1',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'pdel'),
      state: 'idle',
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_launched_at: null,
    });

    const proxy = await service.create({
      protocol: 'socks5',
      host: '6.6.6.6',
      port: 1080,
      password: 'deleteMePass',
    });

    // Acquire lease
    await service.assign({
      profileId: profile.id,
      strategy: 'manual',
      proxyId: proxy.id,
    });

    // Attempt delete while leased must throw LEASE_CONFLICT
    await expect(service.delete(proxy.id)).rejects.toThrow(ProxyError);

    // Release lease
    await service.release(profile.id);

    // Now delete succeeds
    await service.delete(proxy.id);

    // Verify removed from DB and SecretVault
    const dbRow = await repos.proxies.get(proxy.id);
    expect(dbRow).toBeUndefined();

    const pass = await secrets.getProxyPassword(proxy.id);
    expect(pass).toBeNull();
  });
});
