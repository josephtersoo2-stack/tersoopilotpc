import type { CDPSession, ElementHandle, Locator, Page } from 'playwright-core';

import { SeededRng } from '../fingerprint/prng';

import { generateBezierPath, type Point } from './bezier';
import { lognormal, sampleRange } from './distributions';
import { KeyboardEngine } from './humanizer/keyboard';
import { MouseEngine } from './humanizer/mouse';
import { ScrollEngine } from './humanizer/scroll';
import { TouchEngine, type TouchSwipeOptions, type TouchTapOptions } from './humanizer/touch';
import type {
  BoundingBox,
  KeyboardOptions,
  MouseClickOptions,
  MousePathOptions,
  MouseTrajectoryPoint,
  ScrollOptions,
} from './humanizer/types';
import { mulberry32 } from './prng';

export * from './humanizer/types';
export type { Point } from './bezier';

export class Humanizer {
  private rng: () => number;
  private lastMouse: Point = { x: 0, y: 0 };

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  get currentMousePosition(): Point {
    return { ...this.lastMouse };
  }

  async moveMouse(page: Page, target: Point): Promise<void> {
    const steps = Math.floor(sampleRange(this.rng, [20, 60]));
    const path = generateBezierPath(this.lastMouse, target, this.rng, steps);

    for (const p of path) {
      await page.mouse.move(p.x, p.y);
      await this.delay(sampleRange(this.rng, [8, 24]));
    }

    if (this.rng() < 0.1) {
      const overshoot = sampleRange(this.rng, [3, 15]);
      const angle = Math.atan2(target.y - this.lastMouse.y, target.x - this.lastMouse.x);
      const over: Point = {
        x: target.x + Math.cos(angle) * overshoot,
        y: target.y + Math.sin(angle) * overshoot,
      };
      const back = generateBezierPath(target, over, this.rng, 5);
      for (const p of back) {
        await page.mouse.move(p.x, p.y);
        await this.delay(4);
      }
      const correct = generateBezierPath(over, target, this.rng, 3);
      for (const p of correct) {
        await page.mouse.move(p.x, p.y);
        await this.delay(6);
      }
    }

    this.lastMouse = target;
  }

  async click(page: Page, selector: string): Promise<void> {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`SELECTOR_NOT_FOUND:${selector}`);
    const target = {
      x: box.x + box.width / 2 + (this.rng() - 0.5) * 4,
      y: box.y + box.height / 2 + (this.rng() - 0.5) * 4,
    };
    await this.moveMouse(page, target);
    await this.delay(sampleRange(this.rng, [80, 200]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [40, 90]));
    await page.mouse.up();
    await this.delay(sampleRange(this.rng, [100, 400]));
  }

  async clickLocator(page: Page, locator: Locator): Promise<void> {
    const box = await locator.first().boundingBox();
    if (!box) throw new Error('LOCATOR_NOT_VISIBLE');
    const target = {
      x: box.x + box.width / 2 + (this.rng() - 0.5) * 4,
      y: box.y + box.height / 2 + (this.rng() - 0.5) * 4,
    };
    await this.moveMouse(page, target);
    await this.delay(sampleRange(this.rng, [80, 200]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [40, 90]));
    await page.mouse.up();
  }

  async clickAt(page: Page, x: number, y: number): Promise<void> {
    await this.moveMouse(page, { x, y });
    await this.delay(sampleRange(this.rng, [80, 200]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [40, 90]));
    await page.mouse.up();
  }

  async drag(page: Page, from: Point, to: Point): Promise<void> {
    await this.moveMouse(page, from);
    await this.delay(sampleRange(this.rng, [60, 150]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [50, 120]));
    const path = generateBezierPath(from, to, this.rng, 25);
    for (const p of path) {
      await page.mouse.move(p.x, p.y);
      await this.delay(sampleRange(this.rng, [6, 18]));
    }
    await this.delay(sampleRange(this.rng, [40, 100]));
    await page.mouse.up();
  }

  async type(page: Page, selector: string, text: string): Promise<void> {
    await this.click(page, selector);
    await this.typeText(page, text);
  }

  /**
   * Types character by character with humanized inter-key delays.
   *
   * Every other step in the engine types this way. Anything that calls
   * `page.keyboard.type(text)` with a whole string types at machine speed, which
   * is one of the loudest automation signals there is, so model-driven steps
   * route their keystrokes through here too.
   */
  async typeText(page: Page, text: string): Promise<void> {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!char) continue;
      await page.keyboard.type(char);
      const delay = lognormal(this.rng, 80, 0.4);
      await this.delay(Math.max(20, Math.min(delay, 400)));

      if (this.rng() < 0.02 && i < text.length - 1) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
        await page.keyboard.type(wrongChar);
        await this.delay(sampleRange(this.rng, [200, 600]));
        await page.keyboard.press('Backspace');
        await this.delay(sampleRange(this.rng, [100, 300]));
      }
    }
  }

  /**
   * Clicks the centre of an already-resolved target, moving the mouse there
   * the way a person would.
   *
   * Works for both a Playwright locator and an element handle, which is what
   * lets the LLM step click the exact element a page-tree `ref` points at.
   */
  async clickTarget(page: Page, target: Locator | ElementHandle): Promise<void> {
    const box = await this.boundingBoxOf(target);
    if (!box) throw new Error('LOCATOR_NOT_VISIBLE');
    const point = {
      x: box.x + box.width / 2 + (this.rng() - 0.5) * 4,
      y: box.y + box.height / 2 + (this.rng() - 0.5) * 4,
    };
    await this.moveMouse(page, point);
    await this.delay(sampleRange(this.rng, [80, 200]));
    await page.mouse.down();
    await this.delay(sampleRange(this.rng, [40, 90]));
    await page.mouse.up();
  }

  /**
   * Focuses an already-resolved target and types into it with humanized
   * timing. Falls back to a direct value write when the field stays empty,
   * which happens on pages that swallow synthetic key events.
   */
  async typeIntoTarget(
    page: Page,
    target: Locator | ElementHandle,
    text: string,
  ): Promise<void> {
    try {
      await this.clickTarget(page, target);
    } catch {
      // Not clickable (covered, offscreen, or a virtualised field). Focusing
      // alone may still be enough to type into it.
    }

    try {
      await target.focus({ timeout: 2000 });
    } catch {
      // Focus is best effort; the keystrokes below may still land.
    }

    await this.typeText(page, text);

    const empty = await this.readValue(target);
    if (empty) {
      try {
        await target.fill(text, { timeout: 2000 });
      } catch {
        // Nothing else to try; the caller reports the observed value.
      }
    }
  }

  private async boundingBoxOf(
    target: Locator | ElementHandle,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const candidate =
      typeof (target as Locator).first === 'function' ? (target as Locator).first() : target;
    try {
      return await candidate.boundingBox();
    } catch {
      return null;
    }
  }

  /** Returns the field's value when it is empty (or unreadable), else null. */
  private async readValue(target: Locator | ElementHandle): Promise<boolean> {
    const candidate =
      typeof (target as Locator).first === 'function' ? (target as Locator).first() : target;
    if (typeof (candidate as ElementHandle).inputValue !== 'function') return false;
    try {
      return !(await (candidate as ElementHandle).inputValue());
    } catch {
      return false;
    }
  }

  async scroll(page: Page, direction: 'up' | 'down', amount: number): Promise<void> {
    const events = Math.floor(sampleRange(this.rng, [3, 8]));
    for (let i = 0; i < events; i++) {
      const progress = i / events;
      const eased = 1 - Math.pow(1 - progress, 3);
      const step = (amount / events) * (1 + eased * 0.5);
      const delta = direction === 'down' ? step : -step;
      await page.mouse.wheel(0, delta);
      await this.delay(sampleRange(this.rng, [30, 90]));
    }
  }

  async idle(page: Page, minMs: number, maxMs: number): Promise<void> {
    const total = sampleRange(this.rng, [minMs, maxMs]);
    const chunks = Math.floor(total / 3000);

    for (let i = 0; i < chunks; i++) {
      await this.delay(sampleRange(this.rng, [2000, 4000]));
      if (this.rng() < 0.3) {
        await page.mouse.move(
          this.lastMouse.x + (this.rng() - 0.5) * 20,
          this.lastMouse.y + (this.rng() - 0.5) * 20,
        );
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  // --- Static methods for CDP-based execution (backward compatibility) ---
  private static readonly cursorPositions = new WeakMap<CDPSession, Point>();

  /**
   * Generates a realistic humanized mouse trajectory without dispatching events.
   */
  static generateMousePath(
    from: Point,
    to: Point,
    options?: MousePathOptions,
  ): MouseTrajectoryPoint[] {
    return MouseEngine.generateTrajectory(from, to, options);
  }

  /**
   * Samples a realistic click coordinate inside a bounding box using central Gaussian distribution.
   */
  static samplePointInBox(box: BoundingBox, seed?: string | number): Point {
    const rng = new SeededRng(seed ?? Math.floor(Math.random() * 2147483647));
    return MouseEngine.samplePointInBox(box, rng);
  }

  /**
   * Smoothly moves the mouse cursor to the destination point via CDP.
   * Tracks cursor coordinates across interactions.
   */
  static async move(
    cdp: CDPSession,
    to: Point,
    options?: MousePathOptions,
  ): Promise<Point> {
    const current = this.getCursorPosition(cdp);
    const trajectory = MouseEngine.generateTrajectory(current, to, options);
    const end = await MouseEngine.dispatchTrajectory(cdp, trajectory);
    this.cursorPositions.set(cdp, end);
    return end;
  }

  /**
   * Performs a humanized click on a target point or inside an element's bounding box:
   * 1. Smoothly moves to target point via cubic Bézier curve with micro-jitter
   * 2. Dwells momentarily before clicking
   * 3. Dispatches mousePressed event
   * 4. Holds button down for realistic human dwell time (45-115ms)
   * 5. Dispatches mouseReleased event
   * 6. Dwells momentarily before returning
   */
  static async click(
    cdp: CDPSession,
    target: Point | BoundingBox,
    options?: MouseClickOptions,
  ): Promise<Point> {
    const targetPoint: Point =
      'width' in target && 'height' in target
        ? this.samplePointInBox(target, options?.seed)
        : target;

    await this.move(cdp, targetPoint, options);
    await MouseEngine.dispatchClick(cdp, targetPoint, options);
    return targetPoint;
  }

  /**
   * Types text into the focused element via CDP with stochastic typing delays,
   * natural cognitive pauses, and typo correction simulation.
   */
  static async type(
    cdp: CDPSession,
    text: string,
    options?: KeyboardOptions,
  ): Promise<void> {
    return KeyboardEngine.type(cdp, text, options);
  }

  /**
   * Scrolls the page via CDP mouseWheel events with kinetic bursts and deceleration.
   */
  static async scroll(
    cdp: CDPSession,
    options?: ScrollOptions,
  ): Promise<void> {
    const currentCursor = this.getCursorPosition(cdp);
    return ScrollEngine.scroll(cdp, {
      cursorPosition: currentCursor,
      ...options,
    });
  }

  /**
   * Retrieves the last known cursor position for a CDP session.
   */
  static getCursorPosition(cdp: CDPSession): Point {
    return this.cursorPositions.get(cdp) ?? { x: 0, y: 0 };
  }

  /**
   * Performs an authentic mobile touch tap on a target point or inside an element's bounding box via CDP.
   */
  static async touchTap(
    cdp: CDPSession,
    target: Point | BoundingBox,
    options?: TouchTapOptions,
  ): Promise<Point> {
    return TouchEngine.dispatchTap(cdp, target, options);
  }

  /**
   * Performs an authentic mobile touch swipe gesture (inertial scroll/fling) via CDP.
   */
  static async touchSwipe(
    cdp: CDPSession,
    options?: TouchSwipeOptions,
  ): Promise<void> {
    return TouchEngine.dispatchSwipe(cdp, options);
  }

  /**
   * Manually sets or resets the cursor position for a CDP session.
   */
  static setCursorPosition(cdp: CDPSession, point: Point): void {
    this.cursorPositions.set(cdp, point);
  }
}
