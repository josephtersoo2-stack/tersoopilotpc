import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';

import type { Humanizer } from '../crosshair/Humanizer';
import { CAPTCHA_PROMPT } from '../llm/prompts';
import type { LlmService } from '../llm/LlmService';
import type { CaptchaEventRepo } from '../persistence/repos/captchaEventRepo';
import type { ProfileRepo } from '../persistence/repos/profileRepo';
import type { SettingsRepo } from '../persistence/repos/settingsRepo';
import { TersooError } from '../util/errors';
import { detectCaptcha } from './captchaDetector';

export class CaptchaHandler {
  constructor(
    private llm: LlmService,
    private humanizer: Humanizer,
    private captchaRepo: CaptchaEventRepo,
    private profileRepo: ProfileRepo,
    private settingsRepo: SettingsRepo,
    private artifactsDir: string,
  ) {}

  /**
   * Validation guard rails around model-supplied coordinates.
   */
  private lastRejection: string | null = null;

  /**
   * Validates a coordinate pair returned by the vision model.
   *
   * The screenshot is untrusted input, and so is the model's reading of it: a
   * page can embed text that steers the model toward an arbitrary point on
   * screen. Coordinates are therefore required to be finite numbers inside the
   * current viewport before any click or drag is dispatched, and a `drag` must
   * also supply an in-bounds endpoint.
   */
  private assertPointInViewport(
    point: { x: number; y: number },
    label: string,
    viewport: { width: number; height: number },
  ): void {
    const { x, y } = point;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TersooError(
        'CAPTCHA_FAILED',
        `Model returned a non-finite ${label} coordinate; refusing to dispatch input`,
      );
    }
    if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
      throw new TersooError(
        'CAPTCHA_FAILED',
        `Model returned ${label} (${Math.round(x)}, ${Math.round(y)}) outside the ` +
          `${viewport.width}x${viewport.height} viewport; refusing to dispatch input`,
      );
    }
  }

  /** Reads the page viewport, defaulting to something permissive but bounded. */
  private async readViewport(page: Page): Promise<{ width: number; height: number }> {
    try {
      const size = page.viewportSize();
      if (size && size.width > 0 && size.height > 0) return size;
    } catch {
      // Fall through to the DOM measurement below.
    }
    try {
      const measured = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      if (measured && measured.width > 0 && measured.height > 0) return measured;
    } catch {
      // Ignore.
    }
    return { width: 4096, height: 4096 };
  }

  async checkAndHandle(page: Page, runId: string, profileId: string): Promise<number> {
    const detected = await detectCaptcha(page);
    if (!detected) return 0;

    const budgetSetting = await this.settingsRepo.get('captcha_budget');
    const budget = budgetSetting ? Number(budgetSetting) : 3;
    const profile = await this.profileRepo.get(profileId);
    const used = profile?.captcha_budget_used ?? 0;

    if (used >= budget) {
      await this.captchaRepo.insert({
        id: randomUUID(),
        runId,
        profileId,
        detectedAt: Date.now(),
        challengeType: detected.type,
        solvedBy: null,
        attempts: 0,
        outcome: 'aborted',
        screenshotPath: null,
        createdAt: Date.now(),
      });
      throw new TersooError(
        'CAPTCHA_BUDGET_EXCEEDED',
        `Profile hit ${budget} CAPTCHAs — aborting run`,
      );
    }

    await this.profileRepo.incrementCaptchaCount(profileId);

    if (!fs.existsSync(this.artifactsDir)) {
      fs.mkdirSync(this.artifactsDir, { recursive: true });
    }
    const screenshot = await page.screenshot({ type: 'png' });
    const shotPath = path.join(this.artifactsDir, `${runId}-captcha-${Date.now()}.png`);
    fs.writeFileSync(shotPath, new Uint8Array(screenshot));

    let outcome: 'solved' | 'failed' | 'unsolvable' = 'failed';
    let solvedBy: string | null = null;
    const attempts = 1;
    const viewport = await this.readViewport(page);

    try {
      const decision = await this.llm.decideFromScreenshot(screenshot, CAPTCHA_PROMPT);
      if (decision.action === 'unsolvable') {
        outcome = 'unsolvable';
      } else if (decision.action === 'click') {
        this.assertPointInViewport({ x: decision.x, y: decision.y }, 'click', viewport);
        await this.humanizer.clickAt(page, decision.x, decision.y);
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(2000);
        } else {
          await new Promise((r) => setTimeout(r, 2000));
        }
        const stillThere = await detectCaptcha(page);
        outcome = stillThere ? 'failed' : 'solved';
        solvedBy = 'vision';
      } else if (decision.action === 'drag') {
        this.assertPointInViewport({ x: decision.x, y: decision.y }, 'drag start', viewport);
        this.assertPointInViewport({ x: decision.endX, y: decision.endY }, 'drag end', viewport);
        await this.humanizer.drag(
          page,
          { x: decision.x, y: decision.y },
          { x: decision.endX, y: decision.endY },
        );
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(2000);
        } else {
          await new Promise((r) => setTimeout(r, 2000));
        }
        const stillThere = await detectCaptcha(page);
        outcome = stillThere ? 'failed' : 'solved';
        solvedBy = 'vision';
      }
    } catch (err) {
      // A rejected coordinate is a failure, never a reason to click somewhere
      // "close enough". Record why so the run log shows the cause.
      outcome = 'failed';
      this.lastRejection = err instanceof TersooError ? err.message : null;
    }

    await this.captchaRepo.insert({
      id: randomUUID(),
      runId,
      profileId,
      detectedAt: Date.now(),
      challengeType: detected.type,
      solvedBy,
      attempts,
      outcome,
      screenshotPath: shotPath,
      createdAt: Date.now(),
    });

    if (outcome !== 'solved') {
      const detail = this.lastRejection ? ` (${this.lastRejection})` : '';
      this.lastRejection = null;
      throw new TersooError('CAPTCHA_FAILED', `Outcome: ${outcome}${detail}`);
    }

    return 1;
  }
}
