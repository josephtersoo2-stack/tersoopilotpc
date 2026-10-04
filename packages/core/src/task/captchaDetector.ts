import type { Frame, Page } from 'playwright-core';

export interface CaptchaInfo {
  type: 'recaptcha' | 'hcaptcha' | 'turnstile' | 'geetest' | 'funcaptcha' | 'generic';
  selector: string;
  /** The frame the challenge was found in, for logging. */
  frameUrl?: string;
}

/**
 * Challenge markers, checked against the main frame and then every subframe.
 *
 * The iframe entries cover the vendors that host a challenge cross-origin; the
 * container entries cover the ones that render inline. Both are needed, because
 * a challenge is only solvable if it is actually visible, and a hidden
 * pre-flight iframe is present on a great many pages that never challenge.
 */
const SELECTORS: Array<[CaptchaInfo['type'], string]> = [
  ['recaptcha', 'iframe[src*="recaptcha" i][title*="challenge" i]'],
  ['recaptcha', 'iframe[src*="recaptcha" i]:not([title*="challenge" i])'],
  ['recaptcha', 'div.g-recaptcha:not([data-size="invisible"])'],
  ['recaptcha', 'div.grecaptcha-badge'],
  ['hcaptcha', 'iframe[src*="hcaptcha" i]'],
  ['hcaptcha', 'div.h-captcha'],
  ['hcaptcha', '[data-sitekey][class*="h-captcha" i]'],
  ['turnstile', 'iframe[src*="challenges.cloudflare.com" i]'],
  ['turnstile', 'div.cf-turnstile'],
  ['turnstile', 'iframe[title*="cloudflare" i][title*="security" i]'],
  ['geetest', 'iframe[src*="geetest" i]'],
  ['geetest', 'div[class*="geetest" i]'],
  ['funcaptcha', 'iframe[src*="funcaptcha" i]'],
  ['funcaptcha', 'div[id*="arkoselabs" i]'],
  ['generic', 'div#px-captcha'],
  ['generic', 'div[id*="captcha" i][class*="challenge" i]'],
  ['generic', 'div[class*="captcha" i]'],
  ['generic', 'div[id*="captcha" i]'],
  ['generic', 'form[action*="captcha" i]'],
];

/**
 * Looks for a bot challenge anywhere on the page.
 *
 * Every frame is inspected, not just the top document: challenges routinely
 * mount inside a same-origin or sandboxed iframe, and a main-frame-only check
 * misses exactly the cases a run cannot recover from on its own.
 */
export async function detectCaptcha(page: Page): Promise<CaptchaInfo | null> {
  if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return null;

  // Both Page and Frame expose locator(); only Page exposes query(), so the
  // common denominator is used here.
  const frames: Array<Page | Frame> = [];
  try {
    if (typeof page.frames === 'function') frames.push(...page.frames());
  } catch {
    return null;
  }
  if (frames.length === 0) frames.push(page);

  for (const frame of frames) {
    for (const [type, selector] of SELECTORS) {
      try {
        const count = await frame.locator(selector).count();
        if (count > 0) {
          let frameUrl: string | undefined;
          try {
            frameUrl = frame.url();
          } catch {
            // A frame can detach mid-scan; the type and selector are enough.
          }
          return { type, selector, ...(frameUrl ? { frameUrl } : {}) };
        }
      } catch {
        // Ignore evaluation errors on transient frames.
      }
    }
  }

  return null;
}
