import type { CDPSession } from 'playwright-core';

import { SeededRng } from '../../fingerprint/prng';

import type { ScrollOptions } from './types';

export class ScrollEngine {
  /**
   * Scrolls the page via CDP Input.dispatchMouseEvent mouseWheel events with natural kinetic bursts:
   * - 2 to 3 discrete scroll bursts mimicking human finger flicks on mouse wheel / trackpad
   * - Deceleration curve (inertial physics) per burst
   * - Pauses between bursts mimicking hand repositioning
   * - Seeded determinism via profile seed
   */
  static async scroll(
    cdp: CDPSession,
    options?: ScrollOptions,
  ): Promise<void> {
    const rng = new SeededRng(options?.seed ?? Math.floor(Math.random() * 2147483647));
    const direction = options?.direction ?? 'down';
    const totalAmount = Math.max(10, options?.amount ?? 300);
    const speed = Math.max(0.1, options?.speed ?? 1.0);
    const cursor = options?.cursorPosition ?? { x: 500, y: 400 };

    const burstCount = Math.max(1, options?.burstCount ?? rng.nextInt(2, 3));

    // Distribute total scroll amount across bursts
    const burstWeights: number[] = [];
    for (let b = 0; b < burstCount; b++) {
      burstWeights.push(rng.nextFloat(0.8, 1.2));
    }
    const totalWeight = burstWeights.reduce((acc, w) => acc + w, 0);

    const burstAmounts = burstWeights.map((w) =>
      Math.round((w / totalWeight) * totalAmount),
    );

    // Correction to ensure sum equals exact totalAmount
    const diff = totalAmount - burstAmounts.reduce((acc, a) => acc + a, 0);
    if (burstAmounts.length > 0) {
      burstAmounts[burstAmounts.length - 1]! += diff;
    }

    for (let b = 0; b < burstAmounts.length; b++) {
      const burstAmount = burstAmounts[b]!;
      if (burstAmount <= 0) continue;

      // 4 to 8 wheel events per burst with deceleration
      const ticks = Math.max(3, Math.min(10, Math.round(burstAmount / 40) + rng.nextInt(1, 3)));

      // Generate decelerating weights: w(i) = (ticks - i)^1.5
      const tickWeights: number[] = [];
      for (let i = 0; i < ticks; i++) {
        tickWeights.push(Math.pow(ticks - i, 1.4));
      }
      const sumTickWeights = tickWeights.reduce((acc, w) => acc + w, 0);

      let burstAccumulator = 0;
      for (let i = 0; i < ticks; i++) {
        let tickDelta: number;
        if (i === ticks - 1) {
          tickDelta = burstAmount - burstAccumulator;
        } else {
          tickDelta = Math.round((tickWeights[i]! / sumTickWeights) * burstAmount);
          burstAccumulator += tickDelta;
        }
        if (tickDelta === 0) continue;

        let deltaX = 0;
        let deltaY = 0;

        switch (direction) {
          case 'down':
            deltaY = tickDelta;
            break;
          case 'up':
            deltaY = -tickDelta;
            break;
          case 'right':
            deltaX = tickDelta;
            break;
          case 'left':
            deltaX = -tickDelta;
            break;
        }

        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: cursor.x,
          y: cursor.y,
          deltaX,
          deltaY,
        });

        const tickDelay = Math.round(rng.nextInt(14, 28) / speed);
        await new Promise((r) => setTimeout(r, tickDelay));
      }

      // Inter-burst pause (human hand repositioning)
      if (b < burstAmounts.length - 1) {
        const patienceFactor = options?.patienceIndex ? Math.max(0.2, options.patienceIndex / 5.5) : 1.0;
        const interBurstPause = Math.round((rng.nextInt(90, 220) * patienceFactor) / speed);
        await new Promise((r) => setTimeout(r, interBurstPause));
      }
    }
  }
}
