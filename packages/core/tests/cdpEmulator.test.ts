import type { FingerprintBundle } from '@tersoo/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  CdpEmulator,
  CdpEmulatorError,
  type CDPClient,
  type SelfTestInspectionResult,
} from '../src/fingerprint/CdpEmulator';

const SAMPLE_BUNDLE: FingerprintBundle = {
  seed: 'cdp-test-seed-12345',
  platform: 'windows',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
  uaMetadata: {
    brands: [{ brand: 'Chromium', version: '128' }],
    platform: 'Windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
  },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, dpr: 1.25 },
  webgl: {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'NVIDIA Corporation',
    unmaskedRenderer: 'NVIDIA GeForce RTX 4070',
  },
  canvasNoise: { enabled: true, algorithm: 'gaussian', intensity: 0.15 },
  audioNoise: { enabled: true, algorithm: 'gaussian', intensity: 0.1 },
  hardware: { cores: 16, memoryGb: 32, maxTouchPoints: 0 },
  locales: { languages: ['en-US', 'en'], acceptLanguage: 'en-US,en;q=0.9' },
  timezone: 'America/Chicago',
  geolocation: { lat: 41.8781, lng: -87.6298, accuracy: 50 },
  webrtcPolicy: 'disable_non_proxied_udp',
  webdriverHidden: true,
};

describe('Ticket 3.5: CdpEmulator & CDP Script Injection Engine', () => {
  it('injects stealth script via Page.addScriptToEvaluateOnNewDocument', async () => {
    const sentCommands: { method: string; params?: Record<string, unknown> }[] = [];
    const mockCdp: CDPClient = {
      send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
        sentCommands.push({ method, params });
        if (method === 'Page.addScriptToEvaluateOnNewDocument') {
          return { identifier: 'injected-script-id-42' };
        }
        return {};
      }),
    };

    const res = await CdpEmulator.injectStealthScript(mockCdp, SAMPLE_BUNDLE);

    expect(res.identifier).toBe('injected-script-id-42');
    expect(mockCdp.send).toHaveBeenCalledWith('Page.enable');
    expect(mockCdp.send).toHaveBeenCalledWith('Page.addScriptToEvaluateOnNewDocument', expect.objectContaining({
      source: expect.stringContaining(SAMPLE_BUNDLE.seed),
    }));
  });

  it('applies complete CDP emulation overrides matching bundle and proxy geo', async () => {
    const sentCommands: Record<string, Record<string, unknown>> = {};
    const mockCdp: CDPClient = {
      send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
        if (params) {
          sentCommands[method] = params;
        }
        return {};
      }),
    };

    const proxyGeo = {
      timezone: 'Europe/Berlin',
      lat: 52.52,
      lng: 13.405,
    };

    await CdpEmulator.applyEmulation(mockCdp, SAMPLE_BUNDLE, { proxyGeo });

    // 1. Network UA override
    expect(sentCommands['Network.setUserAgentOverride']).toEqual(expect.objectContaining({
      userAgent: SAMPLE_BUNDLE.userAgent,
      acceptLanguage: 'en-US,en;q=0.9',
      platform: 'Windows',
      userAgentMetadata: expect.objectContaining({
        architecture: 'x86',
        platformVersion: '15.0.0',
        mobile: false,
      }),
    }));

    // 2. Timezone override (prefer proxy timezone over bundle timezone)
    expect(sentCommands['Emulation.setTimezoneOverride']).toEqual({
      timezoneId: 'Europe/Berlin',
    });

    // 3. Locale override
    expect(sentCommands['Emulation.setLocaleOverride']).toEqual({
      locale: 'en-US',
    });

    // 4. Geolocation override
    expect(sentCommands['Emulation.setGeolocationOverride']).toEqual({
      latitude: 52.52,
      longitude: 13.405,
      accuracy: 50,
    });

    // 5. Device metrics override omitted for desktop to prevent fractional layout zoom
    expect(sentCommands['Emulation.setDeviceMetricsOverride']).toBeUndefined();
  });

  it('leaves host timezone and geolocation untouched when proxy geo is not provided (Three-State Policy)', async () => {
    const sentCommands: Record<string, Record<string, unknown>> = {};
    const mockCdp: CDPClient = {
      send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
        if (params) {
          sentCommands[method] = params;
        }
        return {};
      }),
    };

    await CdpEmulator.applyEmulation(mockCdp, SAMPLE_BUNDLE);

    expect(sentCommands['Emulation.setTimezoneOverride']).toBeUndefined();
    expect(sentCommands['Emulation.setGeolocationOverride']).toBeUndefined();
  });

  it('applies device metrics override when bundle is mobile', async () => {
    const sentCommands: Record<string, Record<string, unknown>> = {};
    const mockCdp: CDPClient = {
      send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
        if (params) {
          sentCommands[method] = params;
        }
        return {};
      }),
    };

    const mobileBundle = {
      ...SAMPLE_BUNDLE,
      uaMetadata: {
        ...SAMPLE_BUNDLE.uaMetadata,
        mobile: true,
      },
    };

    await CdpEmulator.applyEmulation(mockCdp, mobileBundle);

    expect(sentCommands['Emulation.setDeviceMetricsOverride']).toEqual({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1.25,
      mobile: true,
    });
  });

  it('runs complete emulate sequence in authoritative order', async () => {
    const callOrder: string[] = [];
    const mockCdp: CDPClient = {
      send: vi.fn(async (method: string) => {
        callOrder.push(method);
        if (method === 'Page.addScriptToEvaluateOnNewDocument') {
          return { identifier: 'script-seq-1' };
        }
        return {};
      }),
    };

    const mobileBundle = {
      ...SAMPLE_BUNDLE,
      uaMetadata: {
        ...SAMPLE_BUNDLE.uaMetadata,
        mobile: true,
      },
    };
    const res = await CdpEmulator.emulate(mockCdp, mobileBundle, {
      proxyGeo: {
        timezone: 'Europe/Berlin',
        lat: 52.52,
        lng: 13.405,
      },
    });
    expect(res.scriptIdentifier).toBe('script-seq-1');

    // Verify injection order: Page.enable -> script injection -> Network.enable -> Overrides
    expect(callOrder[0]).toBe('Page.enable');
    expect(callOrder[1]).toBe('Page.addScriptToEvaluateOnNewDocument');
    expect(callOrder[2]).toBe('Network.enable');
    expect(callOrder).toContain('Network.setUserAgentOverride');
    expect(callOrder).toContain('Emulation.setTimezoneOverride');
    expect(callOrder).toContain('Emulation.setLocaleOverride');
    expect(callOrder).toContain('Emulation.setGeolocationOverride');
    expect(callOrder).toContain('Emulation.setDeviceMetricsOverride');
  });

  it('wraps CDP failures in CdpEmulatorError', async () => {
    const mockCdp: CDPClient = {
      send: vi.fn(async () => {
        throw new Error('Connection reset by peer');
      }),
    };

    await expect(CdpEmulator.injectStealthScript(mockCdp, SAMPLE_BUNDLE)).rejects.toThrow(CdpEmulatorError);
    await expect(CdpEmulator.applyEmulation(mockCdp, SAMPLE_BUNDLE)).rejects.toThrow(CdpEmulatorError);
  });

  it('verifies self-test results correctly', () => {
    const validResult: SelfTestInspectionResult = {
      webdriver: undefined,
      hasWebdriverProp: false,
      ua: SAMPLE_BUNDLE.userAgent,
      platform: 'Win32',
      cores: 16,
      memory: 32,
      languages: ['en-US'],
      maxTouchPoints: 0,
      chromePresent: true,
      toStringGuarded: true,
      webgl: {
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'NVIDIA Corporation',
        unmaskedRenderer: 'NVIDIA GeForce RTX 4070',
      },
      canvasNoiseEnabled: true,
      audioNoiseEnabled: true,
      webrtcPolicy: 'disable_non_proxied_udp',
      pluginsCount: 5,
      score: 1.0,
    };

    const verified = CdpEmulator.verifySelfTest(validResult);
    expect(verified.ok).toBe(true);
    expect(verified.score).toBe(1.0);

    // Assert detection if webdriver leaked
    const leakedResult = { ...validResult, webdriver: true };
    expect(CdpEmulator.verifySelfTest(leakedResult).ok).toBe(false);

    // Assert failure if score is below 0.9
    const lowScoreResult = { ...validResult, score: 0.75 };
    expect(CdpEmulator.verifySelfTest(lowScoreResult).ok).toBe(false);

    // Assert throw on empty/null result
    expect(() => CdpEmulator.verifySelfTest(null)).toThrow(CdpEmulatorError);
  });
});
