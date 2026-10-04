import os from 'node:os';
import path from 'node:path';

import { PERSONA_PRESETS, type PersonaPresetKey, type Step } from '@tersoo/contracts';
import type { CDPSession, ElementHandle, Locator, Page } from 'playwright-core';

import { generateBezierPath, type Point } from '../crosshair/bezier';
import { ConsentEngine } from '../crosshair/ConsentEngine';
import { Humanizer } from '../crosshair/Humanizer';
import { ShadowDom } from '../crosshair/ShadowDom';
import type { XPathResolver, XPathResolverResult } from '../crosshair/XPathResolver';
import type { LlmService } from '../llm/LlmService';
import { CrosshairError, TaskError, type ErrorCode } from '../util/errors';

import { NavigationEngine } from '../browser/navigation/NavigationEngine';
import type { CaptchaHandler } from './CaptchaHandler';
import { WorkflowValidator } from './WorkflowValidator';
import { runLlmStep, type PageResolver } from './steps/llmStep';
import { maintainPage } from './steps/pageMaintenance';
import { trySkipAd, type AdSkipResult } from '../crosshair/AdSkipper';
import { clickTargetLikeAPerson, type ClickTarget } from '../crosshair/mouseClick';
import type { LlmPersonaContext } from '../llm/types';

export interface StepExecutionContext {
  profileId: string;
  taskId: string;
  runId: string;
  stepIndex: number;
  page: Page;
  /**
   * Re-acquires a live page for this run. Long-running steps must use this
   * rather than the `page` handle, which is captured once and can be closed or
   * replaced while the step is awaiting a network response.
   */
  resolvePage?: PageResolver | undefined;
  cdp?: CDPSession | undefined;
  humanizer?: Humanizer | undefined;
  llm?: LlmService | undefined;
  captchaHandler?: CaptchaHandler | undefined;
  variables: Record<string, any>;
  screenshotsDir?: string | undefined;
  seed?: string | number | undefined;
  persona?: string | undefined;
  platform?: 'windows' | 'macos' | 'android' | 'linux' | undefined;
  isMobile?: boolean | undefined;
  typingWpm?: number | undefined;
  typoRate?: number | undefined;
  patienceIndex?: number | undefined;
  engagementRate?: number | undefined;
  trustScore?: number | undefined;
  maturationStage?: string | undefined;
  weightedNiches?: Array<{ nicheId: string; weight: number; isPrimary?: boolean }> | undefined;
}

export interface StepRunResult {
  stepIndex: number;
  stepType: string;
  durationMs: number;
  extracted?: { key: string; value: string };
  screenshotPath?: string;
  artifacts?: Record<string, unknown>;
}

export class StepRunner {
  private mousePos: Point = { x: 300, y: 300 };

  constructor(private readonly xpathResolver: XPathResolver) {}

  private async ensureVisualCursor(page: Page, isMobile = false): Promise<void> {
    if (isMobile) {
      await page.evaluate(() => {
        document.getElementById('__tersoo_cursor')?.remove();
      }).catch(() => {});
      return;
    }
    await page.evaluate(() => {
      if (document.getElementById('__tersoo_cursor')) return;
      const cursor = document.createElement('div');
      cursor.id = '__tersoo_cursor';
      cursor.style.position = 'fixed';
      cursor.style.top = '0px';
      cursor.style.left = '0px';
      cursor.style.pointerEvents = 'none';
      cursor.style.zIndex = '2147483647';
      cursor.style.transform = 'translate3d(-50px, -50px, 0)';
      cursor.style.transformOrigin = '0 0';
      cursor.style.transition = 'transform 0.03s linear';

      // Create SVG via createElementNS to avoid TrustedHTML violation on YouTube/CSP sites
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.style.filter = 'drop-shadow(1px 2px 3px rgba(0,0,0,0.5))';
      svg.style.transformOrigin = '0 0';
      svg.style.transition = 'transform 0.08s ease';

      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', 'M0 0 L0 18.5 L4.8 14.2 L8.2 21.5 L10.8 20.3 L7.4 13.2 L14 13.2 Z');
      path.setAttribute('fill', '#ffffff');
      path.setAttribute('stroke', '#111111');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');
      svg.appendChild(path);

      const ripple = document.createElement('div');
      ripple.id = '__tersoo_click_ripple';
      ripple.style.position = 'absolute';
      ripple.style.top = '-10px';
      ripple.style.left = '-10px';
      ripple.style.width = '20px';
      ripple.style.height = '20px';
      ripple.style.borderRadius = '50%';
      ripple.style.border = '2px solid rgba(59, 130, 246, 0.8)';
      ripple.style.background = 'rgba(59, 130, 246, 0.25)';
      ripple.style.transform = 'scale(0)';
      ripple.style.opacity = '0';
      ripple.style.pointerEvents = 'none';
      ripple.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';

      cursor.appendChild(svg);
      cursor.appendChild(ripple);
      (document.body || document.documentElement).appendChild(cursor);
    }).catch(() => {});
  }

  private async moveVisualCursor(page: Page, x: number, y: number, isDown = false, isMobile = false): Promise<void> {
    if (isMobile) {
      await page.evaluate(() => {
        document.getElementById('__tersoo_cursor')?.remove();
      }).catch(() => {});
      return;
    }
    await page.evaluate(({ x, y, isDown }) => {
      let cursor = document.getElementById('__tersoo_cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = '__tersoo_cursor';
        cursor.style.position = 'fixed';
        cursor.style.top = '0px';
        cursor.style.left = '0px';
        cursor.style.pointerEvents = 'none';
        cursor.style.zIndex = '2147483647';
        cursor.style.transformOrigin = '0 0';
        cursor.style.transition = 'transform 0.03s linear';

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.style.filter = 'drop-shadow(1px 2px 3px rgba(0,0,0,0.5))';
        svg.style.transformOrigin = '0 0';
        svg.style.transition = 'transform 0.08s ease';

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M0 0 L0 18.5 L4.8 14.2 L8.2 21.5 L10.8 20.3 L7.4 13.2 L14 13.2 Z');
        path.setAttribute('fill', '#ffffff');
        path.setAttribute('stroke', '#111111');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);

        const ripple = document.createElement('div');
        ripple.id = '__tersoo_click_ripple';
        ripple.style.position = 'absolute';
        ripple.style.top = '-10px';
        ripple.style.left = '-10px';
        ripple.style.width = '20px';
        ripple.style.height = '20px';
        ripple.style.borderRadius = '50%';
        ripple.style.border = '2px solid rgba(59, 130, 246, 0.8)';
        ripple.style.background = 'rgba(59, 130, 246, 0.25)';
        ripple.style.transform = 'scale(0)';
        ripple.style.opacity = '0';
        ripple.style.pointerEvents = 'none';
        ripple.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';

        cursor.appendChild(svg);
        cursor.appendChild(ripple);
        (document.body || document.documentElement).appendChild(cursor);
      }

      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const svg = cursor.querySelector('svg');
      const ripple = document.getElementById('__tersoo_click_ripple');

      if (svg) {
        svg.style.transform = isDown ? 'scale(0.85) rotate(-3deg)' : 'scale(1) rotate(0deg)';
      }

      if (ripple && isDown) {
        ripple.style.transition = 'none';
        ripple.style.transform = 'scale(0.5)';
        ripple.style.opacity = '1';
        requestAnimationFrame(() => {
          ripple.style.transition = 'transform 0.35s ease-out, opacity 0.35s ease-out';
          ripple.style.transform = 'scale(2.2)';
          ripple.style.opacity = '0';
        });
      }
    }, { x, y, isDown }).catch(() => {});
  }

  private async renderTouchRipple(page: Page, x: number, y: number): Promise<void> {
    await page.evaluate(({ x, y }) => {
      let container = document.getElementById('__tersoo_touch_container');
      if (!container) {
        container = document.createElement('div');
        container.id = '__tersoo_touch_container';
        container.style.position = 'fixed';
        container.style.top = '0px';
        container.style.left = '0px';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '2147483647';
        document.documentElement.appendChild(container);
      }

      const ripple = document.createElement('div');
      ripple.style.position = 'absolute';
      ripple.style.left = `${Math.round(x) - 18}px`;
      ripple.style.top = `${Math.round(y) - 18}px`;
      ripple.style.width = '36px';
      ripple.style.height = '36px';
      ripple.style.borderRadius = '50%';
      ripple.style.background = 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, rgba(59, 130, 246, 0.15) 60%, transparent 100%)';
      ripple.style.border = '2px solid rgba(59, 130, 246, 0.9)';
      ripple.style.transform = 'scale(0.4)';
      ripple.style.opacity = '1';
      ripple.style.transition = 'transform 0.35s ease-out, opacity 0.35s ease-out';
      container.appendChild(ripple);

      requestAnimationFrame(() => {
        ripple.style.transform = 'scale(1.75)';
        ripple.style.opacity = '0';
        setTimeout(() => {
          ripple.remove();
        }, 400);
      });
    }, { x, y }).catch(() => {});
  }

  /**
   * Clicks a located element the way a person would.
   *
   * This exists because `locator.click()` does not work on this engine.
   * `rebrowser-playwright-core` resolves the element, reports it visible,
   * enabled and stable, confirms it is the hit target under
   * `elementFromPoint` - and then retries until the timeout without ever
   * dispatching an event. Every engagement action (like, subscribe, comment,
   * read the description), the ad skip and the popup dismiss all used to call
   * it, so all of them silently did nothing while reporting success.
   *
   * Goes through the humanizer when one is available, so the click also looks
   * like a click rather than a synthetic dispatch.
   */
  private async clickLikeHuman(ctx: StepExecutionContext, target: ClickTarget): Promise<boolean> {
    const humanizer = ctx.humanizer ?? new Humanizer(typeof ctx.seed === 'number' ? ctx.seed : 42);
    if (ctx.isMobile && ctx.cdp) {
      // Touch input cannot go through the mouse; the CDP path is used instead.
      const box = await target.boundingBox().catch(() => null);
      if (!box) return false;
      try {
        await Humanizer.touchTap(ctx.cdp, box);
        return true;
      } catch {
        return false;
      }
    }
    return clickTargetLikeAPerson(ctx.page, target, humanizer, { timeoutMs: 2500 });
  }

  private async humanMoveMouse(page: Page, target: Point, isMobile = false): Promise<void> {
    if (isMobile) return;
    if (!page?.mouse?.move) return;
    await this.ensureVisualCursor(page, false);
    const dx = target.x - this.mousePos.x;
    const dy = target.y - this.mousePos.y;
    const distance = Math.hypot(dx, dy);

    // Dynamic steps based on distance
    const steps = Math.max(22, Math.min(55, Math.round(distance / 12) + 16));
    const path = generateBezierPath(this.mousePos, target, Math.random, steps);

    for (const p of path) {
      if (page.mouse?.move) {
        await page.mouse.move(p.x, p.y).catch(() => {});
      }
      await this.moveVisualCursor(page, p.x, p.y, false, false);
      await new Promise((r) => setTimeout(r, 12 + Math.floor(Math.random() * 10)));
    }

    this.mousePos = target;
  }

  /**
   * Executes a single workflow step within the provided runtime context.
   * Dispatches to dedicated step handlers with variable interpolation,
   * humanized interactions, and artifact capture.
   */
  async run(step: Step, ctx: StepExecutionContext): Promise<StepRunResult> {
    const startTime = Date.now();

    // 1. Interpolate step variables using runtime variables map
    const interpolated = WorkflowValidator.interpolateStep(step, ctx.variables);

    // 2. Keep the page usable before the step runs.
    //
    // Consent acceptance is not a YouTube concern: banners are served by any
    // site, and a banner left on screen silently swallows every click that
    // follows. Doing it here, once per step, covers every step type rather than
    // only the ones that happened to call the consent engine themselves.
    if (ctx.page && (typeof ctx.page.isClosed !== 'function' || !ctx.page.isClosed())) {
      await maintainPage(ctx.page, {
        humanizer: ctx.humanizer,
        checkAds: false,
        checkCaptcha: false,
        consentTimeoutMs: 600,
      }).catch(() => null);
    }

    // 3. Check and handle CAPTCHA before step
    if (ctx.captchaHandler) {
      await ctx.captchaHandler.checkAndHandle(ctx.page, ctx.runId, ctx.profileId);
    }

    try {
      let extracted: { key: string; value: string } | undefined;
      let screenshotPath: string | undefined;
      let artifacts: Record<string, unknown> | undefined;

      const result = await this.dispatchStepHandler(interpolated, ctx);
      extracted = result.extracted;
      screenshotPath = result.screenshotPath;
      artifacts = result.artifacts;

      if (ctx.captchaHandler) {
        await ctx.captchaHandler.checkAndHandle(ctx.page, ctx.runId, ctx.profileId);
      }

      return {
        stepIndex: ctx.stepIndex,
        stepType: step.type,
        durationMs: Date.now() - startTime,
        ...(extracted ? { extracted } : {}),
        ...(screenshotPath ? { screenshotPath } : {}),
        ...(artifacts ? { artifacts } : {}),
      };
    } catch (err) {
      if (ctx.captchaHandler) {
        await ctx.captchaHandler.checkAndHandle(ctx.page, ctx.runId, ctx.profileId).catch(() => {});
      }

      // Universal Visual Self-Healing Recovery: when stuck, send screenshot to LLM
      if (ctx.llm && ctx.page && (typeof ctx.page.isClosed !== 'function' || !ctx.page.isClosed())) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        const recovered = await this.attemptVisualRecovery(interpolated, ctx, errorObj).catch(() => false);
        if (recovered) {
          return {
            stepIndex: ctx.stepIndex,
            stepType: step.type,
            durationMs: Date.now() - startTime,
            artifacts: { selfHealed: true },
          };
        }
      }

      if (err instanceof CrosshairError || err instanceof TaskError) {
        throw err;
      }
      throw new TaskError(
        'INTERNAL',
        `Step ${ctx.stepIndex + 1} (${step.type}) failed: ${err instanceof Error ? err.message : String(err)}`,
        { details: err, stepIndex: ctx.stepIndex, stepType: step.type },
      );
    }
  }

  private async dispatchStepHandler(
    step: Step,
    ctx: StepExecutionContext,
  ): Promise<{ extracted?: { key: string; value: string }; screenshotPath?: string; artifacts?: Record<string, unknown> }> {
    let extracted: { key: string; value: string } | undefined;
    let screenshotPath: string | undefined;
    let artifacts: Record<string, unknown> | undefined;

    switch (step.type) {
      case 'navigate':
        await this.handleNavigate(step, ctx);
        break;
      case 'waitFor':
        await this.handleWaitFor(step, ctx);
        break;
      case 'waitForUrl':
        await this.handleWaitForUrl(step, ctx);
        break;
      case 'click':
        await this.handleClick(step, ctx);
        break;
      case 'hover':
        await this.handleHover(step, ctx);
        break;
      case 'mouseMove':
        await this.handleMouseMove(step, ctx);
        break;
      case 'type':
        await this.handleType(step, ctx);
        break;
      case 'scroll':
        await this.handleScroll(step, ctx);
        break;
      case 'extract':
        extracted = await this.handleExtract(step, ctx);
        ctx.variables[extracted.key] = extracted.value;
        break;
      case 'screenshot':
        screenshotPath = await this.handleScreenshot(step, ctx);
        break;
      case 'sleep':
        await this.handleSleep(step, ctx);
        break;
      case 'llm':
        artifacts = await this.handleLlm(step, ctx);
        break;
      case 'engage':
        artifacts = await this.handleEngage(step, ctx);
        break;
      case 'goBack':
        await this.handleGoBack(step, ctx);
        break;
      case 'repeat':
        artifacts = await this.handleRepeat(step, ctx);
        break;
    }

    return {
      ...(extracted !== undefined ? { extracted } : {}),
      ...(screenshotPath !== undefined ? { screenshotPath } : {}),
      ...(artifacts !== undefined ? { artifacts } : {}),
    };
  }

  private async attemptVisualRecovery(
    step: Step,
    ctx: StepExecutionContext,
    originalError: Error,
  ): Promise<boolean> {
    if (!ctx.llm || !ctx.page || (typeof ctx.page.isClosed === 'function' && ctx.page.isClosed())) return false;

    // 1. First run ConsentEngine check in case a modal/interstitial just appeared
    const consentHandled = await ConsentEngine.checkAndHandle(ctx.page, {
      isMobile: ctx.isMobile,
      timeoutMs: 1500,
    }).catch(() => false);

    if (consentHandled) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        await this.dispatchStepHandler(step, ctx);
        return true;
      } catch {}
    }

    // 2. Capture viewport screenshot for Vision LLM analysis
    let screenshotBuffer: Buffer;
    try {
      screenshotBuffer = (await ctx.page.screenshot({
        type: 'jpeg',
        quality: 80,
      })) as Buffer;
    } catch {
      return false;
    }

    const currentUrl = ctx.page.url?.() || '';
    const stepDesc = JSON.stringify(step);

    const prompt = `You are an automated browser recovery agent.
The automation script is currently stuck executing this step:
${stepDesc}
Current URL: ${currentUrl}
Error encountered: "${originalError.message}"

Inspect the provided screenshot carefully.
1. Check if there is an obstacle blocking the page: cookie banner, GDPR notice, promotional modal, login prompt, "Accept all", "Reject all", "Close", or CAPTCHA.
2. If an obstacle is blocking the view, locate the button to dismiss it (e.g., "Accept", "Agree", "Close", "X") and return action "click" with the exact (x, y) pixel coordinates of that button.
3. If no obstacle is present and the step's target element is visible on screen, return action "click" with the exact (x, y) coordinates of that element.
4. If this is truly unrecoverable or a hard blocker, return action "unsolvable" with reason.

Return valid JSON:
{"action": "click", "x": 123, "y": 456, "reason": "dismiss cookie consent"}
OR
{"action": "unsolvable", "reason": "why"}`;

    try {
      const decision = await ctx.llm.decideFromScreenshot(screenshotBuffer, prompt);
      if (decision && decision.action === 'click' && Number.isFinite(decision.x) && Number.isFinite(decision.y)) {
        const { x, y } = decision;

        // Dispatch click or touch tap
        if (ctx.isMobile) {
          await this.renderTouchRipple(ctx.page, x, y);
          if (ctx.cdp) {
            await Humanizer.touchTap(ctx.cdp, { x, y });
          } else if (ctx.page.touchscreen?.tap) {
            await ctx.page.touchscreen.tap(x, y).catch(() => ctx.page.mouse.click(x, y));
          } else {
            await ctx.page.mouse.click(x, y);
          }
        } else {
          await this.humanMoveMouse(ctx.page, { x, y });
          await ctx.page.mouse.click(x, y);
        }

        await new Promise((r) => setTimeout(r, 1200));

        // Retry the original step!
        await this.dispatchStepHandler(step, ctx);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  private async handleNavigate(
    step: Extract<Step, { type: 'navigate' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    if (step.url === 'back' || step.url === 'history:back') {
      await this.handleGoBack({ type: 'goBack', timeoutMs: step.timeoutMs }, ctx);
      return;
    }

    const navEngine = new NavigationEngine(
      ctx.page,
      ctx.llm,
      ctx.screenshotsDir,
    );

    const result = await navEngine.navigate(step.url, {
      timeoutMs: step.timeoutMs,
      waitUntil: step.waitUntil,
      expectedUrl: step.expectedUrl,
      allowedHosts: step.allowedHosts,
      requiredSelectors: step.requiredSelectors,
      requiredText: step.requiredText,
      maxRetries: step.maxRetries,
      useAIRecovery: step.aiRecovery,
      goal: step.goal,
      isMobile: ctx.isMobile,
    });

    if (!result.success) {
      const code: ErrorCode =
        result.failureCode === 'TIMEOUT'
          ? 'STEP_TIMEOUT'
          : result.failureCode === 'ACCESS_DENIED'
            ? 'POLICY_VIOLATION'
            : 'NAVIGATION_FAILED';

      throw new TaskError(
        code,
        `Navigation to '${step.url}' failed [${result.failureCode}]: ${result.message}`,
        {
          failureCode: result.failureCode,
          ...(result.artifactPaths ? { artifacts: result.artifactPaths } : {}),
        },
      );
    }
  }

  private async handleGoBack(
    step: Extract<Step, { type: 'goBack' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    const timeoutMs = step.timeoutMs ?? 30000;
    const patienceFactor = ctx.patienceIndex ? Math.max(0.2, ctx.patienceIndex / 5.5) : 1.0;

    const currentUrl = ctx.page.url?.() || '';
    const isSearchEngineResultsPage = (urlStr: string): boolean => {
      const u = urlStr.toLowerCase();
      return (
        (u.includes('google.') && (u.includes('/search') || u.includes('q='))) ||
        (u.includes('bing.com') && u.includes('/search')) ||
        (u.includes('duckduckgo.com') && u.includes('q=')) ||
        (u.includes('search.yahoo.com') && u.includes('p='))
      );
    };

    // 1. Tab recovery: Check if an external tab was opened in the context
    try {
      const context = ctx.page.context?.();
      const pages = context?.pages() ?? [];
      if (pages.length > 1) {
        const serpPage = pages.find((p) => isSearchEngineResultsPage(p.url?.() || ''));
        if (serpPage && serpPage !== ctx.page) {
          console.log(`[StepRunner] Multi-tab detected: Closing active tab (${currentUrl}) and switching back to SERP tab (${serpPage.url()})`);
          await ctx.page.close().catch(() => {});
          ctx.page = serpPage;
          await ctx.page.bringToFront().catch(() => {});
          await new Promise((r) => setTimeout(r, Math.round(1000 * patienceFactor)));
          return;
        }
      }
    } catch {}

    // 2. Protection: If we are ALREADY on the search engine results page, do NOT navigate back into history!
    // (Navigating back from SERP would dump the user on the blank homepage or new tab page).
    if (isSearchEngineResultsPage(currentUrl)) {
      console.log(`[StepRunner] Already on search engine results page (${currentUrl}). Skipping redundant goBack navigation.`);
      return;
    }

    // Natural human retreat movement: move mouse towards upper left of browser where back button is located
    if (!ctx.isMobile) {
      const topX = 30 + Math.floor(Math.random() * 25);
      const topY = 15 + Math.floor(Math.random() * 20);
      await this.humanMoveMouse(ctx.page, { x: topX, y: topY }, ctx.isMobile).catch(() => {});
      await new Promise((r) => setTimeout(r, Math.round((250 + Math.random() * 250) * patienceFactor)));
    }

    // Perform page.goBack() or window.history.back()
    try {
      if (typeof ctx.page.goBack === 'function') {
        await ctx.page.goBack({
          waitUntil: 'domcontentloaded',
          timeout: timeoutMs,
        }).catch(async (err) => {
          console.warn(`[StepRunner] page.goBack failed or timed out (${err?.message || err}), falling back to window.history.back()`);
          await ctx.page.evaluate(() => window.history.back()).catch(() => {});
        });
      } else {
        await ctx.page.evaluate(() => window.history.back()).catch(() => {});
      }
    } catch (err) {
      console.warn(`[StepRunner] goBack encountered error:`, err);
      await ctx.page.evaluate(() => window.history.back()).catch(() => {});
    }

    // Wait for DOM and navigation to settle
    await new Promise((r) => setTimeout(r, Math.round((1400 + Math.random() * 800) * patienceFactor)));

    // Redirect trap recovery: If after goBack we are still on the same external site,
    // call window.history.back() once more to break through the redirect chain back to SERP
    try {
      const postUrl = ctx.page.url?.() || '';
      if (!isSearchEngineResultsPage(postUrl) && postUrl === currentUrl) {
        console.log(`[StepRunner] Still on external page (${postUrl}) after goBack, executing second history.back() to break redirect trap...`);
        await ctx.page.evaluate(() => window.history.back()).catch(() => {});
        await new Promise((r) => setTimeout(r, Math.round(1500 * patienceFactor)));
      }
    } catch {}

    // Re-check consent or dialogs that might pop up on return
    await ConsentEngine.checkAndHandle(ctx.page, {
      isMobile: ctx.isMobile,
      timeoutMs: 1500,
    }).catch(() => false);
  }

  private async handleWaitFor(
    step: Extract<Step, { type: 'waitFor' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    await this.xpathResolver.resolve(ctx.page, step.selector, {
      taskId: ctx.taskId,
      profileId: ctx.profileId,
      stepIndex: ctx.stepIndex,
      timeoutMs: step.timeoutMs,
      scrollUntilFound: true,
    });
  }

  private async handleWaitForUrl(
    step: Extract<Step, { type: 'waitForUrl' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    const timeoutMs = step.timeoutMs ?? 15000;
    const target = step.url.trim();
    try {
      await ctx.page.waitForURL(
        (url) => {
          const u = url.toString().toLowerCase();
          const targetLower = target.toLowerCase();
          return u.includes(targetLower);
        },
        { timeout: timeoutMs },
      );
    } catch (err) {
      const currentUrl = ctx.page.url?.() || '';
      if (currentUrl.toLowerCase().includes(target.toLowerCase()) || (target.toLowerCase().includes('youtube') && currentUrl.toLowerCase().includes('youtube'))) {
        return;
      }
      throw new CrosshairError(
        'NAVIGATION_FAILED',
        `Timed out waiting for URL '${target}': ${err instanceof Error ? err.message : String(err)}`,
        { targetUrl: target, currentUrl, details: err },
      );
    }
  }

  private async tryVisionFallbackClick(
    step: Extract<Step, { type: 'click' }>,
    ctx: StepExecutionContext,
  ): Promise<boolean> {
    if (!ctx.llm) return false;
    try {
      console.log(`[StepRunner] DOM resolution failed for "${step.selector}". Capturing viewport for Vision LLM recovery...`);
      const screenshot = await ctx.page.screenshot({ type: 'png' }).catch(() => null);
      if (!screenshot) return false;

      const prompt = `The automation workflow is stuck trying to click on element: "${step.selector}".
Find the exact location of this element or button on the screen to click it.
Return the pixel coordinates (x, y) near the center of the target element.`;

      const decision = await ctx.llm.decideFromScreenshot(screenshot, prompt).catch((err) => {
        console.warn(`[StepRunner] Vision LLM fallback call failed:`, err?.message ?? err);
        return null;
      });

      if (!decision || decision.action !== 'click') {
        return false;
      }

      console.log(`[StepRunner] Vision LLM located "${step.selector}" at (${decision.x}, ${decision.y}). Executing click...`);
      const box = {
        x: Math.max(0, decision.x - 10),
        y: Math.max(0, decision.y - 10),
        width: 20,
        height: 20,
      };

      await this.executeBoxClick(ctx, box, step.humanized ?? true);
      return true;
    } catch (err) {
      console.warn(`[StepRunner] Vision fallback failed:`, err);
      return false;
    }
  }

  private async executeBoxClick(
    ctx: StepExecutionContext,
    box: { x: number; y: number; width: number; height: number },
    humanized = true,
    resolvedLocator?: Locator,
    resolvedElement?: ElementHandle<Element>,
  ): Promise<void> {
    const patienceFactor = ctx.patienceIndex ? Math.max(0.2, ctx.patienceIndex / 5.5) : 1.0;

    // Viewport guard: Ensure the target box is inside the visible viewport
    const vp = ctx.page.viewportSize?.() || { width: 1280, height: 800 };
    if (box && (box.y < 0 || box.y > vp.height || box.x < 0 || box.x > vp.width)) {
      if (resolvedLocator) {
        await resolvedLocator.evaluate((el: HTMLElement) => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        const newBox = await resolvedLocator.boundingBox().catch(() => null);
        if (newBox && newBox.width > 0 && newBox.height > 0) {
          box = newBox;
        }
      } else if (resolvedElement) {
        await (resolvedElement as any).evaluate((el: HTMLElement) => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        const newBox = await ShadowDom.resolveBoundingBox(resolvedElement);
        if (newBox && newBox.width > 0 && newBox.height > 0) {
          box = newBox;
        }
      }
    }

    // Authentic mobile touch tap if mobile profile
    if (ctx.isMobile) {
      if (box && box.width > 0 && box.height > 0) {
        const targetX = Math.max(10, Math.min(vp.width - 10, box.x + box.width / 2));
        const targetY = Math.max(10, Math.min(vp.height - 10, box.y + box.height / 2));
        await this.renderTouchRipple(ctx.page, targetX, targetY);
        if (ctx.cdp) {
          await Humanizer.touchTap(ctx.cdp, box, {
            ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
            patienceIndex: ctx.patienceIndex,
          });
          await new Promise((r) => setTimeout(r, Math.round((140 + Math.floor(Math.random() * 160)) * patienceFactor)));
          return;
        }
        if (resolvedLocator && typeof (resolvedLocator as any).tap === 'function') {
          await (resolvedLocator as any)
            .tap()
            .catch(() => ctx.page.mouse?.click(targetX, targetY));
          return;
        }
        if (ctx.page.mouse?.click) {
          await ctx.page.mouse.click(targetX, targetY);
          return;
        }
        if (resolvedLocator) {
          await clickTargetLikeAPerson(ctx.page, resolvedLocator as unknown as ClickTarget, ctx.humanizer, {
            timeoutMs: 2000,
          });
          return;
        }
      }
      if (resolvedLocator) {
        if (typeof (resolvedLocator as any).tap === 'function') {
          await (resolvedLocator as any)
            .tap()
            .catch(() => this.clickLikeHuman(ctx, resolvedLocator as unknown as ClickTarget));
        } else {
          await this.clickLikeHuman(ctx, resolvedLocator as unknown as ClickTarget);
        }
        return;
      }
    }

    if (humanized) {
      if (ctx.cdp && box && box.width > 0 && box.height > 0) {
        const targetX = Math.max(15, Math.min(vp.width - 15, box.x + box.width / 2));
        const targetY = Math.max(15, Math.min(vp.height - 15, box.y + box.height / 2));
        await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY }, ctx.isMobile);
        await Humanizer.click(ctx.cdp, box, {
          ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
          patienceIndex: ctx.patienceIndex,
        });
        return;
      }

      // Smooth visual mouse trajectory & realistic click
      if (box && box.width > 0 && box.height > 0) {
        let rawTargetX = box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.25);
        let rawTargetY = box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.25);
        const targetX = Math.max(15, Math.min(vp.width - 15, rawTargetX));
        const targetY = Math.max(15, Math.min(vp.height - 15, rawTargetY));

        // Glide smoothly across screen to target (desktop only)
        await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY }, ctx.isMobile);

        // Pre-click hesitation driven by persona and patienceIndex
        const persona = PERSONA_PRESETS[(ctx.persona as PersonaPresetKey) ?? 'casual'] ?? PERSONA_PRESETS.casual;
        const minHes = Math.round(persona.hesitationMs.min * patienceFactor);
        const maxHes = Math.round(persona.hesitationMs.max * patienceFactor);
        await new Promise((r) => setTimeout(r, minHes + Math.floor(Math.random() * (Math.max(minHes + 1, maxHes) - minHes + 1))));

        // Mouse down & up
        if (ctx.page.mouse && typeof ctx.page.mouse.down === 'function') {
          await ctx.page.mouse.down().catch(() => {});
          await this.moveVisualCursor(ctx.page, targetX, targetY, true, ctx.isMobile);
          await new Promise((r) => setTimeout(r, 70 + Math.floor(Math.random() * 60)));

          if (typeof ctx.page.mouse.up === 'function') {
            await ctx.page.mouse.up().catch(() => {});
          }
          await this.moveVisualCursor(ctx.page, targetX, targetY, false, ctx.isMobile);
        } else if (ctx.page.mouse && typeof ctx.page.mouse.click === 'function') {
          await this.moveVisualCursor(ctx.page, targetX, targetY, true, ctx.isMobile);
          await ctx.page.mouse.click(targetX, targetY).catch(() => {});
          await this.moveVisualCursor(ctx.page, targetX, targetY, false, ctx.isMobile);
        } else if (resolvedLocator) {
          await this.clickLikeHuman(ctx, resolvedLocator as unknown as ClickTarget);
        }

        // Post-click pause scaled by patience
        await new Promise((r) => setTimeout(r, Math.round((180 + Math.floor(Math.random() * 200)) * patienceFactor)));
        return;
      }
    }

    // Direct non-humanized click fallback
    if (resolvedLocator) {
      await this.clickLikeHuman(ctx, resolvedLocator as unknown as ClickTarget);
      return;
    }
    if (resolvedElement) {
      await this.clickLikeHuman(ctx, resolvedElement as unknown as ClickTarget);
      return;
    }
    if (box && box.width > 0 && box.height > 0 && ctx.page.mouse) {
      await ctx.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  }

  private async clickResolvedLocator(
    ctx: StepExecutionContext,
    resolved: XPathResolverResult,
    humanized = true,
  ): Promise<void> {
    if (!resolved?.locator) {
      if (resolved?.element) {
        await this.clickLikeHuman(ctx, resolved.element as unknown as ClickTarget);
      }
      return;
    }

    if (typeof (resolved.locator as any).scrollIntoViewIfNeeded === 'function') {
      await (resolved.locator as any).scrollIntoViewIfNeeded().catch(() => {});
      await new Promise((r) => setTimeout(r, 250));
    }

    let box = await resolved.locator.boundingBox().catch(() => null);
    if (!box || box.width === 0 || box.height === 0) {
      const rect = await resolved.locator.evaluate((el: HTMLElement) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      }).catch(() => null);
      if (rect && rect.width > 0 && rect.height > 0) {
        box = rect;
      }
    }

    if (box && box.width > 0 && box.height > 0) {
      await this.executeBoxClick(ctx, box, humanized, resolved.locator, resolved.element);
      return;
    }

    // Direct fallback
    await resolved.locator.click({ timeout: 5000 }).catch(async () => {
      await resolved.locator!.dispatchEvent('click');
    });
  }

  private async gentleReadingScroll(ctx: StepExecutionContext, totalDistance = 350): Promise<void> {
    const patienceFactor = ctx.patienceIndex ? Math.max(0.2, ctx.patienceIndex / 5.5) : 1.0;
    const bursts = 3 + Math.floor(Math.random() * 2); // 3-4 bursts
    const distPerBurst = Math.round(totalDistance / bursts);

    for (let b = 0; b < bursts; b++) {
      const jitteredDist = distPerBurst + (Math.floor(Math.random() * 30) - 15);
      if (ctx.page.mouse?.wheel) {
        const microSteps = 5;
        const perStep = Math.round(jitteredDist / microSteps);
        for (let s = 0; s < microSteps; s++) {
          await ctx.page.mouse.wheel(0, perStep).catch(() => {});
          await new Promise((r) => setTimeout(r, 30));
        }
      } else {
        await ctx.page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), jitteredDist).catch(() => {});
      }

      // Subtle mouse cursor drift across text area like a human reader
      if (!ctx.isMobile && ctx.page.mouse) {
        const targetX = Math.max(150, Math.min(850, this.mousePos.x + (Math.random() - 0.5) * 50));
        const targetY = Math.max(200, Math.min(650, this.mousePos.y + (Math.random() - 0.5) * 25));
        await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY }, ctx.isMobile);
      }

      // Natural pause reading content at current scroll level
      const readPause = Math.round((900 + Math.floor(Math.random() * 700)) * patienceFactor);
      await new Promise((r) => setTimeout(r, readPause));
    }
  }

  private async handleClick(
    step: Extract<Step, { type: 'click' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    const currentUrl = ctx.page.url?.() || '';
    if (step.selector.toLowerCase().includes('youtube')) {
      if (currentUrl.toLowerCase().includes('youtube.com')) {
        return;
      }
      if (currentUrl.includes('google.com/sorry') || currentUrl.includes('sorry/index')) {
        await ctx.page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' }).catch(() => {});
        return;
      }
    }

    // If clicking a search input and page is scrolled, restore to top first so it is in full view
    if (
      step.selector.includes('search_input') ||
      step.selector.includes('searchbox') ||
      step.selector.includes('name="q"') ||
      step.selector.includes('input#search')
    ) {
      await ctx.page.evaluate(() => {
        if (window.scrollY > 0) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 250));
    }

    const context = ctx.page.context?.();
    let newPagePromise: Promise<Page | null> | null = null;
    if (context && typeof context.on === 'function') {
      newPagePromise = new Promise<Page | null>((resolve) => {
        const handler = (p: Page) => {
          context.off('page', handler);
          resolve(p);
        };
        context.on('page', handler);
        setTimeout(() => {
          context.off('page', handler);
          resolve(null);
        }, 3000);
      });
    }

    let resolved: XPathResolverResult;
    try {
      resolved = await this.xpathResolver.resolve(ctx.page, step.selector, {
        taskId: ctx.taskId,
        profileId: ctx.profileId,
        stepIndex: ctx.stepIndex,
        timeoutMs: (step as any).timeoutMs ?? 35000,
        scrollUntilFound: true,
      });
    } catch (resolveErr) {
      if (ctx.llm) {
        const visualHandled = await this.tryVisionFallbackClick(step, ctx);
        if (visualHandled) {
          return;
        }
      }
      throw resolveErr;
    }

    // Resolve bounding box
    let box: { x: number; y: number; width: number; height: number } | null = null;

    if (resolved.locator) {
      if (typeof (resolved.locator as any).scrollIntoViewIfNeeded === 'function') {
        await (resolved.locator as any).scrollIntoViewIfNeeded().catch(() => {});
        await new Promise((r) => setTimeout(r, 350));
      }
      box = await resolved.locator.boundingBox();
      if (!box || box.width === 0 || box.height === 0) {
        await new Promise((r) => setTimeout(r, 200));
        box = await resolved.locator.boundingBox();
      }
      if (!box || box.width === 0 || box.height === 0) {
        const rect = await resolved.locator.evaluate((el: HTMLElement) => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        }).catch(() => null);
        if (rect && rect.width > 0 && rect.height > 0) {
          box = rect;
        }
      }
    } else if (resolved.element) {
      box = await ShadowDom.resolveBoundingBox(resolved.element);
    }

    if (box && box.width > 0 && box.height > 0) {
      await this.executeBoxClick(ctx, box, step.humanized ?? true, resolved.locator, resolved.element);
    } else if (ctx.isMobile && resolved.locator && typeof (resolved.locator as any).tap === 'function') {
      await (resolved.locator as any)
        .tap()
        .catch(() => this.clickLikeHuman(ctx, resolved.locator as unknown as ClickTarget));
    } else if (resolved.locator) {
      await this.clickLikeHuman(ctx, resolved.locator as unknown as ClickTarget);
    } else if (resolved.element) {
      await this.clickLikeHuman(ctx, resolved.element as unknown as ClickTarget);
    }

    if (newPagePromise) {
      const popupPage = await newPagePromise.catch(() => null);
      if (popupPage && !popupPage.isClosed()) {
        console.log(`[StepRunner] Click spawned a new browser page/tab (${popupPage.url()}). Updating active page context.`);
        ctx.page = popupPage;
        await popupPage.bringToFront().catch(() => {});
      }
    }
  }

  private async handleHover(
    step: Extract<Step, { type: 'hover' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    if (ctx.isMobile) {
      // Touch devices do not support hover states
      return;
    }

    const resolved = await this.xpathResolver.resolve(ctx.page, step.selector, {
      taskId: ctx.taskId,
      profileId: ctx.profileId,
      stepIndex: ctx.stepIndex,
      timeoutMs: step.timeoutMs ?? 15000,
      scrollUntilFound: true,
    });

    let box: { x: number; y: number; width: number; height: number } | null = null;
    if (resolved.locator) {
      await (resolved.locator as any).scrollIntoViewIfNeeded?.().catch(() => {});
      await new Promise((r) => setTimeout(r, 200));
      box = await resolved.locator.boundingBox();
    } else if (resolved.element) {
      box = await ShadowDom.resolveBoundingBox(resolved.element);
    }

    if (step.humanized && box && box.width > 0 && box.height > 0) {
      const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.25);
      const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.25);
      await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY }, ctx.isMobile);
      await new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 400)));
    } else if (resolved.locator) {
      await resolved.locator.hover().catch(() => {});
    }
  }

  private async handleMouseMove(
    step: Extract<Step, { type: 'mouseMove' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    if (ctx.isMobile) {
      // Touch devices do not have a floating mouse cursor
      return;
    }

    let target: Point | null = null;
    if (step.selector) {
      const resolved = await this.xpathResolver.resolve(ctx.page, step.selector, {
        taskId: ctx.taskId,
        profileId: ctx.profileId,
        stepIndex: ctx.stepIndex,
        timeoutMs: step.timeoutMs ?? 15000,
        scrollUntilFound: true,
      });
      let box: { x: number; y: number; width: number; height: number } | null = null;
      if (resolved.locator) {
        box = await resolved.locator.boundingBox();
      } else if (resolved.element) {
        box = await ShadowDom.resolveBoundingBox(resolved.element);
      }
      if (box && box.width > 0 && box.height > 0) {
        target = {
          x: box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.2),
          y: box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.2),
        };
      }
    } else if (step.x !== undefined && step.y !== undefined) {
      target = { x: step.x, y: step.y };
    } else {
      const vp = ctx.page.viewportSize?.() ?? { width: 1280, height: 720 };
      target = {
        x: Math.max(100, Math.min(vp.width - 100, this.mousePos.x + (Math.random() - 0.5) * 400)),
        y: Math.max(100, Math.min(vp.height - 100, this.mousePos.y + (Math.random() - 0.5) * 300)),
      };
    }

    if (target) {
      if (step.humanized) {
        await this.humanMoveMouse(ctx.page, target, ctx.isMobile);
      } else {
        if (ctx.page.mouse) await ctx.page.mouse.move(target.x, target.y);
        this.mousePos = target;
      }
    }
  }

  private async humanTypeInput(
    ctx: StepExecutionContext,
    text: string,
    options?: { shouldPressEnter?: boolean },
  ): Promise<void> {
    const patienceFactor = ctx.patienceIndex ? Math.max(0.2, ctx.patienceIndex / 5.5) : 1.0;
    const cleanText = text.endsWith('\n') ? text.slice(0, -1) : text;
    const shouldPressEnter = Boolean(options?.shouldPressEnter || text.endsWith('\n'));

    if (ctx.cdp) {
      // Type via Humanizer KeyboardEngine with stochastic delay & typo correction linked to profile persona
      await Humanizer.type(ctx.cdp, cleanText, {
        ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
        typingWpm: ctx.typingWpm,
        typoRate: ctx.typoRate,
      });
      if (shouldPressEnter) {
        await new Promise((r) => setTimeout(r, Math.round((500 + Math.floor(Math.random() * 300)) * patienceFactor)));
        await ctx.page.keyboard.press('Enter');
        await this.ensureSearchSubmitted(ctx);
      }
      return;
    }

    // Realistic human typing cadence with word pauses & typo simulation linked to profile persona
    const persona = PERSONA_PRESETS[(ctx.persona as PersonaPresetKey) ?? 'casual'] ?? PERSONA_PRESETS.casual;
    const effectiveWpm = ctx.typingWpm ?? persona.typingWpm;
    const baseCharMs = Math.round(60000 / (Math.max(10, effectiveWpm) * 5));
    const effectiveTypoRate = ctx.typoRate !== undefined
      ? (ctx.typoRate > 1 ? ctx.typoRate / 100 : ctx.typoRate)
      : (persona.typoRate ?? 0.02);

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      if (!char) continue;

      // Occasional typo simulation with backspace correction
      if (effectiveTypoRate > 0 && Math.random() < effectiveTypoRate && /[a-zA-Z]/.test(char)) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
        await ctx.page.keyboard.type(wrongChar);
        await new Promise((r) => setTimeout(r, 130 + Math.floor(Math.random() * 150)));
        await ctx.page.keyboard.press('Backspace');
        await new Promise((r) => setTimeout(r, 70 + Math.floor(Math.random() * 90)));
      }

      await ctx.page.keyboard.type(char);

      let strokeDelay = Math.round(baseCharMs * (0.65 + Math.random() * 0.7));
      if (char === ' ' || char === '|' || char === '!' || char === '.') {
        strokeDelay += Math.round((persona.hesitationMs.min * 0.6 + Math.random() * persona.hesitationMs.max * 0.4) * patienceFactor);
      }

      await new Promise((r) => setTimeout(r, strokeDelay));
    }

    // Post-typing hesitation before hitting Enter
    if (shouldPressEnter) {
      await new Promise((r) => setTimeout(r, Math.round((600 + Math.floor(Math.random() * 400)) * patienceFactor)));
      await ctx.page.keyboard.press('Enter');
      await this.ensureSearchSubmitted(ctx);
      await new Promise((r) => setTimeout(r, Math.round((400 + Math.floor(Math.random() * 300)) * patienceFactor)));
    }
  }

  /**
   * Clicks a resolved target, falling back to focusing it when the click
   * cannot land. Tolerates a target that exposes neither method rather than
   * throwing and failing the step.
   */
  private async focusOrFallback(target: unknown, ctx?: StepExecutionContext): Promise<void> {
    const el = target as {
      click?: () => Promise<unknown>;
      focus?: () => Promise<unknown>;
      boundingBox?: () => Promise<unknown>;
    };

    if (ctx && typeof el?.boundingBox === 'function') {
      // A locator click would be preferred, but it does not dispatch on this
      // engine, so a resolved click means a humanized mouse click.
      if (await this.clickLikeHuman(ctx, el as ClickTarget)) return;
    } else if (typeof el?.click === 'function') {
      const clicked = await el.click().then(
        () => true,
        () => false,
      );
      if (clicked) return;
    }

    if (typeof el?.focus === 'function') {
      await el.focus().catch(() => {});
    }
  }

  private async handleType(
    step: Extract<Step, { type: 'type' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    // If typing into a search input and page is scrolled, restore to top first so it is in full view
    if (
      step.selector.includes('search_input') ||
      step.selector.includes('searchbox') ||
      step.selector.includes('name="q"') ||
      step.selector.includes('input#search')
    ) {
      await ctx.page.evaluate(() => {
        if (window.scrollY > 0) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 250));
    }

    const resolved = await this.xpathResolver.resolve(ctx.page, step.selector, {
      taskId: ctx.taskId,
      profileId: ctx.profileId,
      stepIndex: ctx.stepIndex,
      timeoutMs: (step as any).timeoutMs ?? 25000,
      scrollUntilFound: true,
    });

    const shouldPressEnter = Boolean(
      (step as unknown as { pressEnter?: boolean }).pressEnter || step.text.endsWith('\n'),
    );
    const cleanText = step.text.endsWith('\n') ? step.text.slice(0, -1) : step.text;

    if (step.humanized) {
      // First click the element to ensure focus
      let box: { x: number; y: number; width: number; height: number } | null = null;
      const vp = ctx.page.viewportSize?.() || { width: 1280, height: 800 };

      if (resolved.locator) {
        if (typeof (resolved.locator as any).scrollIntoViewIfNeeded === 'function') {
          await (resolved.locator as any).scrollIntoViewIfNeeded().catch(() => {});
        }
        box = await resolved.locator.boundingBox();
        if (!box || box.width === 0 || box.height === 0 || box.y < 0 || box.y > vp.height) {
          await resolved.locator.evaluate((el: HTMLElement) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 250));
          box = await resolved.locator.boundingBox();
        }
      } else if (resolved.element) {
        box = await ShadowDom.resolveBoundingBox(resolved.element);
      }

      const patienceFactor = ctx.patienceIndex ? Math.max(0.2, ctx.patienceIndex / 5.5) : 1.0;

      if (ctx.isMobile) {
        if (box && box.width > 0 && box.height > 0) {
          const targetX = Math.max(10, Math.min(vp.width - 10, box.x + box.width / 2));
          const targetY = Math.max(10, Math.min(vp.height - 10, box.y + box.height / 2));
          await this.renderTouchRipple(ctx.page, targetX, targetY);
          if (ctx.cdp) {
            await Humanizer.touchTap(ctx.cdp, box, {
              ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
              patienceIndex: ctx.patienceIndex,
            });
          } else if (resolved.locator && typeof (resolved.locator as any).tap === 'function') {
            await (resolved.locator as any).tap().catch(() => ctx.page.mouse.click(targetX, targetY));
          } else {
            await ctx.page.mouse.click(targetX, targetY);
          }
        } else if (resolved.locator) {
          await this.focusOrFallback(resolved.locator, ctx);
        } else if (resolved.element) {
          await this.focusOrFallback(resolved.element, ctx);
        }
        await new Promise((r) => setTimeout(r, Math.round((200 + Math.floor(Math.random() * 150)) * patienceFactor)));
      } else if (ctx.cdp && box && box.width > 0 && box.height > 0) {
        const targetX = Math.max(15, Math.min(vp.width - 15, box.x + box.width / 2));
        const targetY = Math.max(15, Math.min(vp.height - 15, box.y + box.height / 2));
        await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY }, ctx.isMobile);
        await Humanizer.click(ctx.cdp, box, {
          ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
          patienceIndex: ctx.patienceIndex,
        });
      } else if (box && box.width > 0 && box.height > 0) {
        let rawTargetX = box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.25);
        let rawTargetY = box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.25);
        const targetX = Math.max(15, Math.min(vp.width - 15, rawTargetX));
        const targetY = Math.max(15, Math.min(vp.height - 15, rawTargetY));

        // Glide smoothly to input box
        await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY }, ctx.isMobile);
        await new Promise((r) => setTimeout(r, Math.round((120 + Math.floor(Math.random() * 120)) * patienceFactor)));

        // Click to focus
        if (ctx.page.mouse) {
          await ctx.page.mouse.down().catch(() => {});
          await this.moveVisualCursor(ctx.page, targetX, targetY, true, ctx.isMobile);
          await new Promise((r) => setTimeout(r, 60 + Math.floor(Math.random() * 50)));
          await ctx.page.mouse.up().catch(() => {});
          await this.moveVisualCursor(ctx.page, targetX, targetY, false, ctx.isMobile);
          await new Promise((r) => setTimeout(r, Math.round((220 + Math.floor(Math.random() * 200)) * patienceFactor)));
        }
      } else if (resolved.locator) {
        await this.focusOrFallback(resolved.locator, ctx);
      } else if (resolved.element) {
        await this.focusOrFallback(resolved.element, ctx);
      }

      // Explicitly guarantee DOM focus on the resolved locator. Guarded because
      // a resolved element wrapper is not guaranteed to expose focus(), and
      // losing focus is not a reason to fail the whole step.
      if (resolved.locator && typeof (resolved.locator as any).focus === 'function') {
        await (resolved.locator as any).focus().catch(() => {});
      }

      if (step.clearFirst) {
        // Clear via Google's native clear button if visible
        const clearBtn = ctx.page.locator('div[aria-label="Clear"], button[aria-label="Clear"], [aria-label*="Clear search" i]').first();
        if (await clearBtn.isVisible({ timeout: 250 }).catch(() => false)) {
          // Without this landing, the previous query stays in the box and the
          // next search re-runs the old one.
          await this.clickLikeHuman(ctx, clearBtn);
          await new Promise((r) => setTimeout(r, 150));
        }

        if (resolved.locator && typeof (resolved.locator as any).fill === 'function') {
          await (resolved.locator as any).fill('').catch(() => {});
        } else if (resolved.locator && typeof (resolved.locator as any).clear === 'function') {
          await (resolved.locator as any).clear().catch(() => {});
        }
        await ctx.page.keyboard.press('Control+A').catch(() => {});
        await ctx.page.keyboard.press('Meta+A').catch(() => {});
        await ctx.page.keyboard.press('Backspace').catch(() => {});
        await new Promise((r) => setTimeout(r, 120));
      } else if (resolved.locator && typeof (resolved.locator as any).clear === 'function') {
        await (resolved.locator as any).clear().catch(() => {});
      }

      await this.humanTypeInput(ctx, cleanText, { shouldPressEnter });
      return;
    }

    // Fallback native fill
    if (resolved.locator) {
      if (step.clearFirst) {
        await resolved.locator.clear().catch(() => {});
      }
      await resolved.locator.fill(cleanText);
      if (shouldPressEnter) {
        await ctx.page.keyboard.press('Enter');
        await this.ensureSearchSubmitted(ctx);
      }
    } else if (resolved.element) {
      if (step.clearFirst) {
        await resolved.element.evaluate((el: any) => { if (el) el.value = ''; }).catch(() => {});
      }
      await resolved.element.fill(cleanText);
      if (shouldPressEnter) {
        await ctx.page.keyboard.press('Enter');
        await this.ensureSearchSubmitted(ctx);
      }
    }
  }

  private async ensureSearchSubmitted(ctx: StepExecutionContext): Promise<void> {
    await new Promise((r) => setTimeout(r, 700));
    const currentUrl = ctx.page.url?.() || '';
    if (currentUrl.includes('youtube.com') && !currentUrl.includes('/results')) {
      await ctx.page.evaluate(() => {
        const active = document.activeElement as HTMLInputElement | null;
        const input = (active?.tagName === 'INPUT'
          ? active
          : document.querySelector('input.ytSearchboxComponentInput, input#search, input[name="search_query"]')) as HTMLInputElement | null;
        const form = input?.closest('form');
        if (form) {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
        } else {
          const btn = document.querySelector('button.ytSearchboxComponentSearchButton, button#search-icon-legacy, button[title="Search"]') as HTMLButtonElement | null;
          btn?.click();
        }
      }).catch(() => {});
    } else if (currentUrl.includes('google.') && !currentUrl.includes('/search')) {
      await ctx.page.evaluate(() => {
        const active = document.activeElement as HTMLInputElement | null;
        const input = (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
          ? active
          : document.querySelector('input[name="q"], textarea[name="q"]')) as HTMLElement | null;
        const form = input?.closest('form');
        if (form) {
          if (typeof (form as any).requestSubmit === 'function') {
            (form as any).requestSubmit();
          } else {
            form.submit();
          }
        } else {
          const btn = document.querySelector('input[name="btnK"], button[type="submit"]') as HTMLElement | null;
          btn?.click();
        }
      }).catch(() => {});
    }
  }

  private async handleScroll(
    step: Extract<Step, { type: 'scroll' }>,
    ctx: StepExecutionContext,
  ): Promise<void> {
    const patienceFactor = ctx.patienceIndex ? Math.max(0.2, ctx.patienceIndex / 5.5) : 1.0;

    // Authentic mobile touch swipe gesture if mobile profile
    if (ctx.isMobile) {
      if (step.kinetic && ctx.cdp) {
        await Humanizer.touchSwipe(ctx.cdp, {
          direction: step.direction,
          amount: step.amount,
          seed: ctx.seed,
        });
        await new Promise((r) => setTimeout(r, Math.round((500 + Math.floor(Math.random() * 400)) * patienceFactor)));
        return;
      }
      const deltaY = step.direction === 'down' ? step.amount : -step.amount;
      await ctx.page.evaluate((dy: number) => window.scrollBy({ top: dy, behavior: 'smooth' }), deltaY);
      return;
    }

    if (step.kinetic && ctx.cdp) {
      await Humanizer.scroll(ctx.cdp, {
        direction: step.direction,
        amount: step.amount,
        patienceIndex: ctx.patienceIndex,
        ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
      });
      return;
    }

    if (step.kinetic) {
      // Smooth kinetic mouse wheel scrolling with realistic human finger increments
      const steps = 14;
      const stepDelta = Math.round(step.amount / steps);
      const dy = step.direction === 'down' ? stepDelta : -stepDelta;
      for (let i = 0; i < steps; i++) {
        await ctx.page.mouse.wheel(0, dy);
        await new Promise((r) => setTimeout(r, 45 + Math.floor(Math.random() * 35)));
      }
      // Pause after scrolling to simulate reading
      await new Promise((r) => setTimeout(r, Math.round((600 + Math.floor(Math.random() * 400)) * patienceFactor)));
      return;
    }

    const deltaY = step.direction === 'down' ? step.amount : -step.amount;
    await ctx.page.evaluate((dy: number) => window.scrollBy(0, dy), deltaY);
  }

  private async handleExtract(
    step: Extract<Step, { type: 'extract' }>,
    ctx: StepExecutionContext,
  ): Promise<{ key: string; value: string }> {
    const resolved = await this.xpathResolver.resolve(ctx.page, step.selector, {
      taskId: ctx.taskId,
      profileId: ctx.profileId,
      stepIndex: ctx.stepIndex,
    });

    let value: string | null = null;

    if (step.attribute) {
      if (resolved.locator) {
        value = await resolved.locator.getAttribute(step.attribute);
      } else if (resolved.element) {
        value = await resolved.element.getAttribute(step.attribute);
      }
    } else {
      if (resolved.locator) {
        value = await resolved.locator.textContent();
      } else if (resolved.element) {
        value = await resolved.element.textContent();
      }
    }

    return {
      key: step.as,
      value: (value ?? '').trim(),
    };
  }

  private async handleScreenshot(
    step: Extract<Step, { type: 'screenshot' }>,
    ctx: StepExecutionContext,
  ): Promise<string> {
    const dir = ctx.screenshotsDir ?? os.tmpdir();
    const filename = `${step.name}_${Date.now()}.png`;
    const targetPath = path.join(dir, filename);

    await ctx.page.screenshot({
      path: targetPath,
      fullPage: false,
    });

    return targetPath;
  }

  private async handleSleep(
    step: Extract<Step, { type: 'sleep' }>,
    ctx?: StepExecutionContext,
  ): Promise<void> {
    const rawDuration =
      step.minMs === step.maxMs
        ? step.minMs
        : Math.floor(step.minMs + Math.random() * (step.maxMs - step.minMs + 1));

    const persona = ctx?.persona
      ? PERSONA_PRESETS[ctx.persona as PersonaPresetKey] ?? PERSONA_PRESETS.casual
      : PERSONA_PRESETS.casual;

    const patienceFactor = ctx?.patienceIndex ? Math.max(0.2, ctx.patienceIndex / 5.5) : 1.0;
    const duration = Math.round(rawDuration * (persona.readingMultiplier ?? 1.0) * patienceFactor);

    if (duration <= 0) return;

    if (duration < 2500 || !ctx?.page) {
      await new Promise((resolve) => setTimeout(resolve, duration));
      return;
    }

    // Content-Aware human interaction & dwell telemetry on ANY website (PC vs Mobile)
    const endTime = Date.now() + duration;

    while (Date.now() < endTime) {
      const remaining = endTime - Date.now();
      if (remaining <= 500) {
        await new Promise((r) => setTimeout(r, remaining));
        break;
      }

      // Humanized chunk duration
      const chunkMs = Math.min(remaining, Math.floor(3000 + Math.random() * 4500));
      await new Promise((r) => setTimeout(r, chunkMs * 0.65));

      if (Date.now() >= endTime) break;

      try {
        const vp = ctx.page.viewportSize?.() ?? { width: 1280, height: 720 };
        const isMobile = Boolean(ctx.isMobile);

        // 1. Dynamic Media/Video detection on any website
        let playerBox: { x: number; y: number; width: number; height: number } | null = null;
        try {
          const mediaLoc = ctx.page
            .locator('#movie_player, .html5-video-player, video, [role="region"][aria-label*="video" i]')
            .first();
          if (await mediaLoc.isVisible({ timeout: 200 }).catch(() => false)) {
            playerBox = await mediaLoc.boundingBox().catch(() => null);
          }
        } catch {}

        // Check for skippable video ads (defaults to enabled, controllable via ctx.variables.skipAds !== 'false')
        const shouldSkipAds = ctx.variables?.['skipAds'] !== 'false';
        if (shouldSkipAds) {
          // The shared skipper hovers the player first: YouTube keeps the skip
          // button unclickable until the control bar is shown, which is why a
          // plain visibility check on the button never found it.
          const skipped = await trySkipAd(ctx.page, ctx.humanizer).catch(
            (): AdSkipResult => ({ skipped: false }),
          );
          if (skipped.skipped) {
            console.log(`[StepRunner] Auto-skipped video ad during playback dwell (${skipped.matched}).`);
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
        }

        // Auto-dismiss interstitial video popups / modals (Try Premium, surveys, sign-in nag)
        const shouldDismissPopups = ctx.variables?.['autoDismissPopups'] !== 'false';
        if (shouldDismissPopups) {
          try {
            const dismissBtn = ctx.page
              .locator(
                'button[aria-label*="Dismiss" i], yt-button-shape:has-text("Dismiss") button, yt-button-shape:has-text("No thanks") button, button:has-text("Dismiss"), button:has-text("No thanks"), button:has-text("Skip trial"), tp-yt-paper-dialog button:has-text("Cancel")',
              )
              .first();
            if (await dismissBtn.isVisible({ timeout: 150 }).catch(() => false)) {
              if (await this.clickLikeHuman(ctx, dismissBtn)) {
                console.log('[StepRunner] Auto-dismissed video interstitial popup.');
                await new Promise((r) => setTimeout(r, 400));
              }
            }
          } catch {}
        }

        // 2. Article / Long-form text content detection
        let hasArticle = false;
        if (!playerBox) {
          try {
            const articleLoc = ctx.page
              .locator('article, main, .article-body, .entry-content, .post-content, [role="article"]')
              .first();
            hasArticle = await articleLoc.isVisible({ timeout: 120 }).catch(() => false);
          } catch {}
        }

        if (isMobile) {
          // --- Authentic Mobile (Android) Dwell Behaviors ---
          // Real mobile devices do NOT display or move a mouse cursor.
          // They execute authentic thumb reading swipes and pauses.
          const roll = Math.random();
          if (roll < 0.65) {
            const swipeAmount = Math.round(150 + Math.random() * 250);
            const direction = Math.random() < 0.85 ? 'down' : 'up';
            if (ctx.cdp) {
              await Humanizer.touchSwipe(ctx.cdp, {
                direction,
                amount: swipeAmount,
                seed: ctx.seed,
              }).catch(() => {});
            } else {
              const dy = direction === 'down' ? swipeAmount : -swipeAmount;
              await ctx.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dy).catch(() => {});
            }
          }
          // 35%: Natural reading pause
        } else {
          // --- Desktop (PC) Dwell Behaviors ---
          if (playerBox && playerBox.width > 120 && playerBox.height > 100) {
            // Media/video page: mouse glide over controls (checking progress) or player center
            const roll = Math.random();
            if (roll < 0.60) {
              const isControlArea = Math.random() < 0.45;
              const targetX = Math.round(playerBox.x + playerBox.width * (0.15 + Math.random() * 0.7));
              const targetY = isControlArea
                ? Math.round(playerBox.y + playerBox.height * (0.82 + Math.random() * 0.12)) // bottom controls
                : Math.round(playerBox.y + playerBox.height * (0.25 + Math.random() * 0.45)); // center
              await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY });
            } else if (roll < 0.85) {
              const targetX = Math.round(vp.width * 0.72 + Math.random() * (vp.width * 0.2));
              const targetY = Math.round(150 + Math.random() * 400);
              await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY });
            } else {
              const scrollAmount = (Math.random() > 0.4 ? 1 : -1) * Math.round(40 + Math.random() * 70);
              if (ctx.page.mouse?.wheel) {
                await ctx.page.mouse.wheel(0, scrollAmount).catch(() => {});
              }
            }
          } else if (hasArticle) {
            // Article / News / Blog reading simulation
            const roll = Math.random();
            if (roll < 0.60) {
              const scrollAmount = Math.round(180 + Math.random() * 220);
              if (ctx.cdp) {
                await Humanizer.scroll(ctx.cdp, { direction: 'down', amount: scrollAmount }).catch(() => {});
              } else if (ctx.page.mouse?.wheel) {
                await ctx.page.mouse.wheel(0, scrollAmount).catch(() => {});
              }
            } else if (roll < 0.85) {
              // Mouse cursor drift over article text / headings
              const targetX = Math.round(vp.width * 0.25 + Math.random() * (vp.width * 0.45));
              const targetY = Math.round(180 + Math.random() * (vp.height * 0.5));
              await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY });
            }
          } else {
            // General page dwell: occasional organic mouse wander
            if (Math.random() < 0.45) {
              const targetX = Math.max(100, Math.min(vp.width - 100, this.mousePos.x + (Math.random() - 0.5) * 350));
              const targetY = Math.max(100, Math.min(vp.height - 100, this.mousePos.y + (Math.random() - 0.5) * 250));
              await this.humanMoveMouse(ctx.page, { x: targetX, y: targetY });
            }
          }
        }
      } catch {
        // Continue dwell loop if interaction skipped
      }
    }
  }

  /**
   * Runs a nested step list `times` times.
   *
   * Each inner step goes back through `run()`, so it gets the same variable
   * interpolation, CAPTCHA checks and visual self-healing as a top-level step.
   * Interpolation happens per iteration, which is what lets a pool variable
   * inside the body draw a different value on every round.
   */
  private async handleRepeat(
    step: Extract<Step, { type: 'repeat' }>,
    ctx: StepExecutionContext,
  ): Promise<Record<string, unknown>> {
    const label = step.label ? ` "${step.label}"` : '';

    // `times` may be a number or a `{{variable}}` reference resolved to a
    // numeric string. Coerce here so a bad value fails with a clear message
    // instead of looping zero times.
    const parsedTimes = typeof step.times === 'number' ? step.times : Number(String(step.times).trim());
    if (!Number.isFinite(parsedTimes) || parsedTimes < 1) {
      throw new TaskError(
        'POLICY_VIOLATION',
        `Repeat step${label}: 'times' must resolve to a number of at least 1, got '${String(step.times)}'`,
        { stepIndex: ctx.stepIndex, times: step.times },
      );
    }
    const total = Math.min(50, Math.round(parsedTimes));

    const iterations: number[] = [];
    const failures: string[] = [];

    console.log(`[StepRunner] Repeat${label}: starting ${total} iteration(s)`);

    for (let i = 0; i < total; i++) {
      try {
        // A previous iteration may have navigated or opened a tab, so refresh
        // the page handle before continuing.
        if (ctx.resolvePage) {
          const live = await ctx.resolvePage();
          if (live) {
            ctx.page = live;
          }
        }

        for (let j = 0; j < step.steps.length; j++) {
          const inner = step.steps[j] as unknown as Step;
          await this.run(inner, { ...ctx, stepIndex: ctx.stepIndex + j / 1000 + i / 10000 });
        }

        iterations.push(i + 1);
        console.log(`[StepRunner] Repeat${label}: iteration ${i + 1}/${total} complete`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`iteration ${i + 1}: ${message}`);
        console.error(`[StepRunner] Repeat${label}: iteration ${i + 1}/${total} failed: ${message}`);

        if (!step.continueOnError) {
          throw new TaskError(
            'INTERNAL',
            `Repeat step${label} failed on iteration ${i + 1}/${total}: ${message}`,
            { stepIndex: ctx.stepIndex, iteration: i + 1, total, cause: message },
          );
        }
      }
    }

    return {
      repeatLabel: step.label ?? null,
      repeatRequested: total,
      repeatCompleted: iterations.length,
      repeatFailed: failures.length,
      ...(failures.length > 0 ? { repeatFailures: failures } : {}),
    };
  }

  private async handleLlm(
    step: Extract<Step, { type: 'llm' }>,
    ctx: StepExecutionContext,
  ): Promise<Record<string, unknown>> {
    if (!ctx.llm) {
      throw new TaskError('POLICY_VIOLATION', 'LLM service not available in execution context', {
        stepIndex: ctx.stepIndex,
      });
    }

    const humanizer =
      ctx.humanizer ?? new Humanizer(typeof ctx.seed === 'number' ? ctx.seed : 42);

    const run = () =>
      runLlmStep(ctx.page, humanizer, ctx.llm as LlmService, {
        goal: step.goal,
        maxIterations: step.maxIterations,
        resolvePage: ctx.resolvePage,
        // A per-run seed, so repeated runs of one task do not always open the
        // same result.
        selectionSeed: ctx.seed ?? ctx.runId,
        persona: readPersonaContext(ctx),
        // A challenge found mid-step is handed to the captcha pipeline, which
        // either solves it with vision or pauses the run and alerts.
        onCaptcha: async () => {
          await ctx.captchaHandler?.checkAndHandle(ctx.page, ctx.runId, ctx.profileId);
        },
      });

    const toArtifacts = (result: Awaited<ReturnType<typeof run>>) => ({
      iterations: result.iterations,
      estimatedCostUsd: Number((result.iterations * 0.002).toFixed(4)),
      finalUrl: result.finalUrl,
      // The trail of what the model tried, so a run that "did nothing" can be
      // read back from the run log instead of guessed at.
      llmActions: result.history,
    });

    // `optional: true` marks a judgement call that should never fail the run â€”
    // a page the model cannot make sense of should not abort a browsing task.
    if (step.optional) {
      try {
        return toArtifacts(await run());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[StepRunner] Optional LLM step skipped: ${message}`);
        return { iterations: 0, estimatedCostUsd: 0, skipped: true, reason: message };
      }
    }

    return toArtifacts(await run());
  }

  private async handleEngage(
    step: Extract<Step, { type: 'engage' }>,
    ctx: StepExecutionContext,
  ): Promise<Record<string, unknown>> {
    const action = step.action;
    const isOptional = step.optional !== false;
    const timeoutMs = step.timeoutMs ?? 10000;

    // Check probabilistic action gate (Anti-Sybil Behavioral Variance)
    if (typeof step.probability === 'number' && step.probability < 1) {
      const roll = Math.random();
      if (roll > step.probability) {
        console.log(`[StepRunner] Engagement action "${action}" skipped by probability gate (${Math.round(step.probability * 100)}% chance, rolled ${Math.round(roll * 100)}%)`);
        return { action, status: 'skipped_probability' };
      }
    }

    console.log(`[StepRunner] Executing engagement action: "${action}" (optional: ${isOptional})`);

    const dismissAnySignInDialog = async (): Promise<boolean> => {
      try {
        const dialogCancel = ctx.page
          .locator(
            'tp-yt-paper-dialog button:has-text("Cancel"), [role="dialog"] button:has-text("Cancel"), button[aria-label*="Dismiss" i], yt-button-shape:has-text("Dismiss") button',
          )
          .first();
        if (await dialogCancel.isVisible({ timeout: 800 }).catch(() => false)) {
          // Without this click landing, the sign-in dialog stays on screen and
          // silently swallows every engagement action that follows it.
          if (!(await this.clickLikeHuman(ctx, dialogCancel))) return false;
          return true;
        }
      } catch {}
      return false;
    };

    try {
      switch (action) {
        case 'skip_ad': {
          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:skip_ad', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs: Math.min(timeoutMs, 4000),
          }).catch(() => null);

          if (resolved?.locator) {
            if (!(await this.clickLikeHuman(ctx, resolved.locator))) {
              return { action: 'skip_ad', status: 'error_skipped' };
            }
            console.log('[StepRunner] Engagement: Skipped video ad.');
            return { action: 'skip_ad', status: 'skipped' };
          }
          if (isOptional) {
            console.log('[StepRunner] Engagement: No skippable ad visible, continuing.');
            return { action: 'skip_ad', status: 'no_ad' };
          }
          throw new TaskError('STEP_SELECTOR_MISSING', 'No skippable ad found to skip.');
        }

        case 'like': {
          const currentUrl = ctx.page.url?.() || '';
          if (currentUrl.includes('youtube.com/watch')) {
            await ctx.page.evaluate(() => {
              const bar = document.querySelector('like-button-view-model, #top-row, ytd-watch-metadata');
              if (bar) {
                const rect = bar.getBoundingClientRect();
                if (rect.top < 0 || rect.bottom > window.innerHeight) {
                  bar.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 500));
          }

          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:like', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs: Math.min(timeoutMs, 8000),
          }).catch(() => null);

          if (!resolved?.locator) {
            if (isOptional) {
              console.log('[StepRunner] Engagement: Like button not visible or found, skipping.');
              return { action: 'like', status: 'not_found' };
            }
            throw new TaskError('STEP_SELECTOR_MISSING', 'Like button not found.');
          }

          const ariaPressed = await resolved.locator.getAttribute('aria-pressed').catch(() => null);
          const ariaLabel = (await resolved.locator.getAttribute('aria-label').catch(() => '')) || '';
          if (ariaPressed === 'true' || ariaLabel.toLowerCase().includes('unlike') || ariaLabel.toLowerCase().includes('remove like')) {
            console.log('[StepRunner] Engagement: Video already liked.');
            return { action: 'like', status: 'already_liked' };
          }

          // Visual mouse cursor glide and authentic human click
          await this.clickResolvedLocator(ctx, resolved, true);

          await new Promise((r) => setTimeout(r, 600));
          const hadDialog = await dismissAnySignInDialog();
          if (hadDialog) {
            console.log('[StepRunner] Engagement: Profile not signed in for like; dismissed prompt.');
            return { action: 'like', status: 'sign_in_required' };
          }

          return { action: 'like', status: 'liked' };
        }

        case 'dislike': {
          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:dislike', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs: Math.min(timeoutMs, 8000),
          }).catch(() => null);

          if (!resolved?.locator) {
            if (isOptional) {
              return { action: 'dislike', status: 'not_found' };
            }
            throw new TaskError('STEP_SELECTOR_MISSING', 'Dislike button not found.');
          }

          await this.clickResolvedLocator(ctx, resolved, true);

          await new Promise((r) => setTimeout(r, 600));
          await dismissAnySignInDialog();
          return { action: 'dislike', status: 'disliked' };
        }

        case 'subscribe': {
          const currentUrl = ctx.page.url?.() || '';
          if (currentUrl.includes('youtube.com/watch')) {
            const alreadySubscribed = await ctx.page.evaluate(() => {
              const subBtn = document.querySelector('ytd-watch-metadata #subscribe-button button, #subscribe-button button');
              if (!subBtn) return false;
              const text = subBtn.textContent?.trim().toLowerCase() || '';
              const aria = subBtn.getAttribute('aria-label')?.toLowerCase() || '';
              return text.includes('subscribed') || aria.includes('subscribed') || aria.includes('current setting');
            }).catch(() => false);

            if (alreadySubscribed) {
              console.log('[StepRunner] Engagement: Channel already subscribed.');
              return { action: 'subscribe', status: 'already_subscribed' };
            }

            await ctx.page.evaluate(() => {
              const sub = document.querySelector('#subscribe-button, ytd-watch-metadata #subscribe-button');
              if (sub) {
                const rect = sub.getBoundingClientRect();
                if (rect.top < 0 || rect.bottom > window.innerHeight) {
                  sub.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 500));
          }

          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:subscribe', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs: Math.min(timeoutMs, 8000),
          }).catch(() => null);

          if (!resolved?.locator) {
            if (isOptional) {
              console.log('[StepRunner] Engagement: Subscribe button not found (may already be subscribed).');
              return { action: 'subscribe', status: 'not_found_or_subscribed' };
            }
            throw new TaskError('STEP_SELECTOR_MISSING', 'Subscribe button not found.');
          }

          const text = (await resolved.locator.textContent().catch(() => '')) || '';
          const aria = (await resolved.locator.getAttribute('aria-label').catch(() => '')) || '';
          if (text.toLowerCase().includes('subscribed') || aria.toLowerCase().includes('subscribed')) {
            console.log('[StepRunner] Engagement: Already subscribed.');
            return { action: 'subscribe', status: 'already_subscribed' };
          }

          // Visual mouse cursor glide and authentic human click
          await this.clickResolvedLocator(ctx, resolved, true);

          await new Promise((r) => setTimeout(r, 600));
          const hadDialog = await dismissAnySignInDialog();
          if (hadDialog) {
            console.log('[StepRunner] Engagement: Profile not signed in to subscribe; dismissed prompt.');
            return { action: 'subscribe', status: 'sign_in_required' };
          }

          return { action: 'subscribe', status: 'subscribed' };
        }

        case 'unsubscribe': {
          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:unsubscribe', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs,
          }).catch(() => null);

          if (!resolved?.locator) {
            if (isOptional) return { action: 'unsubscribe', status: 'not_found' };
            throw new TaskError('STEP_SELECTOR_MISSING', 'Unsubscribe button not found.');
          }

          await this.clickResolvedLocator(ctx, resolved, true);
          await new Promise((r) => setTimeout(r, 500));
          const confirmBtn = ctx.page
            .locator('yt-button-shape:has-text("Unsubscribe") button, button:has-text("Unsubscribe")')
            .last();
          if (await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await this.clickLikeHuman(ctx, confirmBtn);
          }
          return { action: 'unsubscribe', status: 'unsubscribed' };
        }

        case 'comment': {
          const commentText = step.commentText;
          if (!commentText) {
            throw new TaskError('POLICY_VIOLATION', 'commentText is required for engage action "comment"');
          }

          // Smoothly scroll down to load YouTube comments section
          await ctx.page.evaluate(() => {
            const comments = document.querySelector('#comments, ytd-comments');
            if (comments) {
              comments.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              window.scrollBy({ top: 600, behavior: 'smooth' });
            }
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 1200));

          const inputRes = await this.xpathResolver.resolve(ctx.page, 'intent:comment_input', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs: Math.min(timeoutMs, 10000),
          }).catch(() => null);

          if (!inputRes?.locator) {
            if (isOptional) {
              console.log('[StepRunner] Engagement: Comment input not accessible or comments disabled.');
              return { action: 'comment', status: 'not_accessible' };
            }
            throw new TaskError('STEP_SELECTOR_MISSING', 'Comment input not found.');
          }

          // The comment box must actually receive focus before typing into it.
          if (!(await this.clickLikeHuman(ctx, inputRes.locator))) {
            await inputRes.locator.focus().catch(() => {});
          }
          await new Promise((r) => setTimeout(r, 500));

          const hadDialog = await dismissAnySignInDialog();
          if (hadDialog) {
            console.log('[StepRunner] Engagement: Sign in required to comment.');
            return { action: 'comment', status: 'sign_in_required' };
          }

          // Modern YouTube expands to contenteditable-root once placeholder is clicked
          const editableBox = ctx.page.locator('#comments #contenteditable-root, ytd-commentbox #contenteditable-root, div#contenteditable-root').first();
          if (await editableBox.isVisible({ timeout: 2500 }).catch(() => false)) {
            await this.clickLikeHuman(ctx, editableBox);
            await this.humanTypeInput(ctx, commentText, { shouldPressEnter: false });
          } else {
            if (!(await this.clickLikeHuman(ctx, inputRes.locator))) {
              await inputRes.locator.focus().catch(() => {});
            }
            await this.humanTypeInput(ctx, commentText, { shouldPressEnter: false });
          }
          await new Promise((r) => setTimeout(r, 800));

          const submitRes = await this.xpathResolver.resolve(ctx.page, 'intent:comment_submit', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs: 5000,
          }).catch(() => null);

          if (submitRes?.locator) {
            await this.clickResolvedLocator(ctx, submitRes, true);
            console.log('[StepRunner] Engagement: Posted comment successfully.');
            return { action: 'comment', status: 'posted', commentText };
          }

          if (isOptional) return { action: 'comment', status: 'submit_not_found' };
          throw new TaskError('STEP_SELECTOR_MISSING', 'Comment submit button not found.');
        }

        case 'read_description': {
          const currentUrl = ctx.page.url?.() || '';
          if (currentUrl.includes('youtube.com/watch')) {
            await ctx.page.evaluate(() => {
              const desc = document.querySelector('ytd-watch-metadata #description-inner, #description, ytd-text-inline-expander');
              if (desc) {
                const rect = desc.getBoundingClientRect();
                if (rect.top < 0 || rect.bottom > window.innerHeight) {
                  desc.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 500));
          }

          let expandRes = await this.xpathResolver.resolve(ctx.page, 'intent:expand_description', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs: Math.min(timeoutMs, 6000),
          }).catch(() => null);

          let expanded = false;
          if (expandRes?.locator) {
            await this.clickResolvedLocator(ctx, expandRes, true);
            console.log('[StepRunner] Engagement: Expanded video description with visual click.');
            expanded = true;
          } else {
            // Check if already expanded
            const alreadyExpanded = await ctx.page.evaluate(() => {
              const collapse = document.querySelector('#collapse, tp-yt-paper-button#collapse, ytd-text-inline-expander #collapse');
              return Boolean(collapse && !collapse.hasAttribute('hidden'));
            }).catch(() => false);
            if (alreadyExpanded) {
              expanded = true;
            }
          }

          if (expanded) {
            // Initial reading pause
            await new Promise((r) => setTimeout(r, 1200 + Math.floor(Math.random() * 800)));

            // Gently scroll downwards through description while reading
            await this.gentleReadingScroll(ctx, 360);

            // Locate and click collapse button ("Show less")
            const collapseRes = await this.xpathResolver.resolve(ctx.page, 'intent:collapse_description', {
              taskId: ctx.taskId,
              profileId: ctx.profileId,
              stepIndex: ctx.stepIndex,
              timeoutMs: 6000,
            }).catch(() => null);

            if (collapseRes?.locator) {
              await this.clickResolvedLocator(ctx, collapseRes, true);
              console.log('[StepRunner] Engagement: Collapsed video description with visual click.');
            } else {
              await ctx.page.evaluate(() => {
                const collapse = document.querySelector(
                  '#collapse, tp-yt-paper-button#collapse, ytd-text-inline-expander #collapse, #description #collapse',
                ) as HTMLElement | null;
                if (collapse && !collapse.hasAttribute('hidden')) {
                  collapse.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  collapse.click();
                }
              }).catch(() => {});
            }

            await new Promise((r) => setTimeout(r, 600));

            // Smoothly glide back up to action bar (Like, Subscribe, etc.)
            await ctx.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
            await new Promise((r) => setTimeout(r, 600));

            return { action: 'read_description', status: 'read' };
          }

          if (isOptional) {
            console.log('[StepRunner] Engagement: Description expand button not found or already fully shown.');
            return { action: 'read_description', status: 'not_found' };
          }
          throw new TaskError('STEP_SELECTOR_MISSING', 'Description expand button not found.');
        }

        case 'share': {
          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:share', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs,
          }).catch(() => null);
          if (resolved?.locator) {
            await this.clickResolvedLocator(ctx, resolved, true);
            await new Promise((r) => setTimeout(r, 600));
            await dismissAnySignInDialog();
            return { action: 'share', status: 'opened' };
          }
          if (isOptional) return { action: 'share', status: 'not_found' };
          throw new TaskError('STEP_SELECTOR_MISSING', 'Share button not found.');
        }

        case 'save': {
          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:save', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs,
          }).catch(() => null);
          if (resolved?.locator) {
            await this.clickResolvedLocator(ctx, resolved, true);
            await new Promise((r) => setTimeout(r, 600));
            await dismissAnySignInDialog();
            return { action: 'save', status: 'saved' };
          }
          if (isOptional) return { action: 'save', status: 'not_found' };
          throw new TaskError('STEP_SELECTOR_MISSING', 'Save button not found.');
        }

        case 'bell': {
          const resolved = await this.xpathResolver.resolve(ctx.page, 'intent:bell', {
            taskId: ctx.taskId,
            profileId: ctx.profileId,
            stepIndex: ctx.stepIndex,
            timeoutMs,
          }).catch(() => null);
          if (resolved?.locator) {
            await this.clickResolvedLocator(ctx, resolved, true);
            await new Promise((r) => setTimeout(r, 600));
            await dismissAnySignInDialog();
            return { action: 'bell', status: 'toggled' };
          }
          if (isOptional) return { action: 'bell', status: 'not_found' };
          throw new TaskError('STEP_SELECTOR_MISSING', 'Notification bell not found.');
        }


        default:
          throw new TaskError('POLICY_VIOLATION', `Unrecognized engagement action: "${action}"`);
      }
    } catch (err) {
      if (isOptional) {
        console.warn(`[StepRunner] Optional engagement "${action}" encountered error, skipping safely:`, err);
        return { action, status: 'error_skipped', error: String(err) };
      }
      throw err;
    }
  }
}

/**
 * Builds the persona payload handed to the model, from the variables the run
 * already publishes.
 *
 * The `persona.*` variables are produced once in RunService and are what
 * workflows interpolate, so reading them here keeps one source of truth: if a
 * step can say `{{persona.trustScore}}`, the model is told the same number.
 * Before this, the LLM step ignored the profile entirely.
 */
export function readPersonaContext(ctx: StepExecutionContext): LlmPersonaContext | null {
  const vars = ctx.variables ?? {};
  const read = (key: string): string | undefined => {
    const value = vars[key];
    return value === undefined || value === null || value === '' ? undefined : String(value);
  };
  const num = (key: string): number | undefined => {
    const raw = read(key);
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const name = read('persona.name') ?? ctx.persona;
  const persona: LlmPersonaContext = {
    ...(name ? { name } : {}),
    ...(read('persona.niche') ? { niche: read('persona.niche') as string } : {}),
    ...(num('persona.trustScore') !== undefined
      ? { trustScore: num('persona.trustScore') as number }
      : {}),
    ...(read('persona.maturationStage')
      ? { maturationStage: read('persona.maturationStage') as string }
      : {}),
    ...(num('persona.engagementRate') !== undefined
      ? { engagementRate: num('persona.engagementRate') as number }
      : {}),
    ...(num('persona.patienceIndex') !== undefined
      ? { patienceIndex: num('persona.patienceIndex') as number }
      : {}),
    ...(num('persona.typingWpm') !== undefined
      ? { typingWpm: num('persona.typingWpm') as number }
      : {}),
  };

  return Object.keys(persona).length > 0 ? persona : null;
}
