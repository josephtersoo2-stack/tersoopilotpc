import type { FingerprintBundle } from '@tersoo/contracts';
import { buildStealthScript } from '@tersoo/stealth';

import { TersooError } from '../util/errors';

export interface CDPClient {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface EmulationOptions {
  proxyGeo?:
    | {
        timezone?: string | null | undefined;
        lat?: number | null | undefined;
        lng?: number | null | undefined;
      }
    | null
    | undefined;
}

export interface SelfTestInspectionResult {
  webdriver: unknown;
  hasWebdriverProp: boolean;
  ua: string;
  platform: string;
  cores: number;
  memory: number;
  languages: string[];
  maxTouchPoints: number;
  chromePresent: boolean;
  toStringGuarded: boolean;
  webgl: {
    vendor: string | null;
    renderer: string | null;
    unmaskedVendor: string | null;
    unmaskedRenderer: string | null;
  };
  canvasNoiseEnabled: boolean;
  audioNoiseEnabled: boolean;
  webrtcPolicy: string;
  pluginsCount: number;
  score: number;
}

export class CdpEmulatorError extends TersooError {
  constructor(message: string, details?: unknown) {
    super('STEALTH_FAILED', `CDP_EMULATOR_ERROR: ${message}`, { details });
  }
}

export class CdpEmulator {
  /**
   * Injects the stealth_shim script before any document or page script runs.
   * Uses Page.addScriptToEvaluateOnNewDocument (CDP).
   */
  static async injectStealthScript(
    cdp: CDPClient,
    bundle: FingerprintBundle,
  ): Promise<{ identifier: string }> {
    try {
      await cdp.send('Page.enable');
      const scriptSource = buildStealthScript(bundle);
      const res = (await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: scriptSource,
      })) as { identifier?: string } | undefined;

      return { identifier: res?.identifier || 'unknown' };
    } catch (err) {
      throw new CdpEmulatorError('Failed to inject stealth script via CDP', err);
    }
  }

  /**
   * Applies all CDP network and emulation overrides matching the fingerprint bundle and proxy geo.
   */
  static async applyEmulation(
    cdp: CDPClient,
    bundle: FingerprintBundle,
    options?: EmulationOptions,
  ): Promise<void> {
    try {
      // 1. Network overrides (User-Agent + Client Hints)
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
      const targetTimezone = options?.proxyGeo?.timezone ?? null;
      if (targetTimezone) {
        await cdp.send('Emulation.setTimezoneOverride', {
          timezoneId: targetTimezone,
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
      const geoLat = options?.proxyGeo?.lat ?? null;
      const geoLng = options?.proxyGeo?.lng ?? null;
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
    } catch (err) {
      throw new CdpEmulatorError('Failed to apply CDP emulation overrides', err);
    }
  }

  /**
   * Executes complete stealth preparation in authoritative order:
   * 1. Inject stealth_shim on new document
   * 2. Apply Network and Emulation overrides
   */
  static async emulate(
    cdp: CDPClient,
    bundle: FingerprintBundle,
    options?: EmulationOptions,
  ): Promise<{ scriptIdentifier: string }> {
    const { identifier } = await this.injectStealthScript(cdp, bundle);
    await this.applyEmulation(cdp, bundle, options);
    return { scriptIdentifier: identifier };
  }

  /**
   * Evaluates self-test telemetry data returned by window.__tersooSelfTest()
   */
  static verifySelfTest(result: unknown): {
    ok: boolean;
    score: number;
    details: SelfTestInspectionResult;
  } {
    if (!result || typeof result !== 'object') {
      throw new CdpEmulatorError('Self-test returned empty or invalid telemetry result');
    }

    const inspection = result as SelfTestInspectionResult;
    const isWebdriverMasked = inspection.webdriver !== true && !inspection.hasWebdriverProp;
    const score = typeof inspection.score === 'number' ? inspection.score : 0;
    const ok = isWebdriverMasked && score >= 0.9;

    return {
      ok,
      score,
      details: inspection,
    };
  }
}
