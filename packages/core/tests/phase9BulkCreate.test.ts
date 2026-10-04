import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { ProfileService } from '../src/services/ProfileService';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { EventBus } from '../src/events/EventBus';
import { DEFAULT_PRESET_IDS } from '@tersoo/contracts';

describe('Phase 9: Dual-Engine Bulk Create & Settings Integration', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let profileService: ProfileService;
  let events: EventBus;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-phase9-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    await repos.presets.seedDefaults();
    events = new EventBus();
    const supervisor = new BrowserSupervisor({
      repos,
      events,
      config,
    });
    profileService = new ProfileService({
      repos,
      supervisor,
      events,
      config,
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('bulk creates profiles with mixed 70/30 distribution', async () => {
    const profiles = await profileService.bulkCreate({
      count: 10,
      presetId: DEFAULT_PRESET_IDS.windows11,
      engineDistribution: {
        mode: 'mixed',
        weights: { apostate: 70, camoufox: 30 },
      },
      tags: ['bulk-test'],
    });

    expect(profiles).toHaveLength(10);
    const apostateCount = profiles.filter((p) => p.engine === 'apostate').length;
    const camoufoxCount = profiles.filter((p) => p.engine === 'camoufox').length;

    expect(apostateCount).toBe(7);
    expect(camoufoxCount).toBe(3);
    expect(profiles[0]?.tags).toContain('bulk-test');
  });

  it('bulk creates profiles with single engine mode', async () => {
    const profiles = await profileService.bulkCreate({
      count: 5,
      presetId: DEFAULT_PRESET_IDS.macosSonoma,
      engineDistribution: {
        mode: 'single',
        engine: 'camoufox',
      },
    });

    expect(profiles).toHaveLength(5);
    expect(profiles.every((p) => p.engine === 'camoufox')).toBe(true);
  });

  it('prevents camoufox on android personas', async () => {
    try {
      await profileService.bulkCreate({
        count: 3,
        presetId: DEFAULT_PRESET_IDS.android14,
        engineDistribution: {
          mode: 'single',
          engine: 'camoufox',
        },
      });
      expect.unreachable('Should have thrown ENGINE_PLATFORM_MISMATCH');
    } catch (err: any) {
      expect(err.code).toBe('ENGINE_PLATFORM_MISMATCH');
      expect(err.message).toContain('Camoufox does not support Android personas');
    }
  });

  it('saves and reads LLM config and weights from repos', async () => {
    // 1. Weights
    await repos.settings.set('engine_weights', JSON.stringify({ apostate: 80, camoufox: 20 }));
    const savedWeights = await repos.settings.get('engine_weights');
    expect(JSON.parse(savedWeights!)).toEqual({ apostate: 80, camoufox: 20 });

    // 2. LLM Config
    await repos.llmConfig.update({
      text_model: 'custom/reasoning-model',
      vision_model: 'custom/vision-model',
      vision_enabled: 1,
    });
    const llm = await repos.llmConfig.get();
    expect(llm?.text_model).toBe('custom/reasoning-model');
    expect(llm?.vision_model).toBe('custom/vision-model');
    expect(llm?.vision_enabled).toBe(1);

    // 3. CAPTCHA Budget Setting
    await repos.settings.set('captcha_budget', '5');
    const budget = await repos.settings.get('captcha_budget');
    expect(budget).toBe('5');
  });
});
