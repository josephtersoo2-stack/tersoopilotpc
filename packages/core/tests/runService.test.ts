import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PRESET_IDS, type Workflow } from '@tersoo/contracts';

import { loadConfig } from '../src/config';
import type { CrosshairWorker } from '../src/crosshair/CrosshairWorker';
import { EventBus } from '../src/events/EventBus';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { JobQueue } from '../src/queue/JobQueue';
import type { FleetService } from '../src/services/FleetService';
import type { ProfileService } from '../src/services/ProfileService';
import { RunService } from '../src/services/RunService';
import type { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';

describe('RunService (Phase 5)', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let queue: JobQueue;
  let events: EventBus;
  let mockSupervisor: BrowserSupervisor;
  let mockCrosshair: CrosshairWorker;
  let mockProfiles: ProfileService;
  let mockFleet: FleetService;
  let runService: RunService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-run-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    await repos.presets.seedDefaults();
    queue = new JobQueue(db, { concurrency: 3 });
    events = new EventBus();

    // Create base task and profiles to satisfy foreign keys
    const now = Date.now();
    await repos.tasks.create({
      id: 'task-1',
      name: 'Default Task',
      schema_version: 1,
      definition: JSON.stringify({
        schemaVersion: 1,
        name: 'Default',
        variables: {},
        steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }],
      }),
      tags: '[]',
      created_at: now,
      updated_at: now,
    });

    await repos.profiles.create({
      id: 'profile-1',
      name: 'Profile 1',
      tags: '[]',
      state: 'idle',
      engine: 'apostate',
      action_mode: 'scripted',
      preset_id: DEFAULT_PRESET_IDS.windows11,
      fingerprint_seed: '12345',
      fingerprint_bundle: JSON.stringify({}),
      user_data_dir: path.join(tempDir, 'p1'),
      notes: null,
      last_launched_at: null,
      captcha_budget_used: 0,
      created_at: now,
      updated_at: now,
    });

    await repos.profiles.create({
      id: 'profile-2',
      name: 'Profile 2',
      tags: '[]',
      state: 'idle',
      engine: 'apostate',
      action_mode: 'scripted',
      preset_id: DEFAULT_PRESET_IDS.windows11,
      fingerprint_seed: '67890',
      fingerprint_bundle: JSON.stringify({}),
      user_data_dir: path.join(tempDir, 'p2'),
      notes: null,
      last_launched_at: null,
      captcha_budget_used: 0,
      created_at: now,
      updated_at: now,
    });

    mockSupervisor = {
      list: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      register: vi.fn(),
      stop: vi.fn(),
      stopAll: vi.fn(),
    } as unknown as BrowserSupervisor;

    mockCrosshair = {
      hasSession: vi.fn().mockReturnValue(true),
      getPage: vi.fn().mockReturnValue({
        goto: vi.fn().mockResolvedValue(undefined),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('dummy')),
      }),
      getCdpSession: vi.fn().mockReturnValue({}),
    } as unknown as CrosshairWorker;

    mockProfiles = {
      launch: vi.fn().mockResolvedValue({ instance: {}, runId: 'run-1' }),
      stop: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProfileService;

    mockFleet = {
      setConcurrency: vi.fn(),
      getConcurrency: vi.fn().mockReturnValue(3),
      acquireLaunchStagger: vi.fn().mockResolvedValue(undefined),
      canSpawnAnother: vi.fn().mockResolvedValue({ ok: true }),
      status: vi.fn().mockResolvedValue({}),
    } as unknown as FleetService;

    runService = new RunService({
      repos,
      queue,
      events,
      supervisor: mockSupervisor,
      crosshair: mockCrosshair,
      profiles: mockProfiles,
      fleet: mockFleet,
      config,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('query and format runs', () => {
    it('lists runs formatted as camelCase RunSummary contracts', async () => {
      const now = Date.now();
      await repos.runs.create({
        id: 'run-test-1',
        task_id: 'task-1',
        profile_id: 'profile-1',
        state: 'queued',
        idempotency_key: null,
        attempt: 1,
        checkpoint: null,
        error_class: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: now,
      });

      const list = await runService.list();
      expect(list.length).toBe(1);
      const item = list[0]!;
      expect(item.id).toBe('run-test-1');
      expect(item.taskId).toBe('task-1');
      expect(item.profileId).toBe('profile-1');
      expect(item.state).toBe('queued');
      expect(item.attempt).toBe(1);
    });

    it('retrieves run by id with step runs and parsed checkpoint', async () => {
      const now = Date.now();
      await repos.runs.create({
        id: 'run-test-2',
        task_id: 'task-1',
        profile_id: 'profile-1',
        state: 'running',
        idempotency_key: null,
        attempt: 1,
        checkpoint: JSON.stringify({ lastStepIndex: 0, variables: { email: 'test@example.com' } }),
        error_class: null,
        error_message: null,
        started_at: now,
        finished_at: null,
        created_at: now,
      });

      await repos.stepRuns.create({
        id: 'step-1',
        run_id: 'run-test-2',
        step_index: 0,
        step_type: 'navigate',
        state: 'succeeded',
        attempts: 1,
        last_error: null,
        artifacts: JSON.stringify({ pageTitle: 'Example' }),
        started_at: now,
        finished_at: now + 500,
      });

      const detail = await runService.getById('run-test-2');
      expect(detail).toBeDefined();
      expect(detail!.id).toBe('run-test-2');
      expect(detail!.checkpoint).toEqual({ lastStepIndex: 0, variables: { email: 'test@example.com' } });
      expect(detail!.steps.length).toBe(1);
      expect(detail!.steps[0]!.stepType).toBe('navigate');
      expect(detail!.steps[0]!.state).toBe('succeeded');
      expect(detail!.steps[0]!.artifacts).toEqual({ pageTitle: 'Example' });
    });
  });

  describe('cancellation and resumption', () => {
    it('cancels an active run, halts execution, stops profile, and emits run.state_changed', async () => {
      const now = Date.now();
      await repos.runs.create({
        id: 'run-cancel-1',
        task_id: 'task-1',
        profile_id: 'profile-1',
        state: 'running',
        idempotency_key: null,
        attempt: 1,
        checkpoint: null,
        error_class: null,
        error_message: null,
        started_at: now,
        finished_at: null,
        created_at: now,
      });

      const eventsFired: any[] = [];
      events.on('run.state_changed', (p) => {
        eventsFired.push(p);
      });

      await runService.cancel('run-cancel-1');

      const updated = await repos.runs.getById('run-cancel-1');
      expect(updated?.state).toBe('cancelled');
      expect(updated?.finished_at).toBeGreaterThan(0);
      expect(mockProfiles.stop).toHaveBeenCalledWith('profile-1');
      expect(eventsFired).toHaveLength(1);
      expect(eventsFired[0]).toEqual({ runId: 'run-cancel-1', state: 'cancelled' });
    });

    it('resumes a paused run from its checkpoint offset', async () => {
      const now = Date.now();
      await repos.runs.create({
        id: 'run-resume-1',
        task_id: 'task-1',
        profile_id: 'profile-1',
        state: 'paused',
        idempotency_key: null,
        attempt: 1,
        checkpoint: JSON.stringify({ lastStepIndex: 2, variables: { foo: 'bar' } }),
        error_class: 'STEP_FAILED',
        error_message: 'Selector timed out',
        started_at: now,
        finished_at: null,
        created_at: now,
      });

      const eventsFired: any[] = [];
      events.on('run.state_changed', (p) => {
        eventsFired.push(p);
      });

      await runService.resume('run-resume-1');

      const updated = await repos.runs.getById('run-resume-1');
      expect(updated?.state).toBe('queued');
      expect(updated?.error_class).toBeNull();
      expect(eventsFired[0]).toEqual({ runId: 'run-resume-1', state: 'queued' });
    });
  });

  describe('crash recovery', () => {
    it('recovers runs left in running or starting state to paused on restart', async () => {
      const now = Date.now();
      await repos.runs.create({
        id: 'run-stale-1',
        task_id: 'task-1',
        profile_id: 'profile-1',
        state: 'running',
        idempotency_key: null,
        attempt: 1,
        checkpoint: JSON.stringify({ lastStepIndex: 1 }),
        error_class: null,
        error_message: null,
        started_at: now,
        finished_at: null,
        created_at: now,
      });

      await repos.runs.create({
        id: 'run-stale-2',
        task_id: 'task-1',
        profile_id: 'profile-2',
        state: 'starting',
        idempotency_key: null,
        attempt: 1,
        checkpoint: null,
        error_class: null,
        error_message: null,
        started_at: now,
        finished_at: null,
        created_at: now,
      });

      const recoveredCount = await runService.recoverStaleRuns();
      expect(recoveredCount).toBe(2);

      const r1 = await repos.runs.getById('run-stale-1');
      const r2 = await repos.runs.getById('run-stale-2');
      expect(r1?.state).toBe('paused');
      expect(r1?.error_class).toBe('APP_CRASH_RECOVERED');
      expect(r2?.state).toBe('paused');
      expect(r2?.error_class).toBe('APP_CRASH_RECOVERED');
    });
  });

  describe('end-to-end workflow run execution', () => {
    it('executes workflow steps, records checkpoints, and finishes with succeeded state', async () => {
      const now = Date.now();
      const workflow: Workflow = {
        schemaVersion: 1,
        name: 'Login Workflow',
        variables: {},
        steps: [
          { type: 'sleep', minMs: 10, maxMs: 20 },
          { type: 'sleep', minMs: 10, maxMs: 20 },
        ],
      };

      await repos.tasks.create({
        id: 'task-e2e',
        name: 'Login Task',
        schema_version: 1,
        definition: JSON.stringify(workflow),
        tags: '[]',
        created_at: now,
        updated_at: now,
      });

      await repos.runs.create({
        id: 'run-e2e-1',
        task_id: 'task-e2e',
        profile_id: 'profile-1',
        state: 'queued',
        idempotency_key: null,
        attempt: 1,
        checkpoint: null,
        error_class: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: now,
      });

      const stateEvents: string[] = [];
      events.on('run.state_changed', (p) => {
        stateEvents.push(p.state);
      });

      await queue.enqueue('workflow.run', {
        runId: 'run-e2e-1',
        taskId: 'task-e2e',
        profileId: 'profile-1',
        options: { concurrency: 2, staggerMinMs: 0, staggerMaxMs: 0 },
      });

      await queue.waitForIdle();

      const finalRun = await repos.runs.getById('run-e2e-1');
      expect(finalRun?.state).toBe('succeeded');
      expect(finalRun?.finished_at).toBeGreaterThan(0);
      expect(finalRun?.checkpoint).toBeDefined();

      const cp = JSON.parse(finalRun!.checkpoint!);
      expect(cp.lastStepIndex).toBe(1);

      const stepRuns = await repos.stepRuns.listForRun('run-e2e-1');
      expect(stepRuns.length).toBe(2);
      expect(stepRuns[0]!.state).toBe('succeeded');
      expect(stepRuns[1]!.state).toBe('succeeded');

      expect(mockProfiles.launch).toHaveBeenCalled();
      expect(mockProfiles.stop).toHaveBeenCalledWith('profile-1');
      expect(stateEvents).toContain('starting');
      expect(stateEvents).toContain('running');
      expect(stateEvents).toContain('succeeded');
    });

    it('handles failure policy skip by recording step skipped and completing remaining steps', async () => {
      const now = Date.now();
      const workflow: Workflow = {
        schemaVersion: 1,
        name: 'Skip Test Workflow',
        variables: {},
        steps: [
          // Step 0: click with non-existent selector will fail
          { type: 'click', selector: '#non-existent-selector', humanized: false },
          // Step 1: valid sleep step
          { type: 'sleep', minMs: 10, maxMs: 20 },
        ],
      };

      await repos.tasks.create({
        id: 'task-skip-test',
        name: 'Skip Test Task',
        schema_version: 1,
        definition: JSON.stringify(workflow),
        tags: '[]',
        created_at: now,
        updated_at: now,
      });

      await repos.runs.create({
        id: 'run-skip-1',
        task_id: 'task-skip-test',
        profile_id: 'profile-1',
        state: 'queued',
        idempotency_key: null,
        attempt: 1,
        checkpoint: null,
        error_class: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: now,
      });

      await queue.enqueue('workflow.run', {
        runId: 'run-skip-1',
        taskId: 'task-skip-test',
        profileId: 'profile-1',
        options: { failurePolicy: 'skip', staggerMinMs: 0, staggerMaxMs: 0 },
      });

      await queue.waitForIdle();

      const finalRun = await repos.runs.getById('run-skip-1');
      expect(finalRun?.state).toBe('succeeded');

      const stepRuns = await repos.stepRuns.listForRun('run-skip-1');
      expect(stepRuns.length).toBe(2);
      expect(stepRuns[0]!.state).toBe('skipped');
      expect(stepRuns[1]!.state).toBe('succeeded');
    });
  });
});
