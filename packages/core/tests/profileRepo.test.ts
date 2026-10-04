import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { clearActiveLocalLocks } from '../src/persistence/profileLock';
import { Repos } from '../src/persistence/repos';
import type { DB } from '../src/persistence/schema';
import { ProfileError } from '../src/util/errors';

describe('Ticket 1.1: ProfileRepo CRUD', () => {
  let tempDir: string;
  let db: AppDatabase<DB>;
  let repos: Repos;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-profile-repo-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb<DB>(config, rootMigrationsDir);
    repos = new Repos(db);

    // Seed preset for foreign key requirements
    await repos.presets.create({
      id: 'preset-win',
      name: 'Windows Chrome Preset',
      platform: 'windows',
      bundle: JSON.stringify({ userAgent: 'Chrome/128' }),
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    });

    await repos.presets.create({
      id: 'preset-mac',
      name: 'Mac Chrome Preset',
      platform: 'macos',
      bundle: JSON.stringify({ userAgent: 'Chrome/128 Mac' }),
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    });
  });

  afterEach(() => {
    clearActiveLocalLocks();
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates and reads profile by id', async () => {
    const created = await repos.profiles.create({
      id: 'prof-1',
      name: 'Marketing Alpha',
      tags: JSON.stringify(['marketing', 'us']),
      preset_id: 'preset-win',
      fingerprint_seed: 'seed-marketing-1',
      fingerprint_bundle: JSON.stringify({ canvas: true }),
      user_data_dir: path.join(tempDir, 'prof-1'),
      state: 'idle',
      notes: 'Main social account',
    });

    expect(created.id).toBe('prof-1');
    expect(created.name).toBe('Marketing Alpha');
    expect(created.created_at).toBeGreaterThan(0);
    expect(created.updated_at).toBe(created.created_at);
    expect(created.last_launched_at).toBeNull();

    const fetched = await repos.profiles.getById('prof-1');
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe('prof-1');
    expect(fetched?.name).toBe('Marketing Alpha');

    const nonExistent = await repos.profiles.getById('non-existent');
    expect(nonExistent).toBeUndefined();
  });

  it('enforces UNIQUE constraint on user_data_dir', async () => {
    const sharedDir = path.join(tempDir, 'shared-dir');
    await repos.profiles.create({
      id: 'prof-dup-1',
      name: 'First',
      tags: '[]',
      preset_id: 'preset-win',
      fingerprint_seed: 'seed1',
      fingerprint_bundle: '{}',
      user_data_dir: sharedDir,
      state: 'idle',
      notes: null,
    });

    await expect(
      repos.profiles.create({
        id: 'prof-dup-2',
        name: 'Second',
        tags: '[]',
        preset_id: 'preset-win',
        fingerprint_seed: 'seed2',
        fingerprint_bundle: '{}',
        user_data_dir: sharedDir,
        state: 'idle',
        notes: null,
      }),
    ).rejects.toThrow();
  });

  it('enforces FOREIGN KEY constraint on preset_id', async () => {
    await expect(
      repos.profiles.create({
        id: 'prof-invalid-fk',
        name: 'Bad Preset',
        tags: '[]',
        preset_id: 'non-existent-preset',
        fingerprint_seed: 'seed',
        fingerprint_bundle: '{}',
        user_data_dir: path.join(tempDir, 'prof-bad-fk'),
        state: 'idle',
        notes: null,
      }),
    ).rejects.toThrow();
  });

  it('retrieves profile with details joining preset platform and active proxy lease', async () => {
    await repos.profiles.create({
      id: 'prof-joined',
      name: 'Joined Profile',
      tags: '["us"]',
      preset_id: 'preset-win',
      fingerprint_seed: 'seed-joined',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'prof-joined'),
      state: 'idle',
      notes: null,
    });

    // Before any proxy is assigned
    const detailsNoProxy = await repos.profiles.getWithDetails('prof-joined');
    expect(detailsNoProxy).toBeDefined();
    expect(detailsNoProxy?.platform).toBe('windows');
    expect(detailsNoProxy?.activeProxyId).toBeNull();
    expect(detailsNoProxy?.activeLeaseId).toBeNull();

    // Seed proxy and acquire active lease
    await repos.proxies.create({
      id: 'proxy-joined',
      protocol: 'socks5',
      host: '192.168.1.100',
      port: 1080,
      username: null,
      password_ref: null,
      geo_country: 'US',
      geo_city: 'Chicago',
      geo_tz: 'America/Chicago',
      geo_isp: null,
      geo_lat: 41.87,
      geo_lng: -87.62,
      exit_ip: '198.51.100.2',
      last_checked_at: Date.now(),
      last_latency_ms: 30,
      status: 'healthy',
      status_reason: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const lease = await repos.leases.acquire('prof-joined', 'proxy-joined', 60000);
    expect(lease).not.toBeNull();

    // After lease acquired
    const detailsWithProxy = await repos.profiles.getWithDetails('prof-joined');
    expect(detailsWithProxy).not.toBeNull();
    expect(detailsWithProxy?.platform).toBe('windows');
    expect(detailsWithProxy?.activeProxyId).toBe('proxy-joined');
    expect(detailsWithProxy?.activeLeaseId).toBe(lease?.id);

    // List with details
    const listDetails = await repos.profiles.listWithDetails();
    expect(listDetails).toHaveLength(1);
    expect(listDetails[0]?.activeProxyId).toBe('proxy-joined');
  });

  it('supports comprehensive filtering on list and count', async () => {
    // Profile 1: idle, preset-win, tags: ["crypto", "us"]
    await repos.profiles.create({
      id: 'p1',
      name: 'Crypto Buyer 1',
      tags: JSON.stringify(['crypto', 'us']),
      preset_id: 'preset-win',
      fingerprint_seed: 'seed1',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p1'),
      state: 'idle',
      notes: 'Notes for crypto 1',
      created_at: 1000,
    });

    // Profile 2: running, preset-mac, tags: ["crypto", "eu"]
    await repos.profiles.create({
      id: 'p2',
      name: 'Crypto Buyer 2',
      tags: JSON.stringify(['crypto', 'eu']),
      preset_id: 'preset-mac',
      fingerprint_seed: 'seed2',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p2'),
      state: 'running',
      notes: 'Notes for crypto 2',
      created_at: 2000,
    });

    // Profile 3: paused, preset-win, tags: ["social"]
    await repos.profiles.create({
      id: 'p3',
      name: 'Social Account',
      tags: JSON.stringify(['social']),
      preset_id: 'preset-win',
      fingerprint_seed: 'seed3',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p3'),
      state: 'paused',
      notes: 'Twitter profile',
      created_at: 3000,
    });

    // Total count
    expect(await repos.profiles.count()).toBe(3);

    // Filter by single state
    const runningList = await repos.profiles.list({ state: 'running' });
    expect(runningList).toHaveLength(1);
    expect(runningList[0]?.id).toBe('p2');
    expect(await repos.profiles.count({ state: 'running' })).toBe(1);

    // Filter by multiple states
    const idleOrRunning = await repos.profiles.list({ state: ['idle', 'running'] });
    expect(idleOrRunning).toHaveLength(2);

    // Filter by preset
    const macList = await repos.profiles.list({ presetId: 'preset-mac' });
    expect(macList).toHaveLength(1);
    expect(macList[0]?.id).toBe('p2');

    // Filter by tag
    const cryptoList = await repos.profiles.list({ tag: 'crypto' });
    expect(cryptoList).toHaveLength(2);

    // Filter by tags array
    const cryptoUsList = await repos.profiles.list({ tags: ['crypto', 'us'] });
    expect(cryptoUsList).toHaveLength(1);
    expect(cryptoUsList[0]?.id).toBe('p1');

    // Filter by platform
    const windowsProfiles = await repos.profiles.list({ platform: 'windows' });
    expect(windowsProfiles).toHaveLength(2);
    expect(await repos.profiles.count({ platform: 'windows' })).toBe(2);

    const macDetails = await repos.profiles.listWithDetails({ platform: 'macos' });
    expect(macDetails).toHaveLength(1);
    expect(macDetails[0]?.id).toBe('p2');

    // Search by name
    const searchResults = await repos.profiles.list({ search: 'Buyer' });
    expect(searchResults).toHaveLength(2);

    // Search by notes
    const searchNotes = await repos.profiles.list({ search: 'Twitter' });
    expect(searchNotes).toHaveLength(1);
    expect(searchNotes[0]?.id).toBe('p3');

    // Pagination
    const page = await repos.profiles.list({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
    // Ordered by created_at desc: p3 (3000), p2 (2000), p1 (1000)
    expect(page[0]?.id).toBe('p2');
    expect(page[1]?.id).toBe('p1');
  });

  it('updates profile fields and tracks updated_at', async () => {
    await repos.profiles.create({
      id: 'p-update',
      name: 'Original Name',
      tags: '["tag1"]',
      preset_id: 'preset-win',
      fingerprint_seed: 'seed-orig',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p-update'),
      state: 'idle',
      notes: 'Original notes',
      created_at: 1000,
      updated_at: 1000,
    });

    const updated = await repos.profiles.update('p-update', {
      name: 'New Name',
      notes: 'New notes',
      tags: JSON.stringify(['tag1', 'tag2']),
    });

    expect(updated).toBeDefined();
    expect(updated?.name).toBe('New Name');
    expect(updated?.notes).toBe('New notes');
    expect(updated?.tags).toBe(JSON.stringify(['tag1', 'tag2']));
    expect(updated?.updated_at).toBeGreaterThan(1000);

    const nonExistent = await repos.profiles.update('missing', { name: 'Foo' });
    expect(nonExistent).toBeUndefined();
  });

  it('updates profile state and manages last_launched_at', async () => {
    await repos.profiles.create({
      id: 'p-state',
      name: 'State Test',
      tags: '[]',
      preset_id: 'preset-win',
      fingerprint_seed: 'seed-state',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p-state'),
      state: 'idle',
      notes: null,
      created_at: 1000,
      updated_at: 1000,
    });

    // Transition to running sets last_launched_at
    await repos.profiles.updateState('p-state', 'running');
    const running = await repos.profiles.getById('p-state');
    expect(running?.state).toBe('running');
    expect(running?.last_launched_at).not.toBeNull();
    const firstLaunch = running?.last_launched_at;

    // Transition to paused maintains last_launched_at
    await repos.profiles.updateState('p-state', 'paused');
    const paused = await repos.profiles.getById('p-state');
    expect(paused?.state).toBe('paused');
    expect(paused?.last_launched_at).toBe(firstLaunch);

    // Explicit meta.lastLaunchedAt
    await repos.profiles.updateState('p-state', 'running', { lastLaunchedAt: 999999 });
    const customLaunch = await repos.profiles.getById('p-state');
    expect(customLaunch?.last_launched_at).toBe(999999);
  });

  it('deletes profile and reports success accurately', async () => {
    await repos.profiles.create({
      id: 'p-delete',
      name: 'To Delete',
      tags: '[]',
      preset_id: 'preset-win',
      fingerprint_seed: 'seed-delete',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'p-delete'),
      state: 'idle',
      notes: null,
    });

    expect(await repos.profiles.getById('p-delete')).toBeDefined();
    const deleted = await repos.profiles.delete('p-delete');
    expect(deleted).toBe(true);

    expect(await repos.profiles.getById('p-delete')).toBeUndefined();
    const deleteAgain = await repos.profiles.delete('p-delete');
    expect(deleteAgain).toBe(false);
  });

  it('checks user_data_dir existence with existsByUserDataDir', async () => {
    const dir = path.join(tempDir, 'used-dir');
    await repos.profiles.create({
      id: 'p-check',
      name: 'Check Dir',
      tags: '[]',
      preset_id: 'preset-win',
      fingerprint_seed: 'seed-check',
      fingerprint_bundle: '{}',
      user_data_dir: dir,
      state: 'idle',
      notes: null,
    });

    expect(await repos.profiles.existsByUserDataDir(dir)).toBe(true);
    expect(await repos.profiles.existsByUserDataDir(path.join(tempDir, 'unused-dir'))).toBe(false);

    // Excluding own profile id should return false
    expect(await repos.profiles.existsByUserDataDir(dir, 'p-check')).toBe(false);
    expect(await repos.profiles.existsByUserDataDir(dir, 'different-profile')).toBe(true);
  });

  describe('Ticket 1.5: Profile state DB writes and file lock', () => {
    beforeEach(async () => {
      await repos.profiles.create({
        id: 'p-state-1.5',
        name: 'State Test Profile',
        tags: '[]',
        preset_id: 'preset-win',
        fingerprint_seed: 'seed-state-1.5',
        fingerprint_bundle: '{}',
        user_data_dir: path.join(tempDir, 'p-state-1.5'),
        state: 'idle',
        notes: null,
        created_at: 2000,
        updated_at: 2000,
      });
    });

    it('setState and getState manage state accurately', async () => {
      expect(await repos.profiles.getState('p-state-1.5')).toBe('idle');

      await repos.profiles.setState('p-state-1.5', 'running');
      expect(await repos.profiles.getState('p-state-1.5')).toBe('running');

      const row = await repos.profiles.getById('p-state-1.5');
      expect(row?.last_launched_at).not.toBeNull();

      expect(await repos.profiles.getState('non-existent')).toBeUndefined();
    });

    it('transitionState succeeds on expected fromState', async () => {
      // idle -> running
      const updated = await repos.profiles.transitionState(
        'p-state-1.5',
        'idle',
        'running',
      );
      expect(updated.state).toBe('running');
      expect(updated.last_launched_at).not.toBeNull();

      // running -> crashed
      const crashed = await repos.profiles.transitionState(
        'p-state-1.5',
        ['running', 'paused'],
        'crashed',
      );
      expect(crashed.state).toBe('crashed');
    });

    it('transitionState throws ALREADY_RUNNING when trying to transition running to running', async () => {
      await repos.profiles.setState('p-state-1.5', 'running');

      await expect(
        repos.profiles.transitionState('p-state-1.5', 'idle', 'running'),
      ).rejects.toMatchObject({
        code: 'ALREADY_RUNNING',
      });
    });

    it('transitionState throws POLICY_VIOLATION when state does not match', async () => {
      await expect(
        repos.profiles.transitionState('p-state-1.5', 'paused', 'running'),
      ).rejects.toMatchObject({
        code: 'POLICY_VIOLATION',
      });
    });

    it('transitionState throws PROFILE_NOT_FOUND if profile does not exist', async () => {
      await expect(
        repos.profiles.transitionState('non-existent', 'idle', 'running'),
      ).rejects.toMatchObject({
        code: 'PROFILE_NOT_FOUND',
      });
    });

    it('acquireLock, isLocked, and forceUnlock work through ProfileRepo', async () => {
      expect(await repos.profiles.isLocked('p-state-1.5')).toBe(false);

      const handle = await repos.profiles.acquireLock('p-state-1.5');
      expect(handle.isHeld()).toBe(true);
      expect(await repos.profiles.isLocked('p-state-1.5')).toBe(true);

      // Attempting to lock again rejects with ALREADY_RUNNING
      await expect(
        repos.profiles.acquireLock('p-state-1.5'),
      ).rejects.toMatchObject({
        code: 'ALREADY_RUNNING',
      });

      // Release lock
      await handle.release();
      expect(handle.isHeld()).toBe(false);
      expect(await repos.profiles.isLocked('p-state-1.5')).toBe(false);

      // Lock again and test forceUnlock
      await repos.profiles.acquireLock('p-state-1.5');
      expect(await repos.profiles.isLocked('p-state-1.5')).toBe(true);
      await repos.profiles.forceUnlock('p-state-1.5');
      expect(await repos.profiles.isLocked('p-state-1.5')).toBe(false);
    });

    it('acquireLock throws PROFILE_NOT_FOUND for non-existent profile', async () => {
      await expect(
        repos.profiles.acquireLock('non-existent'),
      ).rejects.toMatchObject({
        code: 'PROFILE_NOT_FOUND',
      });
    });
  });
});
