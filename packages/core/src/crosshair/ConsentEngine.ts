import type { CDPSession, Page } from 'playwright-core';

import type { Humanizer } from './Humanizer';
import { clickTargetLikeAPerson, type ClickTarget } from './mouseClick';

export interface ConsentEngineOptions {
  timeoutMs?: number | undefined;
  isMobile?: boolean | undefined;
  /**
   * When supplied, accept buttons are clicked with humanized mouse movement
   * instead of a direct DOM dispatch.
   *
   * A banner is something a person clicks, and a synthetic
   * `element.click()` is one of the more recognisable automation behaviours on
   * a page whose whole purpose is to watch for exactly that.
   */
  humanizer?: Humanizer | undefined;
}

/**
 * Universal Consent & Interstitial Engine
 *
 * Automatically detects and accepts cookie consent banners, GDPR notices, and
 * dismisses blocking overlays/newsletters across ANY website (not just Google/YouTube).
 *
 * Supports:
 * - Standard CMP Frameworks: OneTrust, Cookiebot, Quantcast, Didomi, Axeptio, Usercentrics,
 *   TrustArc, Google Funding Choices, Sourcepoint, Civica
 * - Multi-lingual Semantic ARIA Buttons: English, German, French, Spanish, Italian, Portuguese
 * - Intrusive Promo & Newsletter Modal Dismissal
 */
export class ConsentEngine {
  /**
   * Primary selectors for known Consent Management Platforms (CMPs).
   */
  private static readonly CMP_SELECTORS = [
    // OneTrust
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    '.onetrust-close-btn-handler',
    // Cookiebot
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    'a#CybotCookiebotDialogBodyButtonAccept',
    // Quantcast Choice
    '.qc-cmp2-summary-buttons button[mode="primary"]',
    'button.qc-cmp-button[mode="primary"]',
    // Didomi
    '#didomi-notice-agree-button',
    'button#didomi-notice-agree-button',
    // Usercentrics / Axeptio / TrustArc
    'button[data-testid="uc-accept-all-button"]',
    '#axeptio_btn_acceptAll',
    'a.trustarc-agree-btn',
    // Google Funding Choices / YouTube / Google Consent (Desktop & Mobile)
    'button#L2AGLb',
    '.fc-cta-consent',
    'button.fc-cta-consent',
    'button[aria-label*="Accept the use of cookies" i]',
    'button[aria-label*="Accept all" i]',
    'button[aria-label*="Alle akzeptieren" i]',
    'button:has-text("Accept all")',
    'button:has-text("Alle akzeptieren")',
    'yt-button-shape:has-text("Accept all")',
    'yt-button-shape:has-text("Alle akzeptieren")',
    '.ytSpecButtonShapeNextFilled:has-text("Accept all")',
    'ytd-button-renderer:has-text("Accept all")',
    'ytd-button-renderer:has-text("Alle akzeptieren")',
    'ytm-consent-bump-v2-renderer button',
    'form[action*="consent"] button',
  ];

  /**
   * Regular expressions for semantic button matching across languages.
   */
  private static readonly ACCEPT_PATTERNS = [
    // English
    /^accept\s+(all\s+)?(cookies)?$/i,
    /^(allow|agree\s+to)\s+(all\s+)?(cookies)?$/i,
    /^(i\s+)?(agree|accept|understand)$/i,
    /^accept the use of cookies/i,
    /^got\s+it$/i,
    /^continue$/i,
    /^ok$/i,
    // German
    /^alle\s+(cookies\s+)?akzeptieren$/i,
    /^(cookies\s+)?akzeptieren$/i,
    /^zustimmen$/i,
    /^einverstanden$/i,
    // French
    /^tout\s+accepter$/i,
    /^j'accepte$/i,
    /^accepter\s+(et\s+fermer)?$/i,
    /^autoriser$/i,
    // Spanish / Portuguese / Italian
    /^aceptar\s+(todo|todas)?$/i,
    /^aceitar\s+(tudo|todos)?$/i,
    /^accetta\s+(tutti)?$/i,
  ];

  /**
   * Selectors to identify promo / newsletter close buttons.
   */
  private static readonly CLOSE_OVERLAY_SELECTORS = [
    'button[aria-label*="close" i]',
    'button[aria-label*="dismiss" i]',
    'button[aria-label*="schließen" i]',
    'button[aria-label*="fermer" i]',
    'button[title*="close" i]',
    'button.close',
    'button.modal-close',
    'button.popup-close',
    '[data-action="close"]',
    '.overlay-close',
    '#dismiss-button',
  ];

  /**
   * Elements considered for a semantic "accept" match.
   *
   * Kept in one place so the page-side probe and the Playwright-side click
   * address the same elements in the same order: the probe returns an index
   * into this list, and that index is used to locate the real element.
   */
  private static readonly SEMANTIC_SELECTOR =
    'button, [role="button"], a.btn, yt-button-shape, input[type="button"], input[type="submit"]';

  /**
   * Inspects the page and handles any active cookie banner or blocking interstitial.
   * Returns true if a banner/modal was handled, false otherwise.
   */
  static async checkAndHandle(
    page: Page,
    options?: ConsentEngineOptions,
  ): Promise<boolean> {
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return false;
    const timeout = options?.timeoutMs ?? 500;
    const humanizer = options?.humanizer;

    // 1. Check known CMP framework buttons across top page and all frames (highest fidelity & speed)
    const mainFrame = typeof page.mainFrame === 'function' ? page.mainFrame() : page;
    const subframes = typeof page.frames === 'function' ? page.frames().filter(f => f !== mainFrame) : [];
    const frames = [mainFrame, ...subframes];

    for (const frame of frames) {
      for (const selector of this.CMP_SELECTORS) {
        try {
          const btn = frame.locator(selector).first();
          if (await btn.isVisible({ timeout: 80 }).catch(() => false)) {
            if (await this.clickLikeAPerson(page, btn, humanizer, 800)) {
              await new Promise((r) => setTimeout(r, 250));
              return true;
            }
          }
        } catch {}
      }
    }

    // 2. Generic semantic search inside modals or cookie banners.
    //    The page-side probe only *finds* the element; the click is dispatched
    //    through the mouse, so it is humanized and actually lands.
    for (const frame of frames) {
      try {
        const match = await frame.evaluate(
          buildSemanticProbe(this.SEMANTIC_SELECTOR, this.ACCEPT_PATTERNS),
        );

        if (typeof match === 'number' && match >= 0) {
          const target = frame.locator(this.SEMANTIC_SELECTOR).nth(match);
          if (await this.clickLikeAPerson(page, target, humanizer, 1500)) {
            await new Promise((r) => setTimeout(r, 300));
            return true;
          }
        }
      } catch {}
    }

    // 3. Check for blocking newsletter / promo dismiss button if modal is open
    for (const selector of this.CLOSE_OVERLAY_SELECTORS) {
      try {
        const closeBtn = page.locator(selector).first();
        if (await closeBtn.isVisible({ timeout: 60 }).catch(() => false)) {
          // Check if parent looks like a dialog or popup
          const isModal = await closeBtn.evaluate((el) => {
            const modalAncestor = el.closest('[role="dialog"], [role="alertdialog"], .modal, .popup, [aria-modal="true"]');
            return Boolean(modalAncestor);
          }).catch(() => false);

          if (isModal) {
            if (await this.clickLikeAPerson(page, closeBtn, humanizer, 800)) {
              await new Promise((r) => setTimeout(r, 200));
              return true;
            }
          }
        }
      } catch {}
    }

    return false;
  }

  /**
   * Clicks a located element the way a person would.
   *
   * Never `locator.click()`: see `clickTargetLikeAPerson` for why.
   */
  private static async clickLikeAPerson(
    page: Page,
    target: ClickTarget,
    humanizer: Humanizer | undefined,
    timeout: number,
  ): Promise<boolean> {
    return clickTargetLikeAPerson(page, target, humanizer, { timeoutMs: timeout });
  }
}

/**
 * Builds the page-side probe that finds a consent button by its text.
 *
 * This is a string, not a function, for the same reason the page tree walk is:
 * a bundler rewrites a named function passed to `evaluate` into a call to a
 * `__name` helper that does not exist inside the page. Written as a function,
 * this probe threw `ReferenceError: __name is not defined` on every build and
 * the semantic fallback silently never ran - so a banner whose only accept
 * control was labelled in text was never accepted.
 */
export function buildSemanticProbe(
  selector: string,
  patterns: ReadonlyArray<{ source: string; flags: string }>,
): string {
  return `(() => {
  var SEL = ${JSON.stringify(selector)};
  var PATTERNS = ${JSON.stringify(patterns)};
  var nodes = Array.prototype.slice.call(document.querySelectorAll(SEL));
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (!el.getClientRects || el.getClientRects().length === 0) continue;
    if (el.closest('[aria-hidden="true"],[hidden]')) continue;
    var inner = ((el.innerText || el.textContent) || '').trim();
    var aria = (el.getAttribute('aria-label') || '').trim();
    for (var p = 0; p < PATTERNS.length; p++) {
      var re = new RegExp(PATTERNS[p].source, PATTERNS[p].flags);
      if ((inner && re.test(inner)) || (aria && re.test(aria))) return i;
    }
  }
  return -1;
})()`;
}
