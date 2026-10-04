import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/events/EventBus';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { ProfileService } from '../src/services/ProfileService';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { EngineFactory } from '../src/engines/EngineFactory';
import { ApostateEngine } from '../src/engines/apostate/ApostateEngine';
import type { BrowserEngine, BrowserSession, LaunchInput } from '../src/engines/types';
import { TersooError } from '../src/util/errors';

/**
 * A fresh user-data directory per test.
 *
 * These tests must not point at a fixed directory: the database records a
 * checksum for every applied migration, so a directory reused across runs
 * raises `checksum mismatch` as soon as a migration file is edited.
 */
function makeUserDataDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tersoo-camoufox-${label}-`));
}

describe('Phase 4 — ProfileService Camoufox Engine Integration', () => {
  it('rejects Camoufox engine for Android preset with ENGINE_PLATFORM_MISMATCH', async () => {
    const config = {
      userDataDir: makeUserDataDir('android'),
      chromeBinary: 'chrome.exe',
      headless: true,
      strictCoherence: false,
      leaseTtlMs: 60000,
      leaseHeartbeatMs: 15000,
      leaseSweepMs: 30000,
      forwarderHealthTimeoutMs: 5000,
      cdpDiscoveryTimeoutMs: 5000,
      stealthMinScore: 90,
      defaultConcurrency: 4,
    };

    const db = openDb(config);
    const repos = new Repos(db);
    await repos.presets.seedDefaults();
    const events = new EventBus();
    const supervisor = new BrowserSupervisor({ config, events });

    const service = new ProfileService({
      repos,
      supervisor,
      events,
      config,
    });

    // Preset for android
    const androidPreset = (await repos.presets.list()).find((p) => p.platform === 'android');
    expect(androidPreset).toBeDefined();

    await expect(
      service.create({
        name: 'Android Camoufox Test',
        presetId: androidPreset!.id,
        // @ts-expect-error engine passed at runtime
        engine: 'camoufox',
      }),
    ).rejects.toThrow(TersooError);

    try {
      await service.create({
        name: 'Android Camoufox Test 2',
        presetId: androidPreset!.id,
        // @ts-expect-error engine passed at runtime
        engine: 'camoufox',
      });
    } catch (err: any) {
      expect(err.code).toBe('ENGINE_PLATFORM_MISMATCH');
    }

    db.close();
  });

  it('creates and launches a profile using CamoufoxEngine via EngineFactory', async () => {
    const config = {
      userDataDir: makeUserDataDir('enginefactory'),
      chromeBinary: 'chrome.exe',
      headless: true,
      strictCoherence: false,
      leaseTtlMs: 60000,
      leaseHeartbeatMs: 15000,
      leaseSweepMs: 30000,
      forwarderHealthTimeoutMs: 5000,
      cdpDiscoveryTimeoutMs: 5000,
      stealthMinScore: 90,
      defaultConcurrency: 4,
    };

    const db = openDb(config);
    const repos = new Repos(db);
    await repos.presets.seedDefaults();
    const events = new EventBus();
    const supervisor = new BrowserSupervisor({ config, events });

    let camoufoxLaunched = false;
    const mockCamoufoxEngine: BrowserEngine = {
      type: 'camoufox',
      async launch(input: LaunchInput): Promise<BrowserSession> {
        camoufoxLaunched = true;
        return {
          humanizer: null,
          engine: 'camoufox',
          cdpPort: null,
          async close() {},
        };
      },
      async stop() {},
    };

    const engineFactory = new EngineFactory(
      new ApostateEngine({ supervisor, config }),
      mockCamoufoxEngine,
    );

    const service = new ProfileService({
      repos,
      supervisor,
      events,
      config,
      engineFactory,
    });

    const winPreset = (await repos.presets.list()).find((p) => p.platform === 'windows');
    expect(winPreset).toBeDefined();

    const created = await service.create({
      name: 'Windows Camoufox Profile',
      presetId: winPreset!.id,
      // @ts-expect-error runtime field
      engine: 'camoufox',
    });

    expect(created.id).toBeDefined();

    const launchResult = await service.launch(created.id, { skipEmulation: true });
    expect(camoufoxLaunched).toBe(true);
    expect(launchResult.runId).toBeDefined();

    await service.stop(created.id);
    db.close();
  });
});
