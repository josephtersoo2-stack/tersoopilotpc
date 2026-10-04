import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';

import type { Config } from '../../config';
import { Humanizer } from '../../crosshair/Humanizer';
import { buildAuthenticatedProxyUrl } from '../../proxy/proxyUrl';
import type { BrowserSupervisor } from '../../supervisor/BrowserSupervisor';
import type { Instance } from '../../supervisor/types';
import { sanitizeAdditionalArgs } from '../shared/argSanitizer';
import { ensureProfileDirs, prepareChromiumProfile } from '../shared/userDataDir';
import type { BrowserEngine, BrowserSession, EngineType, LaunchInput } from '../types';

import { resolveApostateBinary } from './resolveBinary';

export interface ApostateEngineDeps {
  supervisor?: BrowserSupervisor;
  config?: Config;
  binaryPath?: string;
  defaultCdpTimeoutMs?: number;
}

function mapApostatePlatform(platform?: string): string {
  // Apostate native cluster requires the host OS graphics architecture:
  // On Windows, the binary must run the Direct3D 11 cluster ('windows').
  // Requesting 'macos' (Apple Metal) on Windows causes Chromium's GPU process to abort with error 18.
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (platform === 'linux' || platform === 'android') return 'linux';
  return 'windows';
}

export class ApostateEngine implements BrowserEngine {
  readonly type: EngineType = 'apostate';
  private readonly activeSessions = new Map<string, BrowserSession>();

  constructor(private readonly deps: ApostateEngineDeps = {}) {}

  async launch(input: LaunchInput): Promise<BrowserSession> {
    ensureProfileDirs(input.userDataDir);

    // Resolve the Apostate binary and set env var so the SDK finds it
    const executablePath =
      this.deps.binaryPath ||
      this.deps.config?.chromeBinary ||
      resolveApostateBinary();

    if (executablePath && fs.existsSync(executablePath)) {
      process.env.APOSTATE_BINARY = executablePath;
    }

    // Clean up any dummy Google OAuth keys in process.env so they never poison Chromium OAuth / DICE
    delete process.env.GOOGLE_DEFAULT_CLIENT_ID;
    delete process.env.GOOGLE_DEFAULT_CLIENT_SECRET;

    const isMobile =
      input.profile.fingerprintBundle?.platform === 'android' ||
      Boolean(input.profile.fingerprintBundle?.uaMetadata?.mobile);

    const platform = mapApostatePlatform(input.profile.fingerprintBundle?.platform);
    const profileLang = input.profile.fingerprintBundle?.locales?.languages?.[0];
    const profileTz = input.profile.fingerprintBundle?.timezone;
    const hasProxy = input.forwarderPort > 0;

    // Build options exactly as the Apostate Node SDK expects them
    // See: https://docs.apostate.dev/guides/node.md
    //
    // GeoIP strategy:
    // - Without proxy → ALWAYS geoip on (tz must match real IP, ignore profile tz)
    // - With proxy + explicit tz in profile → use profile tz, geoip off
    // - With proxy + no explicit tz → geoip on (detect from proxy exit IP)
    const useGeoip = !hasProxy || !profileTz;

    const apostateOptions: Record<string, unknown> = {
      fingerprint: input.seed,
      fingerprintPlatform: platform,
      headless: input.headless,
      chromiumSandbox: true,
      geoip: useGeoip,
      ignoreDefaultArgs: [
        '--disable-blink-features=AutomationControlled',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
    };

    if (isMobile) {
      apostateOptions.hasTouch = true;
      apostateOptions.isMobile = true;
    }

    // Only pass explicit timezone when using a proxy with a matching profile tz
    if (profileTz && hasProxy && !useGeoip) {
      apostateOptions.timezone = profileTz;
    }
    if (profileLang) {
      apostateOptions.locale = profileLang;
    }

    if (input.forwarderPort > 0) {
      apostateOptions.proxy = {
        server: buildAuthenticatedProxyUrl(input.forwarderPort, input.forwarderAuth),
        ...(input.forwarderAuth
          ? { username: input.forwarderAuth.username, password: input.forwarderAuth.password }
          : {}),
      };
    }

    const args = sanitizeAdditionalArgs(input.additionalArgs);

    // Suppress missing API key warning cleanly without breaking OAuth / DICE
    args.push('--test-type', '--disable-infobars', '--no-first-run', '--no-default-browser-check');

    const screenWidth = input.profile.fingerprintBundle?.screen?.width ?? (isMobile ? 412 : 1920);
    const screenHeight = input.profile.fingerprintBundle?.screen?.height ?? (isMobile ? 915 : 1080);

    const hostWorkAreaW = input.hostScreen?.workAreaWidth ?? input.hostScreen?.width ?? 1280;
    const hostWorkAreaH = input.hostScreen?.workAreaHeight ?? input.hostScreen?.height ?? 720;

    if (isMobile) {
      // Fit mobile window comfortably on any PC screen without extending behind taskbar:
      // Leave ~30px for OS padding and ensure max height fits within screen work area
      const maxWinH = Math.max(480, hostWorkAreaH - 30);
      const maxWinW = Math.max(360, hostWorkAreaW - 40);
      const winW = Math.min(Math.round(screenWidth + 18), maxWinW);
      const winH = Math.min(Math.round(screenHeight + 85), maxWinH);
      args.push(`--window-size=${winW},${winH}`);
      args.push('--window-position=50,15');
    } else {
      // Desktop window: clamp to host workArea so window never hides below screen taskbar
      const maxWinW = Math.max(800, hostWorkAreaW - 20);
      const maxWinH = Math.max(600, hostWorkAreaH - 20);
      const winW = Math.min(screenWidth, maxWinW);
      const winH = Math.min(screenHeight, maxWinH);
      args.push(`--window-size=${winW},${winH}`);
      args.push('--window-position=20,10');
    }

    if (args.length > 0) {
      apostateOptions.args = args;
    }

    try {
      const apostate = await import('@heretic-tech/apostate');

      // Use launchPersistentContext for profile persistence (cookies, storage, identity)
      const apostateUserDataDir = path.join(input.userDataDir, 'apostate');
      ensureProfileDirs(apostateUserDataDir);
      prepareChromiumProfile(apostateUserDataDir);

      const context = await apostate.launchPersistentContext(
        apostateUserDataDir,
        apostateOptions as any,
      );

      const page: Page = context.pages()[0] ?? (await context.newPage());
      const browser: Browser | undefined = context.browser() ?? undefined;
      const humanizer = new Humanizer(input.seed);
      const profileId = input.profile.id;

      if (isMobile) {
        const dpr = input.profile.fingerprintBundle?.screen?.dpr ?? 2.625;
        const model = input.profile.fingerprintBundle?.uaMetadata?.model ?? 'Pixel 8 Pro';
        const chromeMajor = '155';
        const mobileUA =
          input.profile.fingerprintBundle?.userAgent?.replace(/Chrome\/\d+\.0\.0\.0/, `Chrome/${chromeMajor}.0.0.0`) ||
          `Mozilla/5.0 (Linux; Android 14; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Mobile Safari/537.36`;

        const applyMobileEmulation = async (targetPage: Page) => {
          try {
            await targetPage.setViewportSize({ width: screenWidth, height: screenHeight }).catch(() => {});
            const cdp = await context.newCDPSession(targetPage);
            await cdp.send('Emulation.setUserAgentOverride', {
              userAgent: mobileUA,
              platform: 'Android',
              userAgentMetadata: {
                brands: [
                  { brand: 'Chromium', version: chromeMajor },
                  { brand: 'Not(A:Brand', version: '24' },
                  { brand: 'Google Chrome', version: chromeMajor },
                ],
                platform: 'Android',
                platformVersion: '14.0.0',
                architecture: 'arm64',
                model,
                mobile: true,
              },
            });
            await cdp.send('Emulation.setDeviceMetricsOverride', {
              width: screenWidth,
              height: screenHeight,
              deviceScaleFactor: dpr,
              mobile: true,
            });
            await cdp.send('Emulation.setTouchEmulationEnabled', {
              enabled: true,
              maxTouchPoints: input.profile.fingerprintBundle?.hardware?.maxTouchPoints ?? 5,
            });
          } catch (emuErr) {
            console.warn('[ApostateEngine] Warning: Could not apply mobile CDP emulation:', emuErr);
          }
        };

        await applyMobileEmulation(page);

        context.on('page', (newPage: Page) => {
          applyMobileEmulation(newPage).catch(() => {});
        });
      }

      // Auto-open clean New Tab Page if starting on about:blank.
      // Loading the NTP can make Chromium swap the startup target, so the
      // session must be given the freshest live page afterwards rather than the
      // handle that existed before the navigation.
      if (page.url() === 'about:blank') {
        await page.goto('chrome://newtab').catch(() => {});
      }

      let activePage = page;
      try {
        const livePages = context.pages().filter((p: Page) => !p.isClosed());
        if (livePages.length > 0) {
          activePage = livePages[livePages.length - 1]!;
        }
      } catch {
        // Keep the original handle if the context is already gone.
      }

      context.on('close', () => {
        this.activeSessions.delete(profileId);
        if (this.deps.supervisor) {
          void this.deps.supervisor.handleSessionClose(profileId);
        }
      });

      const session: BrowserSession = {
        browser,
        context,
        page: activePage,
        humanizer,
        engine: 'apostate',
        cdpPort: null,
        cdpWsUrl: null,
        pid: (context as any)._browser?._process?.pid,
        async close() {
          await context.close().catch(() => {});
        },
      };

      this.activeSessions.set(profileId, session);
      return session;
    } catch (err: unknown) {
      console.error('[ApostateEngine] launch failed:', err);
      throw err;
    }
  }

  getSession(profileId: string): BrowserSession | undefined {
    const session = this.activeSessions.get(profileId);
    if (session?.context) {
      // Re-acquire the freshest open page: a tab may have been closed or
      // replaced since it was captured, and callers rely on this to recover
      // from a stale handle.
      try {
        const activePages = session.context.pages().filter((p) => !p.isClosed());
        if (activePages.length > 0) {
          session.page = activePages[activePages.length - 1];
        }
      } catch {
        // Context already gone; leave the existing handle in place.
      }
    }
    return session;
  }

  async stop(profileId: string): Promise<void> {
    const session = this.activeSessions.get(profileId);
    if (session) {
      this.activeSessions.delete(profileId);
      await session.close().catch(() => {});
    }
    if (this.deps.supervisor) {
      await this.deps.supervisor.stop(profileId);
    }
  }
}
