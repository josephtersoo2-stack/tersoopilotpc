import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_PRESET_IDS } from '@tersoo/contracts';

import { loadConfig } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { FingerprintEngine } from '../src/fingerprint/FingerprintEngine';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { ProfileService } from '../src/services/ProfileService';
import type { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';

describe('ProfileService Export & Import (Phase 6 Hardening)', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let events: EventBus;
  let profileService: ProfileService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-export-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    await repos.presets.seedDefaults();
    events = new EventBus();

    profileService = new ProfileService({
      repos,
      supervisor: {} as BrowserSupervisor,
      events,
      config,
      fingerprint: new FingerprintEngine(repos.presets),
      forwarder: {} as any,
      healthProbe: {} as any,
      secrets: {} as any,
    });
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('exports and re-imports a profile cleanly with unique identity', async () => {
    // 1. Create initial profile
    const original = await profileService.create({
      name: 'Source Profile',
      presetId: DEFAULT_PRESET_IDS.windows11,
      engine: 'apostate',
      tags: ['production', 'banking'],
      notes: 'Sensitive financial operations',
    });

    expect(original.id).toBeDefined();
    expect(original.name).toBe('Source Profile');

    // 2. Export profile bundle
    const bundle = await profileService.exportProfile(original.id);
    expect(bundle.version).toBe(1);
    expect(bundle.exportedAt).toBeGreaterThan(0);
    expect(bundle.profile.name).toBe('Source Profile');
    expect(bundle.profile.tags).toEqual(['production', 'banking']);
    expect(bundle.profile.engine).toBe('apostate');
    expect(bundle.profile.fingerprintSeed).toBe(original.fingerprintSeed);
    expect(bundle.profile.notes).toBe('Sensitive financial operations');

    // 3. Import profile from bundle
    const imported = await profileService.importProfile({
      bundle,
      nameOverride: 'Cloned Profile',
    });

    expect(imported.id).toBeDefined();
    expect(imported.id).not.toBe(original.id); // distinct UUID
    expect(imported.name).toBe('Cloned Profile');
    expect(imported.tags).toEqual(['production', 'banking']);
    expect(imported.fingerprintSeed).toBe(original.fingerprintSeed);
    expect(imported.engine).toBe('apostate');
    expect(imported.userDataDir).not.toBe(original.userDataDir); // distinct directory
    expect(fs.existsSync(imported.userDataDir)).toBe(true);

    // 4. Verify both exist in repo
    const list = await profileService.list();
    expect(list.length).toBe(2);
  });
});
