import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { EventBus } from '../src/events/EventBus';
import { ProfileService } from '../src/services/ProfileService';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { ProxyBroker } from '../src/proxy/ProxyBroker';
import { loadConfig } from '../src/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ProfileService Live Event Emissions', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let events: EventBus;
  let service: ProfileService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-profile-events-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    events = new EventBus();

    await repos.presets.seedDefaults();

    const broker = new ProxyBroker(repos.leases, repos.proxies, config);
    const supervisor = new BrowserSupervisor({ config, events, repos, broker });

    service = new ProfileService({
      repos,
      supervisor,
      events,
      config,
    });
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('emits profile.created when a profile is created', async () => {
    const createdListener = vi.fn();
    events.on('profile.created', createdListener);

    const presets = await repos.presets.list();
    expect(presets.length).toBeGreaterThan(0);

    const profile = await service.create({
      name: 'Realtime Test Profile',
      presetId: presets[0]!.id,
      engine: 'apostate',
    });

    expect(createdListener).toHaveBeenCalledTimes(1);
    expect(createdListener).toHaveBeenCalledWith({
      profileId: profile.id,
      name: 'Realtime Test Profile',
    });
  });

  it('emits profile.deleted when a profile is deleted', async () => {
    const deletedListener = vi.fn();
    events.on('profile.deleted', deletedListener);

    const presets = await repos.presets.list();
    const profile = await service.create({
      name: 'Profile to Delete',
      presetId: presets[0]!.id,
      engine: 'apostate',
    });

    await service.delete(profile.id);

    expect(deletedListener).toHaveBeenCalledTimes(1);
    expect(deletedListener).toHaveBeenCalledWith({
      profileId: profile.id,
    });
  });
});
