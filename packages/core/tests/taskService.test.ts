import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_PRESET_IDS, type Workflow } from '@tersoo/contracts';

import { loadConfig } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { JobQueue } from '../src/queue/JobQueue';
import { TaskService } from '../src/services/TaskService';

describe('TaskService', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let queue: JobQueue;
  let events: EventBus;
  let taskService: TaskService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-task-service-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    await repos.presets.seedDefaults();
    queue = new JobQueue(db);
    events = new EventBus();
    taskService = new TaskService({ repos, queue, events });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const sampleWorkflow: Workflow = {
    schemaVersion: 1,
    name: 'Sample Workflow',
    variables: { baseUrl: 'https://example.com' },
    steps: [
      { type: 'navigate', url: '{{baseUrl}}/login', waitUntil: 'domcontentloaded' },
      { type: 'waitFor', selector: '#login-btn', timeoutMs: 5000 },
      { type: 'click', selector: '#login-btn', humanized: true },
    ],
  };

  it('creates, lists, and retrieves tasks by id', async () => {
    const created = await taskService.create({
      name: 'Test Task',
      tags: ['automation', 'canary'],
      definition: sampleWorkflow,
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Test Task');
    expect(created.tags).toEqual(['automation', 'canary']);
    expect(created.definition.steps).toHaveLength(3);

    const list = await taskService.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
    expect(list[0]?.name).toBe('Test Task');

    const fetched = await taskService.getById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Test Task');
    expect(fetched?.definition.name).toBe('Sample Workflow');
  });

  it('dispatches task to target profiles and enqueues jobs', async () => {
    // Create profile
    const profileId = crypto.randomUUID();
    const profile = await repos.profiles.create({
      id: profileId,
      name: 'Worker 1',
      tags: JSON.stringify(['scraper']),
      state: 'idle',
      preset_id: DEFAULT_PRESET_IDS.windows11,
      fingerprint_seed: 'seed-123',
      fingerprint_bundle: JSON.stringify({}),
      user_data_dir: path.join(tempDir, 'profile1'),
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const task = await taskService.create({
      name: 'Scrape Task',
      tags: ['production'],
      definition: sampleWorkflow,
    });

    const dispatchResult = await taskService.dispatch({
      taskId: task.id,
      targets: { profileIds: [profile.id] },
    });

    expect(dispatchResult.runIds).toHaveLength(1);
    expect(queue.size()).toBe(1);

    const runs = await repos.runs.list({ taskId: task.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.profile_id).toBe(profile.id);
    expect(runs[0]?.state).toBe('queued');
  });
});
