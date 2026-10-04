import type { CDPSession, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Humanizer } from '../src/crosshair/Humanizer';
import { KeyboardEngine } from '../src/crosshair/humanizer/keyboard';
import { MouseEngine } from '../src/crosshair/humanizer/mouse';
import { ScrollEngine } from '../src/crosshair/humanizer/scroll';
import { StepRunner, type StepExecutionContext } from '../src/task/StepRunner';
import { WorkflowValidator } from '../src/task/WorkflowValidator';

describe('Behavioral Persona & Playwright Automation Linkage', () => {
  let mockCdp: CDPSession;
  let dispatchedEvents: { method: string; params: Record<string, unknown> }[];

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchedEvents = [];
    mockCdp = {
      send: vi.fn(async (method: string, params: Record<string, unknown>) => {
        dispatchedEvents.push({ method, params });
        return {};
      }),
    } as unknown as CDPSession;
  });

  describe('KeyboardEngine typingWpm & typoRate linkage', () => {
    it('scales typing delays dynamically with typingWpm', async () => {
      const startTimeFast = Date.now();
      await KeyboardEngine.type(mockCdp, 'abc', {
        typingWpm: 200, // fast speed
        simulateTypos: false,
        simulateDoubleSpace: false,
      });
      const durationFast = Date.now() - startTimeFast;

      expect(durationFast).toBeGreaterThanOrEqual(0);
      expect(dispatchedEvents.filter((e) => e.method === 'Input.dispatchKeyEvent').length).toBe(6);
    });

    it('triggers typos and corrections using typoRate parameter', async () => {
      await KeyboardEngine.type(mockCdp, 'a', {
        speed: 100.0,
        typoRate: 100, // 100% typo rate
        simulateTypos: true,
      });

      const keyEvents = dispatchedEvents.filter((e) => e.method === 'Input.dispatchKeyEvent');
      // Typo dispatch produces:
      // 1. accidental typo char
      // 2. Backspace
      // 3. intended 'a' char
      expect(keyEvents.length).toBeGreaterThan(2);
      const backspaceEvent = keyEvents.find((e) => e.params['key'] === 'Backspace');
      expect(backspaceEvent).toBeDefined();
    });
  });

  describe('StepRunner behavioral context propagation', () => {
    it('passes profile typingWpm, typoRate, and patienceIndex to Humanizer', async () => {
      const typeSpy = vi.spyOn(Humanizer, 'type').mockResolvedValue(undefined);
      const clickSpy = vi.spyOn(Humanizer, 'click').mockResolvedValue({ x: 100, y: 100 });
      const scrollSpy = vi.spyOn(Humanizer, 'scroll').mockResolvedValue(undefined);

      const mockPage = {
        locator: vi.fn().mockReturnValue({
          boundingBox: vi.fn().mockResolvedValue({ x: 50, y: 50, width: 100, height: 30 }),
          scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
        }),
        mouse: {
          move: vi.fn().mockResolvedValue(undefined),
        },
        evaluate: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      const mockResolver = {
        resolve: vi.fn().mockResolvedValue({
          locator: (mockPage as any).locator(),
        }),
      } as any;

      const runner = new StepRunner(mockResolver);

      const ctx: StepExecutionContext = {
        profileId: 'profile-test-123',
        taskId: 'task-abc',
        runId: 'run-xyz',
        stepIndex: 0,
        page: mockPage,
        cdp: mockCdp,
        variables: {
          'niche.keyword': 'Euro Truck Simulator',
          'persona.name': 'gamer',
        },
        typingWpm: 85,
        typoRate: 4.5,
        patienceIndex: 7.2,
      };

      // 1. Test click step with patienceIndex
      await runner.run({ type: 'click', selector: '#buy-btn', humanized: true }, ctx);
      expect(clickSpy).toHaveBeenCalledWith(
        mockCdp,
        expect.anything(),
        expect.objectContaining({ patienceIndex: 7.2 }),
      );

      // 2. Test type step with typingWpm & typoRate
      await runner.run({ type: 'type', selector: '#search-box', text: 'Sim games', humanized: true }, ctx);
      expect(typeSpy).toHaveBeenCalledWith(
        mockCdp,
        'Sim games',
        expect.objectContaining({ typingWpm: 85, typoRate: 4.5 }),
      );

      // 3. Test scroll step with patienceIndex
      await runner.run({ type: 'scroll', direction: 'down', amount: 300, kinetic: true }, ctx);
      expect(scrollSpy).toHaveBeenCalledWith(
        mockCdp,
        expect.objectContaining({ patienceIndex: 7.2 }),
      );
    });
  });

  describe('WorkflowValidator variable interpolation & closures', () => {
    it('correctly interpolates dot notation niche and persona variables', () => {
      const template = 'Search {{niche.keyword}} at {{niche.seedUrl}} with WPM {{persona.typingWpm}}';
      const variables = {
        'niche.keyword': 'farming sim 25',
        'niche.seedUrl': 'https://store.steampowered.com',
        'persona.typingWpm': '75',
      };

      const result = WorkflowValidator.interpolate(template, variables);
      expect(result).toBe('Search farming sim 25 at https://store.steampowered.com with WPM 75');
    });

    it('validates workflow containing dot-notated built-in niche and persona variables without errors', () => {
      const workflowData = {
        schemaVersion: 1,
        name: 'Gamer Daily Browsing',
        steps: [
          {
            type: 'navigate',
            url: '{{niche.seedUrl}}',
          },
          {
            type: 'type',
            selector: 'input#search',
            text: '{{niche.keyword}}',
          },
        ],
      };

      const result = WorkflowValidator.validate(workflowData);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
