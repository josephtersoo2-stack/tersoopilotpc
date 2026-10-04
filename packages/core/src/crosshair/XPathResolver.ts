import type { ElementHandle, Locator, Page } from 'playwright-core';

import { CrosshairError } from '../util/errors';

import type { AnchorRegistry } from './AnchorRegistry';
import { ConsentEngine } from './ConsentEngine';
import { ShadowDom } from './ShadowDom';
import { buildPickOrganicScript } from './serpResults';

export type ResolutionStrategy =
  | 'xpath_native'
  | 'css_native'
  | 'shadow_dom'
  | 'anchor_registry'
  | 'accessibility_role';

export interface XPathResolverResult {
  locator?: Locator;
  element?: ElementHandle<Element>;
  strategy: ResolutionStrategy;
  resolvedSelector: string;
  attempts: number;
  durationMs: number;
}

export interface XPathResolverOptions {
  taskId?: string;
  profileId?: string | null;
  stepIndex?: number;
  semanticSignature?: string | null;
  role?: string;
  name?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  saveAnchor?: boolean;
  scrollUntilFound?: boolean;
}

export class XPathResolver {
  constructor(private readonly anchorRegistry?: AnchorRegistry) {}

  /**
   * Resolves a target element in the Page through a prioritized fallback chain:
   * 0. Video / Dynamic Title matching (Method A)
   * 1. Playwright native XPath locator
   * 2. Playwright native CSS locator
   * 3. Deep Shadow DOM piercing (traversing open and component shadow roots)
   * 4. AnchorRegistry recall (cached historical selectors with confidence reinforcement)
   * 5. Accessibility Role + Name locator
   *
   * Automatically scrolls down dynamically on search and infinite-scroll pages
   * (such as YouTube search results) when an element is lazy-loaded.
   */
  async resolve(
    page: Page,
    selector: string,
    options?: XPathResolverOptions,
  ): Promise<XPathResolverResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? 15000;

    const isInfiniteFeed =
      selector.startsWith('video:') ||
      selector.startsWith('title:') ||
      selector.includes('ytd-video-renderer') ||
      selector.includes('ytm-video') ||
      selector.includes('rich-item') ||
      selector.includes('video-title');

    const shouldScroll = isInfiniteFeed || Boolean(options?.scrollUntilFound);
    const attemptIntervalMs = isInfiniteFeed ? 1200 : 750;
    const maxAttempts =
      options?.maxAttempts ??
      Math.max(3, Math.min(30, Math.floor(timeoutMs / attemptIntervalMs)));
    const attemptTimeoutMs = Math.max(
      600,
      Math.min(1500, Math.floor(timeoutMs / Math.min(maxAttempts, 6))),
    );

    let lastError: Error | null = null;
    let didScrollDown = false;

    // Dismiss common cookie/login popups on navigation
    await this.dismissPopupsIfPresent(page);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.executeFallbackChain(
          page,
          selector,
          attemptTimeoutMs,
          options,
        );

        if (result) {
          // If anchorRegistry is configured and saveAnchor is not false, remember resolved selector
          if (
            this.anchorRegistry &&
            options?.taskId &&
            options.saveAnchor !== false &&
            result.strategy !== 'anchor_registry'
          ) {
            const selectorType =
              result.strategy === 'xpath_native'
                ? 'xpath'
                : result.strategy === 'accessibility_role'
                  ? 'role'
                  : 'css';

            void this.anchorRegistry
              .remember({
                taskId: options.taskId,
                profileId: options.profileId ?? null,
                stepIndex: options.stepIndex ?? 0,
                selectorHint: selector,
                semanticSignature: options.semanticSignature ?? null,
                selector: result.resolvedSelector,
                type: selectorType,
                confidence: 1.0,
              })
              .catch(() => {});
          }

          return {
            ...result,
            attempts: attempt,
            durationMs: Date.now() - startTime,
          };
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < maxAttempts) {
        // Scrolling strategy:
        // Attempts 1 & 2: Viewport-first! Never scroll on the first 2 attempts so top results (e.g. search links)
        // are not pushed off-screen while the page is rendering.
        const canScrollNow = isInfiniteFeed ? attempt >= 3 : attempt >= 4;

        // If we have scrolled down multiple times and are nearing maxAttempts, scroll back to top to re-check
        const penUltThreshold = Math.max(4, Math.floor(maxAttempts * 0.75));
        if (didScrollDown && attempt === penUltThreshold) {
          await this.scrollToTop(page);
          await new Promise((resolve) => setTimeout(resolve, 400));
        } else if (shouldScroll && canScrollNow) {
          didScrollDown = true;
          const scrollDistance = isInfiniteFeed
            ? 500 + Math.floor(Math.random() * 150)
            : 300 + Math.floor(Math.random() * 100);
          await this.scrollPageDown(page, scrollDistance);
          await new Promise((resolve) =>
            setTimeout(resolve, 500 + Math.floor(Math.random() * 200)),
          );
        } else {
          const delayMs =
            (options?.retryBackoffMs ?? 300) * Math.pow(1.2, attempt - 1);
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(delayMs, 1000)),
          );
        }
      }
    }

    throw new CrosshairError(
      'STEP_SELECTOR_MISSING',
      `Failed to resolve selector '${selector}' after ${maxAttempts} attempts (${Date.now() - startTime}ms): ${lastError?.message ?? 'No element matched resolution chain'}`,
      {
        selector,
        attempts: maxAttempts,
        durationMs: Date.now() - startTime,
      },
    );
  }

  private async scrollPageDown(page: Page, distance = 600): Promise<void> {
    try {
      if (page.mouse?.wheel) {
        const ticks = 3;
        const perTick = Math.round(distance / ticks);
        for (let i = 0; i < ticks; i++) {
          await page.mouse.wheel(0, perTick).catch(() => {});
          await new Promise((r) => setTimeout(r, 20));
        }
      } else {
        await page
          .evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), distance)
          .catch(() => {});
      }
    } catch {
      await page.evaluate((d) => window.scrollBy(0, d), distance).catch(() => {});
    }
  }

  private async scrollToTop(page: Page): Promise<void> {
    try {
      await page
        .evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 350));
    } catch {}
  }

  private async findFirstVisibleLocator(
    page: Page,
    selectors: string[],
    timeoutMs = 400,
  ): Promise<{ locator: Locator; resolvedSelector: string } | null> {
    for (const s of selectors) {
      try {
        const locators = page.locator(s);
        if (typeof (locators as any).count === 'function' && typeof (locators as any).nth === 'function') {
          const count = await locators.count().catch(() => 0);
          for (let idx = 0; idx < count; idx++) {
            const candidate = locators.nth(idx);
            if (await candidate.isVisible().catch(() => false)) {
              return { locator: candidate, resolvedSelector: `${s} >> nth=${idx}` };
            }
          }
        }
        const first = typeof (locators as any).first === 'function' ? locators.first() : locators;
        if (await first.isVisible({ timeout: Math.min(timeoutMs, 400) }).catch(() => false)) {
          return { locator: first, resolvedSelector: s };
        }
      } catch {}
    }
    return null;
  }

  private async classifyVideoCandidate(
    candidate: Locator,
  ): Promise<'LIVE' | 'SHORT' | 'STANDARD_VOD'> {
    if (typeof (candidate as any).evaluate !== 'function') {
      return 'STANDARD_VOD';
    }
    return candidate
      .evaluate((el: Element) => {
        const card =
          el.closest(
            'ytd-video-renderer, ytd-rich-item-renderer, ytm-video-with-context-renderer, ytd-grid-video-renderer, ytm-compact-video-renderer, ytd-reel-item-renderer, [role="article"]',
          ) || el;

        // 1. Check for Shorts
        const href = (
          el.getAttribute('href') ||
          card.querySelector('a')?.getAttribute('href') ||
          ''
        ).toLowerCase();
        if (href.includes('/shorts/')) return 'SHORT';
        if (
          card.tagName.toLowerCase().includes('reel') ||
          Boolean(
            card.closest(
              'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, [class*="reel-shelf"], [class*="shorts-shelf"]',
            ),
          )
        ) {
          return 'SHORT';
        }

        // 2. Check for Live Stream
        // A. Overlay style or badge classes
        if (
          card.querySelector(
            '[overlay-style="LIVE"], .badge-style-type-live-now, .badge-shape-wiz--thumbnail-live',
          )
        ) {
          return 'LIVE';
        }

        // B. Search/Card badges
        const badges = Array.from(
          card.querySelectorAll(
            '[class*="badge"], ytd-badge-supported-renderer, ytd-thumbnail-overlay-time-status-renderer, [aria-label*="live" i]',
          ),
        );
        for (const b of badges) {
          const text = (b.textContent || '').trim().toUpperCase();
          const aria = (b.getAttribute('aria-label') || '').toUpperCase();
          if (
            text === 'LIVE' ||
            text.includes('LIVE NOW') ||
            aria.includes('LIVE') ||
            aria.includes('STREAMING NOW')
          ) {
            return 'LIVE';
          }
        }

        // C. Title or card aria-label
        const titleAria = (
          el.getAttribute('aria-label') ||
          card.getAttribute('aria-label') ||
          ''
        ).toUpperCase();
        if (
          titleAria.includes('LIVE STREAM') ||
          titleAria.includes('STREAMING LIVE') ||
          titleAria.includes('PREMIERE')
        ) {
          return 'LIVE';
        }

        // D. Thumbnail duration overlay showing "LIVE"
        const timeStatus = card.querySelector(
          'ytd-thumbnail-overlay-time-status-renderer, [class*="time-status"]',
        );
        if (
          timeStatus &&
          (timeStatus.textContent || '').trim().toUpperCase().includes('LIVE')
        ) {
          return 'LIVE';
        }

        return 'STANDARD_VOD';
      })
      .catch(() => 'STANDARD_VOD');
  }

  private async dismissPopupsIfPresent(page: Page): Promise<void> {
    try {
      await ConsentEngine.checkAndHandle(page, { timeoutMs: 150 });
    } catch {}
  }

  private async resolveLinkByTermViaEval(
    page: Page,
    term: string,
  ): Promise<Omit<XPathResolverResult, 'attempts' | 'durationMs'> | null> {
    try {
      const lower = term.toLowerCase().trim();
      const resolvedAttr = `data-tersoo-res`;
      const resolvedVal = `res-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      const found = await page.evaluate(
        ({ lower, resolvedAttr, resolvedVal }) => {
          const isAd = (el: Element): boolean => {
            return Boolean(
              el.closest('[data-text-ad]') ||
              el.closest('[aria-label*="sponsored" i]') ||
              el.closest('[aria-label*="advertisement" i]') ||
              el.closest('#tads') ||
              el.closest('.ads-ad'),
            );
          };

          const isVisible = (el: HTMLElement): boolean => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const style = window.getComputedStyle(el);
            return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
          };

          const anchors = Array.from(document.querySelectorAll('a'));

          // 1. Decoded href or data-href match (handles redirect tracking e.g. Google /url?q=)
          for (const a of anchors) {
            if (isAd(a) || !isVisible(a)) continue;
            let decodedHref = '';
            try {
              decodedHref = decodeURIComponent(a.href || a.getAttribute('href') || '');
            } catch {
              decodedHref = (a.href || a.getAttribute('href') || '').toLowerCase();
            }
            const dataHref = (a.getAttribute('data-href') || '').toLowerCase();

            if (decodedHref.toLowerCase().includes(lower) || dataHref.includes(lower)) {
              a.setAttribute(resolvedAttr, resolvedVal);
              return true;
            }
          }

          // 2. Visible text / headline match
          for (const a of anchors) {
            if (isAd(a) || !isVisible(a)) continue;
            const text = (a.innerText || a.textContent || '').toLowerCase().trim();
            if (text.includes(lower)) {
              a.setAttribute(resolvedAttr, resolvedVal);
              return true;
            }
          }

          return false;
        },
        { lower, resolvedAttr, resolvedVal },
      );

      if (found) {
        const query = `a[${resolvedAttr}="${resolvedVal}"]`;
        const locator = page.locator(query).first();
        return {
          locator,
          strategy: 'css_native',
          resolvedSelector: query,
        };
      }
    } catch {}
    return null;
  }

  private async resolveTopResultViaEval(
    page: Page,
  ): Promise<Omit<XPathResolverResult, 'attempts' | 'durationMs'> | null> {
    return this.resolveOrganicResultViaEval(page, 0);
  }

  private async resolveOrganicResultViaEval(
    page: Page,
    targetIndex = 0,
  ): Promise<Omit<XPathResolverResult, 'attempts' | 'durationMs'> | null> {
    try {
      const resolvedAttr = `data-tersoo-res`;
      const resolvedVal = `res-${Date.now()}-${targetIndex}-${Math.floor(Math.random() * 10000)}`;

      // The whole walk is a string, not a callback function. A named function
      // passed to page.evaluate is rewritten by esbuild's keepNames (which tsx
      // and vitest enable) into a call to a `__name` helper that does not exist
      // inside the page, so the callback throws and the path silently no-ops.
      // See crosshair/serpResults.ts for the shared result definition.
      const found = await page.evaluate(buildPickOrganicScript(targetIndex, resolvedAttr, resolvedVal));

      if (found) {
        const query = `a[${resolvedAttr}="${resolvedVal}"]`;
        const locator = page.locator(query).first();
        return {
          locator,
          strategy: 'css_native',
          resolvedSelector: query,
        };
      }
    } catch (err) {
      // A page that cannot be walked (CSP, detached context) must not take the
      // whole resolution down; the caller falls through to the CSS candidates.
      if (process.env.TERSOO_DEBUG_RESOLVER) {
        console.warn('[XPathResolver] organic result evaluation failed:', err);
      }
    }
    return null;
  }
  /**
   * The resolution chain itself, separated from `resolve` so the retry loop,
   * scrolling and anchor-recall can wrap around it.
   *
   * Returns a partial result: `attempts` and `durationMs` are stamped on by the
   * caller, which knows how many tries it took.
   */
  private async executeFallbackChain(
    page: Page,
    selector: string,
    timeoutMs: number,
    options?: XPathResolverOptions,
  ): Promise<Omit<XPathResolverResult, 'attempts' | 'durationMs'> | null> {
    // "intent:search_input" -> "search_input"; empty for ordinary selectors.
        // intentQuery keeps the caller's casing because a semantic intent like
    // intent:button("Subscribe") carries the accessible name to look for, and
    // lowercasing it would change what is searched for. intentKey is the
    // lowercased form used for matching the intent name itself.
    const intentQuery = selector.startsWith('intent:') ? selector.slice('intent:'.length) : '';
    const intentKey = intentQuery.toLowerCase();

    try {
      // 1. Search input / search box.
      //    Generic, with no hardcoded domains, so it works on any site that has
      //    a search field.
      if (
        intentKey === 'search_input' ||
        intentKey === 'search' ||
        intentKey === 'searchbox'
      ) {
        const searchInputSelectors = [
          'textarea[name="q"]',
          'input[type="search"]',
          'input[name="q"]',
          'input[name="query"]',
          'input[id="search"]',
          'input[placeholder*="search" i]',
          'input[aria-label*="search" i]',
          'input[placeholder*="Search" i]',
          'textarea[aria-label*="search" i]',
          '[role="searchbox"]',
          '[role="search"] input',
          '[role="search"] textarea',
          'form[role="search"] input',
        ];

        const found = await this.findFirstVisibleLocator(page, searchInputSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 2. Search submit button.
      if (intentKey === 'search_button' || intentKey === 'search_submit') {
        const submitSelectors = [
          'button.ytSearchboxComponentSearchButton',
          'button[title="Search"]',
          'button[aria-label="Search"]',
          'button#search-icon-legacy',
          'button[type="submit"]',
          '[role="search"] button',
          'button[aria-label*="search" i]',
          'button:has-text("Search")',
        ];
        const found = await this.findFirstVisibleLocator(page, submitSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 3. Main article / headline on news, blog, or catalog
      if (intentQuery.startsWith('article') || intentQuery.startsWith('headline')) {
        const argMatch = intentQuery.match(/\(["']?(.*?)["']?\)/);
        const term = argMatch ? argMatch[1]?.trim() : '';

        const articleSelectors = term
          ? [
              `article:has-text("${term}") a`,
              `[role="article"]:has-text("${term}") a`,
              `h1:has-text("${term}") a, h2:has-text("${term}") a, h3:has-text("${term}") a`,
              `a:has-text("${term}")`,
            ]
          : [
              'article h2 a, article h3 a, article a',
              '[role="article"] a',
              'main h1 a, main h2 a, main h3 a',
              '.post-title a, .entry-title a, .article-title a',
            ];

        for (const s of articleSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 600) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 4. Media / Video player on any site
      if (intentKey === 'media' || intentKey === 'video' || intentKey === 'player') {
        const mediaSelectors = [
          '#movie_player',
          '.html5-video-player',
          'video',
          '[role="region"][aria-label*="video" i]',
          'iframe[src*="youtube"]',
          'iframe[src*="vimeo"]',
        ];
        for (const s of mediaSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 500) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 5. Semantic Button by label: intent:button("Subscribe")
      if (intentQuery.startsWith('button(')) {
        const name = intentQuery.replace(/^button\(['"]?(.*?)['"]?\)$/i, '$1').trim();
        try {
          if (typeof page.getByRole === 'function') {
            const loc = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
            if (await loc.isVisible({ timeout: timeoutMs }).catch(() => false)) {
              return { locator: loc, strategy: 'accessibility_role', resolvedSelector: `role:button[name="${name}"]` };
            }
          }
        } catch {}
        try {
          const loc = page.locator(`button:has-text("${name}"), [role="button"]:has-text("${name}")`).first();
          if (await loc.isVisible({ timeout: timeoutMs }).catch(() => false)) {
            return { locator: loc, strategy: 'css_native', resolvedSelector: `button:has-text("${name}")` };
          }
        } catch {}
      }

      // 6. Semantic Link by label: intent:link("Read more")
      if (intentQuery.startsWith('link(')) {
        const name = intentQuery.replace(/^link\(['"]?(.*?)['"]?\)$/i, '$1').trim();
        try {
          if (typeof page.getByRole === 'function') {
            const loc = page.getByRole('link', { name: new RegExp(name, 'i') }).first();
            if (await loc.isVisible({ timeout: timeoutMs }).catch(() => false)) {
              return { locator: loc, strategy: 'accessibility_role', resolvedSelector: `role:link[name="${name}"]` };
            }
          }
        } catch {}
        try {
          const loc = page
            .locator(`a:has-text("${name}"), a:has(h3:has-text("${name}")), a[href*="${name.toLowerCase()}"]`)
            .first();
          if (await loc.isVisible({ timeout: timeoutMs }).catch(() => false)) {
            return { locator: loc, strategy: 'css_native', resolvedSelector: `a:has-text("${name}")` };
          }
        } catch {}
        const evalResult = await this.resolveLinkByTermViaEval(page, name);
        if (evalResult) {
          return evalResult;
        }
      }

      // 7. Top / Indexed organic search result on any search engine (Google, Bing, DuckDuckGo, etc.)
      const isTopResultAlias =
        intentKey === 'top_result' ||
        intentKey === 'first_result' ||
        intentKey === 'search_result' ||
        intentKey === 'top_link';

      const indexedMatch = intentQuery.match(/^(?:search_result|organic_result|top_result|result)(?::|\()(\d+)\)?$/i);

      if (isTopResultAlias || indexedMatch) {
        const targetIndex = indexedMatch && indexedMatch[1] ? parseInt(indexedMatch[1], 10) : 0;

        // Try the smart organic result evaluator FIRST because it enforces distinct root domains,
        // filters out "People also ask" accordions, and handles search engine result cards accurately.
        const evalResult = await this.resolveOrganicResultViaEval(page, targetIndex);
        if (evalResult) {
          return evalResult;
        }

        const topResultCandidates = [
          // Google desktop organic results
          'div.g:not([data-text-ad]) a[jsname="UWckNb"]',
          'div.g:not([data-text-ad]) .yuRUbf > a',
          'div.g:not([data-text-ad]) a:has(h3)',
          'div.tF2Cxc a:has(h3)',
          // Google mobile organic results
          'div.xpd:not([data-text-ad]) a:has(h3)',
          'div.cz3e8c a[data-ved]:has(h3)',
          'div.KDCVte a[data-ved]',
          'div.xpd a[data-ved]',
          // DuckDuckGo
          '[data-testid="result-title-a"]',
          'article h2 a',
          // Bing
          'li.b_algo h2 a',
          'li.b_algo a:has(h2)',
          // Universal fallback: headline links inside main content
          'main a:has(h3), [role="main"] a:has(h3), main h2 a, [role="main"] h2 a',
          'a:has(h3)',
        ];

        for (const s of topResultCandidates) {
          try {
            const locators = page.locator(s);
            const count = await locators.count().catch(() => 0);
            if (count > targetIndex) {
              const candidate = locators.nth(targetIndex);
              if (await candidate.isVisible({ timeout: Math.min(timeoutMs, 600) }).catch(() => false)) {
                return { locator: candidate, strategy: 'css_native', resolvedSelector: `${s} >> nth=${targetIndex}` };
              }
            } else if (targetIndex === 0 && count > 0) {
              const first = locators.first();
              if (await first.isVisible({ timeout: Math.min(timeoutMs, 600) }).catch(() => false)) {
                return { locator: first, strategy: 'css_native', resolvedSelector: s };
              }
            }
          } catch {}
        }
      }

      // 8. Search result matching query term: intent:search_result("youtube") or intent:search_result(youtube)
      if (intentQuery.startsWith('search_result(')) {
        const match = intentQuery.match(/^search_result\(['"]?(.*?)['"]?\)$/i);
        const term = match ? match[1]?.trim() : '';
        if (term) {
          const searchResultCandidates = [
            `a:has(h3:has-text("${term}"))`,
            `a:has-text("${term}"):has(h3)`,
            `div.g:has-text("${term}") a`,
            `li.b_algo:has-text("${term}") a`,
            `[data-testid="result-title-a"]:has-text("${term}")`,
            `a[href*="${term.toLowerCase()}"]`,
            `a:has-text("${term}")`,
          ];
          for (const s of searchResultCandidates) {
            try {
              const loc = page.locator(s).first();
              if (await loc.isVisible({ timeout: Math.min(timeoutMs, 600) }).catch(() => false)) {
                return { locator: loc, strategy: 'css_native', resolvedSelector: s };
              }
            } catch {}
          }

          const evalResult = await this.resolveLinkByTermViaEval(page, term);
          if (evalResult) {
            return evalResult;
          }
        }
      }

      // 9. Video Ad Skip (YouTube, Twitch, Dailymotion, generic video players)
      if (intentKey === 'skip_ad' || intentKey === 'ad_skip' || intentKey === 'skip') {
        const skipSelectors = [
          '.ytp-skip-ad-button',
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          'button.ytp-ad-skip-button-text',
          'button[id^="skip-button"]',
          'div.ytp-ad-text:has-text("Skip")',
          'button:has-text("Skip Ad")',
          'button:has-text("Skip Ads")',
          'button:has-text("Skip")',
          '.ytp-ad-overlay-close-button',
          'button.ytp-ad-overlay-close-button',
          '[aria-label*="close ad" i]',
          '[aria-label*="skip ad" i]',
          'div[class*="ad-skip" i] button',
          '.videoAdUiSkipButton',
        ];
        for (const s of skipSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 400) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 10. Like / Thumbs Up (YouTube, TikTok, Twitter/X, Reddit, etc.)
      if (intentKey === 'like' || intentKey === 'thumbs_up') {
        const likeSelectors = [
          'ytd-watch-metadata like-button-view-model button',
          '#top-row like-button-view-model button',
          'like-button-view-model button',
          'segmented-like-dislike-button-view-model button',
          'ytd-watch-metadata button[aria-label*="like" i]',
          'button[aria-label*="like this video" i]',
          'button[aria-label*="I like this" i]',
          'button[title*="I like this" i]',
          'ytm-like-button-renderer button',
          'button[aria-label^="like" i]:not([aria-label*="dislike" i])',
          'button:has-text("Like")',
          '[role="button"][aria-label*="like" i]:not([aria-label*="dislike" i])',
        ];
        const found = await this.findFirstVisibleLocator(page, likeSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 11. Dislike / Thumbs Down
      if (intentKey === 'dislike' || intentKey === 'thumbs_down') {
        const dislikeSelectors = [
          'ytd-watch-metadata dislike-button-view-model button',
          '#top-row dislike-button-view-model button',
          'dislike-button-view-model button',
          'segmented-like-dislike-button-view-model button:last-child',
          'ytd-watch-metadata button[aria-label*="dislike" i]',
          'button[aria-label*="dislike this video" i]',
          'button[aria-label*="I dislike this" i]',
          'button[title*="Dislike" i]',
          'button[aria-label^="dislike" i]',
          'button:has-text("Dislike")',
          '[role="button"][aria-label*="dislike" i]',
        ];
        const found = await this.findFirstVisibleLocator(page, dislikeSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 12. Subscribe
      if (intentKey === 'subscribe') {
        const subSelectors = [
          'ytd-watch-metadata #subscribe-button button',
          '#subscribe-button button',
          'ytd-watch-metadata yt-button-shape:has-text("Subscribe") button',
          'ytd-watch-metadata button:has-text("Subscribe")',
          'ytd-subscribe-button-renderer button',
          'yt-button-shape:has-text("Subscribe") button',
          'button[aria-label*="Subscribe to" i]',
          'button:has-text("Subscribe")',
          'ytm-subscribe-button-renderer button',
          'button.cbox:has-text("Subscribe")',
          '[role="button"]:has-text("Subscribe")',
        ];
        const found = await this.findFirstVisibleLocator(page, subSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 13. Unsubscribe
      if (intentKey === 'unsubscribe') {
        const unsubSelectors = [
          'ytd-watch-metadata #subscribe-button button',
          'ytd-subscribe-button-renderer button[aria-label*="Unsubscribe" i]',
          'ytd-subscribe-button-renderer button:has-text("Subscribed")',
          'button[aria-label*="Subscribed" i]',
          'button:has-text("Subscribed")',
          'button:has-text("Unsubscribe")',
        ];
        const found = await this.findFirstVisibleLocator(page, unsubSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 14. Comment Input Box
      if (intentKey === 'comment_input' || intentKey === 'comment_box' || intentKey === 'comment') {
        const commentInputSelectors = [
          '#comments #placeholder-area',
          'ytd-comments #placeholder-area',
          '#comments [role="textbox"]',
          'ytd-commentbox #contenteditable-root',
          'div#contenteditable-root[aria-label*="comment" i]',
          'div#contenteditable-root',
          '#simplebox-placeholder',
          'textarea[placeholder*="comment" i]',
          'div[role="textbox"][aria-label*="comment" i]',
          'textarea[name="comment"]',
          'div[contenteditable="true"][aria-label*="comment" i]',
        ];
        let found = await this.findFirstVisibleLocator(page, commentInputSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
        // Lazy-loading fallback on YouTube: scroll down to trigger #comments section loading
        try {
          await page.evaluate(() => {
            const comments = document.querySelector('#comments, ytd-comments');
            if (comments) comments.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else window.scrollBy({ top: 600, behavior: 'smooth' });
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 800));
          found = await this.findFirstVisibleLocator(page, commentInputSelectors, timeoutMs);
          if (found) {
            return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
          }
        } catch {}
      }

      // 15. Comment Submit Button
      if (intentKey === 'comment_submit' || intentKey === 'comment_button') {
        const submitSelectors = [
          '#comments #submit-button button',
          'ytd-commentbox #submit-button button',
          '#submit-button button:has-text("Comment")',
          '#submit-button button',
          'button[aria-label*="Comment" i]',
          'button:has-text("Comment")',
          'button:has-text("Post")',
        ];
        const found = await this.findFirstVisibleLocator(page, submitSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 16. Share button
      if (intentKey === 'share') {
        const shareSelectors = [
          'button[aria-label*="Share" i]',
          'share-button-view-model button',
          'button:has-text("Share")',
          'yt-button-shape:has-text("Share") button',
          '[role="button"][aria-label*="share" i]',
        ];
        for (const s of shareSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 500) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 17. Save to Playlist / Watch Later
      if (intentKey === 'save' || intentKey === 'playlist') {
        const saveSelectors = [
          'button[aria-label*="Save to playlist" i]',
          'button[aria-label*="Save" i]',
          'button:has-text("Save")',
          'yt-button-shape:has-text("Save") button',
        ];
        for (const s of saveSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 500) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 18. Bell / Notifications
      if (intentKey === 'bell' || intentKey === 'notifications') {
        const bellSelectors = [
          'ytd-subscription-notification-toggle-button-renderer-next button',
          'button[aria-label*="notification" i]',
          'button[aria-label*="bell" i]',
        ];
        for (const s of bellSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 500) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 19. Dismiss Popup / Modal (Try Premium, surveys, sign-in nag)
      if (
        intentKey === 'dismiss_popup' ||
        intentKey === 'dismiss' ||
        intentKey === 'close_dialog'
      ) {
        const dismissSelectors = [
          'button[aria-label*="Dismiss" i]',
          'yt-button-shape:has-text("Dismiss") button',
          'yt-button-shape:has-text("No thanks") button',
          'button:has-text("Dismiss")',
          'button:has-text("No thanks")',
          'button:has-text("Not now")',
          'button:has-text("Skip trial")',
          'button:has-text("Cancel")',
          'tp-yt-paper-dialog button:has-text("Cancel")',
          '[role="dialog"] button:has-text("Cancel")',
        ];
        for (const s of dismissSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 400) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 20. Mute / Unmute
      if (intentKey === 'mute' || intentKey === 'unmute') {
        const muteSelectors = [
          'button.ytp-mute-button',
          'button[aria-label*="Mute" i]',
          'button[aria-label*="Unmute" i]',
        ];
        for (const s of muteSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 400) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 21. Fullscreen
      if (intentKey === 'fullscreen') {
        const fsSelectors = [
          'button.ytp-fullscreen-button',
          'button[aria-label*="Full screen" i]',
        ];
        for (const s of fsSelectors) {
          try {
            const loc = page.locator(s).first();
            if (await loc.isVisible({ timeout: Math.min(timeoutMs, 400) }).catch(() => false)) {
              return { locator: loc, strategy: 'css_native', resolvedSelector: s };
            }
          } catch {}
        }
      }

      // 22. Expand Description (click "...more" to expand video description)
      if (
        intentKey === 'expand_description' ||
        intentKey === 'description_more' ||
        intentKey === 'more' ||
        intentKey === 'read_description'
      ) {
        const expandDescSelectors = [
          '#description-inline-expander #expand',
          'tp-yt-paper-button#expand',
          'ytd-text-inline-expander #expand',
          '#description #expand',
          'tp-yt-paper-button:has-text("...more")',
          'tp-yt-paper-button:has-text("more")',
          'button:has-text("...more")',
          'button:has-text("more")',
          'ytd-watch-metadata #description-inner',
          '[aria-label*="description" i]',
          'ytm-item-section-renderer.modern-description-section',
          '.ytm-expandable-video-description-body-renderer',
        ];
        const found = await this.findFirstVisibleLocator(page, expandDescSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }
      }

      // 23. Collapse Description (click "Show less" to collapse video description)
      if (
        intentKey === 'collapse_description' ||
        intentKey === 'description_less' ||
        intentKey === 'show_less' ||
        intentKey === 'close_description'
      ) {
        const collapseDescSelectors = [
          '#description-inline-expander #collapse',
          'tp-yt-paper-button#collapse',
          'ytd-text-inline-expander #collapse',
          'ytd-watch-metadata #description #collapse',
          '#description #collapse',
          'tp-yt-paper-button#collapse:not([hidden])',
          '#description-inline-expander tp-yt-paper-button:not([hidden])',
          'ytd-text-inline-expander tp-yt-paper-button:not([hidden])',
          '#collapse-button button',
          'tp-yt-paper-button:has-text("Show less")',
          'button:has-text("Show less")',
          '[aria-label*="Collapse" i]',
          '[aria-label*="Show less" i]',
        ];
        const found = await this.findFirstVisibleLocator(page, collapseDescSelectors, timeoutMs);
        if (found) {
          return { locator: found.locator, strategy: 'css_native', resolvedSelector: found.resolvedSelector };
        }

        // Off-screen scroll check: if rendered below fold, bring it into view
        for (const s of collapseDescSelectors) {
          try {
            const loc = page.locator(s).first();
            if ((await loc.count().catch(() => 0)) > 0) {
              await (loc as any).scrollIntoViewIfNeeded?.().catch(() => {});
              await new Promise((r) => setTimeout(r, 200));
              if (await loc.isVisible().catch(() => false)) {
                return { locator: loc, strategy: 'css_native', resolvedSelector: s };
              }
            }
          } catch {}
        }

        // DOM evaluation fallback to scroll into view
        const evalScrolled = await page.evaluate(() => {
          const btn = document.querySelector(
            '#collapse, tp-yt-paper-button#collapse, ytd-text-inline-expander #collapse, #description #collapse',
          ) as HTMLElement | null;
          if (btn && !btn.hasAttribute('hidden') && btn.style.display !== 'none') {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
          }
          return false;
        }).catch(() => false);

        if (evalScrolled) {
          await new Promise((r) => setTimeout(r, 400));
          const foundAfterScroll = await this.findFirstVisibleLocator(page, collapseDescSelectors, timeoutMs);
          if (foundAfterScroll) {
            return { locator: foundAfterScroll.locator, strategy: 'css_native', resolvedSelector: foundAfterScroll.resolvedSelector };
          }
        }
      }

      // 24. First video / video result intent aliases
      if (intentKey === 'first_video' || intentKey === 'video_result' || intentKey === 'top_video') {
        return this.resolve(page, 'video:0', options);
      }
    } catch {
      // An intent that could not be evaluated falls through to the tiers below
      // rather than failing the whole resolution.
    }

    // ----------------------------------------------------
    // Tier 0: Video / Dynamic Title resolution (Cross-platform PC & Android)
    // ----------------------------------------------------
    if (selector.startsWith('video:') || selector.startsWith('title:')) {
      const rawTitle = selector.replace(/^(video|title):/i, '').trim();
      const lowerRaw = rawTitle.toLowerCase();

      // Check if user or step explicitly requested live stream or short
      const wantsLive =
        lowerRaw.startsWith('live') ||
        lowerRaw.includes(':live') ||
        lowerRaw.includes(' live stream') ||
        lowerRaw.startsWith('stream');
      const wantsShort =
        lowerRaw.startsWith('short') ||
        lowerRaw.startsWith('shorts') ||
        lowerRaw.includes(':short') ||
        lowerRaw.includes(':shorts');

      // Strip modifier prefixes like "live:", "shorts:", "vod:", "regular:"
      const normalizedPos = lowerRaw
        .replace(/^(live|shorts?|vod|regular):?/i, '')
        .trim();

      // Check if selector is a positional index (e.g. video:0, video:1, video:first, video:top, video:live:0, video:shorts:0)
      const isPositional =
        normalizedPos === 'first' ||
        normalizedPos === 'top' ||
        normalizedPos === 'any' ||
        normalizedPos === '' ||
        /^\d+$/.test(normalizedPos);

      if (isPositional) {
        const rawNum = /^\d+$/.test(normalizedPos) ? parseInt(normalizedPos, 10) : 0;
        // 0-indexed: 0 is first, 1 is 2nd (or 1 is first if 1-indexed)
        const targetIdx = rawNum > 0 ? (rawNum === 1 ? 0 : rawNum - 1) : 0;

        const currentUrl = page.url?.() || '';
        const isSearchResults = currentUrl.includes('/results') || currentUrl.includes('search');

        const positionalCandidates = wantsShort
          ? [
              'ytd-reel-item-renderer a',
              'ytd-rich-item-renderer a[href*="/shorts/"]',
              'a[href*="/shorts/"]',
              'ytd-video-renderer a[href*="/shorts/"]',
            ]
          : isSearchResults
          ? [
              'ytd-video-renderer a#video-title',
              'ytd-video-renderer #video-title',
              'ytd-video-renderer a.ytd-thumbnail',
              'ytm-video-with-context-renderer a.media-item-thumbnail-container',
              '[role="article"] a',
            ]
          : [
              'ytd-video-renderer a#video-title',
              'ytd-rich-item-renderer a#video-title',
              'ytd-grid-video-renderer a#video-title',
              'ytm-video-with-context-renderer a.media-item-thumbnail-container',
              'ytm-compact-video-renderer a',
              '[role="article"] a',
              '.video-card a',
              'video',
            ];

        for (const cand of positionalCandidates) {
          try {
            const locators = page.locator(cand);
            const count = await locators.count().catch(() => 0);
            let visibleIndex = 0;
            for (let idx = 0; idx < count; idx++) {
              const candidate = locators.nth(idx);
              if (await candidate.isVisible().catch(() => false)) {
                // Classify video type and strictly avoid live streams and shorts unless requested
                const videoType = await this.classifyVideoCandidate(candidate);

                if (wantsLive) {
                  if (videoType !== 'LIVE') continue;
                } else if (wantsShort) {
                  if (videoType !== 'SHORT') continue;
                } else {
                  // Default: strictly avoid LIVE streams and SHORTS
                  if (videoType !== 'STANDARD_VOD') continue;
                }

                if (visibleIndex === targetIdx) {
                  return {
                    locator: candidate,
                    strategy: 'css_native',
                    resolvedSelector: `${cand} >> nth=${idx}`,
                  };
                }
                visibleIndex++;
              }
            }
          } catch {}
        }
      }

      const cleanTitle = rawTitle
        .replace(
          /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}|!Ã°Å¸â€Â¥]/gu,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim();

      const segments = cleanTitle
        .split(/[|\-:]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);
      const searchTerms = segments.length > 0 ? segments : [cleanTitle];

      for (const term of searchTerms) {
        const lowerTerm = term.toLowerCase();

        // 1. Cross-platform YouTube & video sites (Desktop ytd, Mobile ytm, and generic card)
        const candidates = [
          // Desktop YouTube
          `ytd-video-renderer:has(#video-title:has-text("${term}")) a#video-title`,
          `ytd-video-renderer:has-text("${term}") a#video-title`,
          `ytd-video-renderer:has(#video-title:has-text("${term}")) #thumbnail`,
          // Mobile YouTube (m.youtube.com)
          `ytm-video-with-context-renderer:has-text("${term}") a.media-item-thumbnail-container`,
          `ytm-video-with-context-renderer:has-text("${term}") h3`,
          `ytm-compact-video-renderer:has-text("${term}") a`,
          // Generic video & media sites (Vimeo, Dailymotion, news embeds)
          `[role="article"]:has-text("${term}") a`,
          `[class*="video"]:has-text("${term}") a`,
          `.video-card:has-text("${term}") a`,
          `a:has-text("${term}")`,
        ];

        for (const cand of candidates) {
          try {
            const loc = page.locator(cand).first();
            await loc.waitFor({ state: 'attached', timeout: Math.min(timeoutMs, 500) });
            if ((await loc.count()) > 0) {
              const videoType = await this.classifyVideoCandidate(loc);
              if (wantsLive) {
                if (videoType !== 'LIVE') continue;
              } else if (wantsShort) {
                if (videoType !== 'SHORT') continue;
              } else {
                if (videoType !== 'STANDARD_VOD') continue;
              }
              return {
                locator: loc,
                strategy: 'css_native',
                resolvedSelector: cand,
              };
            }
          } catch {}
        }

        // XPath contains fallback (case-insensitive)
        try {
          const xp = `xpath=//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${lowerTerm}')]`;
          const loc = page.locator(xp).first();
          await loc.waitFor({ state: 'attached', timeout: Math.min(timeoutMs, 500) });
          if ((await loc.count()) > 0) {
            const videoType = await this.classifyVideoCandidate(loc);
            if (
              (wantsLive && videoType === 'LIVE') ||
              (wantsShort && videoType === 'SHORT') ||
              (!wantsLive && !wantsShort && videoType === 'STANDARD_VOD')
            ) {
              return {
                locator: loc,
                strategy: 'xpath_native',
                resolvedSelector: xp,
              };
            }
          }
        } catch {}
      }

      return null;
    }

    // Support combined comma-separated or pipe-separated fallback queries
    if (selector.includes(',') || selector.includes('|')) {
      const candidates = (
        selector.includes('|') && !selector.startsWith('//') && !selector.startsWith('/')
          ? selector.split('|')
          : selector.split(',')
      )
        .map((s) => s.trim())
        .filter(Boolean);

      if (candidates.length > 1) {
        for (const candidate of candidates) {
          try {
            const isXp =
              candidate.startsWith('/') ||
              candidate.startsWith('xpath=') ||
              candidate.startsWith('//');
            const q = isXp
              ? candidate.startsWith('xpath=')
                ? candidate
                : `xpath=${candidate}`
              : candidate;
            const loc = page.locator(q).first();
            await loc.waitFor({ state: 'attached', timeout: Math.min(timeoutMs, 1000) });
            if ((await loc.count()) > 0) {
              return {
                locator: loc,
                strategy: isXp ? 'xpath_native' : 'css_native',
                resolvedSelector: q,
              };
            }
          } catch {}
        }
      }
    }

    const isXpathHint =
      selector.startsWith('/') ||
      selector.startsWith('xpath=') ||
      selector.startsWith('//');

    // ----------------------------------------------------
    // Tier 1: Native XPath (if selector is or starts with XPath)
    // ----------------------------------------------------
    if (isXpathHint) {
      const xpathQuery = selector.startsWith('xpath=')
        ? selector
        : `xpath=${selector}`;
      try {
        const locator = page.locator(xpathQuery).first();
        await locator.waitFor({ state: 'attached', timeout: timeoutMs });
        if ((await locator.count()) > 0) {
          return {
            locator,
            strategy: 'xpath_native',
            resolvedSelector: xpathQuery,
          };
        }
      } catch {
        // Fall through to next tier
      }
    }

    // ----------------------------------------------------
    // Tier 2: Native CSS locator
    // ----------------------------------------------------
    if (!isXpathHint) {
      try {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: 'attached', timeout: timeoutMs });
        if ((await locator.count()) > 0) {
          return {
            locator,
            strategy: 'css_native',
            resolvedSelector: selector,
          };
        }
      } catch {
        // Fall through to next tier
      }
    }

    // ----------------------------------------------------
    // Tier 2.5: Decoded URL & dynamic redirect link resolution
    // Handles Google SERP redirects (/url?q=...), URL-encoded hrefs, and dynamic links
    // ----------------------------------------------------
    if (!isXpathHint && selector.includes('href')) {
      const hrefMatch = selector.match(/href\*?=["']?([^"'>\]\s]+)["']?/i);
      if (hrefMatch && hrefMatch[1]) {
        const term = hrefMatch[1].trim();
        const evalResult = await this.resolveLinkByTermViaEval(page, term);
        if (evalResult) {
          return evalResult;
        }
        const domainName = term.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[\/.]/)[0];
        if (domainName && domainName !== term && domainName.length >= 3) {
          const fallbackDomainResult = await this.resolveLinkByTermViaEval(page, domainName);
          if (fallbackDomainResult) {
            return fallbackDomainResult;
          }
        }
      }
    }

    // ----------------------------------------------------
    // Tier 3: Deep Shadow DOM piercing
    // ----------------------------------------------------
    try {
      if (isXpathHint) {
        const cleanXp = selector.startsWith('xpath=')
          ? selector.slice(6)
          : selector;
        const shadowEl = await ShadowDom.findXPath(page, cleanXp);
        if (shadowEl) {
          return {
            element: shadowEl,
            strategy: 'shadow_dom',
            resolvedSelector: selector,
          };
        }
      } else {
        const shadowEl = await ShadowDom.findElement(page, selector);
        if (shadowEl) {
          return {
            element: shadowEl,
            strategy: 'shadow_dom',
            resolvedSelector: selector,
          };
        }
      }
    } catch {
      // Fall through to next tier
    }

    // ----------------------------------------------------
    // Tier 4: AnchorRegistry recall (cached historical selector)
    // ----------------------------------------------------
    if (this.anchorRegistry && options?.taskId) {
      try {
        const key = this.anchorRegistry.generateKey({
          taskId: options.taskId,
          stepIndex: options.stepIndex ?? 0,
          selectorHint: selector,
          semanticSignature: options.semanticSignature ?? null,
        });

        const anchor = await this.anchorRegistry.recall(
          options.taskId,
          options.profileId,
          key,
        );

        if (anchor && anchor.selector) {
          try {
            const isAnchorXpath =
              anchor.selector.startsWith('/') ||
              anchor.selector.startsWith('xpath=');
            const anchorQuery = isAnchorXpath
              ? anchor.selector.startsWith('xpath=')
                ? anchor.selector
                : `xpath=${anchor.selector}`
              : anchor.selector;

            const locator = page.locator(anchorQuery).first();
            await locator.waitFor({ state: 'attached', timeout: timeoutMs });
            if ((await locator.count()) > 0) {
              // Reinforce anchor confidence on verified hit
              void this.anchorRegistry.reinforce(anchor.id).catch(() => {});
              return {
                locator,
                strategy: 'anchor_registry',
                resolvedSelector: anchor.selector,
              };
            }
          } catch {
            // Anchor failed to resolve: decay confidence
            void this.anchorRegistry.decay(anchor.id).catch(() => {});
          }
        }
      } catch {
        // Fall through to next tier
      }
    }

    // ----------------------------------------------------
    // Tier 5: Accessibility Role + Name fallback
    // ----------------------------------------------------
    const targetRole = options?.role;
    const targetName = options?.name ?? (!isXpathHint ? selector : undefined);

    if (targetRole) {
      try {
        const roleLocator = page
          .getByRole(targetRole as Parameters<Page['getByRole']>[0], {
            ...(targetName ? { name: targetName } : {}),
          })
          .first();

        await roleLocator.waitFor({ state: 'attached', timeout: timeoutMs });
        if ((await roleLocator.count()) > 0) {
          return {
            locator: roleLocator,
            strategy: 'accessibility_role',
            resolvedSelector: `role=${targetRole}[name=${targetName ?? ''}]`,
          };
        }
      } catch {
        // Fall through
      }
    }

    return null;
  }
}