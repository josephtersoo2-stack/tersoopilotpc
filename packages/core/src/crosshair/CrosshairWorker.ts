import type { FingerprintBundle } from '@tersoo/contracts';
import { buildStealthScript } from '@tersoo/stealth';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright-core';

import type { EventBus } from '../events/EventBus';
import { CrosshairError } from '../util/errors';

import type { AnchorRegistry } from './AnchorRegistry';

export interface CrosshairWorkerDeps {
  events: EventBus;
  anchors: AnchorRegistry;
}

export interface CrosshairProxyInput {
  geo_tz?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
}

export interface CrosshairAttachInput {
  profileId: string;
  cdpWsUrl?: string | null;
  bundle: FingerprintBundle;
  proxy?: CrosshairProxyInput | null;
  timezone?: string;
  geolocation?:
    | {
        lat: number;
        lng: number;
        accuracy: number;
      }
    | null;
}

export interface ProfileBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  bundle: FingerprintBundle;
  proxy?: CrosshairProxyInput | null;
}

export class CrosshairWorker {
  private readonly sessions = new Map<string, ProfileBrowserSession>();

  constructor(private readonly deps: CrosshairWorkerDeps) {}

  /**
   * Attaches to an existing running Chromium instance via its CDP WebSocket URL.
   * Initializes a Playwright BrowserContext, active Page, and CDPSession.
   * Authoritatively injects stealth script and applies network/emulation overrides.
   */
  async attach(input: CrosshairAttachInput): Promise<this> {
    if (!input.cdpWsUrl) {
      throw new CrosshairError(
        'CDP_ATTACH_FAILED',
        `Cannot attach CrosshairWorker: profile '${input.profileId}' has no cdpWsUrl`,
      );
    }

    try {
      const browser = await chromium.connectOverCDP(input.cdpWsUrl);
      const context =
        browser.contexts()[0] ?? (await browser.newContext());
      const page = context.pages()[0] ?? (await context.newPage());
      const cdp = await context.newCDPSession(page);

      const session: ProfileBrowserSession = {
        browser,
        context,
        page,
        cdp,
        bundle: input.bundle,
        ...(input.proxy !== undefined ? { proxy: input.proxy } : {}),
      };

      this.sessions.set(input.profileId, session);

      // 1. Authoritatively inject stealth_shim script before any document script evaluates
      await this.addInitScript(input.profileId, input.bundle);

      // 2. Apply CDP emulation overrides
      await this.applyEmulation(input.bundle, input.proxy ?? null, input.profileId);

      // Emit event
      await this.deps.events.emit('crosshair.attached', {
        profileId: input.profileId,
      });

      return this;
    } catch (err) {
      if (err instanceof CrosshairError) {
        throw err;
      }
      throw new CrosshairError(
        'CDP_ATTACH_FAILED',
        `Failed to connect Playwright over CDP to ${input.cdpWsUrl}: ${err instanceof Error ? err.message : String(err)}`,
        { details: err },
      );
    }
  }

  /**
   * Registers the stealth shim script to be evaluated on every new document in the context.
   */
  async addInitScript(
    profileIdOrBundle: string | FingerprintBundle,
    bundleParam?: FingerprintBundle,
  ): Promise<void> {
    let session: ProfileBrowserSession | undefined;
    let bundle: FingerprintBundle;

    if (typeof profileIdOrBundle === 'string') {
      session = this.sessions.get(profileIdOrBundle);
      bundle = bundleParam ?? session?.bundle as FingerprintBundle;
    } else {
      bundle = profileIdOrBundle;
      session = this.requireFirstSession();
    }

    if (!bundle) {
      throw new CrosshairError(
        'INTERNAL',
        'Cannot add init script: FingerprintBundle is undefined',
      );
    }

    if (session) {
      const scriptContent = buildStealthScript(bundle);
      await session.context.addInitScript({
        content: scriptContent,
      });
      try {
        await session.cdp.send('Page.enable');
        await session.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
          source: scriptContent,
        });
      } catch {
        // Ignored if CDP session cannot accept Page domain commands
      }
    }
  }

  /**
   * Applies all CDP network and emulation overrides matching the bundle and proxy geo.
   */
  async applyEmulation(
    bundle: FingerprintBundle,
    proxy?: CrosshairProxyInput | null,
    profileId?: string,
  ): Promise<void> {
    const session = profileId
      ? this.sessions.get(profileId)
      : this.requireFirstSession();

    if (!session) {
      throw new CrosshairError(
        'CDP_ATTACH_FAILED',
        `No active Crosshair session found to apply emulation${profileId ? ` for profile '${profileId}'` : ''}`,
      );
    }

    const { cdp } = session;

    // 1. Network User-Agent & Client Hints
    await cdp.send('Network.enable');
    await cdp.send('Network.setUserAgentOverride', {
      userAgent: bundle.userAgent,
      acceptLanguage: bundle.locales.acceptLanguage,
      platform: bundle.uaMetadata.platform,
      userAgentMetadata: {
        brands: bundle.uaMetadata.brands,
        fullVersion: '',
        fullVersionList: bundle.uaMetadata.brands,
        platform: bundle.uaMetadata.platform,
        platformVersion: bundle.uaMetadata.platformVersion,
        architecture: bundle.uaMetadata.architecture,
        model: bundle.uaMetadata.model,
        mobile: bundle.uaMetadata.mobile,
      },
    });

    // 2. Timezone override (three-state policy: proxy-first, host fallback when direct)
    const targetTz = proxy?.geo_tz ?? null;
    if (targetTz) {
      await cdp.send('Emulation.setTimezoneOverride', {
        timezoneId: targetTz,
      });
    }

    // 3. Locale override
    try {
      const primaryLocale = bundle.locales.languages[0] || 'en-US';
      await cdp.send('Emulation.setLocaleOverride', {
        locale: primaryLocale,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Another locale override is already in effect')) {
        throw err;
      }
    }

    // 4. Geolocation override (align with proxy geo if available; do not hardcode foreign location on direct connection)
    const geoLat = proxy?.geo_lat ?? null;
    const geoLng = proxy?.geo_lng ?? null;
    if (geoLat != null && geoLng != null) {
      await cdp.send('Emulation.setGeolocationOverride', {
        latitude: geoLat,
        longitude: geoLng,
        accuracy: bundle.geolocation?.accuracy ?? 50,
      });
    }

    // 5. Device metrics override (ONLY for mobile profiles; on desktop, CLI flags control window geometry without fractional subpixel zoom)
    if (bundle.uaMetadata.mobile) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: bundle.screen.width,
        height: bundle.screen.height,
        deviceScaleFactor: bundle.screen.dpr,
        mobile: true,
      });
    }
  }

  /**
   * Asserts that stealth evasions are active and effective in the running page.
   * Returns the self-test telemetry result or throws STEALTH_FAILED.
   */
  async assertStealthReady(profileId?: string): Promise<Record<string, unknown>> {
    const session = profileId
      ? this.sessions.get(profileId)
      : this.requireFirstSession();

    if (!session) {
      throw new CrosshairError(
        'CDP_ATTACH_FAILED',
        'Cannot assert stealth readiness: no active session',
      );
    }

    const { page } = session;
    let result = await page.evaluate(() => {
      const g = globalThis as unknown as {
        __tersooSelfTest?: () => Record<string, unknown>;
        __tersooSelfTestResult?: { telemetry: Record<string, unknown>; score: number };
      };
      if (typeof g.__tersooSelfTest === 'function') {
        return g.__tersooSelfTest();
      }
      if (g.__tersooSelfTestResult) {
        return g.__tersooSelfTestResult.telemetry;
      }
      return null;
    });

    if (!result) {
      // Inject and evaluate stealth script directly into current page context (e.g. initial about:blank)
      const scriptContent = buildStealthScript(session.bundle);
      await page.evaluate(scriptContent);
      result = await page.evaluate(() => {
        const g = globalThis as unknown as {
          __tersooSelfTest?: () => Record<string, unknown>;
        };
        return typeof g.__tersooSelfTest === 'function' ? g.__tersooSelfTest() : null;
      });
    }

    if (!result) {
      throw new CrosshairError(
        'STEALTH_FAILED',
        'Self-test returned null or undefined from page evaluation',
      );
    }

    const webdriverCompromised =
      result['webdriver'] === true || result['hasWebdriverProp'] === true;
    const score = typeof result['score'] === 'number' ? result['score'] : 0;

    if (webdriverCompromised || score < 0.9) {
      throw new CrosshairError(
        'STEALTH_FAILED',
        `Stealth self-test check failed (score: ${score}, webdriver compromised: ${webdriverCompromised})`,
        { telemetry: result },
      );
    }

    return result;
  }

  /**
   * Retrieves the active Playwright Page for a profile.
   */
  getPage(profileId?: string): Page {
    const session = profileId
      ? this.sessions.get(profileId)
      : this.requireFirstSession();

    if (!session) {
      throw new CrosshairError(
        'CDP_ATTACH_FAILED',
        `No active session found for profile '${profileId ?? 'default'}'`,
      );
    }
    return session.page;
  }

  /**
   * Retrieves the active CDPSession for a profile.
   */
  getCdpSession(profileId?: string): CDPSession {
    const session = profileId
      ? this.sessions.get(profileId)
      : this.requireFirstSession();

    if (!session) {
      throw new CrosshairError(
        'CDP_ATTACH_FAILED',
        `No active session found for profile '${profileId ?? 'default'}'`,
      );
    }
    return session.cdp;
  }

  /**
   * Retrieves the active session for a profile.
   */
  getSession(profileId: string): ProfileBrowserSession | undefined {
    return this.sessions.get(profileId);
  }

  /**
   * Returns whether a profile is currently attached.
   */
  hasSession(profileId: string): boolean {
    return this.sessions.has(profileId);
  }

  /**
   * Closes the Playwright browser connection and frees session resources for a profile.
   */
  async close(profileId: string): Promise<void> {
    const session = this.sessions.get(profileId);
    if (!session) {
      return;
    }

    this.sessions.delete(profileId);

    try {
      await session.cdp.detach().catch(() => {});
      await session.browser.close().catch(() => {});
    } catch {
      // Best-effort cleanup
    }

    await this.deps.events.emit('crosshair.detached', {
      profileId,
    });
  }

  /**
   * Closes all active profile sessions.
   */
  async closeAll(): Promise<void> {
    const profileIds = [...this.sessions.keys()];
    for (const id of profileIds) {
      await this.close(id);
    }
  }

  private requireFirstSession(): ProfileBrowserSession {
    const first = this.sessions.values().next().value;
    if (!first) {
      throw new CrosshairError(
        'CDP_ATTACH_FAILED',
        'No active CrosshairWorker sessions available',
      );
    }
    return first;
  }
}
