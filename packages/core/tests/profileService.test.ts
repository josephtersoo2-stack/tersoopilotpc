import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ProfileDetail,
  ProfileSummary,
  type ProfileCreateInput,
} from '@tersoo/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadConfig, type Config } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { clearActiveLocalLocks } from '../src/persistence/profileLock';
import { Repos } from '../src/persistence/repos';
import type { DB } from '../src/persistence/schema';
import { ProfileService } from '../src/services/ProfileService';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { ProfileError, ProxyError } from '../src/util/errors';

describe('Ticket 1.2: ProfileService CRUD', () => {
  let tempDir: string;
  let config: Config;
  let db: AppDatabase<DB>;
  let repos: Repos;
  let events: EventBus;
  let supervisor: BrowserSupervisor;
  let service: ProfileService;

  const winPresetId = crypto.randomUUID();
  const macPresetId = crypto.randomUUID();
  const proxyId = crypto.randomUUID();

  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-profile-service-test-'));
    config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb<DB>(config, rootMigrationsDir);
    repos = new Repos(db);
    events = new EventBus();
    supervisor = new BrowserSupervisor({
      config,
      events,
      crosshair: {} as never,
    });

    service = new ProfileService({
      repos,
      supervisor,
      events,
      config,
    });

    // Seed presets
    await repos.presets.create({
      id: winPresetId,
      name: 'Windows Chrome Preset',
      platform: 'windows',
      bundle: JSON.stringify({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
        screen: { width: 1920, height: 1080 },
      }),
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    });

    await repos.presets.create({
      id: macPresetId,
      name: 'Mac Chrome Preset',
      platform: 'macos',
      bundle: JSON.stringify({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0',
        screen: { width: 2560, height: 1440 },
      }),
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    });

    // Seed a proxy
    await repos.proxies.create({
      id: proxyId,
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
      last_latency_ms: 25,
      status: 'healthy',
      status_reason: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  });

  afterEach(() => {
    clearActiveLocalLocks();
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates profile with filesystem dirs and validates against ProfileDetail', async () => {
    const input: ProfileCreateInput = {
      name: 'Marketing Profile 1',
      presetId: winPresetId,
      tags: ['marketing', 'us'],
      notes: 'Initial account notes',
    };

    const profile = await service.create(input);

    expect(profile.id).toBeDefined();
    expect(profile.name).toBe('Marketing Profile 1');
    expect(profile.tags).toEqual(['marketing', 'us']);
    expect(profile.presetId).toBe(winPresetId);
    expect(profile.platform).toBe('windows');
    expect(profile.state).toBe('idle');
    expect(profile.proxyId).toBeNull();
    expect(profile.notes).toBe('Initial account notes');
    expect(profile.fingerprintSeed).toBeDefined();

    // Verify contract schema compliance
    const validated = ProfileDetail.parse(profile);
    expect(validated.id).toBe(profile.id);

    // Verify directory structure on disk
    expect(fs.existsSync(profile.userDataDir)).toBe(true);
    expect(fs.existsSync(path.join(profile.userDataDir, 'chromium'))).toBe(true);
    expect(fs.existsSync(path.join(profile.userDataDir, 'cache'))).toBe(true);
    expect(fs.existsSync(path.join(profile.userDataDir, 'crash'))).toBe(true);
  });

  it('creates profile with proxy lease and emits lease.acquired event', async () => {
    const leaseEvents: unknown[] = [];
    events.on('lease.acquired', (payload) => {
      leaseEvents.push(payload);
    });

    const profile = await service.create({
      name: 'Proxy Profile',
      presetId: winPresetId,
      proxyId,
    });

    expect(profile.proxyId).toBe(proxyId);
    expect(leaseEvents).toHaveLength(1);
    expect((leaseEvents[0] as { profileId: string }).profileId).toBe(profile.id);

    // Verifying lease conflict if attempting to create another profile with same proxy
    await expect(
      service.create({
        name: 'Conflict Profile',
        presetId: winPresetId,
        proxyId,
      }),
    ).rejects.toThrow(ProxyError);
  });

  it('rejects creation when preset or proxy does not exist', async () => {
    const nonExistentPreset = crypto.randomUUID();
    await expect(
      service.create({
        name: 'Bad Preset',
        presetId: nonExistentPreset,
      }),
    ).rejects.toThrow(ProfileError);

    const nonExistentProxy = crypto.randomUUID();
    await expect(
      service.create({
        name: 'Bad Proxy',
        presetId: winPresetId,
        proxyId: nonExistentProxy,
      }),
    ).rejects.toThrow(ProxyError);
  });

  it('retrieves profile by id and validates detail contract', async () => {
    const created = await service.create({
      name: 'Detail Test',
      presetId: macPresetId,
      tags: ['test'],
    });

    const fetched = await service.get(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.platform).toBe('macos');
    expect(ProfileDetail.parse(fetched)).toBeDefined();

    const missingId = crypto.randomUUID();
    await expect(service.get(missingId)).rejects.toThrow(ProfileError);
  });

  it('lists profiles and validates against ProfileSummary', async () => {
    await service.create({
      name: 'Alpha Profile',
      presetId: winPresetId,
      tags: ['lead', 'us'],
    });
    await service.create({
      name: 'Beta Profile',
      presetId: macPresetId,
      tags: ['lead', 'eu'],
    });

    const all = await service.list();
    expect(all).toHaveLength(2);
    expect(z.array(ProfileSummary).parse(all)).toBeDefined();

    // Filter by tag
    const usProfiles = await service.list({ tag: 'us' });
    expect(usProfiles).toHaveLength(1);
    expect(usProfiles[0]?.name).toBe('Alpha Profile');

    // Filter by search
    const betaProfiles = await service.list({ search: 'Beta' });
    expect(betaProfiles).toHaveLength(1);
    expect(betaProfiles[0]?.name).toBe('Beta Profile');
  });

  it('updates profile fields and recalculates bundle on preset change', async () => {
    const created = await service.create({
      name: 'Original Profile',
      presetId: winPresetId,
      tags: ['old'],
    });

    const updated = await service.update(created.id, {
      name: 'Updated Profile',
      tags: ['new', 'updated'],
      presetId: macPresetId,
      notes: 'New notes',
    });

    expect(updated.name).toBe('Updated Profile');
    expect(updated.tags).toEqual(['new', 'updated']);
    expect(updated.presetId).toBe(macPresetId);
    expect(updated.platform).toBe('macos');
    expect(updated.notes).toBe('New notes');
    expect(ProfileDetail.parse(updated)).toBeDefined();

    // Rejects updating non-existent profile
    const missingId = crypto.randomUUID();
    await expect(service.update(missingId, { name: 'Foo' })).rejects.toThrow(ProfileError);

    // Rejects updating non-existent preset
    await expect(
      service.update(created.id, { presetId: crypto.randomUUID() }),
    ).rejects.toThrow(ProfileError);
  });

  it('updates profile state and emits profile.state_changed', async () => {
    const stateEvents: unknown[] = [];
    events.on('profile.state_changed', (payload) => {
      stateEvents.push(payload);
    });

    const created = await service.create({
      name: 'State Test',
      presetId: winPresetId,
    });

    await service.updateState(created.id, 'running');
    const running = await service.get(created.id);
    expect(running.state).toBe('running');
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]).toEqual({ profileId: created.id, state: 'running' });

    // Rejects changing preset while running
    await expect(
      service.update(created.id, { presetId: macPresetId }),
    ).rejects.toThrow(ProfileError);
  });

  it('deletes profile, releases lease, and removes directory from disk', async () => {
    const leaseReleasedEvents: unknown[] = [];
    events.on('lease.released', (payload) => {
      leaseReleasedEvents.push(payload);
    });

    const created = await service.create({
      name: 'To Delete',
      presetId: winPresetId,
      proxyId,
    });

    const dir = created.userDataDir;
    expect(fs.existsSync(dir)).toBe(true);

    await service.delete(created.id);

    // Deleted from DB
    await expect(service.get(created.id)).rejects.toThrow(ProfileError);

    // Directory cleaned up
    expect(fs.existsSync(dir)).toBe(false);

    // Lease released
    expect(leaseReleasedEvents).toHaveLength(1);
    expect((leaseReleasedEvents[0] as { profileId: string }).profileId).toBe(created.id);

    // Proxy can now be leased again
    const another = await service.create({
      name: 'Another Profile',
      presetId: winPresetId,
      proxyId,
    });
    expect(another.proxyId).toBe(proxyId);
  });

  it('prevents deleting running profile', async () => {
    const created = await service.create({
      name: 'Running Delete Test',
      presetId: winPresetId,
    });

    await service.updateState(created.id, 'running');

    await expect(service.delete(created.id)).rejects.toThrow(ProfileError);
  });

  describe('Ticket 1.5: ProfileService state writes and lock integration', () => {
    it('setState and getState update DB and emit profile.state_changed', async () => {
      const stateEvents: unknown[] = [];
      events.on('profile.state_changed', (payload) => {
        stateEvents.push(payload);
      });

      const created = await service.create({
        name: 'Service State Test',
        presetId: winPresetId,
      });

      expect(await service.getState(created.id)).toBe('idle');

      await service.setState(created.id, 'running');
      expect(await service.getState(created.id)).toBe('running');

      expect(stateEvents).toHaveLength(1);
      expect(stateEvents[0]).toEqual({ profileId: created.id, state: 'running' });
    });

    it('transitionState performs atomic CAS and emits profile.state_changed', async () => {
      const stateEvents: unknown[] = [];
      events.on('profile.state_changed', (payload) => {
        stateEvents.push(payload);
      });

      const created = await service.create({
        name: 'Transition Test',
        presetId: winPresetId,
      });

      const updated = await service.transitionState(created.id, 'idle', 'running');
      expect(updated.state).toBe('running');
      expect(stateEvents).toHaveLength(1);
      expect(stateEvents[0]).toEqual({ profileId: created.id, state: 'running' });

      // Crash transition
      const crashed = await service.transitionState(
        created.id,
        ['running', 'paused'],
        'crashed',
      );
      expect(crashed.state).toBe('crashed');
      expect(stateEvents).toHaveLength(2);
      expect(stateEvents[1]).toEqual({ profileId: created.id, state: 'crashed' });
    });

    it('acquireLock, isLocked, and forceUnlock manage file locking', async () => {
      const created = await service.create({
        name: 'Lock Test',
        presetId: winPresetId,
      });

      expect(await service.isLocked(created.id)).toBe(false);

      const handle = await service.acquireLock(created.id);
      expect(handle.isHeld()).toBe(true);
      expect(await service.isLocked(created.id)).toBe(true);

      // Concurrent lock fails
      await expect(service.acquireLock(created.id)).rejects.toMatchObject({
        code: 'ALREADY_RUNNING',
      });

      await handle.release();
      expect(handle.isHeld()).toBe(false);
      expect(await service.isLocked(created.id)).toBe(false);

      // Lock again and force unlock
      await service.acquireLock(created.id);
      expect(await service.isLocked(created.id)).toBe(true);
      await service.forceUnlock(created.id);
      expect(await service.isLocked(created.id)).toBe(false);
    });
  });
});
