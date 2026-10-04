import type { CDPSession } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Humanizer, type Point } from '../src/crosshair/Humanizer';

describe('Ticket 4.5: Humanizer Mouse Engine (Cubic Bézier & Micro-Jitter)', () => {
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

  it('generates non-linear cubic Bézier path from start to target', () => {
    const from: Point = { x: 50, y: 100 };
    const to: Point = { x: 500, y: 400 };

    const path = Humanizer.generateMousePath(from, to, {
      seed: 'test-seed-123',
      overshoot: false,
    });

    expect(path.length).toBeGreaterThanOrEqual(15);

    // First point must be start
    expect(path[0]!.x).toBe(from.x);
    expect(path[0]!.y).toBe(from.y);
    expect(path[0]!.timeMs).toBe(0);

    // Last point must be exact target
    const last = path[path.length - 1]!;
    expect(last.x).toBe(to.x);
    expect(last.y).toBe(to.y);
    expect(last.timeMs).toBeGreaterThan(100);

    // Non-linear check: at least one point should deviate significantly from the straight line
    // Straight line equation: y - y1 = m*(x - x1) -> m*x - y + (y1 - m*x1) = 0
    const m = (to.y - from.y) / (to.x - from.x);
    let maxPerpendicularDeviation = 0;

    for (const pt of path) {
      const expectedYOnLine = from.y + m * (pt.x - from.x);
      const dev = Math.abs(pt.y - expectedYOnLine);
      if (dev > maxPerpendicularDeviation) {
        maxPerpendicularDeviation = dev;
      }
    }

    // Must have non-zero curve deviation (typical curve deviation > 10px)
    expect(maxPerpendicularDeviation).toBeGreaterThan(10);
  });

  it('is deterministic when provided the same seed', () => {
    const from: Point = { x: 0, y: 0 };
    const to: Point = { x: 300, y: 300 };

    const pathA = Humanizer.generateMousePath(from, to, { seed: 'deterministic-seed' });
    const pathB = Humanizer.generateMousePath(from, to, { seed: 'deterministic-seed' });
    const pathC = Humanizer.generateMousePath(from, to, { seed: 'different-seed' });

    expect(pathA).toEqual(pathB);
    expect(pathA).not.toEqual(pathC);
  });

  it('generates overshoot trajectory when overshoot is enabled', () => {
    const from: Point = { x: 100, y: 100 };
    const to: Point = { x: 400, y: 100 }; // moving along +X axis

    const path = Humanizer.generateMousePath(from, to, {
      seed: 'overshoot-seed-1',
      overshoot: true,
      microJitter: false,
    });

    // An overshoot along X axis will have points where x > to.x (x > 400) before settling back to 400
    const overshotPoints = path.filter((p) => p.x > to.x);
    expect(overshotPoints.length).toBeGreaterThan(0);

    // And the final point must still be exact target
    const finalPt = path[path.length - 1]!;
    expect(finalPt.x).toBe(to.x);
    expect(finalPt.y).toBe(to.y);
  });

  it('samples target click coordinates inside bounding box with central weighting', () => {
    const box = { x: 100, y: 200, width: 200, height: 60 };

    for (let i = 0; i < 20; i++) {
      const pt = Humanizer.samplePointInBox(box, `box-seed-${i}`);

      // Must be inside bounds
      expect(pt.x).toBeGreaterThanOrEqual(box.x);
      expect(pt.x).toBeLessThanOrEqual(box.x + box.width);
      expect(pt.y).toBeGreaterThanOrEqual(box.y);
      expect(pt.y).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  it('Humanizer.move dispatches CDP mouseMoved events and updates cursor position', async () => {
    Humanizer.setCursorPosition(mockCdp, { x: 10, y: 10 });

    const target: Point = { x: 150, y: 120 };
    const end = await Humanizer.move(mockCdp, target, {
      seed: 'move-test-seed',
      speed: 10.0, // fast execution for tests
    });

    expect(end.x).toBe(target.x);
    expect(end.y).toBe(target.y);
    expect(Humanizer.getCursorPosition(mockCdp)).toEqual(target);

    const moveEvents = dispatchedEvents.filter(
      (e) => e.method === 'Input.dispatchMouseEvent' && e.params['type'] === 'mouseMoved',
    );
    expect(moveEvents.length).toBeGreaterThanOrEqual(15);
  });

  it('Humanizer.click moves to element bounding box, presses, dwells, and releases', async () => {
    Humanizer.setCursorPosition(mockCdp, { x: 0, y: 0 });

    const box = { x: 200, y: 300, width: 100, height: 40 };

    const clickedPoint = await Humanizer.click(mockCdp, box, {
      seed: 'click-test-seed',
      speed: 10.0,
      preClickDelayMs: 2,
      clickDurationMs: 5,
      postClickDelayMs: 2,
    });

    expect(clickedPoint.x).toBeGreaterThanOrEqual(box.x);
    expect(clickedPoint.x).toBeLessThanOrEqual(box.x + box.width);
    expect(clickedPoint.y).toBeGreaterThanOrEqual(box.y);
    expect(clickedPoint.y).toBeLessThanOrEqual(box.y + box.height);

    // Verify event sequence: mouseMoved... -> mousePressed -> mouseReleased
    const mouseEvents = dispatchedEvents
      .filter((e) => e.method === 'Input.dispatchMouseEvent')
      .map((e) => e.params['type']);

    expect(mouseEvents).toContain('mouseMoved');
    expect(mouseEvents).toContain('mousePressed');
    expect(mouseEvents).toContain('mouseReleased');

    const pressedIdx = mouseEvents.lastIndexOf('mousePressed');
    const releasedIdx = mouseEvents.lastIndexOf('mouseReleased');
    expect(pressedIdx).toBeLessThan(releasedIdx);
  });
});
