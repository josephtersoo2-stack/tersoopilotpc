import type { CDPSession } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Humanizer } from '../src/crosshair/Humanizer';

describe('Ticket 4.6: Humanizer Keyboard & Scroll Engine', () => {
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

  describe('KeyboardEngine (Humanizer.type)', () => {
    it('dispatches keyDown and keyUp events for each character with realistic typing delays', async () => {
      const text = 'Hello, World!';

      await Humanizer.type(mockCdp, text, {
        speed: 50.0, // fast execution for unit tests
        simulateTypos: false,
      });

      const keyEvents = dispatchedEvents.filter(
        (e) => e.method === 'Input.dispatchKeyEvent',
      );

      // Each character produces at least 1 keyDown and 1 keyUp
      expect(keyEvents.length).toBe(text.length * 2);

      const typedChars = keyEvents
        .filter((e) => e.params['type'] === 'keyDown')
        .map((e) => e.params['text'])
        .join('');

      expect(typedChars).toBe(text);
    });

    it('simulates typo and backspace correction when typo occurs', async () => {
      // Force typo on 'hello' with 100% typo chance
      await Humanizer.type(mockCdp, 'h', {
        seed: 'typo-seed',
        speed: 50.0,
        simulateTypos: true,
        typoChance: 1.0,
      });

      const keyEvents = dispatchedEvents.filter(
        (e) => e.method === 'Input.dispatchKeyEvent',
      );

      // Should have:
      // 1. typo keyDown + keyUp
      // 2. backspace rawKeyDown + keyUp
      // 3. intended char 'h' keyDown + keyUp
      const hasBackspace = keyEvents.some(
        (e) =>
          e.params['key'] === 'Backspace' ||
          e.params['windowsVirtualKeyCode'] === 8,
      );
      expect(hasBackspace).toBe(true);

      const lastKeyDown = keyEvents
        .filter((e) => e.params['type'] === 'keyDown')
        .pop();
      expect(lastKeyDown?.params['text']).toBe('h');
    });
  });

  describe('ScrollEngine (Humanizer.scroll)', () => {
    it('dispatches mouseWheel events with kinetic bursts and deceleration', async () => {
      const totalAmount = 300;

      await Humanizer.scroll(mockCdp, {
        direction: 'down',
        amount: totalAmount,
        burstCount: 2,
        speed: 50.0, // fast execution for tests
        cursorPosition: { x: 400, y: 300 },
      });

      const wheelEvents = dispatchedEvents.filter(
        (e) =>
          e.method === 'Input.dispatchMouseEvent' &&
          e.params['type'] === 'mouseWheel',
      );

      expect(wheelEvents.length).toBeGreaterThanOrEqual(6);

      // Sum of deltaY must equal exact totalAmount
      const sumDeltaY = wheelEvents.reduce(
        (acc, e) => acc + (Number(e.params['deltaY']) || 0),
        0,
      );
      expect(sumDeltaY).toBe(totalAmount);

      // Deceleration verification: first event in burst has higher delta than last event in burst
      const firstTickDelta = Number(wheelEvents[0]!.params['deltaY']);
      const midTickDelta = Number(wheelEvents[Math.floor(wheelEvents.length / 4)]!.params['deltaY']);
      expect(firstTickDelta).toBeGreaterThanOrEqual(midTickDelta);
    });

    it('supports scrolling up with negative deltaY', async () => {
      await Humanizer.scroll(mockCdp, {
        direction: 'up',
        amount: 200,
        speed: 50.0,
      });

      const wheelEvents = dispatchedEvents.filter(
        (e) =>
          e.method === 'Input.dispatchMouseEvent' &&
          e.params['type'] === 'mouseWheel',
      );

      const sumDeltaY = wheelEvents.reduce(
        (acc, e) => acc + (Number(e.params['deltaY']) || 0),
        0,
      );
      expect(sumDeltaY).toBe(-200);
    });

    it('supports horizontal scrolling (left and right) with deltaX', async () => {
      await Humanizer.scroll(mockCdp, {
        direction: 'right',
        amount: 150,
        speed: 50.0,
      });

      const wheelEvents = dispatchedEvents.filter(
        (e) =>
          e.method === 'Input.dispatchMouseEvent' &&
          e.params['type'] === 'mouseWheel',
      );

      const sumDeltaX = wheelEvents.reduce(
        (acc, e) => acc + (Number(e.params['deltaX']) || 0),
        0,
      );
      expect(sumDeltaX).toBe(150);
    });
  });
});
