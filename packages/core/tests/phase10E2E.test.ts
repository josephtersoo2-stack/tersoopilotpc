import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElementHandle, Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PRESET_IDS } from '@tersoo/contracts';
import { loadConfig } from '../src/config';
import { EngineFactory } from '../src/engines/EngineFactory';
import type { BrowserEngine } from '../src/engines/types';
import { Humanizer } from '../src/crosshair/Humanizer';
import { EventBus } from '../src/events/EventBus';
import type { LlmService } from '../src/llm/LlmService';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import type { RunRow } from '../src/persistence/schema';
import { ProfileService } from '../src/services/ProfileService';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { CaptchaHandler } from '../src/task/CaptchaHandler';
import { StepRunner } from '../src/task/StepRunner';
import { createLogger, type IEventAppender } from '../src/util/logger';

function makeRunRow(id: string, taskId: string, profileId: string): RunRow {
  return {
    id,
    task_id: taskId,
    profile_id: profileId,
    state: 'running',
    idempotency_key: null,
    attempt: 1,
    checkpoint: null,
    error_class: null,
    error_message: null,
    started_at: Date.now(),
    finished_at: null,
    created_at: Date.now(),
  };
}

describe('Phase 10: End-to-End Validation & Hardening Test Suite', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let events: EventBus;
  let profileService: ProfileService;
  let engineFactory: EngineFactory;
  let mockApostate: BrowserEngine;
  let mockCamoufox: BrowserEngine;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-phase10-e2e-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    await repos.presets.seedDefaults();
    events = new EventBus();
    const supervisor = new BrowserSupervisor({
      repos,
      events,
      config,
      crosshair: {} as any,
    });

    mockApostate = {
      type: 'apostate',
      launch: vi.fn().mockImplementation(async (opts) => ({
        id: `sess-apostate-${opts.profile.id}`,
        profileId: opts.profile.id,
        engine: 'apostate',
        cdp: {} as any,
        close: vi.fn(),
      })),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    mockCamoufox = {
      type: 'camoufox',
      launch: vi.fn().mockImplementation(async (opts) => ({
        id: `sess-camoufox-${opts.profile.id}`,
        profileId: opts.profile.id,
        engine: 'camoufox',
        cdp: {} as any,
        close: vi.fn(),
      })),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    engineFactory = new EngineFactory(mockApostate, mockCamoufox);

    profileService = new ProfileService({
      repos,
      supervisor,
      events,
      config,
      engineFactory,
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('1. Fleet Concurrency & Engine Distribution', () => {
    it('bulk creates 20 mixed profiles with 70/30 distribution', async () => {
      const profiles = await profileService.bulkCreate({
        count: 20,
        presetId: DEFAULT_PRESET_IDS.windows11,
        engineDistribution: {
          mode: 'mixed',
          weights: { apostate: 70, camoufox: 30 },
        },
        tags: ['phase10-fleet'],
      });

      expect(profiles).toHaveLength(20);
      const apostateCount = profiles.filter((p) => p.engine === 'apostate').length;
      const camoufoxCount = profiles.filter((p) => p.engine === 'camoufox').length;

      // 70% of 20 = 14 Apostate, 30% of 20 = 6 Camoufox
      expect(apostateCount).toBe(14);
      expect(camoufoxCount).toBe(6);

      // Verify each profile exists in persistence with engine and user_data_dir intact
      for (const p of profiles) {
        const row = await repos.profiles.getById(p.id);
        expect(row).toBeDefined();
        expect(row?.engine).toBe(p.engine);
        expect(row?.tags).toContain('phase10-fleet');
        expect(fs.existsSync(row!.user_data_dir)).toBe(true);
      }
    });

    it('launches concurrent fleet with mixed engines without lock conflicts', async () => {
      const profiles = await profileService.bulkCreate({
        count: 10,
        presetId: DEFAULT_PRESET_IDS.windows11,
        engineDistribution: {
          mode: 'mixed',
          weights: { apostate: 50, camoufox: 50 },
        },
      });

      expect(profiles).toHaveLength(10);
      const apostateProfiles = profiles.filter((p) => p.engine === 'apostate');
      const camoufoxProfiles = profiles.filter((p) => p.engine === 'camoufox');
      expect(apostateProfiles).toHaveLength(5);
      expect(camoufoxProfiles).toHaveLength(5);

      // Launch all 10 profiles in parallel
      const launchResults = await Promise.all(
        profiles.map((p) => profileService.launch(p.id, { headless: true })),
      );

      expect(launchResults).toHaveLength(10);
      expect(mockApostate.launch).toHaveBeenCalledTimes(5);
      expect(mockCamoufox.launch).toHaveBeenCalledTimes(5);

      // Verify all profiles transitioned to running cleanly
      for (const p of profiles) {
        const stored = await repos.profiles.getById(p.id);
        expect(stored?.state).toBe('running');
      }
    });
  });

  describe('2. CAPTCHA Lifecycle & Hard Budget Enforcement', () => {
    it('records CAPTCHA events and aborts when budget is exceeded', async () => {
      const profile = await profileService.create({
        name: 'Captcha Test Profile',
        presetId: DEFAULT_PRESET_IDS.windows11,
      });

      const task = await repos.tasks.create({
        id: 'task-captcha-test',
        name: 'Task for Captcha Test',
        schema_version: 1,
        definition: JSON.stringify({ steps: [] }),
        tags: '[]',
        created_at: Date.now(),
        updated_at: Date.now(),
      } as any);

      const runs = await Promise.all(
        [1, 2, 3, 4].map((i) =>
          repos.runs.create(makeRunRow(`run-captcha-${i}`, task.id, profile.id)),
        ),
      );
      expect(runs).toHaveLength(4);

      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'clickAt').mockResolvedValue(undefined);
      vi.spyOn(humanizer, 'drag').mockResolvedValue(undefined);

      const mockLlm = {
        decideFromScreenshot: vi.fn().mockResolvedValue({
          action: 'click',
          x: 100,
          y: 200,
          reason: 'Solve test challenge',
        }),
      } as unknown as LlmService;

      // detectCaptcha walks frames with locator().count().
      const captchaPageMock = (present: () => boolean) =>
        ({
          frames: vi.fn().mockReturnValue([]),
          locator: vi.fn().mockImplementation((selector: string) => ({
            count: vi
              .fn()
              .mockResolvedValue(
                present() && (selector.includes('turnstile') || selector.includes('recaptcha')) ? 1 : 0,
              ),
          })),
          screenshot: vi.fn().mockResolvedValue(Buffer.from('png-screenshot-bytes')),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
        }) as unknown as Page;

      const mockCaptchaPage = captchaPageMock(() => true);

      const artifactsDir = path.join(tempDir, 'artifacts');
      const handler = new CaptchaHandler(
        mockLlm,
        humanizer,
        repos.captchaEvents,
        repos.profiles,
        repos.settings,
        artifactsDir,
      );

      // Verify initial budget is 0 used
      const p1 = await repos.profiles.getById(profile.id);
      expect(p1?.captcha_budget_used).toBe(0);

      // 3 successful CAPTCHA handlings (within default budget of 3)
      for (let i = 1; i <= 3; i++) {
        // Present on the first detection, gone once the model's click lands.
        let solved = false;
        vi.spyOn(humanizer, 'clickAt').mockImplementation(async () => {
          solved = true;
        });
        const pageForRun = captchaPageMock(() => !solved);

        const handled = await handler.checkAndHandle(pageForRun, `run-captcha-${i}`, profile.id);
        expect(handled).toBe(1);

        const currentProfile = await repos.profiles.getById(profile.id);
        expect(currentProfile?.captcha_budget_used).toBe(i);
      }

      // The 4th encounter exceeds the budget limit (3) and aborts
      try {
        await handler.checkAndHandle(mockCaptchaPage, 'run-captcha-4', profile.id);
        expect.unreachable('Should have thrown CAPTCHA_BUDGET_EXCEEDED');
      } catch (err: any) {
        expect(err.code).toBe('CAPTCHA_BUDGET_EXCEEDED');
        expect(err.message).toContain('aborting run');
      }

      // Verify events recorded in persistence
      const events = await repos.captchaEvents.listForProfile(profile.id);
      expect(events.length).toBeGreaterThanOrEqual(4);
      const abortedEvent = events.find((e) => e.outcome === 'aborted');
      expect(abortedEvent).toBeDefined();
    });
  });

  describe('3. Hardening & Security Protections', () => {
    it('redacts sensitive fields in logger and database event appender', async () => {
      const mockAppender: IEventAppender = {
        append: vi.fn(),
      };

      const logger = createLogger({
        level: 'info',
        eventRepo: mockAppender,
      });

      const child = logger.child('security', { profileId: 'p-sec' });

      child.info('user.login', {
        username: 'alice',
        password: 'my-super-secret-password',
        apiKey: 'sk-openrouter-secret-key-12345',
        nested: {
          token: 'jwt.token.secret',
        },
      });

      expect(mockAppender.append).toHaveBeenCalledTimes(1);
      const [level, scope, event, data] = (mockAppender.append as any).mock.calls[0];
      expect(level).toBe('info');
      expect(scope).toBe('security');
      expect(event).toBe('user.login');
      expect((data as any).username).toBe('alice');
      expect((data as any).password).toBe('[REDACTED]');
      expect((data as any).apiKey).toBe('[REDACTED]');
      expect((data as any).nested.token).toBe('[REDACTED]');
    });

    it('enforces 30-day retention cleanup on captcha_events table', async () => {
      const profile = await profileService.create({
        name: 'Cleanup Profile',
        presetId: DEFAULT_PRESET_IDS.windows11,
      });

      const task = await repos.tasks.create({
        id: 'task-retention-test',
        name: 'Task for Retention Test',
        schema_version: 1,
        definition: JSON.stringify({ steps: [] }),
        tags: '[]',
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const run1 = await repos.runs.create(makeRunRow('run-retention-1', task.id, profile.id));
      const run2 = await repos.runs.create(makeRunRow('run-retention-2', task.id, profile.id));

      const now = Date.now();
      const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;
      const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;

      // Insert 2 old events (40 days ago) and 1 recent event (5 days ago)
      await repos.captchaEvents.insert({
        id: 'old-event-1',
        runId: run1.id,
        profileId: profile.id,
        detectedAt: fortyDaysAgo,
        challengeType: 'turnstile',
        outcome: 'solved',
        createdAt: fortyDaysAgo,
      });

      await repos.captchaEvents.insert({
        id: 'old-event-2',
        runId: run1.id,
        profileId: profile.id,
        detectedAt: fortyDaysAgo,
        challengeType: 'turnstile',
        outcome: 'failed',
        createdAt: fortyDaysAgo,
      });

      await repos.captchaEvents.insert({
        id: 'recent-event-1',
        runId: run2.id,
        profileId: profile.id,
        detectedAt: fiveDaysAgo,
        challengeType: 'turnstile',
        outcome: 'solved',
        createdAt: fiveDaysAgo,
      });

      // Cleanup events older than 30 days
      const deletedCount = await repos.captchaEvents.cleanupOlderThanDays(30);
      expect(deletedCount).toBe(2);

      // Verify only the recent event remains
      const remaining = await repos.captchaEvents.listForProfile(profile.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe('recent-event-1');
    });

    it('validates and updates engine launch options configuration', async () => {
      // 1. Initial engine config exists
      const apostateConfig = await repos.engineConfig.get('apostate');
      expect(apostateConfig).toBeDefined();

      // 2. Update with JSON launch options
      await repos.engineConfig.update('apostate', {
        launch_options: JSON.stringify({
          headless: true,
          args: ['--disable-gpu', '--no-sandbox'],
        }),
      });

      const updated = await repos.engineConfig.get('apostate');
      const parsedOptions = JSON.parse(updated!.launch_options);
      expect(parsedOptions.headless).toBe(true);
      expect(parsedOptions.args).toContain('--disable-gpu');

      // 3. Camoufox configuration
      await repos.engineConfig.update('camoufox', {
        launch_options: JSON.stringify({
          os: 'windows',
          geoip: true,
        }),
      });

      const camoufoxConfig = await repos.engineConfig.get('camoufox');
      const parsedCamoufox = JSON.parse(camoufoxConfig!.launch_options);
      expect(parsedCamoufox.os).toBe('windows');
      expect(parsedCamoufox.geoip).toBe(true);
    });
  });

  describe('4. LLM Telemetry & Step Execution', () => {
    it('executes LLM step with humanized interaction and captures iteration and cost telemetry', async () => {
      const mockResolver = {
        resolve: vi.fn(),
      };
      const runner = new StepRunner(mockResolver as any);

      const mockLlmService = {
        decideFromTree: vi
          .fn()
          .mockResolvedValueOnce({
            action: 'wait',
            ms: 50,
          })
          .mockResolvedValueOnce({
            action: 'done',
          }),
      } as unknown as LlmService;

      const mockPage = {
        accessibility: {
          snapshot: vi.fn().mockResolvedValue({
            role: 'WebArea',
            name: 'Sample E2E Page',
            children: [],
          }),
        },
        evaluate: vi.fn().mockResolvedValue({
          role: 'WebArea',
          name: 'Sample E2E Page',
          children: [],
        }),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      const result = await runner.run(
        {
          type: 'llm',
          goal: 'Complete onboarding flow',
          maxIterations: 5,
        },
        {
          profileId: 'prof-telemetry',
          taskId: 'task-telemetry',
          runId: 'run-telemetry',
          stepIndex: 0,
          page: mockPage,
          cdp: {} as any,
          llm: mockLlmService,
          variables: {},
        },
      );

      expect(result.stepType).toBe('llm');
      expect(result.artifacts?.iterations).toBe(2);
      expect(result.artifacts?.estimatedCostUsd).toBe(0.004);
      expect(mockLlmService.decideFromTree).toHaveBeenCalledTimes(2);
    });
  });
});

