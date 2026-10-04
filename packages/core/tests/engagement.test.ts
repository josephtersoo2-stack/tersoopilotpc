import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Page, Locator } from 'playwright-core';
import { XPathResolver } from '../src/crosshair/XPathResolver';
import { WorkflowValidator } from '../src/task/WorkflowValidator';
import { StepRunner, type StepExecutionContext } from '../src/task/StepRunner';
import type { Step } from '@tersoo/contracts';

describe('TersooPilot Engagement, Ad-Skipping & Social Actions', () => {
  let resolver: XPathResolver;
  let mockPage: Page;

  beforeEach(() => {
    resolver = new XPathResolver();
    mockPage = {
      locator: vi.fn((_sel: string) => {
        return {
          first: () => ({
            waitFor: vi.fn().mockResolvedValue(undefined),
            isVisible: vi.fn().mockResolvedValue(true),
            boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 10, width: 50, height: 20 }),
            click: vi.fn().mockResolvedValue(undefined),
            getAttribute: vi.fn().mockResolvedValue('false'),
            textContent: vi.fn().mockResolvedValue('Subscribe'),
          }),
        } as unknown as Locator;
      }),
      evaluate: vi.fn().mockResolvedValue(undefined),
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
        down: vi.fn().mockResolvedValue(undefined),
        up: vi.fn().mockResolvedValue(undefined),
        wheel: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Page;
  });

  describe('XPathResolver Semantic Engagement Intents', () => {
    it('resolves intent:skip_ad with robust fallback selectors', async () => {
      const res = await resolver.resolve(mockPage, 'intent:skip_ad', { timeoutMs: 1000 });
      expect(res.strategy).toBe('css_native');
      expect(res.resolvedSelector).toContain('.ytp-skip-ad-button');
    });

    it('resolves intent:like and intent:subscribe', async () => {
      const likeRes = await resolver.resolve(mockPage, 'intent:like', { timeoutMs: 1000 });
      expect(likeRes.strategy).toBe('css_native');
      expect(likeRes.resolvedSelector).toContain('like');

      const subRes = await resolver.resolve(mockPage, 'intent:subscribe', { timeoutMs: 1000 });
      expect(subRes.strategy).toBe('css_native');
      expect(subRes.resolvedSelector).toContain('subscribe');
    });

    it('resolves intent:expand_description and intent:collapse_description', async () => {
      const expandRes = await resolver.resolve(mockPage, 'intent:expand_description', { timeoutMs: 1000 });
      expect(expandRes.strategy).toBe('css_native');
      expect(expandRes.resolvedSelector).toBeTruthy();

      const collapseRes = await resolver.resolve(mockPage, 'intent:collapse_description', { timeoutMs: 1000 });
      expect(collapseRes.strategy).toBe('css_native');
      expect(collapseRes.resolvedSelector).toBeTruthy();
    });

    it('resolves intent:comment_input and scrolls to trigger comment hydration when initially offscreen', async () => {
      let scrolled = false;
      const customPage = {
        ...mockPage,
        locator: vi.fn((sel: string) => {
          return {
            first: () => ({
              waitFor: vi.fn().mockResolvedValue(undefined),
              isVisible: vi.fn().mockImplementation(async () => {
                if (sel.includes('comment') || sel.includes('placeholder')) {
                  return scrolled;
                }
                return false;
              }),
              boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 10, width: 50, height: 20 }),
              click: vi.fn().mockResolvedValue(undefined),
            }),
          } as unknown as Locator;
        }),
        evaluate: vi.fn().mockImplementation(async () => {
          scrolled = true;
        }),
      } as unknown as Page;

      const commentRes = await resolver.resolve(customPage, 'intent:comment_input', { timeoutMs: 1000 });
      expect(commentRes.strategy).toBe('css_native');
      expect(customPage.evaluate).toHaveBeenCalled();
    });
  });

  describe('WorkflowValidator Engage Step Validation', () => {
    it('validates a valid engage step', () => {
      const wf = {
        id: 'wf-engage-1',
        name: 'Engagement Test',
        version: '1.0',
        steps: [
          {
            type: 'engage',
            action: 'like',
            optional: true,
          },
        ],
      };
      const res = WorkflowValidator.validate(wf);
      expect(res.ok).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('validates comment action requires commentText or variable', () => {
      const invalidWf = {
        id: 'wf-engage-invalid',
        name: 'Invalid Comment Test',
        version: '1.0',
        steps: [
          {
            type: 'engage',
            action: 'comment',
          },
        ],
      };
      const res = WorkflowValidator.validate(invalidWf);
      expect(res.ok).toBe(false);
      expect(res.errors.some((e: string) => e.includes("'commentText' is required"))).toBe(true);

      const validWf = {
        id: 'wf-engage-valid',
        name: 'Valid Comment Test',
        version: '1.0',
        steps: [
          {
            type: 'engage',
            action: 'comment',
            commentText: 'Awesome video!',
          },
        ],
      };
      const validRes = WorkflowValidator.validate(validWf);
      expect(validRes.ok).toBe(true);
    });

    it('normalizes video_action / social aliases into engage steps', () => {
      const wf = {
        id: 'wf-1',
        name: 'Engagement Test',
        version: '1.0',
        variables: { customComment: 'Great stuff!' },
        steps: [
          { type: 'video_action', action: 'like' } as any,
          { type: 'social', action: 'comment', text: 'Nice content!' } as any,
        ],
      };
      const norm = WorkflowValidator.normalize(wf) as any;
      expect(norm.steps[0].type).toBe('engage');
      expect(norm.steps[0].action).toBe('like');
      expect(norm.steps[1].type).toBe('engage');
      expect(norm.steps[1].action).toBe('comment');
      expect(norm.steps[1].commentText).toBe('Nice content!');
    });
  });

  describe('StepRunner Engage Step Handler', () => {
    let runner: StepRunner;
    let ctx: StepExecutionContext;

    beforeEach(() => {
      runner = new StepRunner(resolver);
      ctx = {
        profileId: 'test-profile',
        taskId: 'test-task',
        runId: 'test-run',
        stepIndex: 0,
        page: mockPage,
        variables: {
          skipAds: 'true',
          autoDismissPopups: 'true',
        },
      };
    });

    it('executes like engagement and verifies state', async () => {
      const mockLikeLocator = {
        getAttribute: vi.fn().mockResolvedValue('false'),
        boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 10, width: 40, height: 40 }),
        click: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(resolver, 'resolve').mockResolvedValueOnce({
        locator: mockLikeLocator as any,
        strategy: 'css_native',
        resolvedSelector: 'button[aria-label*="like"]',
        attempts: 1,
        durationMs: 5,
      });

      const step: Step = { type: 'engage', action: 'like' };
      const runResult = await runner.run(step, ctx);
      expect(runResult).toBeDefined();
      expect(runResult.stepType).toBe('engage');
      expect(runResult.artifacts?.action).toBe('like');
    });

    it('gracefully handles optional engagement if element is not found', async () => {
      vi.spyOn(resolver, 'resolve').mockRejectedValueOnce(new Error('Timeout'));

      const step: Step = { type: 'engage', action: 'subscribe', optional: true };
      const runResult = await runner.run(step, ctx);
      expect(runResult).toBeDefined();
      expect(runResult.stepType).toBe('engage');
      expect(runResult.artifacts?.status).toBe('not_found_or_subscribed');
    });

    it('executes read_description engagement with expand, gentle scroll, and collapse', async () => {
      const mockExpandLocator = {
        boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 300, width: 60, height: 25 }),
        click: vi.fn().mockResolvedValue(undefined),
      };
      const mockCollapseLocator = {
        boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 700, width: 80, height: 25 }),
        click: vi.fn().mockResolvedValue(undefined),
      };

      vi.spyOn(resolver, 'resolve')
        .mockResolvedValueOnce({
          locator: mockExpandLocator as any,
          strategy: 'css_native',
          resolvedSelector: '#expand',
          attempts: 1,
          durationMs: 5,
        })
        .mockResolvedValueOnce({
          locator: mockCollapseLocator as any,
          strategy: 'css_native',
          resolvedSelector: '#collapse',
          attempts: 1,
          durationMs: 5,
        });

      const step: Step = { type: 'engage', action: 'read_description', optional: true };
      const runResult = await runner.run(step, ctx);
      expect(runResult).toBeDefined();
      expect(runResult.stepType).toBe('engage');
      expect(runResult.artifacts?.action).toBe('read_description');
      expect(runResult.artifacts?.status).toBe('read');
      expect(mockPage.mouse.wheel).toHaveBeenCalled();
    }, 15000);
  });
});
