import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright-core';

import { Humanizer } from '../src/crosshair/Humanizer';
import type { LlmService } from '../src/llm/LlmService';
import type { CaptchaEventRepo } from '../src/persistence/repos/captchaEventRepo';
import type { ProfileRepo } from '../src/persistence/repos/profileRepo';
import type { SettingsRepo } from '../src/persistence/repos/settingsRepo';
import { detectCaptcha } from '../src/task/captchaDetector';
import { CaptchaHandler } from '../src/task/CaptchaHandler';
import { TersooError } from '../src/util/errors';

describe('Phase 8: CAPTCHA Detection, Vision Fallback & Budget Enforcement', () => {
  let tmpDir: string;
  let mockPage: Page;
  let mockLlm: LlmService;
  let humanizer: Humanizer;
  let mockCaptchaRepo: CaptchaEventRepo;
  let mockProfileRepo: ProfileRepo;
  let mockSettingsRepo: SettingsRepo;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-captcha-test-'));

    humanizer = new Humanizer(42);
    vi.spyOn(humanizer, 'clickAt').mockResolvedValue(undefined);
    vi.spyOn(humanizer, 'drag').mockResolvedValue(undefined);

    mockPage = {
      // detectCaptcha walks every frame with locator().count(), so a mock
      // built on page.$ would silently pass a page that has no challenges.
      frames: vi.fn().mockReturnValue([]),
      locator: vi.fn().mockImplementation((selector: string) => ({
        count: vi
          .fn()
          .mockResolvedValue(
            selector.includes('turnstile') || selector.includes('recaptcha') ? 1 : 0,
          ),
      })),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png-screenshot-bytes')),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    mockLlm = {
      decideFromScreenshot: vi.fn().mockResolvedValue({
        action: 'click',
        x: 150,
        y: 250,
        reason: 'Click the verify checkbox',
      }),
    } as unknown as LlmService;

    mockCaptchaRepo = {
      insert: vi.fn().mockResolvedValue({}),
      getById: vi.fn(),
      listForRun: vi.fn(),
      listForProfile: vi.fn(),
      create: vi.fn(),
    } as unknown as CaptchaEventRepo;

    mockProfileRepo = {
      get: vi.fn().mockResolvedValue({
        id: 'prof-123',
        captcha_budget_used: 0,
      }),
      incrementCaptchaCount: vi.fn().mockResolvedValue(undefined),
      resetCaptchaCount: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProfileRepo;

    mockSettingsRepo = {
      get: vi.fn().mockResolvedValue('3'),
      set: vi.fn(),
      getAll: vi.fn(),
    } as unknown as SettingsRepo;
  });

  describe('detectCaptcha', () => {
    it('detects turnstile captcha on page', async () => {
      const detected = await detectCaptcha(mockPage);
      expect(detected).not.toBeNull();
      expect(detected?.type).toBe('recaptcha');
    });

    it('returns null when no CAPTCHA elements exist', async () => {
      const cleanPage = {
        frames: vi.fn().mockReturnValue([]),
        locator: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
      } as unknown as Page;

      const detected = await detectCaptcha(cleanPage);
      expect(detected).toBeNull();
    });

    it('finds a challenge inside a subframe, not just the top document', async () => {
      const childFrame = {
        url: () => 'https://site.test/frame',
        locator: (selector: string) => ({
          count: vi
            .fn()
            .mockResolvedValue(selector.includes('hcaptcha') ? 1 : 0),
        }),
      };
      const page = {
        frames: vi.fn().mockReturnValue([
          { url: () => 'https://site.test', locator: () => ({ count: vi.fn().mockResolvedValue(0) }) },
          childFrame,
        ]),
      } as unknown as Page;

      const detected = await detectCaptcha(page);
      expect(detected?.type).toBe('hcaptcha');
      expect(detected?.frameUrl).toContain('/frame');
    });
  });

  describe('CaptchaHandler', () => {
    it('detects CAPTCHA, screenshots, gets vision decision, clicks, and writes event row', async () => {
      // A challenge is on screen until the model's click lands, then it is gone.
      let solved = false;
      vi.spyOn(humanizer, 'clickAt').mockImplementation(async () => {
        solved = true;
      });
      (mockPage.locator as any) = vi.fn().mockImplementation((selector: string) => ({
        count: vi
          .fn()
          .mockResolvedValue(
            !solved && (selector.includes('turnstile') || selector.includes('recaptcha')) ? 1 : 0,
          ),
      }));

      const handler = new CaptchaHandler(
        mockLlm,
        humanizer,
        mockCaptchaRepo,
        mockProfileRepo,
        mockSettingsRepo,
        tmpDir,
      );

      const result = await handler.checkAndHandle(mockPage, 'run-1', 'prof-123');

      expect(result).toBe(1);
      expect(mockProfileRepo.incrementCaptchaCount).toHaveBeenCalledWith('prof-123');
      expect(mockLlm.decideFromScreenshot).toHaveBeenCalled();
      expect(humanizer.clickAt).toHaveBeenCalledWith(mockPage, 150, 250);
      expect(mockCaptchaRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-1',
          profileId: 'prof-123',
          outcome: 'solved',
          solvedBy: 'vision',
        }),
      );

      // Verify screenshot file was saved to artifacts dir
      const files = fs.readdirSync(tmpDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toContain('run-1-captcha');
    });

    it('handles slider drag action correctly', async () => {
      let solved = false;
      vi.spyOn(humanizer, 'drag').mockImplementation(async () => {
        solved = true;
      });
      (mockPage.locator as any) = vi.fn().mockImplementation((selector: string) => ({
        count: vi
          .fn()
          .mockResolvedValue(
            !solved && (selector.includes('turnstile') || selector.includes('recaptcha')) ? 1 : 0,
          ),
      }));

      mockLlm.decideFromScreenshot = vi.fn().mockResolvedValue({
        action: 'drag',
        x: 50,
        y: 200,
        endX: 250,
        endY: 200,
        reason: 'Slide puzzle piece',
      });

      const handler = new CaptchaHandler(
        mockLlm,
        humanizer,
        mockCaptchaRepo,
        mockProfileRepo,
        mockSettingsRepo,
        tmpDir,
      );

      const result = await handler.checkAndHandle(mockPage, 'run-1', 'prof-123');

      expect(result).toBe(1);
      expect(humanizer.drag).toHaveBeenCalledWith(
        mockPage,
        { x: 50, y: 200 },
        { x: 250, y: 200 },
      );
    });

    it('aborts with CAPTCHA_BUDGET_EXCEEDED when profile budget is exhausted', async () => {
      mockProfileRepo.get = vi.fn().mockResolvedValue({
        id: 'prof-123',
        captcha_budget_used: 3,
      });

      const handler = new CaptchaHandler(
        mockLlm,
        humanizer,
        mockCaptchaRepo,
        mockProfileRepo,
        mockSettingsRepo,
        tmpDir,
      );

      await expect(handler.checkAndHandle(mockPage, 'run-1', 'prof-123')).rejects.toThrowError(
        TersooError,
      );
      await expect(handler.checkAndHandle(mockPage, 'run-1', 'prof-123')).rejects.toThrow(
        expect.objectContaining({ code: 'CAPTCHA_BUDGET_EXCEEDED' }),
      );

      expect(mockCaptchaRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'aborted',
        }),
      );
    });

    it('resets captcha budget on profile resetCaptchaCount', async () => {
      await mockProfileRepo.resetCaptchaCount('prof-123');
      expect(mockProfileRepo.resetCaptchaCount).toHaveBeenCalledWith('prof-123');
    });
  });
});
