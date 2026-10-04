import os from 'node:os';
import type { CDPSession, ElementHandle, Locator, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Humanizer } from '../src/crosshair/Humanizer';
import type { XPathResolver } from '../src/crosshair/XPathResolver';
import { StepExecutionContext, StepRunner } from '../src/task/StepRunner';

describe('Ticket 4.8: StepRunner Step Handlers & Humanized Execution', () => {
  let mockPage: Page;
  let mockCdp: CDPSession;
  let mockLocator: Locator;
  let mockElement: ElementHandle<Element>;
  let mockResolver: XPathResolver;
  let runner: StepRunner;
  let ctx: StepExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLocator = {
      boundingBox: vi.fn().mockResolvedValue({ x: 50, y: 100, width: 120, height: 40 }),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
      textContent: vi.fn().mockResolvedValue('Extracted text value'),
      getAttribute: vi.fn().mockResolvedValue('https://example.com/target-attr'),
    } as unknown as Locator;

    mockElement = {
      click: vi.fn().mockResolvedValue(undefined),
    } as unknown as ElementHandle<Element>;

    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('png-bytes')),
      evaluate: vi.fn().mockResolvedValue(undefined),
      // Clicks are dispatched as raw mouse events at a bounding box, because
      // locator.click() never dispatches on this engine.
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        down: vi.fn().mockResolvedValue(undefined),
        up: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Page;

    mockCdp = {
      send: vi.fn().mockResolvedValue({}),
    } as unknown as CDPSession;

    mockResolver = {
      resolve: vi.fn().mockResolvedValue({
        locator: mockLocator,
        strategy: 'css_native',
        resolvedSelector: '#target',
        attempts: 1,
        durationMs: 10,
      }),
    } as unknown as XPathResolver;

    runner = new StepRunner(mockResolver);

    ctx = {
      profileId: 'test-profile-id',
      taskId: 'test-task-id',
      runId: 'test-run-id',
      stepIndex: 0,
      page: mockPage,
      cdp: mockCdp,
      variables: {
        domain: 'https://example.org',
        userName: 'johndoe',
      },
      screenshotsDir: os.tmpdir(),
      seed: 'runner-seed-123',
    };
  });

  it('runs navigate step with interpolated variable URL', async () => {
    const res = await runner.run(
      {
        type: 'navigate',
        url: '{{domain}}/portal',
        waitUntil: 'domcontentloaded',
      },
      ctx,
    );

    expect(res.stepType).toBe('navigate');
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.org/portal', expect.objectContaining({
      waitUntil: 'domcontentloaded',
    }));
  });

  it('runs waitFor step and delegates to XPathResolver', async () => {
    const res = await runner.run(
      {
        type: 'waitFor',
        selector: '//input[@id="user"]',
        timeoutMs: 8000,
      },
      ctx,
    );

    expect(res.stepType).toBe('waitFor');
    expect(mockResolver.resolve).toHaveBeenCalledWith(
      mockPage,
      '//input[@id="user"]',
      expect.objectContaining({
        timeoutMs: 8000,
      }),
    );
  });

  it('runs humanized click step using Humanizer.click', async () => {
    const clickSpy = vi.spyOn(Humanizer, 'click').mockResolvedValue({ x: 100, y: 120 });

    const res = await runner.run(
      {
        type: 'click',
        selector: '#submit-btn',
        humanized: true,
      },
      ctx,
    );

    expect(res.stepType).toBe('click');
    expect(clickSpy).toHaveBeenCalledWith(
      mockCdp,
      expect.objectContaining({ width: 120, height: 40 }),
      expect.objectContaining({ seed: ctx.seed }),
    );
  });

  it('runs non-humanized click step via mouse events, not locator.click', async () => {
    const res = await runner.run(
      {
        type: 'click',
        selector: '#quick-btn',
        humanized: false,
      },
      ctx,
    );

    expect(res.stepType).toBe('click');
    // locator.click() does not dispatch on this engine, so even a
    // "non-humanized" click goes through a bounding box and raw mouse events.
    expect(mockLocator.click).not.toHaveBeenCalled();
    expect(mockPage.mouse.down).toHaveBeenCalled();
    expect(mockPage.mouse.up).toHaveBeenCalled();
  });

  it('runs humanized type step using Humanizer.type', async () => {
    vi.spyOn(Humanizer, 'click').mockResolvedValue({ x: 50, y: 100 });
    const typeSpy = vi.spyOn(Humanizer, 'type').mockResolvedValue(undefined);

    const res = await runner.run(
      {
        type: 'type',
        selector: '#username',
        text: 'Hello {{userName}}',
        humanized: true,
      },
      ctx,
    );

    expect(res.stepType).toBe('type');
    expect(typeSpy).toHaveBeenCalledWith(
      mockCdp,
      'Hello johndoe',
      expect.objectContaining({ seed: ctx.seed }),
    );
  });

  it('runs non-humanized type step directly on locator via fill', async () => {
    const res = await runner.run(
      {
        type: 'type',
        selector: '#plain-input',
        text: 'Direct text',
        humanized: false,
      },
      ctx,
    );

    expect(res.stepType).toBe('type');
    expect(mockLocator.fill).toHaveBeenCalledWith('Direct text');
  });

  it('runs kinetic scroll step using Humanizer.scroll', async () => {
    const scrollSpy = vi.spyOn(Humanizer, 'scroll').mockResolvedValue(undefined);

    const res = await runner.run(
      {
        type: 'scroll',
        direction: 'down',
        amount: 400,
        kinetic: true,
      },
      ctx,
    );

    expect(res.stepType).toBe('scroll');
    expect(scrollSpy).toHaveBeenCalledWith(
      mockCdp,
      expect.objectContaining({
        direction: 'down',
        amount: 400,
      }),
    );
  });

  it('runs extract step and records extracted value in context variables', async () => {
    const res = await runner.run(
      {
        type: 'extract',
        selector: '.order-id',
        as: 'extractedOrderId',
      },
      ctx,
    );

    expect(res.stepType).toBe('extract');
    expect(res.extracted).toEqual({
      key: 'extractedOrderId',
      value: 'Extracted text value',
    });
    expect(ctx.variables['extractedOrderId']).toBe('Extracted text value');
  });

  it('runs screenshot step and returns target screenshot path', async () => {
    const res = await runner.run(
      {
        type: 'screenshot',
        name: 'page_snapshot',
      },
      ctx,
    );

    expect(res.stepType).toBe('screenshot');
    expect(res.screenshotPath).toContain('page_snapshot_');
    expect(mockPage.screenshot).toHaveBeenCalled();
  });

  it('runs sleep step for specified duration', async () => {
    const start = Date.now();
    const res = await runner.run(
      {
        type: 'sleep',
        minMs: 20,
        maxMs: 30,
      },
      ctx,
    );

    expect(res.stepType).toBe('sleep');
    expect(Date.now() - start).toBeGreaterThanOrEqual(18);
  });

  it('falls back to Vision LLM screenshot resolution when XPathResolver fails on click', async () => {
    (mockResolver.resolve as any).mockRejectedValueOnce(new Error('STEP_SELECTOR_MISSING'));

    const mockLlm = {
      decideFromScreenshot: vi.fn().mockResolvedValue({
        action: 'click',
        x: 250,
        y: 180,
      }),
    };

    const ctxWithLlm = {
      ...ctx,
      llm: mockLlm as any,
    };

    const res = await runner.run(
      {
        type: 'click',
        selector: 'a.stuck-selector',
        humanized: true,
      },
      ctxWithLlm,
    );

    expect(res.stepType).toBe('click');
    expect(mockPage.screenshot).toHaveBeenCalled();
    expect(mockLlm.decideFromScreenshot).toHaveBeenCalled();
  });
});
