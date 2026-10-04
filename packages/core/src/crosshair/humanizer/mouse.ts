import type { CDPSession } from 'playwright-core';

import { SeededRng } from '../../fingerprint/prng';

import type {
  BoundingBox,
  MouseClickOptions,
  MousePathOptions,
  MouseTrajectoryPoint,
  Point,
} from './types';

export class MouseEngine {
  /**
   * Generates a realistic humanized mouse movement trajectory from start to destination:
   * - Cubic Bézier curve with randomized perpendicular control points
   * - Dynamic acceleration/deceleration following human minimum-jerk kinematics (Fitts' Law)
   * - Overshoot and corrective trajectory simulation for realistic ballistic movements
   * - Per-point micro-jitter simulating neuromuscular tremor
   * - Seeded determinism via profile seed
   */
  static generateTrajectory(
    from: Point,
    to: Point,
    options?: MousePathOptions,
  ): MouseTrajectoryPoint[] {
    const rng = new SeededRng(options?.seed ?? Math.floor(Math.random() * 2147483647));
    const speed = options?.speed ?? 1.0;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);

    // If start and end are practically identical, return single point
    if (distance < 2) {
      return [{ x: to.x, y: to.y, timeMs: 0 }];
    }

    // Human movement duration approximation (Fitts' Law baseline)
    const baseDurationMs = Math.max(
      150,
      Math.min(900, Math.round((120 + Math.log2(distance + 1) * 65) / Math.max(0.2, speed))),
    );

    const stepCount = Math.max(
      15,
      Math.min(
        100,
        options?.steps ?? Math.round(distance / 8 + baseDurationMs / 18),
      ),
    );

    const shouldOvershoot =
      options?.overshoot ??
      (distance > 120 && rng.boolean(options?.overshootProbability ?? 0.22));

    if (shouldOvershoot) {
      return this.generateOvershootTrajectory(from, to, distance, baseDurationMs, stepCount, rng, options);
    }

    return this.generateSingleCurve(from, to, distance, baseDurationMs, stepCount, rng, options);
  }

  /**
   * Samples a realistic target point inside a bounding box with central Gaussian weighting.
   * Avoids artificial exact center or border clicks.
   */
  static samplePointInBox(box: BoundingBox, rng: SeededRng): Point {
    // Standard normal distribution via Box-Muller transform
    const u1 = Math.max(1e-6, rng.next());
    const u2 = rng.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

    // Clamp within central 75% of element bounding box
    const marginX = box.width * 0.125;
    const marginY = box.height * 0.125;
    const stdDevX = (box.width - 2 * marginX) / 6;
    const stdDevY = (box.height - 2 * marginY) / 6;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const sampleX = Math.round(
      Math.min(box.x + box.width - marginX, Math.max(box.x + marginX, centerX + z0 * stdDevX)),
    );
    const sampleY = Math.round(
      Math.min(box.y + box.height - marginY, Math.max(box.y + marginY, centerY + z1 * stdDevY)),
    );

    return { x: sampleX, y: sampleY };
  }

  /**
   * Dispatches mouse movements to Chromium via CDP Input.dispatchMouseEvent along a trajectory.
   */
  static async dispatchTrajectory(
    cdp: CDPSession,
    trajectory: MouseTrajectoryPoint[],
  ): Promise<Point> {
    if (trajectory.length === 0) {
      return { x: 0, y: 0 };
    }

    let lastTime = 0;
    for (const point of trajectory) {
      const wait = point.timeMs - lastTime;
      if (wait > 1) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      lastTime = point.timeMs;

      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x,
        y: point.y,
      });
    }

    const last = trajectory[trajectory.length - 1]!;
    return { x: last.x, y: last.y };
  }

  /**
   * Dispatches a humanized mouse click at the given point with realistic dwell times.
   */
  static async dispatchClick(
    cdp: CDPSession,
    point: Point,
    options?: MouseClickOptions,
  ): Promise<void> {
    const rng = new SeededRng(options?.seed ?? Math.floor(Math.random() * 2147483647));
    const button = options?.button ?? 'left';
    const clickCount = options?.clickCount ?? 1;

    const patienceFactor = options?.patienceIndex ? Math.max(0.2, options.patienceIndex / 5.5) : 1.0;

    // 1. Pre-click dwell
    const preClickDelay = options?.preClickDelayMs ?? Math.round(rng.nextInt(20, 60) * patienceFactor);
    await new Promise((r) => setTimeout(r, preClickDelay));

    // 2. Mouse down
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button,
      clickCount,
    });

    // 3. Click dwell duration (human button press hold time)
    const clickDuration = options?.clickDurationMs ?? rng.nextInt(45, 115);
    await new Promise((r) => setTimeout(r, clickDuration));

    // 4. Mouse up
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button,
      clickCount,
    });

    // 5. Post-click dwell
    const postClickDelay = options?.postClickDelayMs ?? Math.round(rng.nextInt(25, 75) * patienceFactor);
    await new Promise((r) => setTimeout(r, postClickDelay));
  }

  private static generateSingleCurve(
    from: Point,
    to: Point,
    distance: number,
    durationMs: number,
    steps: number,
    rng: SeededRng,
    options?: MousePathOptions,
  ): MouseTrajectoryPoint[] {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const normalX = -dy / distance;
    const normalY = dx / distance;

    // Random control points with perpendicular deviation
    const deviation1 = rng.nextFloat(-0.25, 0.25) * distance;
    const deviation2 = rng.nextFloat(-0.25, 0.25) * distance;

    const t1 = rng.nextFloat(0.2, 0.4);
    const t2 = rng.nextFloat(0.6, 0.8);

    const p1: Point = {
      x: from.x + dx * t1 + normalX * deviation1,
      y: from.y + dy * t1 + normalY * deviation1,
    };

    const p2: Point = {
      x: from.x + dx * t2 + normalX * deviation2,
      y: from.y + dy * t2 + normalY * deviation2,
    };

    const enableJitter = options?.microJitter ?? true;
    const jitterIntensity = options?.jitterIntensity ?? 1.2;

    const points: MouseTrajectoryPoint[] = [];

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;

      // Minimum jerk kinematic velocity profile (quintic polynomial curve)
      // s(u) = 10u^3 - 15u^4 + 6u^5
      const s = 10 * Math.pow(u, 3) - 15 * Math.pow(u, 4) + 6 * Math.pow(u, 5);

      // Evaluate cubic Bézier at parameter s
      const bx = this.cubicBezier(from.x, p1.x, p2.x, to.x, s);
      const by = this.cubicBezier(from.y, p1.y, p2.y, to.y, s);

      // Micro-jitter: higher in mid-flight, zero at extremities
      let jx = 0;
      let jy = 0;
      if (enableJitter && i > 0 && i < steps) {
        const jitterEnvelope = Math.sin(Math.PI * u); // peak at u = 0.5, 0 at ends
        jx = rng.nextFloat(-1, 1) * jitterIntensity * jitterEnvelope;
        jy = rng.nextFloat(-1, 1) * jitterIntensity * jitterEnvelope;
      }

      const pointTime = Math.round(u * durationMs);

      points.push({
        x: Math.round(bx + jx),
        y: Math.round(by + jy),
        timeMs: pointTime,
      });
    }

    // Ensure final point is exact target
    points[points.length - 1] = {
      x: to.x,
      y: to.y,
      timeMs: durationMs,
    };

    return points;
  }

  private static generateOvershootTrajectory(
    from: Point,
    to: Point,
    distance: number,
    totalDurationMs: number,
    totalSteps: number,
    rng: SeededRng,
    options?: MousePathOptions,
  ): MouseTrajectoryPoint[] {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const unitX = dx / distance;
    const unitY = dy / distance;

    // Overshoot magnitude: 6 - 22 px past target with slight lateral deviation
    const overshootMagnitude = rng.nextFloat(6, 22);
    const lateralDeviation = rng.nextFloat(-8, 8);
    const normalX = -unitY;
    const normalY = unitX;

    const overshootPoint: Point = {
      x: Math.round(to.x + unitX * overshootMagnitude + normalX * lateralDeviation),
      y: Math.round(to.y + unitY * overshootMagnitude + normalY * lateralDeviation),
    };

    const mainDurationMs = Math.round(totalDurationMs * 0.78);
    const correctDurationMs = totalDurationMs - mainDurationMs;

    const mainSteps = Math.max(10, Math.round(totalSteps * 0.75));
    const correctSteps = Math.max(5, totalSteps - mainSteps);

    // 1. Initial ballistic flight to overshoot position
    const mainFlight = this.generateSingleCurve(
      from,
      overshootPoint,
      distance + overshootMagnitude,
      mainDurationMs,
      mainSteps,
      rng,
      options,
    );

    // 2. Corrective curve back to exact target
    const correctiveFlight = this.generateSingleCurve(
      overshootPoint,
      to,
      overshootMagnitude,
      correctDurationMs,
      correctSteps,
      rng,
      {
        ...options,
        microJitter: false, // very low jitter on precision landing
      },
    );

    // Combine trajectories with continuous timestamps
    const combined: MouseTrajectoryPoint[] = [...mainFlight];
    for (let i = 1; i < correctiveFlight.length; i++) {
      const p = correctiveFlight[i]!;
      combined.push({
        x: p.x,
        y: p.y,
        timeMs: mainDurationMs + p.timeMs,
      });
    }

    return combined;
  }

  private static cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const oneMinusT = 1 - t;
    return (
      Math.pow(oneMinusT, 3) * p0 +
      3 * Math.pow(oneMinusT, 2) * t * p1 +
      3 * oneMinusT * Math.pow(t, 2) * p2 +
      Math.pow(t, 3) * p3
    );
  }
}
