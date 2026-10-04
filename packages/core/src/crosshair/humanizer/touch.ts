import type { CDPSession } from 'playwright-core';

import { SeededRng } from '../../fingerprint/prng';
import type { BoundingBox, Point } from './types';

export interface TouchTapOptions {
  seed?: string | number | undefined;
  patienceIndex?: number | undefined;
  contactRadius?: number | undefined;
}

export interface TouchSwipeOptions {
  seed?: string | number | undefined;
  direction?: 'up' | 'down' | 'left' | 'right' | undefined;
  amount?: number | undefined;
  speed?: number | undefined;
  startPoint?: Point | undefined;
}

export class TouchEngine {
  /**
   * Dispatches an authentic mobile touch tap via CDP Input.dispatchTouchEvent:
   * - Emulates genuine human finger contact pad (radiusX, radiusY, force)
   * - Micro-wobble during contact dwell simulating neuromuscular pressure shifts
   * - Realistic dwell duration (55ms - 110ms)
   */
  static async dispatchTap(
    cdp: CDPSession,
    target: Point | BoundingBox,
    options?: TouchTapOptions,
  ): Promise<Point> {
    const rng = new SeededRng(options?.seed ?? Math.floor(Math.random() * 2147483647));

    let x: number;
    let y: number;

    if ('width' in target && 'height' in target) {
      // Gaussian distribution centered inside bounding box
      const rx = (rng.nextFloat(0, 1) + rng.nextFloat(0, 1) - 1) * 0.35;
      const ry = (rng.nextFloat(0, 1) + rng.nextFloat(0, 1) - 1) * 0.35;
      x = Math.round(target.x + target.width * (0.5 + rx));
      y = Math.round(target.y + target.height * (0.5 + ry));
    } else {
      x = Math.round(target.x + (rng.nextFloat(-1.5, 1.5)));
      y = Math.round(target.y + (rng.nextFloat(-1.5, 1.5)));
    }

    const radiusX = options?.contactRadius ?? rng.nextInt(12, 18);
    const radiusY = Math.round(radiusX * rng.nextFloat(1.1, 1.35));
    const force = rng.nextFloat(0.75, 0.98);

    // 1. Touch Start
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        {
          x,
          y,
          radiusX,
          radiusY,
          rotationAngle: rng.nextInt(10, 35),
          force,
          id: 0,
        },
      ],
    }).catch(() => {});

    // 2. Contact Dwell with micro-shift
    const dwellMs = rng.nextInt(60, 110);
    await new Promise((r) => setTimeout(r, Math.round(dwellMs * 0.6)));

    // Subtle micro-wobble during press
    const wobbleX = x + (rng.nextFloat(-0.8, 0.8));
    const wobbleY = y + (rng.nextFloat(-0.8, 0.8));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: wobbleX,
          y: wobbleY,
          radiusX,
          radiusY,
          rotationAngle: rng.nextInt(10, 35),
          force: force * 0.95,
          id: 0,
        },
      ],
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, Math.round(dwellMs * 0.4)));

    // 3. Touch End
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    }).catch(() => {});

    return { x, y };
  }

  /**
   * Dispatches an authentic mobile finger swipe / scroll gesture:
   * - Touch contact on mobile screen
   * - Inertial thumb trajectory with acceleration and natural deceleration
   * - Natural thumb sweep arc (slight horizontal curve during vertical swipe)
   * - Clean release
   */
  static async dispatchSwipe(
    cdp: CDPSession,
    options?: TouchSwipeOptions,
  ): Promise<void> {
    const rng = new SeededRng(options?.seed ?? Math.floor(Math.random() * 2147483647));
    const direction = options?.direction ?? 'down';
    const amount = Math.max(80, options?.amount ?? 350);

    // Default start point near bottom-center for scrolling down, or upper-center for scrolling up
    const startX = options?.startPoint?.x ?? rng.nextInt(180, 240);
    const startY = options?.startPoint?.y ?? (direction === 'down' ? rng.nextInt(520, 680) : rng.nextInt(220, 340));

    // For scrolling content "down", finger moves UP (negative delta)
    const sign = direction === 'down' ? -1 : 1;
    const endY = startY + sign * amount;
    // Natural slight right-handed thumb sweep curvature (10-25px horizontal drift)
    const sweepDrift = rng.nextInt(12, 28);
    const endX = startX + sweepDrift;

    const steps = Math.max(10, Math.min(24, Math.round(amount / 25)));
    const radiusX = rng.nextInt(14, 20);
    const radiusY = Math.round(radiusX * 1.25);

    // 1. Touch Start
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        {
          x: startX,
          y: startY,
          radiusX,
          radiusY,
          force: 0.9,
          id: 0,
        },
      ],
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, rng.nextInt(25, 45)));

    // 2. Trajectory with deceleration curve (easing out)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Easing curve: easeOutQuad
      const eased = t * (2 - t);

      const curX = Math.round(startX + (endX - startX) * eased);
      const curY = Math.round(startY + (endY - startY) * eased);
      const currentForce = Math.max(0.3, 0.9 - t * 0.5);

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: curX,
            y: curY,
            radiusX,
            radiusY,
            force: currentForce,
            id: 0,
          },
        ],
      }).catch(() => {});

      // Human gesture inter-step delay (12-24ms)
      await new Promise((r) => setTimeout(r, rng.nextInt(12, 22)));
    }

    // 3. Touch End
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    }).catch(() => {});

    // Post-swipe pause
    await new Promise((r) => setTimeout(r, rng.nextInt(100, 250)));
  }
}
