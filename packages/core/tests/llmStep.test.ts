import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CDPSession, Page } from 'playwright-core';
import type { Step } from '@tersoo/contracts';

import { extractAccessibilityTree, findNodeByRef, type AccessibilityNode } from '../src/crosshair/accessibility';
import { Humanizer } from '../src/crosshair/Humanizer';
import type { LlmService } from '../src/llm/LlmService';
import type { LlmDecision } from '../src/llm/types';
import { evaluateStepFailure } from '../src/task/policies';
import { runLlmStep } from '../src/task/steps/llmStep';
import { StepRunner, type StepExecutionContext } from '../src/task/StepRunner';
import { WorkflowValidator } from '../src/task/WorkflowValidator';
import { TaskError } from '../src/util/errors';

describe('Phase 7: Accessibility Tree & LLM Step Type', () => {
  describe('Accessibility Tree Extraction', () => {
    it('extracts tree with sequential integer refs', async () => {
      const mockSnapshot = {
        role: 'WebArea',
        name: 'Root Page',
        children: [
          {
            role: 'heading',
            name: 'Welcome',
          },
          {
            role: 'button',
            name: 'Login',
          },
        ],
      };

      const mockPage = {
        accessibility: {
          snapshot: vi.fn().mockResolvedValue(mockSnapshot),
        },
      } as unknown as Page;

      const tree = await extractAccessibilityTree(mockPage);

      expect(tree.ref).toBe(1);
      expect(tree.role).toBe('WebArea');
      expect(tree.children?.length).toBe(2);
      expect(tree.children?.[0]?.ref).toBe(2);
      expect(tree.children?.[1]?.ref).toBe(3);
    });

    it('finds node by ref correctly in deep hierarchy', () => {
      const tree: AccessibilityNode = {
        ref: 1,
        role: 'WebArea',
        name: 'Root',
        children: [
          {
            ref: 2,
            role: 'form',
            name: 'Form',
            children: [
              {
                ref: 3,
                role: 'button',
                name: 'Submit',
              },
            ],
          },
        ],
      };

      const found = findNodeByRef(tree, 3);
      expect(found).toBeDefined();
      expect(found?.name).toBe('Submit');

      const notFound = findNodeByRef(tree, 99);
      expect(notFound).toBeNull();
    });

    it('returns a fallback root node when accessibility snapshot is empty (e.g. about:blank)', async () => {
      const mockPage = {
        url: vi.fn().mockReturnValue('about:blank'),
        accessibility: {
          snapshot: vi.fn().mockResolvedValue(null),
        },
      } as unknown as Page;

      const tree = await extractAccessibilityTree(mockPage);
      expect(tree).toBeDefined();
      expect(tree.ref).toBe(1);
      expect(tree.role).toBe('WebArea');
      expect(tree.name).toBe('about:blank');
      expect(tree.children).toEqual([]);
    });
  });

  describe('runLlmStep Execution Loop', () => {
    it('executes decision loop until done', async () => {
      const mockTree = {
        role: 'WebArea',
        name: 'Page',
        children: [{ role: 'button', name: 'Next' }],
      };

      const mockLocator = {
        first: () => ({
          boundingBox: vi.fn().mockResolvedValue({ x: 50, y: 50, width: 60, height: 30 }),
        }),
      };

      const mockPage = {
        accessibility: {
          snapshot: vi.fn().mockResolvedValue(mockTree),
        },
        getByRole: vi.fn().mockReturnValue(mockLocator),
        locator: vi.fn().mockReturnValue(mockLocator),
        mouse: {
          move: vi.fn().mockResolvedValue(undefined),
          down: vi.fn().mockResolvedValue(undefined),
          up: vi.fn().mockResolvedValue(undefined),
        },
        keyboard: {
          type: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as Page;

      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);

      let stepNum = 0;
      const mockLlm = {
        decideFromTree: vi.fn(async (): Promise<LlmDecision> => {
          stepNum++;
          if (stepNum === 1) {
            return { action: 'click', ref: 2, reason: 'Click next' };
          }
          return { action: 'done', reason: 'Completed' };
        }),
      } as unknown as LlmService;

      const result = await runLlmStep(mockPage, humanizer, mockLlm, {
        goal: 'Complete onboarding',
        maxIterations: 5,
      });

      expect(result.iterations).toBe(2);
      expect(result.finalDecision.action).toBe('done');
      expect(mockLlm.decideFromTree).toHaveBeenCalledTimes(2);
    });

    it('throws LLM_UNSOLVABLE when LLM returns unsolvable', async () => {
      const mockTree = { role: 'WebArea', name: 'Blocked' };
      const mockPage = {
        accessibility: {
          snapshot: vi.fn().mockResolvedValue(mockTree),
        },
      } as unknown as Page;

      const humanizer = new Humanizer(42);
      const mockLlm = {
        decideFromTree: vi.fn().mockResolvedValue({
          action: 'unsolvable',
          reason: 'Access denied by firewall',
        }),
      } as unknown as LlmService;

      await expect(
        runLlmStep(mockPage, humanizer, mockLlm, { goal: 'Bypass block' }),
      ).rejects.toThrow('LLM_UNSOLVABLE:Access denied by firewall');
    });

    it('throws LLM_MAX_ITERATIONS when step limit is reached without done', async () => {
      const mockTree = { role: 'WebArea', name: 'Infinite' };
      const mockPage = {
        accessibility: {
          snapshot: vi.fn().mockResolvedValue(mockTree),
        },
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);

      const mockLlm = {
        decideFromTree: vi.fn().mockResolvedValue({
          action: 'wait',
          ms: 10,
        }),
      } as unknown as LlmService;

      await expect(
        runLlmStep(mockPage, humanizer, mockLlm, { goal: 'Wait indefinitely', maxIterations: 3 }),
      ).rejects.toThrow('LLM_MAX_ITERATIONS');
    });

    it('navigates away from blank page autonomously and completes goal', async () => {
      let isBlank = true;
      const mockPage = {
        url: vi.fn(() => (isBlank ? 'about:blank' : 'https://www.google.com')),
        accessibility: {
          snapshot: vi.fn(async () => {
            if (isBlank) return null;
            return {
              role: 'WebArea',
              name: 'Google',
              children: [{ role: 'searchbox', name: 'Search' }],
            };
          }),
        },
        goto: vi.fn(async (url: string) => {
          isBlank = false;
        }),
      } as unknown as Page;

      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);

      const mockLlm = {
        decideFromTree: vi.fn(async (tree: any): Promise<LlmDecision> => {
          // The page description carries the URL, which is the only way the
          // model can tell it is on a blank page and must navigate first.
          if (tree.url === 'about:blank') {
            return { action: 'navigate', url: 'https://www.google.com' };
          }
          return { action: 'done' };
        }),
      } as unknown as LlmService;

      const result = await runLlmStep(mockPage, humanizer, mockLlm, {
        goal: 'Open Google in the browser and complete',
        maxIterations: 5,
      });

      expect(result.iterations).toBe(2);
      expect(result.finalDecision.action).toBe('done');
      expect(mockPage.goto).toHaveBeenCalledWith('https://www.google.com', { waitUntil: 'domcontentloaded' });
    });

    it('handles typing with pressEnter and keyboard press action', async () => {
      const mockTree = {
        role: 'WebArea',
        name: 'Search Page',
        children: [{ role: 'searchbox', name: 'Search' }],
      };

      const mockLocator = {
        first: () => ({
          boundingBox: vi.fn().mockResolvedValue({ x: 50, y: 50, width: 60, height: 30 }),
        }),
      };

      const mockPage = {
        accessibility: {
          snapshot: vi.fn().mockResolvedValue(mockTree),
        },
        getByRole: vi.fn().mockReturnValue(mockLocator),
        locator: vi.fn().mockReturnValue(mockLocator),
        mouse: {
          move: vi.fn().mockResolvedValue(undefined),
          down: vi.fn().mockResolvedValue(undefined),
          up: vi.fn().mockResolvedValue(undefined),
        },
        keyboard: {
          type: vi.fn().mockResolvedValue(undefined),
          press: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as Page;

      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);

      let stepNum = 0;
      const mockLlm = {
        decideFromTree: vi.fn(async (): Promise<LlmDecision> => {
          stepNum++;
          if (stepNum === 1) {
            return { action: 'type', ref: 2, text: 'youtube', pressEnter: true };
          }
          if (stepNum === 2) {
            return { action: 'press', key: 'Enter' };
          }
          return { action: 'done' };
        }),
      } as unknown as LlmService;

      const result = await runLlmStep(mockPage, humanizer, mockLlm, {
        goal: 'Search for youtube',
        maxIterations: 5,
      });

      expect(result.iterations).toBe(3);
      // Keystrokes are typed one character at a time with humanized delays,
      // exactly like every other step in the engine, rather than in one bulk
      // `keyboard.type` call.
      const typed = (mockPage.keyboard.type as unknown as { mock: { calls: string[][] } }).mock.calls
        .map((call) => call[0])
        .join('');
      expect(typed).toContain('youtube');
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
    });
  });

  describe('Stale page recovery (LLM_PAGE_CLOSED)', () => {
    function makePage(name: string, closed = false) {
      return {
        name,
        closed,
        isClosed: () => closed,
        accessibility: {
          snapshot: vi.fn().mockResolvedValue({ role: 'WebArea', name }),
        },
        goto: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        keyboard: {
          type: vi.fn().mockResolvedValue(undefined),
          press: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as Page;
    }

    it('re-acquires a live page from the resolver when the captured handle is closed', async () => {
      const stale = makePage('stale', true);
      const fresh = makePage('fresh');

      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);

      const mockLlm = {
        decideFromTree: vi
          .fn()
          .mockResolvedValueOnce({ action: 'navigate', url: 'https://example.com' })
          .mockResolvedValueOnce({ action: 'done' }),
      } as unknown as LlmService;

      const result = await runLlmStep(stale, humanizer, mockLlm, {
        goal: 'Open example.com',
        maxIterations: 5,
        resolvePage: () => fresh,
      });

      expect(result.iterations).toBe(2);
      // The navigate must have hit the recovered page, not the dead handle.
      expect(fresh.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'domcontentloaded',
      });
    });

    it('throws a clear tagged error when no live page remains', async () => {
      const dead = makePage('dead', true);
      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);

      const mockLlm = { decideFromTree: vi.fn() } as unknown as LlmService;

      await expect(
        runLlmStep(dead, humanizer, mockLlm, {
          goal: 'anything',
          maxIterations: 3,
          resolvePage: () => undefined,
        }),
      ).rejects.toThrow(/LLM_PAGE_CLOSED/);
      expect(mockLlm.decideFromTree).not.toHaveBeenCalled();
    });

    it('falls back to the captured handle when the resolver yields nothing', async () => {
      const live = makePage('live');
      const humanizer = new Humanizer(42);
      vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);

      const mockLlm = {
        decideFromTree: vi.fn().mockResolvedValue({ action: 'done' }),
      } as unknown as LlmService;

      const result = await runLlmStep(live, humanizer, mockLlm, {
        goal: 'anything',
        maxIterations: 2,
        resolvePage: () => {
          throw new Error('engine unavailable');
        },
      });

      expect(result.iterations).toBe(1);
    });
  });

  describe('StepRunner Integration with llm step', () => {
    it('executes llm step in StepRunner successfully', async () => {
      const mockXpath = {} as any;
      const runner = new StepRunner(mockXpath);

      const mockTree = { role: 'WebArea', name: 'Test Page' };
      const mockPage = {
        accessibility: {
          snapshot: vi.fn().mockResolvedValue(mockTree),
        },
      } as unknown as Page;

      const mockLlm = {
        decideFromTree: vi.fn().mockResolvedValue({ action: 'done' }),
      } as unknown as LlmService;

      const ctx: StepExecutionContext = {
        profileId: 'prof-1',
        taskId: 'task-1',
        runId: 'run-1',
        stepIndex: 0,
        page: mockPage,
        cdp: {} as CDPSession,
        llm: mockLlm,
        variables: {},
      };

      const step: Step = {
        type: 'llm',
        goal: 'Sign in to account',
        maxIterations: 5,
      };

      const result = await runner.run(step, ctx);
      expect(result.stepType).toBe('llm');
      expect(result.artifacts?.iterations).toBe(1);
    });

    it('throws POLICY_VIOLATION if llm is missing in StepExecutionContext', async () => {
      const runner = new StepRunner({} as any);
      const ctx: StepExecutionContext = {
        profileId: 'prof-1',
        taskId: 'task-1',
        runId: 'run-1',
        stepIndex: 0,
        page: {} as Page,
        cdp: {} as CDPSession,
        variables: {},
      };

      const step: Step = {
        type: 'llm',
        goal: 'Sign in',
        maxIterations: 5,
      };

      await expect(runner.run(step, ctx)).rejects.toThrow(TaskError);
    });
  });

  describe('WorkflowValidator with llm step', () => {
    it('validates workflow containing llm step', () => {
      const wf = {
        schemaVersion: 1,
        name: 'AI Automation Workflow',
        steps: [
          {
            type: 'navigate',
            url: 'https://example.com',
          },
          {
            type: 'llm',
            goal: 'Find the contact us button and click it',
            maxIterations: 10,
          },
        ],
      };

      const validation = WorkflowValidator.validate(wf);
      expect(validation.ok).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('detects empty goal in llm step', () => {
      const wf = {
        schemaVersion: 1,
        name: 'Invalid AI Workflow',
        steps: [
          {
            type: 'llm',
            goal: '   ',
          },
        ],
      };

      const validation = WorkflowValidator.validate(wf);
      expect(validation.ok).toBe(false);
      expect(validation.errors.some((e) => e.includes('Goal cannot be empty'))).toBe(true);
    });

    it('interpolates variables in llm goal', () => {
      const step: Step = {
        type: 'llm',
        goal: 'Search for {{search_query}} on the page',
        maxIterations: 10,
      };

      const interpolated = WorkflowValidator.interpolateStep(step, {
        search_query: 'Playwright automation',
      });

      expect((interpolated as any).goal).toBe('Search for Playwright automation on the page');
    });
  });

  describe('Failure Policy Handling for LLM Errors', () => {
    it('evaluates LLM_UNSOLVABLE to abort by default', () => {
      const err = new Error('LLM_UNSOLVABLE:Element not found');
      const action = evaluateStepFailure('screenshot_abort', err);
      expect(action.action).toBe('abort');
      expect(action.reason).toContain('LLM could not solve step');
    });

    it('evaluates LLM_UNSOLVABLE to skip when skip policy is active', () => {
      const err = new Error('LLM_UNSOLVABLE:Captcha blocked');
      const action = evaluateStepFailure('skip', err);
      expect(action.action).toBe('skip');
    });

    it('evaluates retry policy with exponential backoff on regular errors', () => {
      const err = new Error('Network timeout');
      const action1 = evaluateStepFailure('retry', err, 1, 3);
      expect(action1.action).toBe('retry');
      expect(action1.retryDelayMs).toBe(1000);

      const action2 = evaluateStepFailure('retry', err, 2, 3);
      expect(action2.action).toBe('retry');
      expect(action2.retryDelayMs).toBe(2000);

      const action3 = evaluateStepFailure('retry', err, 3, 3);
      expect(action3.action).toBe('abort');
    });
  });
});
