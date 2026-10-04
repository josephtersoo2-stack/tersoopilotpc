import type { Page } from 'playwright-core';

import type { Humanizer } from './Humanizer';
import { clickTargetLikeAPerson, type ClickTarget } from './mouseClick';

/**
 * Video ad skipping.
 *
 * Two things make this harder than it looks, and both caused the model to sit
 * through ads in a real run:
 *
 *  1. Players hide their control bar when the pointer is not over them. A skip
 *     button that is present in the DOM is not clickable until the player has
 *     been hovered, so a plain visibility check finds nothing.
 *  2. The button's markup changes across player versions, and a text match on
 *     "Skip" also matches unrelated page chrome. The selectors below are tried
 *     in confidence order, and a text match is only trusted inside a player.
 */
const PLAYER_SELECTORS = [
  // YouTube: current and legacy skip-button markup.
  'video',
  '.html5-video-player',
  '.ytp-youtube-player',
  '#movie_player',
  '.vjs-player',
  '.video-player',
  '[class*="player" i][class*="video" i]',
];

const SKIP_BUTTON_SELECTORS = [
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button-slot button',
  '.ytp-ad-skip-button',
  '.ytp-skip-ad-button',
  'button.ytp-ad-skip-button-modern',
  // Generic player frameworks.
  '[class*="skip-ad" i]',
  '[class*="skipAd" i]',
  '[class*="ad-skip" i] button',
  '[aria-label*="Skip ad" i]',
  '[aria-label*="Skip ads" i]',
  '[aria-label*="Skip advertisement" i]',
  '[title*="Skip ad" i]',
  '[data-testid*="skip" i]',
];

/** Text matches, only accepted when inside something that looks like a player. */
const SKIP_TEXT = /^\s*(skip\s*(ad|ads|advertisement)?|skip ad now)\s*$/i;

export interface AdSkipResult {
  skipped: boolean;
  /** Which selector matched, for the run log. */
  matched?: string;
}

/**
 * Reveals player controls and clicks a skip button if one is showing.
 *
 * Safe to call on any page: it hovers the player only when a player exists, and
 * returns `skipped: false` when there is nothing to do.
 */
export async function trySkipAd(
  page: Page,
  humanizer?: Humanizer,
  options?: { timeoutMs?: number },
): Promise<AdSkipResult> {
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return { skipped: false };
  if (typeof page.locator !== 'function') return { skipped: false };

  const timeout = options?.timeoutMs ?? 400;

  // 1. Hover the player so its control bar is actually rendered and visible.
  const playerBox = await firstVisibleBox(page, PLAYER_SELECTORS, 250);
  if (playerBox && typeof page.mouse?.move === 'function') {
    await page.mouse
      .move(playerBox.x + playerBox.width / 2, playerBox.y + playerBox.height - 24)
      .catch(() => {});
    await sleep(350);
  }

  // 2. High-confidence, player-specific selectors first.
  for (const selector of SKIP_BUTTON_SELECTORS) {
    const clicked = await clickIfVisible(page, selector, humanizer, timeout);
    if (clicked) return { skipped: true, matched: selector };
  }

  // 3. Text match, but only on a button that lives inside a player container.
  try {
    const textSelector = playerBox
      ? PLAYER_SELECTORS.slice(0, 6)
          .map((p) => `${p} button`)
          .concat(PLAYER_SELECTORS.slice(0, 6).map((p) => `${p} [role="button"]`))
          .join(', ')
      : '';

    if (textSelector) {
      const found = await page.evaluate(
        ([selector, source]) => {
          const regex = new RegExp(source, 'i');
          const nodes = Array.from(document.querySelectorAll(selector));
          for (const node of nodes) {
            if (!node.getClientRects || node.getClientRects().length === 0) continue;
            const text = (node.textContent || '').trim();
            if (regex.test(text)) return true;
          }
          return false;
        },
        [textSelector, SKIP_TEXT.source] as const,
      );
      if (found) {
        // Re-locate through Playwright so the click is humanized rather than a
        // synthetic DOM dispatch.
        const buttons = page.locator(textSelector);
        const count = await buttons.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          const candidate = buttons.nth(i);
          const text = ((await candidate.textContent().catch(() => '')) ?? '').trim();
          if (!SKIP_TEXT.test(text)) continue;
          if (await humanizerClick(page, candidate, humanizer)) {
            return { skipped: true, matched: `text:${text}` };
          }
        }
      }
    }
  } catch {
    // Best effort.
  }

  return { skipped: false };
}

async function firstVisibleBox(
  page: Page,
  selectors: string[],
  timeout: number,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  for (const selector of selectors) {
    try {
      const box = await page
        .locator(selector)
        .first()
        .boundingBox({ timeout })
        .catch(() => null);
      if (box && box.width > 0 && box.height > 0) return box;
    } catch {
      // Try the next selector.
    }
  }
  return null;
}

async function clickIfVisible(
  page: Page,
  selector: string,
  humanizer: Humanizer | undefined,
  timeout: number,
): Promise<boolean> {
  try {
    const locator = page.locator(selector).first();
    if (!(await locator.isVisible({ timeout }).catch(() => false))) return false;
    return await humanizerClick(page, locator, humanizer);
  } catch {
    return false;
  }
}

async function humanizerClick(
  page: Page,
  locator: ClickTarget,
  humanizer: Humanizer | undefined,
): Promise<boolean> {
  // bounding box + raw mouse, never `locator.click()`: see mouseClick.ts.
  return clickTargetLikeAPerson(page, locator, humanizer, { timeoutMs: 1200 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
