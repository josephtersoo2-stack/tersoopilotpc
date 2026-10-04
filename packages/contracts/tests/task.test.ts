import { describe, expect, it } from 'vitest';

import { DispatchInput, RunSummary, StepRun, TaskCreateInput, Workflow } from '../src/task';

describe('Contracts: Task & Workflow', () => {
  const taskId = '11111111-1111-1111-1111-111111111111';
  const profileId = '22222222-2222-2222-2222-222222222222';
  const runId = '33333333-3333-3333-3333-333333333333';

  const validWorkflow: Workflow = {
    schemaVersion: 1,
    name: 'Login Flow',
    variables: { username: 'testuser' },
    steps: [
      { type: 'navigate', url: 'https://example.com/login', waitUntil: 'domcontentloaded' },
      { type: 'waitFor', selector: '//input[@name="user"]', timeoutMs: 5000 },
      { type: 'type', selector: '//input[@name="user"]', text: 'testuser', humanized: true },
      { type: 'click', selector: '//button[@type="submit"]', humanized: true },
      { type: 'screenshot', name: 'after-login' },
      { type: 'sleep', minMs: 1000, maxMs: 2000 },
    ],
  };

  it('validates a complete Workflow', () => {
    expect(Workflow.parse(validWorkflow)).toEqual(validWorkflow);
  });

  it('validates TaskCreateInput', () => {
    const input = {
      name: 'Login Task',
      tags: ['auth', 'critical'],
      definition: validWorkflow,
    };
    expect(TaskCreateInput.parse(input)).toEqual(input);
  });

  it('validates DispatchInput with defaults', () => {
    const input = {
      taskId,
      targets: {
        profileIds: [profileId],
      },
    };
    const parsed = DispatchInput.parse(input);
    expect(parsed.options.concurrency).toBe(5);
    expect(parsed.options.staggerMinMs).toBe(10000);
    expect(parsed.options.staggerMaxMs).toBe(30000);
    expect(parsed.options.failurePolicy).toBe('retry');
    expect(parsed.options.maxAttempts).toBe(3);
  });

  it('validates RunSummary and StepRun', () => {
    const run: RunSummary = {
      id: runId,
      taskId,
      profileId,
      state: 'running',
      attempt: 1,
      startedAt: 1727500000000,
      finishedAt: null,
      errorClass: null,
      errorMessage: null,
    };
    expect(RunSummary.parse(run)).toEqual(run);

    const stepRun: StepRun = {
      id: '44444444-4444-4444-4444-444444444444',
      runId,
      stepIndex: 0,
      stepType: 'navigate',
      state: 'succeeded',
      attempts: 1,
      lastError: null,
      artifacts: { pageTitle: 'Example Domain' },
      startedAt: 1727500000000,
      finishedAt: 1727500001000,
    };
    expect(StepRun.parse(stepRun)).toEqual(stepRun);
  });
});
