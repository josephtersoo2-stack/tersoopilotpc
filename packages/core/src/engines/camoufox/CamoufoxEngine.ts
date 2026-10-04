import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';

import { Humanizer } from '../../crosshair/Humanizer';
import type { BrowserSupervisor } from '../../supervisor/BrowserSupervisor';
import { ensureProfileDirs } from '../shared/userDataDir';
import type { BrowserEngine, BrowserSession, EngineType, LaunchInput } from '../types';
import {
  applyProfileToCamouConfig,
  buildCamoufoxOptions,
  type BuildCamoufoxOptionsInput,
} from './buildOptions';
import {
  configureCamoufoxProfile,
  ensureCamoufoxDistribution,
} from './ensureCamoufox';
import { resolveCamoufoxBinary } from './resolveBinary';

export interface CamoufoxEngineDeps {
  binaryPath?: string;
  supervisor?: BrowserSupervisor;
}

export class CamoufoxEngine implements BrowserEngine {
  readonly type: EngineType = 'camoufox';
  private readonly activeSessions = new Map<string, BrowserSession>();

  constructor(private readonly deps: CamoufoxEngineDeps = {}) {}

  async launch(input: LaunchInput): Promise<BrowserSession> {
    const camoufoxUserDataDir = path.join(input.userDataDir, 'camoufox');
    ensureProfileDirs(camoufoxUserDataDir);

    // Resolve binary & ensure environment is configured
    const executablePath = this.deps.binaryPath || resolveCamoufoxBinary();

    // Ensure CAMOUFOX_INSTALL_DIR points to the directory containing the binary
    if (executablePath && fs.existsSync(executablePath)) {
      process.env.CAMOUFOX_INSTALL_DIR = path.dirname(executablePath);
    }

    // Run self-healing provisioner on Camoufox distribution (omni.ja, chrome.css, policies.json, camoufox.cfg)
    ensureCamoufoxDistribution(executablePath);

    // Configure profile preferences (native Firefox Proton UI, about:home, Google search, WebRTC protection)
    configureCamoufoxProfile(camoufoxUserDataDir);

    const buildInput: BuildCamoufoxOptionsInput = {
      userDataDir: camoufoxUserDataDir,
      proxyPort: input.forwarderPort,
      proxyCredentials: input.forwarderAuth,
      seed: input.seed,
      platform: input.profile.fingerprintBundle.platform,
      languages: input.profile.fingerprintBundle.locales.languages,
      timezone: input.profile.fingerprintBundle.timezone,
      headless: input.headless,
      executablePath,
      additionalArgs: input.additionalArgs,
      screen: input.screen ?? input.profile.fingerprintBundle.screen,
      webgl: input.profile.fingerprintBundle.webgl,
      hardware: input.profile.fingerprintBundle.hardware,
      hostScreen: input.hostScreen,
    };

    const options = buildCamoufoxOptions(buildInput);

    // Dynamically import camoufox-js and playwright
    const { launchOptions, NewBrowser } = await import('camoufox-js');
    const { firefox } = await import('playwright-core');

    const { headless, user_data_dir, ...restOptions } = options;
    const fromOptions = await launchOptions({
      headless: Boolean(headless),
      ...restOptions,
    });

    // Apply the exact profile fingerprint settings to Camoufox configuration
    applyProfileToCamouConfig(fromOptions, buildInput);

    let browserOrContext: any;
    try {
      browserOrContext = await NewBrowser(
        firefox,
        Boolean(headless),
        fromOptions,
        camoufoxUserDataDir,
        false,
      );
    } catch (launchErr: unknown) {
      console.error('[CamoufoxEngine] launch failed:', launchErr);
      throw launchErr;
    }

    let context: BrowserContext;
    let browser: Browser | undefined;

    if (browserOrContext && 'newContext' in browserOrContext) {
      browser = browserOrContext as Browser;
      context = await browser.newContext();
    } else {
      context = browserOrContext as BrowserContext;
      browser = typeof context.browser === 'function' ? (context.browser() ?? undefined) : undefined;
    }

    // Get existing page or wait for the first one to open
    let page: Page;
    const existingPages = context.pages();
    if (existingPages.length > 0) {
      page = existingPages[0]!;
    } else {
      // Wait briefly for initial page, or create one
      const awaited = await Promise.race([
        context.waitForEvent('page').catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      page = (awaited as Page) ?? (await context.newPage());
    }

    const profileId = input.profile.id;
    const humanizer = new Humanizer(input.seed);

    context.on('close', () => {
      this.activeSessions.delete(profileId);
      if (this.deps.supervisor) {
        void this.deps.supervisor.handleSessionClose(profileId);
      }
    });

    const session: BrowserSession = {
      browser,
      context,
      page,
      humanizer,
      engine: 'camoufox',
      cdpPort: null,
      cdpWsUrl: null,
      pid: (context as any)._browser?._process?.pid ?? (browser as any)?._process?.pid,
      async close() {
        try {
          if (browser) {
            await browser.close().catch(() => {});
          } else if (context) {
            await context.close().catch(() => {});
          }
        } finally {
          // session cleaned
        }
      },
    };

    this.activeSessions.set(profileId, session);
    return session;
  }

  getSession(profileId: string): BrowserSession | undefined {
    const session = this.activeSessions.get(profileId);
    if (session && session.context) {
      const activePages = session.context.pages().filter((p) => !p.isClosed());
      if (activePages.length > 0) {
        session.page = activePages[activePages.length - 1];
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
