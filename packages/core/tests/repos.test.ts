import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';

describe('Ticket 0.8: Repositories & Kysely Schema', () => {
  let tempDir: string;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-repos-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('instantiates all repositories via Repos class', () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    expect(repos.profiles).toBeDefined();
    expect(repos.proxies).toBeDefined();
    expect(repos.leases).toBeDefined();
    expect(repos.tasks).toBeDefined();
    expect(repos.runs).toBeDefined();
    expect(repos.stepRuns).toBeDefined();
    expect(repos.anchors).toBeDefined();
    expect(repos.events).toBeDefined();
    expect(repos.audit).toBeDefined();
    expect(repos.presets).toBeDefined();

    db.close();
  });

  it('LeaseRepo: acquire, conflict detection, heartbeat, release, and sweep', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    // Seed preset, profile, proxy
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
      name: 'Test Profile 1',
      tags: '["test"]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seed1234',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'prof-1'),
      state: 'idle',
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_launched_at: null,
    });

    await repos.profiles.create({
      id: 'prof-2',
      name: 'Test Profile 2',
      tags: '["test"]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seed5678',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'prof-2'),
      state: 'idle',
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_launched_at: null,
    });

    await repos.proxies.create({
      id: 'px-1',
      protocol: 'socks5',
      host: '127.0.0.1',
      port: 1080,
      username: null,
      password_ref: null,
      geo_country: 'US',
      geo_city: 'New York',
      geo_tz: 'America/New_York',
      geo_isp: 'Test ISP',
      geo_lat: 40.71,
      geo_lng: -74.0,
      exit_ip: '198.51.100.1',
      last_checked_at: Date.now(),
      last_latency_ms: 50,
      status: 'healthy',
      status_reason: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 1. Initial Acquire
    const lease1 = await repos.leases.acquire('prof-1', 'px-1', 60000);
    expect(lease1).not.toBeNull();
    expect(lease1?.profileId).toBe('prof-1');
    expect(lease1?.proxyId).toBe('px-1');
    expect(lease1?.state).toBe('active');

    // 2. Active lease lookup
    const active = await repos.leases.getActiveForProfile('prof-1');
    expect(active?.id).toBe(lease1?.id);

    // 3. Conflict: same proxy cannot be acquired by another profile while active
    const conflictProxy = await repos.leases.acquire('prof-2', 'px-1', 60000);
    expect(conflictProxy).toBeNull();

    // 4. Conflict: same profile cannot acquire another proxy while active
    await repos.proxies.create({
      id: 'px-2',
      protocol: 'http',
      host: '127.0.0.1',
      port: 8080,
      username: null,
      password_ref: null,
      geo_country: null,
      geo_city: null,
      geo_tz: null,
      geo_isp: null,
      geo_lat: null,
      geo_lng: null,
      exit_ip: null,
      last_checked_at: null,
      last_latency_ms: null,
      status: 'healthy',
      status_reason: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    const conflictProfile = await repos.leases.acquire('prof-1', 'px-2', 60000);
    expect(conflictProfile).toBeNull();

    // 5. Heartbeat
    await repos.leases.heartbeat(lease1!.id, 120000);
    const updated = await repos.leases.getActiveForProfile('prof-1');
    expect(updated!.expires_at).toBeGreaterThan(lease1!.expiresAt);

    // 6. Release
    await repos.leases.release(lease1!.id);
    const afterRelease = await repos.leases.getActiveForProfile('prof-1');
    expect(afterRelease).toBeUndefined();

    // 7. Expire and sweep
    const expiredLease = await repos.leases.acquire('prof-1', 'px-1', -1000);
    expect(expiredLease).not.toBeNull();
    const swept = await repos.leases.sweepExpired();
    expect(swept).toBe(1);

    db.close();
  });

  it('ProfileRepo: CRUD operations and state transitions', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    await repos.presets.create({
      id: 'pre-1',
      name: 'Windows Preset',
      platform: 'windows',
      bundle: '{}',
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Create
    await repos.profiles.create({
      id: 'p-crud',
      name: 'Initial Name',
      tags: '[]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seed1111',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p-crud'),
      state: 'idle',
      notes: null,
      created_at: 100,
      updated_at: 100,
      last_launched_at: null,
    });

    // Read
    const found = await repos.profiles.getById('p-crud');
    expect(found?.name).toBe('Initial Name');

    // Update
    const updated = await repos.profiles.update('p-crud', { name: 'Updated Name' });
    expect(updated?.name).toBe('Updated Name');

    // Update State
    await repos.profiles.updateState('p-crud', 'running');
    const running = await repos.profiles.getById('p-crud');
    expect(running?.state).toBe('running');
    expect(running?.last_launched_at).not.toBeNull();

    // List
    const all = await repos.profiles.list();
    expect(all).toHaveLength(1);

    // Delete
    await repos.profiles.delete('p-crud');
    const afterDelete = await repos.profiles.getById('p-crud');
    expect(afterDelete).toBeUndefined();

    db.close();
  });

  it('Events & Audit Repos: append and query', async () => {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);

    // Append through IEventAppender
    await repos.events.append(
      'info',
      'supervisor',
      'profile.launched',
      { pid: 4321 },
      {
        profileId: 'p-evt',
        runId: 'r-1',
      },
    );

    const events = await repos.events.query({ profileId: 'p-evt' });
    expect(events).toHaveLength(1);
    expect(events[0]?.level).toBe('info');
    expect(events[0]?.scope).toBe('supervisor');
    expect(events[0]?.event).toBe('profile.launched');
    expect(JSON.parse(events[0]!.data)).toEqual({ pid: 4321 });

    // Audit append & query
    await repos.audit.append('admin', 'profile.create', 'p-evt', { tag: 'vip' });
    const auditLogs = await repos.audit.query(10);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]?.actor).toBe('admin');
    expect(auditLogs[0]?.action).toBe('profile.create');

    db.close();
  });
});
