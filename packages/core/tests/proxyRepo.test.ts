import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import type { ProxyRow } from '../src/persistence/schema';

describe('Ticket 2.4: ProxyRepo & LeaseRepo Enhancements', () => {
  let tempDir: string;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-proxy-repo-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestProxy(overrides?: Partial<ProxyRow>): ProxyRow {
    const id = overrides?.id ?? `prx-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    return {
      id,
      protocol: 'socks5',
      host: '1.2.3.4',
      port: 1080,
      username: null,
      password_ref: null,
      geo_country: 'US',
      geo_city: 'New York',
      geo_tz: 'America/New_York',
      geo_isp: 'Test ISP',
      geo_lat: 40.7128,
      geo_lng: -74.006,
      exit_ip: '1.2.3.4',
      last_checked_at: now,
      last_latency_ms: 120,
      status: 'healthy',
      status_reason: null,
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  it('pickHealthyUnleased selects healthy proxy and excludes actively leased ones', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    // Seed preset and profiles
    await repos.presets.create({
      id: 'pre-1',
      name: 'Default Windows',
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

    // Create 3 proxies: prx-1 (healthy, 50ms), prx-2 (healthy, 200ms), prx-3 (dead)
    const p1 = createTestProxy({ id: 'prx-1', host: '10.0.0.1', last_latency_ms: 50 });
    const p2 = createTestProxy({ id: 'prx-2', host: '10.0.0.2', last_latency_ms: 200 });
    const p3 = createTestProxy({ id: 'prx-3', host: '10.0.0.3', status: 'dead' });

    await repos.proxies.createBulk([p1, p2, p3]);

    // First pick should select prx-1 (lowest latency healthy proxy)
    const picked1 = await repos.proxies.pickHealthyUnleased();
    expect(picked1?.id).toBe('prx-1');

    // Lease prx-1 to prof-1
    const lease1 = await repos.leases.acquire('prof-1', 'prx-1', 60000);
    expect(lease1).not.toBeNull();

    // Second pick should skip leased prx-1 and dead prx-3, selecting prx-2
    const picked2 = await repos.proxies.pickHealthyUnleased();
    expect(picked2?.id).toBe('prx-2');

    // Lease prx-2 to prof-2
    await repos.leases.acquire('prof-2', 'prx-2', 60000);

    // Third pick should return undefined since all healthy proxies are leased
    const picked3 = await repos.proxies.pickHealthyUnleased();
    expect(picked3).toBeUndefined();

    // Release prx-1
    await repos.leases.release(lease1!.id);

    // Now prx-1 is available again
    const picked4 = await repos.proxies.pickHealthyUnleased();
    expect(picked4?.id).toBe('prx-1');

    db.close();
  });

  it('pickHealthyUnleased respects excludeIds', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    const p1 = createTestProxy({ id: 'prx-a', host: '10.0.0.1', last_latency_ms: 50 });
    const p2 = createTestProxy({ id: 'prx-b', host: '10.0.0.2', last_latency_ms: 100 });
    await repos.proxies.createBulk([p1, p2]);

    const picked = await repos.proxies.pickHealthyUnleased(['prx-a']);
    expect(picked?.id).toBe('prx-b');

    db.close();
  });

  it('findByEndpoint distinguishes unique host, port, protocol, and username', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    const p1 = createTestProxy({ id: 'p-auth', protocol: 'socks5', host: 'node.io', port: 1080, username: 'user1' });
    const p2 = createTestProxy({ id: 'p-noauth', protocol: 'socks5', host: 'node.io', port: 1080, username: null });
    await repos.proxies.createBulk([p1, p2]);

    const foundWithUser = await repos.proxies.findByEndpoint('socks5', 'node.io', 1080, 'user1');
    expect(foundWithUser?.id).toBe('p-auth');

    const foundWithoutUser = await repos.proxies.findByEndpoint('socks5', 'node.io', 1080, null);
    expect(foundWithoutUser?.id).toBe('p-noauth');

    const notFound = await repos.proxies.findByEndpoint('http', 'node.io', 1080, 'user1');
    expect(notFound).toBeUndefined();

    db.close();
  });

  it('list and count filter proxies by status, protocol, country, and search term', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    const p1 = createTestProxy({ id: 'p1', protocol: 'socks5', status: 'healthy', geo_country: 'DE', geo_city: 'Berlin' });
    const p2 = createTestProxy({ id: 'p2', protocol: 'http', status: 'healthy', geo_country: 'US', geo_city: 'Chicago' });
    const p3 = createTestProxy({ id: 'p3', protocol: 'socks5', status: 'dead', geo_country: 'DE', geo_city: 'Munich' });
    await repos.proxies.createBulk([p1, p2, p3]);

    const deProxies = await repos.proxies.list({ country: 'DE' });
    expect(deProxies).toHaveLength(2);

    const healthyCount = await repos.proxies.count({ status: 'healthy' });
    expect(healthyCount).toBe(2);

    const searchMunich = await repos.proxies.list({ search: 'Munich' });
    expect(searchMunich).toHaveLength(1);
    expect(searchMunich[0]?.id).toBe('p3');

    db.close();
  });

  it('LeaseRepo getActiveForProxy and releaseForProfile work atomically', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

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
      id: 'prof-x',
      name: 'Profile X',
      tags: '[]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seedx',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'px'),
      state: 'idle',
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_launched_at: null,
    });

    const proxy = createTestProxy({ id: 'prx-lease-test' });
    await repos.proxies.create(proxy);

    // Initially no active lease
    expect(await repos.leases.getActiveForProxy('prx-lease-test')).toBeUndefined();

    // Acquire lease
    const lease = await repos.leases.acquire('prof-x', 'prx-lease-test', 30000);
    expect(lease).not.toBeNull();

    // Now active
    const activeForProxy = await repos.leases.getActiveForProxy('prx-lease-test');
    expect(activeForProxy?.id).toBe(lease!.id);
    expect(activeForProxy?.profile_id).toBe('prof-x');

    const listActive = await repos.leases.listActive();
    expect(listActive).toHaveLength(1);

    // Release via releaseForProfile
    const numReleased = await repos.leases.releaseForProfile('prof-x');
    expect(numReleased).toBe(1);

    // No longer active
    expect(await repos.leases.getActiveForProxy('prx-lease-test')).toBeUndefined();
    expect(await repos.leases.getActiveForProfile('prof-x')).toBeUndefined();

    db.close();
  });
});
