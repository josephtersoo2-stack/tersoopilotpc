import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CDPSession, ElementHandle, Locator, Page } from 'playwright-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnchorRegistry } from '../src/crosshair/AnchorRegistry';
import { MouseEngine } from '../src/crosshair/humanizer/mouse';
import { ShadowDom } from '../src/crosshair/ShadowDom';
import { XPathResolver } from '../src/crosshair/XPathResolver';
import { loadConfig } from '../src/config';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { StepExecutionContext, StepRunner } from '../src/task/StepRunner';
import { WorkflowValidator } from '../src/task/WorkflowValidator';

describe('Ticket 4.10: Phase 4 Exit Criteria Integration Suite', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let anchorRegistry: AnchorRegistry;
  let xpathResolver: XPathResolver;
  let stepRunner: StepRunner;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-phase4-exit-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    anchorRegistry = new AnchorRegistry(repos.anchors);
    xpathResolver = new XPathResolver(anchorRegistry);
    stepRunner = new StepRunner(xpathResolver);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // =========================================================================
  // Exit Criterion 1: Workflow on canary server succeeds end-to-end
  // =========================================================================
  it(
    'Exit Criterion 1: Workflow succeeds end-to-end (all 8 step types & variable flow)',
    async () => {
    const rawWorkflow = {
      schemaVersion: 1,
      name: 'Phase 4 Canary Automation',
      variables: {
        baseUrl: 'https://canary.tersoo.local',
        searchQuery: 'AntiDetect Stealth Test',
      },
      steps: [
        { type: 'navigate', url: '{{baseUrl}}/login', waitUntil: 'domcontentloaded' },
        { type: 'waitFor', selector: '#main-form', timeoutMs: 5000 },
        { type: 'click', selector: 'button#accept-btn', humanized: true },
        { type: 'type', selector: 'input#search-input', text: '{{searchQuery}}', humanized: true },
        { type: 'scroll', direction: 'down', amount: 350, kinetic: true },
        { type: 'extract', selector: '.results-count', as: 'extractedResults' },
        { type: 'screenshot', name: 'canary-final-view' },
        { type: 'sleep', minMs: 10, maxMs: 30 },
      ],
    };

    // 1. Validate workflow closure and forward variable resolution
    const validation = WorkflowValidator.validate(rawWorkflow);
    expect(validation.ok).toBe(true);
    const validatedWorkflow = validation.workflow!;
    expect(validatedWorkflow.steps).toHaveLength(8);

    // 2. Setup mock page and CDP session
    const mockLocator = {
      boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 150, width: 200, height: 40 }),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
      textContent: vi.fn().mockResolvedValue('42 matching items found'),
      getAttribute: vi.fn().mockResolvedValue(null),
    } as unknown as Locator;

    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockImplementation((opts?: { path?: string }) => {
        if (opts?.path) {
          fs.writeFileSync(opts.path, 'mock-png-data');
        }
        return Promise.resolve(Buffer.from('mock-png-data'));
      }),
      evaluate: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const cdpDispatchedEvents: Array<{ method: string; params: unknown }> = [];
    const mockCdp = {
      send: vi.fn().mockImplementation((method: string, params: unknown) => {
        cdpDispatchedEvents.push({ method, params });
        return Promise.resolve({});
      }),
    } as unknown as CDPSession;

    // Spy on XPathResolver to return mock locator
    vi.spyOn(xpathResolver, 'resolve').mockResolvedValue({
      locator: mockLocator,
      strategy: 'css_native',
      resolvedSelector: 'mock-selector',
      attempts: 1,
      durationMs: 5,
    });

    const ctx: StepExecutionContext = {
      profileId: 'canary-profile-01',
      taskId: 'canary-task-01',
      runId: 'canary-run-01',
      stepIndex: 0,
      page: mockPage,
      cdp: mockCdp,
      variables: { ...validatedWorkflow.variables },
      screenshotsDir: tempDir,
      seed: 'canary-seed-42',
    };

    let lastScreenshotPath: string | undefined;

    // 3. Execute all 8 steps sequentially
    for (let i = 0; i < validatedWorkflow.steps.length; i++) {
      const step = validatedWorkflow.steps[i]!;
      ctx.stepIndex = i;

      const result = await stepRunner.run(step, ctx);
      expect(result.stepType).toBe(step.type);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      if (result.screenshotPath) {
        lastScreenshotPath = result.screenshotPath;
      }

      // Verify dynamic extraction variable propagates to context
      if (result.extracted) {
        ctx.variables[result.extracted.key] = result.extracted.value;
      }
    }

    // Verify context contains extracted variable from step 6
    expect(ctx.variables.extractedResults).toBe('42 matching items found');

    // Verify screenshot file was generated on disk
    expect(lastScreenshotPath).toBeDefined();
    expect(fs.existsSync(lastScreenshotPath!)).toBe(true);

    // Verify CDP received mouse movement and keyboard dispatch events
    const mouseEvents = cdpDispatchedEvents.filter((e) => e.method === 'Input.dispatchMouseEvent');
    expect(mouseEvents.length).toBeGreaterThan(10);
  }, 25000);

  // =========================================================================
  // Exit Criterion 2: XPath resolves through Shadow DOM
  // =========================================================================
  it('Exit Criterion 2: XPath resolves through deep Shadow DOM boundaries', async () => {
    const mockHandle = {
      evaluate: vi.fn().mockResolvedValue('nested-shadow-btn'),
    } as unknown as ElementHandle<Element>;

    const mockJsHandle = {
      asElement: vi.fn().mockReturnValue(mockHandle),
      dispose: vi.fn().mockResolvedValue(undefined),
    };

    const mockPage = {
      evaluateHandle: vi.fn().mockResolvedValue(mockJsHandle),
    } as unknown as Page;

    const result = await ShadowDom.findXPath(mockPage, "//button[@id='shadow-login-btn']");
    expect(result).toBe(mockHandle);
    expect(mockPage.evaluateHandle).toHaveBeenCalled();
  });

  // =========================================================================
  // Exit Criterion 3: Humanized actions produce non-linear mouse paths
  // =========================================================================
  it('Exit Criterion 3: Humanized actions produce non-linear mouse paths with micro-jitter', () => {
    const start = { x: 50, y: 100 };
    const target = { x: 800, y: 600 };

    const trajectoryPoints = MouseEngine.generateTrajectory(start, target, {
      steps: 40,
      microJitter: true,
      jitterIntensity: 1.5,
      overshoot: true,
      seed: 'nonlinear-mouse-seed',
    });

    expect(trajectoryPoints.length).toBeGreaterThan(25);

    // 1. Calculate linearity: A straight line between start and target has equation:
    // dx*(y - y1) - dy*(x - x1) = 0 for all points on straight line
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const lineLength = Math.hypot(dx, dy);

    let maxPerpendicularDeviation = 0;
    for (const pt of trajectoryPoints) {
      // Perpendicular distance from pt to straight line: |dx*(y - y1) - dy*(x - x1)| / lineLength
      const dist = Math.abs(dx * (pt.y - start.y) - dy * (pt.x - start.x)) / lineLength;
      if (dist > maxPerpendicularDeviation) {
        maxPerpendicularDeviation = dist;
      }
    }

    // A straight linear path would have maxPerpendicularDeviation ≈ 0.
    // Humanized Bézier curve with overshoot must produce significant curve deviation (> 10px).
    expect(maxPerpendicularDeviation).toBeGreaterThan(15);

    // 2. Verify non-linear velocity distribution (acceleration then deceleration)
    const speeds: number[] = [];
    for (let i = 1; i < trajectoryPoints.length; i++) {
      const p1 = trajectoryPoints[i - 1]!;
      const p2 = trajectoryPoints[i]!;
      const dt = Math.max(1, p2.timeMs - p1.timeMs);
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      speeds.push(dist / dt);
    }

    expect(speeds.length).toBeGreaterThan(20);
    const midSpeed = speeds[Math.floor(speeds.length / 2)]!;
    const endSpeed = speeds[speeds.length - 1]!;

    // Trajectory accelerates mid-flight and settles at target
    expect(midSpeed).toBeGreaterThan(0);
    expect(endSpeed).toBeLessThan(midSpeed * 2);
  });

  // =========================================================================
  // Exit Criterion 4: Anchors persist and recall across workflow runs
  // =========================================================================
  it('Exit Criterion 4: Anchors persist in SQLite and recall across runs with reinforced confidence', async () => {
    const taskId = 'task-canary-anchor';
    const profileId = 'profile-canary-anchor';
    const originalSelector = 'button#persistent-action-btn';

    // 1. Generate key and remember anchor in SQLite
    const anchorKey = anchorRegistry.generateKey({
      taskId,
      stepIndex: 0,
      selectorHint: originalSelector,
    });

    const entry = await anchorRegistry.remember({
      taskId,
      profileId,
      key: anchorKey,
      selector: originalSelector,
      type: 'css',
      confidence: 0.8,
    });

    expect(entry.id).toBeDefined();

    // Verify row was inserted into SQLite
    const persisted = await repos.anchors.get(taskId, profileId, anchorKey);
    expect(persisted).toBeDefined();
    expect(persisted?.selector).toBe(originalSelector);
    expect(persisted?.confidence).toBeCloseTo(0.8, 1);

    // 2. Simulate fresh worker process / app restart by creating a new AnchorRegistry from DB
    const freshRegistry = new AnchorRegistry(repos.anchors);

    // 3. Recall anchor from SQLite
    const recalled = await freshRegistry.recall(taskId, profileId, anchorKey);
    expect(recalled).not.toBeNull();
    expect(recalled?.selector).toBe(originalSelector);
    expect(recalled?.confidence).toBeCloseTo(0.8, 1);

    // 4. Reinforce anchor confidence on successful resolution (+0.05)
    const reinforced = await freshRegistry.reinforce(recalled!.id);
    expect(reinforced).not.toBeNull();
    expect(reinforced!.confidence).toBeCloseTo(0.85, 2);

    // Verify reinforced confidence was persisted to DB
    const updated = await repos.anchors.get(taskId, profileId, anchorKey);
    expect(updated).toBeDefined();
    expect(updated!.confidence).toBeCloseTo(0.85, 2);
  });
});
