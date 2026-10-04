import type { CDPSession } from 'playwright-core';

import { SeededRng } from '../../fingerprint/prng';

import type { KeyboardOptions } from './types';

const QWERTY_ADJACENCY: Record<string, string[]> = {
  a: ['q', 'w', 's', 'z'],
  b: ['v', 'g', 'h', 'n'],
  c: ['x', 'd', 'f', 'v'],
  d: ['s', 'e', 'r', 'f', 'c', 'x'],
  e: ['w', 's', 'd', 'r'],
  f: ['d', 'r', 't', 'g', 'v', 'c'],
  g: ['f', 't', 'y', 'h', 'b', 'v'],
  h: ['g', 'y', 'u', 'j', 'n', 'b'],
  i: ['u', 'j', 'k', 'o'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'],
  k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'],
  n: ['b', 'h', 'j', 'm'],
  o: ['i', 'k', 'l', 'p'],
  p: ['o', 'l'],
  q: ['w', 'a', 's'],
  r: ['e', 'd', 'f', 't'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', 'f', 'g', 'y'],
  u: ['y', 'h', 'j', 'i'],
  v: ['c', 'f', 'g', 'b'],
  w: ['q', 'a', 's', 'e'],
  x: ['z', 's', 'd', 'c'],
  y: ['t', 'g', 'h', 'u'],
  z: ['a', 's', 'x'],
};

export class KeyboardEngine {
  /**
   * Types text into the active element via CDP Input.dispatchKeyEvent with realistic human dynamics:
   * - Stochastic per-character typing delays (40 - 140ms baseline)
   * - Natural cognitive pauses on punctuation, spaces, and capital letters
   * - 2% realistic keyboard typo simulation with human reaction time and backspace correction
   * - Occasional double-space correction simulation
   * - Seeded determinism via profile seed
   */
  static async type(
    cdp: CDPSession,
    text: string,
    options?: KeyboardOptions,
  ): Promise<void> {
    const rng = new SeededRng(options?.seed ?? Math.floor(Math.random() * 2147483647));

    // Dynamic delay computation linked to target WPM
    // Standard typing calculation: 1 word = 5 characters.
    // Average delay per character: 60,000ms / (WPM * 5) = 12,000 / WPM.
    let minDelay = options?.minDelayMs;
    let maxDelay = options?.maxDelayMs;

    if (minDelay === undefined || maxDelay === undefined) {
      if (options?.typingWpm && options.typingWpm > 0) {
        const baseCharMs = Math.round(12000 / Math.max(10, options.typingWpm));
        minDelay = minDelay ?? Math.max(15, Math.round(baseCharMs * 0.65));
        maxDelay = maxDelay ?? Math.max(minDelay + 10, Math.round(baseCharMs * 1.35));
      } else {
        minDelay = minDelay ?? 40;
        maxDelay = maxDelay ?? 140;
      }
    }

    const speed = Math.max(0.1, options?.speed ?? 1.0);
    const simulateTypos = options?.simulateTypos ?? true;

    let resolvedTypoChance = options?.typoChance;
    if (resolvedTypoChance === undefined && options?.typoRate !== undefined) {
      resolvedTypoChance = options.typoRate > 1 ? options.typoRate / 100 : options.typoRate;
    }
    const typoChance = resolvedTypoChance ?? 0.02;
    const simulateDoubleSpace = options?.simulateDoubleSpace ?? true;

    let previousChar = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;

      // 1. Check for realistic typo simulation
      const lowerChar = char.toLowerCase();
      const adjacentKeys = QWERTY_ADJACENCY[lowerChar];

      if (
        simulateTypos &&
        adjacentKeys &&
        adjacentKeys.length > 0 &&
        char.match(/[a-zA-Z]/) &&
        rng.boolean(typoChance)
      ) {
        const typoChar = rng.pick(adjacentKeys);
        const finalTypo = char === char.toUpperCase() ? typoChar.toUpperCase() : typoChar;

        // Type accidental typo
        await this.dispatchChar(cdp, finalTypo, rng);

        // Human reaction time before noticing mistake (120 - 280ms)
        const reactionDelay = Math.round(rng.nextInt(120, 280) / speed);
        await new Promise((r) => setTimeout(r, reactionDelay));

        // Press backspace to correct mistake
        await this.dispatchBackspace(cdp, rng);

        // Recovery pause (60 - 140ms)
        const correctionDelay = Math.round(rng.nextInt(60, 140) / speed);
        await new Promise((r) => setTimeout(r, correctionDelay));
      }

      // 2. Type intended character
      await this.dispatchChar(cdp, char, rng);

      // 3. Check for double-space simulation
      if (char === ' ' && simulateDoubleSpace && rng.boolean(0.01)) {
        await this.dispatchChar(cdp, ' ', rng);
        const reactionDelay = Math.round(rng.nextInt(100, 220) / speed);
        await new Promise((r) => setTimeout(r, reactionDelay));
        await this.dispatchBackspace(cdp, rng);
      }

      // 4. Calculate dynamic delay before next character
      if (i < text.length - 1) {
        const baseDelay = rng.nextInt(minDelay, maxDelay);
        let dynamicDelay = baseDelay;

        // Space delay (thinking time)
        if (char === ' ') {
          dynamicDelay += rng.nextInt(25, 65);
        } else if (char.match(/[.,!?;:]/)) {
          dynamicDelay += rng.nextInt(45, 110);
        } else if (char === char.toUpperCase() && char.match(/[A-Z]/)) {
          dynamicDelay += rng.nextInt(30, 75);
        } else if (char === previousChar) {
          // Repeated keys are pressed faster
          dynamicDelay = Math.max(minDelay, dynamicDelay - rng.nextInt(15, 30));
        }

        const finalDelay = Math.round(dynamicDelay / speed);
        await new Promise((r) => setTimeout(r, finalDelay));
      }

      previousChar = char;
    }
  }

  private static async dispatchChar(
    cdp: CDPSession,
    char: string,
    rng: SeededRng,
  ): Promise<void> {
    const holdDuration = rng.nextInt(25, 60);

    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
      unmodifiedText: char,
    });

    await new Promise((r) => setTimeout(r, holdDuration));

    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
    });
  }

  private static async dispatchBackspace(
    cdp: CDPSession,
    rng: SeededRng,
  ): Promise<void> {
    const holdDuration = rng.nextInt(30, 65);

    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    });

    await new Promise((r) => setTimeout(r, holdDuration));

    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    });
  }
}
