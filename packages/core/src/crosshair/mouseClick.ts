import type { Page } from 'playwright-core';

import type { Humanizer } from './Humanizer';

/** The shape both a Playwright locator and an element handle satisfy. */
export interface ClickTarget {
  boundingBox: (options?: { timeout?: number }) => Promise<{ x: number; y: number; width: number; height: number } | null>;
  click?: (options?: { timeout?: number }) => Promise<void>;
}

export interface ClickOptions {
  /** Skips humanized mouse movement. Never used on a live profile. */
  instant?: boolean;
  /** Passed to `boundingBox`; keeps a missing element from stalling a sweep. */
  timeoutMs?: number;
}

/**
 * Clicks the centre of a located element.
 *
 * This deliberately does not call `locator.click()`.
 *
 * The engine runs on `rebrowser-playwright-core`, whose patched click path
 * never dispatches: the element resolves, is reported visible, enabled and
 * stable, is the hit target under `elementFromPoint`, and the call still
 * retries until it times out. Every real click in this codebase therefore goes
 * through a bounding box and raw mouse events, which works reliably.
 *
 * Consent banners and skip-ad buttons are the two places that had been calling
 * `locator.click()` directly, which is precisely why neither ever appeared to
 * do anything.
 *
 * Returns false when there is nothing to click, so callers can keep scanning
 * rather than treating a miss as a handled interaction.
 */
export async function clickTargetLikeAPerson(
  page: Page,
  target: ClickTarget,
  humanizer?: Humanizer | undefined,
  options: ClickOptions = {},
): Promise<boolean> {
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return false;

  let box: { x: number; y: number; width: number; height: number } | null = null;
  try {
    box = await target.boundingBox(
      options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : undefined,
    );
  } catch {
    return false;
  }

  if (!box || box.width <= 0 || box.height <= 0) return false;
  if (typeof page.mouse?.move !== 'function') return false;

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  try {
    if (humanizer) {
      await humanizer.clickAt(page, x, y);
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.up();
    }
    return true;
  } catch {
    return false;
  }
}
