import type { Page } from 'playwright-core';

import { trySkipAd } from '../../crosshair/AdSkipper';
import { ConsentEngine } from '../../crosshair/ConsentEngine';
import type { Humanizer } from '../../crosshair/Humanizer';
import { detectCaptcha, type CaptchaInfo } from '../captchaDetector';

/**
 * Everything that has to keep happening while the engine is occupied with
 * something else.
 *
 * An LLM step can spend minutes on one goal, and a "watch for 30 seconds"
 * instruction is a single action that holds the page for half a minute. In that
 * window a cookie banner can appear, a pre-roll can start, and a challenge can
 * be served. If the only checks happen between workflow steps, none of it is
 * ever seen - which is precisely how a real run sat through an unskippable ad
 * and then died without ever being told.
 */
export interface PageMaintenanceOptions {
  humanizer?: Humanizer | undefined;
  /** Skip the ad check when the page has no player anyway. */
  checkAds?: boolean;
  /** Skip the challenge check when the caller will handle it. */
  checkCaptcha?: boolean;
  consentTimeoutMs?: number;
}

export interface PageMaintenanceResult {
  consentHandled: boolean;
  adSkipped: boolean;
  captcha: CaptchaInfo | null;
}

export async function maintainPage(
  page: Page,
  options: PageMaintenanceOptions = {},
): Promise<PageMaintenanceResult> {
  const result: PageMaintenanceResult = { consentHandled: false, adSkipped: false, captcha: null };
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return result;

  // Consent first: a banner covering the player would also cover the skip
  // button, and a banner over a challenge can hide it.
  result.consentHandled = await ConsentEngine.checkAndHandle(page, {
    timeoutMs: options.consentTimeoutMs ?? 700,
    humanizer: options.humanizer,
  }).catch(() => false);

  if (options.checkAds !== false) {
    const ad = await trySkipAd(page, options.humanizer).catch(() => ({ skipped: false }));
    result.adSkipped = ad.skipped;
  }

  if (options.checkCaptcha !== false) {
    result.captcha = await detectCaptcha(page).catch(() => null);
  }

  return result;
}

/** Longest a single uninterrupted pause is allowed to be. */
const MAX_SLICE_MS = 2500;

/**
 * Waits for a total duration while keeping the page alive.
 *
 * A long wait is sliced, and each slice re-runs page maintenance, so consent
 * banners, ads and challenges are handled *during* the wait instead of after
 * it. `onChallenge` lets the caller take over when a challenge shows up: that
 * is the point at which a human may need to get involved.
 */
export async function waitWhileMaintaining(
  page: Page,
  totalMs: number,
  options: PageMaintenanceOptions & { onChallenge?: (info: CaptchaInfo) => Promise<void> | void } = {},
): Promise<{ elapsedMs: number; challenges: CaptchaInfo[]; adSkipped: boolean }> {
  const target = Math.max(0, Math.min(totalMs, 300_000));
  const slice = Math.max(250, Math.min(MAX_SLICE_MS, target || MAX_SLICE_MS));
  const challenges: CaptchaInfo[] = [];
  let adSkipped = false;
  let elapsed = 0;

  while (elapsed < target) {
    const step = Math.min(slice, target - elapsed);
    await sleep(step);
    elapsed += step;

    // A closed page ends the wait; the caller re-resolves and decides.
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) break;

    const maintenance = await maintainPage(page, options).catch(() => null);
    if (!maintenance) continue;

    if (maintenance.adSkipped) adSkipped = true;

    if (maintenance.captcha) {
      challenges.push(maintenance.captcha);
      if (options.onChallenge) {
        await options.onChallenge(maintenance.captcha);
      }
      // A challenge usually replaces or blocks the page; the caller decides
      // whether to keep waiting.
      if (challenges.length > 0) break;
    }
  }

  return { elapsedMs: elapsed, challenges, adSkipped };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
