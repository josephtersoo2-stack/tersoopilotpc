import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_PRESET_IDS, type Workflow } from '../packages/contracts/src';
import { createContainer, loadConfig } from '../packages/core/src';

async function testTaskExecution() {
  console.log('=== TersooPilot Task Creation & Execution Test ===');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-task-test-'));
  const config = loadConfig(tempDir, 'dummy-chrome', { headless: true });
  const container = await createContainer(config);

  // 1. Create a test profile with Apostate engine
  console.log('[1/4] Creating test profile...');
  const profile = await container.services.profiles.create({
    name: 'Task Runner Test Profile',
    presetId: DEFAULT_PRESET_IDS.windows11,
    engine: 'apostate',
    tags: ['test-runner'],
  });
  console.log(`Created profile: ${profile.id} (${profile.name})`);

  // 2. Define a multi-step workflow
  const workflowDefinition: Workflow = {
    schemaVersion: 1,
    name: 'Multi-Step Verification Workflow',
    variables: {
      targetUrl: 'https://example.com',
    },
    steps: [
      {
        type: 'navigate',
        url: '{{targetUrl}}',
        waitUntil: 'domcontentloaded',
      },
      {
        type: 'waitFor',
        selector: 'h1',
        timeoutMs: 10000,
      },
      {
        type: 'extract',
        selector: 'h1',
        as: 'headingText',
      },
      {
        type: 'scroll',
        direction: 'down',
        amount: 200,
        kinetic: true,
      },
      {
        type: 'sleep',
        minMs: 500,
        maxMs: 1000,
      },
      {
        type: 'screenshot',
        name: 'example-verification',
      },
    ],
  };

  // 3. Save task via TaskService
  console.log('[2/4] Saving automation task to database...');
  const task = await container.services.tasks.create({
    name: 'Example.com Verification Task',
    tags: ['verification', 'demo'],
    definition: workflowDefinition,
  });
  console.log(`Task created with ID: ${task.id}, steps: ${task.definition.steps.length}`);

  // 4. Verify task retrieval
  const fetchedTask = await container.services.tasks.getById(task.id);
  if (!fetchedTask) {
    throw new Error('Failed to retrieve task from database');
  }
  console.log(`[3/4] Successfully retrieved task definition: "${fetchedTask.name}"`);

  // 5. Verify task dispatch input validation
  console.log('[4/4] Testing task dispatch targeting profile...');
  const dispatchResult = await container.services.tasks.dispatch({
    taskId: task.id,
    targets: {
      profileIds: [profile.id],
    },
    options: {
      concurrency: 1,
      staggerMinMs: 0,
      staggerMaxMs: 0,
      failurePolicy: 'retry',
      maxAttempts: 2,
    },
  });

  console.log(`Dispatched run IDs: ${JSON.stringify(dispatchResult.runIds)}`);
  const runId = dispatchResult.runIds[0]!;

  // Check run status in DB
  const runRow = await container.repos.runs.getById(runId);
  console.log(`Run status in database: state=${runRow?.state}, task_id=${runRow?.task_id}`);

  // Clean up
  await container.dispose();
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('=== Task Creation & Dispatch Test COMPLETED SUCCESSFULLY ===');
}

testTaskExecution().catch((err) => {
  console.error('[Task Test Failed]:', err);
  process.exit(1);
});
