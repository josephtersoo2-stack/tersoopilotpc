import { describe, expect, it, vi } from 'vitest';
import type { Locator, Page } from 'playwright-core';

import { cubicBezier, generateBezierPath } from '../src/crosshair/bezier';
import { lognormal, normal, sampleRange, uniform } from '../src/crosshair/distributions';
import { Humanizer } from '../src/crosshair/Humanizer';
import { mulberry32 } from '../src/crosshair/prng';

function createMockPage() {
  const mouseMoves: { x: number; y: number }[] = [];
  const mouseEvents: string[] = [];
  const wheels: { deltaX: number; deltaY: number }[] = [];
  const typedChars: string[] = [];
  const keysPressed: string[] = [];

  const mockLocator = {
    first: () => ({
      boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 80, height: 40 }),
    }),
  } as unknown as Locator;

  const page = {
    mouse: {
      move: vi.fn(async (x: number, y: number) => {
        mouseMoves.push({ x, y });
      }),
      down: vi.fn(async () => {
        mouseEvents.push('down');
      }),
      up: vi.fn(async () => {
        mouseEvents.push('up');
      }),
      wheel: vi.fn(async (deltaX: number, deltaY: number) => {
        wheels.push({ deltaX, deltaY });
      }),
    },
    keyboard: {
      type: vi.fn(async (char: string) => {
        typedChars.push(char);
      }),
      press: vi.fn(async (key: string) => {
        keysPressed.push(key);
      }),
    },
    locator: vi.fn().mockReturnValue(mockLocator),
  } as unknown as Page;

  return { page, mouseMoves, mouseEvents, wheels, typedChars, keysPressed, mockLocator };
}

describe('Phase 5: Humanizer Module', () => {
  describe('PRNG (mulberry32)', () => {
    it('is strictly deterministic for identical seeds', () => {
      const rng1 = mulberry32(424242);
      const rng2 = mulberry32(424242);

      const seq1 = Array.from({ length: 100 }, () => rng1());
      const seq2 = Array.from({ length: 100 }, () => rng2());

      expect(seq1).toEqual(seq2);
      expect(seq1.every((n) => n >= 0 && n < 1)).toBe(true);
    });

    it('generates different sequences for different seeds', () => {
      const rng1 = mulberry32(11111);
      const rng2 = mulberry32(99999);

      const val1 = rng1();
      const val2 = rng2();
      expect(val1).not.toBe(val2);
    });
  });

  describe('Distributions', () => {
    it('samples uniform within specified bounds', () => {
      const rng = mulberry32(123);
      for (let i = 0; i < 50; i++) {
        const val = uniform(rng, 10, 20);
        expect(val).toBeGreaterThanOrEqual(10);
        expect(val).toBeLessThanOrEqual(20);
      }
    });

    it('samples range correctly', () => {
      const rng = mulberry32(456);
      for (let i = 0; i < 50; i++) {
        const val = sampleRange(rng, [5, 15]);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThanOrEqual(15);
      }
    });

    it('normal and lognormal return finite numbers', () => {
      const rng = mulberry32(789);
      for (let i = 0; i < 50; i++) {
        const norm = normal(rng, 100, 15);
        expect(Number.isFinite(norm)).toBe(true);

        const logn = lognormal(rng, 80, 0.4);
        expect(Number.isFinite(logn)).toBe(true);
        expect(logn).toBeGreaterThan(0);
      }
    });
  });

  describe('Bézier Curves & Path Generation', () => {
    it('computes cubic Bézier points correctly', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 10, y: 20 };
      const p2 = { x: 20, y: 20 };
      const p3 = { x: 30, y: 0 };

      const start = cubicBezier(p0, p1, p2, p3, 0);
      const mid = cubicBezier(p0, p1, p2, p3, 0.5);
      const end = cubicBezier(p0, p1, p2, p3, 1);

      expect(start).toEqual(p0);
      expect(end).toEqual(p3);
      expect(mid.y).toBeGreaterThan(0);
    });

    it('generates non-linear curved path between start and end', () => {
      const rng = mulberry32(999);
      const start = { x: 0, y: 0 };
      const end = { x: 100, y: 100 };
      const steps = 30;

      const path = generateBezierPath(start, end, rng, steps);
      expect(path.length).toBe(steps + 1);

      // Verify intermediate points exist and deviate from simple linear interpolation
      const midPoint = path[Math.floor(steps / 2)]!;
      const linearMid = { x: 50, y: 50 };
      const deviation = Math.hypot(midPoint.x - linearMid.x, midPoint.y - linearMid.y);
      expect(deviation).toBeGreaterThan(0);
    });

    it('produces identical paths with same seed (determinism)', () => {
      const rng1 = mulberry32(54321);
      const rng2 = mulberry32(54321);
      const path1 = generateBezierPath({ x: 10, y: 20 }, { x: 200, y: 300 }, rng1, 25);
      const path2 = generateBezierPath({ x: 10, y: 20 }, { x: 200, y: 300 }, rng2, 25);

      expect(path1).toEqual(path2);
    });
  });

  describe('Humanizer Class Instance Methods', () => {
    it('moves mouse along Bézier path and updates currentMousePosition', async () => {
      const { page, mouseMoves } = createMockPage();
      const humanizer = new Humanizer(42);

      expect(humanizer.currentMousePosition).toEqual({ x: 0, y: 0 });

      await humanizer.moveMouse(page, { x: 300, y: 400 });

      expect(mouseMoves.length).toBeGreaterThan(15);
      expect(humanizer.currentMousePosition).toEqual({ x: 300, y: 400 });
      expect(page.mouse.move).toHaveBeenCalled();
    });

    it('clicks selector with realistic mouse down and up', async () => {
      const { page, mouseEvents } = createMockPage();
      const humanizer = new Humanizer(42);

      await humanizer.click(page, '#submit-button');

      expect(page.locator).toHaveBeenCalledWith('#submit-button');
      expect(mouseEvents).toContain('down');
      expect(mouseEvents).toContain('up');
      expect(humanizer.currentMousePosition.x).toBeGreaterThan(90);
      expect(humanizer.currentMousePosition.x).toBeLessThan(190);
    });

    it('throws error when clicking non-existent selector', async () => {
      const page = {
        locator: vi.fn().mockReturnValue({
          first: () => ({
            boundingBox: vi.fn().mockResolvedValue(null),
          }),
        }),
      } as unknown as Page;

      const humanizer = new Humanizer(42);
      await expect(humanizer.click(page, '#missing')).rejects.toThrow('SELECTOR_NOT_FOUND:#missing');
    });

    it('clicks locator directly', async () => {
      const { page, mockLocator, mouseEvents } = createMockPage();
      const humanizer = new Humanizer(42);

      await humanizer.clickLocator(page, mockLocator);

      expect(mouseEvents).toContain('down');
      expect(mouseEvents).toContain('up');
    });

    it('clicks at specific coordinate', async () => {
      const { page, mouseEvents } = createMockPage();
      const humanizer = new Humanizer(42);

      await humanizer.clickAt(page, 150, 250);

      expect(mouseEvents).toContain('down');
      expect(mouseEvents).toContain('up');
      expect(humanizer.currentMousePosition).toEqual({ x: 150, y: 250 });
    });

    it('drags between two points', async () => {
      const { page, mouseEvents, mouseMoves } = createMockPage();
      const humanizer = new Humanizer(42);

      await humanizer.drag(page, { x: 10, y: 10 }, { x: 100, y: 200 });

      expect(mouseEvents).toEqual(['down', 'up']);
      expect(mouseMoves.length).toBeGreaterThan(20);
    });

    it('types text character by character', async () => {
      const { page, typedChars } = createMockPage();
      const humanizer = new Humanizer(42);

      await humanizer.type(page, 'input[name="query"]', 'hello');

      expect(typedChars.join('')).toContain('hello');
      expect(page.keyboard.type).toHaveBeenCalled();
    });

    it('scrolls page with kinetic wheel events', async () => {
      const { page, wheels } = createMockPage();
      const humanizer = new Humanizer(42);

      await humanizer.scroll(page, 'down', 500);

      expect(wheels.length).toBeGreaterThanOrEqual(3);
      expect(wheels.every((w) => w.deltaY > 0)).toBe(true);

      wheels.length = 0;
      await humanizer.scroll(page, 'up', 300);
      expect(wheels.every((w) => w.deltaY < 0)).toBe(true);
    });

    it('idles with subtle twitches', async () => {
      const { page } = createMockPage();
      const humanizer = new Humanizer(42);

      // Short idle test to keep fast
      await humanizer.idle(page, 50, 100);
    });
  });
});
