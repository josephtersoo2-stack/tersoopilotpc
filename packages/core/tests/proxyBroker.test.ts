import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import type { ProxyRow } from '../src/persistence/schema';
import { ProxyBroker } from '../src/proxy/ProxyBroker';
import { TersooError } from '../src/util/errors';

describe('Ticket 2.5: ProxyBroker (Leasing, Heartbeat, Sweep, Swap)', () => {
  let tempDir: string;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-broker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createProxy(id: string, status = 'healthy', latency = 100): ProxyRow {
    const now = Date.now();
    return {
      id,
      protocol: 'socks5',
      host: '192.168.1.1',
      port: 1080,
      username: null,
      password_ref: null,
      geo_country: 'US',
      geo_city: 'Chicago',
      geo_tz: 'America/Chicago',
      geo_isp: 'ISP',
      geo_lat: 41.8781,
      geo_lng: -87.6298,
      exit_ip: '192.168.1.1',
      last_checked_at: now,
      last_latency_ms: latency,
      status,
      status_reason: null,
      created_at: now,
      updated_at: now,
    };
  }

  async function setupTestEnvironment() {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);
    const broker = new ProxyBroker(repos.leases, repos.proxies, config);

    // Seed preset & profiles
    await repos.presets.create({
      id: 'pre-1',
      name: 'Default',
      platform: 'windows',
      bundle: '{}',
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    await repos.profiles.create({
      id: 'prof-1',
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

    await repos.profiles.create({
      id: 'prof-2',
      name: 'Profile 2',
      tags: '[]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seed2',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p2'),
      state: 'idle',
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_launched_at: null,
    });

    return { config, db, repos, broker };
  }

  it('acquires proxy manually and prevents another profile from acquiring it', async () => {
    const { db, repos, broker } = await setupTestEnvironment();
    await repos.proxies.create(createProxy('prx-manual-1'));

    const lease1 = await broker.acquire('prof-1', {
      strategy: 'manual',
      proxyId: 'prx-manual-1',
    });

    expect(lease1.profileId).toBe('prof-1');
    expect(lease1.proxyId).toBe('prx-manual-1');
    expect(lease1.state).toBe('active');

    // prof-2 attempts to acquire the exact same proxy -> LEASE_CONFLICT
    await expect(
      broker.acquire('prof-2', {
        strategy: 'manual',
        proxyId: 'prx-manual-1',
      }),
    ).rejects.toThrow(TersooError);

    db.close();
  });

  it('acquires proxy randomly among healthy proxies and reuses existing lease on repeated call', async () => {
    const { db, repos, broker } = await setupTestEnvironment();
    await repos.proxies.createBulk([
      createProxy('prx-r1', 'healthy', 50),
      createProxy('prx-r2', 'healthy', 150),
    ]);

    const leaseA = await broker.acquire('prof-1', { strategy: 'random' });
    expect(leaseA.profileId).toBe('prof-1');
    expect(leaseA.state).toBe('active');

    // Repeated call should return existing lease
    const leaseB = await broker.acquire('prof-1', { strategy: 'random' });
    expect(leaseB.id).toBe(leaseA.id);
    expect(leaseB.proxyId).toBe(leaseA.proxyId);

    db.close();
  });

  it('throws NO_HEALTHY_PROXY if no unleased healthy proxy is available', async () => {
    const { db, broker } = await setupTestEnvironment();

    await expect(broker.acquire('prof-1', { strategy: 'random' })).rejects.toThrow(
      /No healthy, unleased proxy available/,
    );

    db.close();
  });

  it('heartbeat updates expiresAt timestamp', async () => {
    const { db, repos, broker } = await setupTestEnvironment();
    await repos.proxies.create(createProxy('prx-hb'));

    const lease = await broker.acquire('prof-1', {
      strategy: 'manual',
      proxyId: 'prx-hb',
    });

    const initialExpiresAt = lease.expiresAt;
    // Wait small tick
    await new Promise((r) => setTimeout(r, 10));

    await broker.heartbeat(lease.id);
    const updated = await repos.leases.getActiveForProfile('prof-1');
    expect(updated?.expires_at).toBeGreaterThan(initialExpiresAt);

    db.close();
  });

  it('swap releases old proxy and acquires a different healthy proxy', async () => {
    const { db, repos, broker } = await setupTestEnvironment();
    await repos.proxies.createBulk([
      createProxy('prx-swap-1', 'healthy', 50),
      createProxy('prx-swap-2', 'healthy', 60),
    ]);

    const firstLease = await broker.acquire('prof-1', {
      strategy: 'manual',
      proxyId: 'prx-swap-1',
    });
    expect(firstLease.proxyId).toBe('prx-swap-1');

    // Swap
    const swappedLease = await broker.swap('prof-1');
    expect(swappedLease.id).not.toBe(firstLease.id);
    expect(swappedLease.proxyId).toBe('prx-swap-2');

    // Old lease is released
    const oldLease = await repos.leases.getById(firstLease.id);
    expect(oldLease?.state).toBe('released');

    db.close();
  });

  it('sweep marks expired leases as expired and frees proxies for acquisition', async () => {
    const { db, repos, broker } = await setupTestEnvironment();
    await repos.proxies.create(createProxy('prx-sweep'));

    // Acquire with short TTL in the past
    await repos.leases.acquire('prof-1', 'prx-sweep', -1000);

    const sweptCount = await broker.sweep();
    expect(sweptCount).toBe(1);

    // Profile 2 can now acquire the freed proxy
    const newLease = await broker.acquire('prof-2', {
      strategy: 'manual',
      proxyId: 'prx-sweep',
    });
    expect(newLease.profileId).toBe('prof-2');

    db.close();
  });
});
