import type { FingerprintBundle } from '@tersoo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBus } from '../src/events/EventBus';
import { CrosshairWorker } from '../src/crosshair/CrosshairWorker';
import { CrosshairError } from '../src/util/errors';

const mockSend = vi.fn().mockResolvedValue({});
const mockDetach = vi.fn().mockResolvedValue(undefined);
const mockEvaluate = vi.fn();
const mockAddInitScript = vi.fn().mockResolvedValue(undefined);
const mockBrowserClose = vi.fn().mockResolvedValue(undefined);

const mockCdpSession = {
  send: mockSend,
  detach: mockDetach,
};

const mockPage = {
  evaluate: mockEvaluate,
};

const mockContext = {
  pages: vi.fn(() => [mockPage]),
  newPage: vi.fn(async () => mockPage),
  newCDPSession: vi.fn(async () => mockCdpSession),
  addInitScript: mockAddInitScript,
};

const mockBrowser = {
  contexts: vi.fn(() => [mockContext]),
  newContext: vi.fn(async () => mockContext),
  close: mockBrowserClose,
};

vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: vi.fn(async () => mockBrowser),
  },
}));

const SAMPLE_BUNDLE: FingerprintBundle = {
  seed: 'crosshair-worker-test-seed',
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
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, dpr: 1.0 },
  webgl: {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'NVIDIA Corporation',
    unmaskedRenderer: 'NVIDIA GeForce RTX 3080',
  },
  canvasNoise: { enabled: true, algorithm: 'gaussian', intensity: 0.1 },
  audioNoise: { enabled: true, algorithm: 'gaussian', intensity: 0.1 },
  hardware: { cores: 8, memoryGb: 16, maxTouchPoints: 0 },
  locales: { languages: ['en-US', 'en'], acceptLanguage: 'en-US,en;q=0.9' },
  timezone: 'America/New_York',
  geolocation: { lat: 40.7128, lng: -74.006, accuracy: 50 },
  webrtcPolicy: 'disable_non_proxied_udp',
  webdriverHidden: true,
};

describe('Ticket 4.1: CrosshairWorker Playwright CDP Attachment & Emulation', () => {
  let events: EventBus;
  let mockAnchors: any;
  let worker: CrosshairWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new EventBus();
    mockAnchors = {
      remember: vi.fn().mockResolvedValue(undefined),
      recall: vi.fn().mockResolvedValue(null),
    };
    worker = new CrosshairWorker({
      events,
      anchors: mockAnchors,
    });
  });

  it('throws CrosshairError when cdpWsUrl is missing on attach', async () => {
    await expect(
      worker.attach({
        profileId: 'test-profile-1',
        bundle: SAMPLE_BUNDLE,
      }),
    ).rejects.toThrow(CrosshairError);
  });

  it('attaches to Playwright CDP, injects initScript, and applies emulation', async () => {
    const attachedSpy = vi.fn();
    events.on('crosshair.attached', attachedSpy);

    await worker.attach({
      profileId: 'test-profile-1',
      cdpWsUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
      bundle: SAMPLE_BUNDLE,
      proxy: {
        geo_tz: 'America/Chicago',
        geo_lat: 41.8781,
        geo_lng: -87.6298,
      },
    });

    expect(worker.hasSession('test-profile-1')).toBe(true);
    expect(attachedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'test-profile-1',
      }),
    );

    // Verify initScript added
    expect(mockAddInitScript).toHaveBeenCalledTimes(1);
    expect(mockAddInitScript).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(SAMPLE_BUNDLE.seed),
      }),
    );

    // Verify CDP emulation overrides dispatched
    expect(mockSend).toHaveBeenCalledWith('Network.enable');
    expect(mockSend).toHaveBeenCalledWith(
      'Network.setUserAgentOverride',
      expect.objectContaining({
        userAgent: SAMPLE_BUNDLE.userAgent,
        platform: SAMPLE_BUNDLE.uaMetadata.platform,
      }),
    );
    expect(mockSend).toHaveBeenCalledWith('Emulation.setTimezoneOverride', {
      timezoneId: 'America/Chicago', // Proxy timezone override
    });
    expect(mockSend).toHaveBeenCalledWith('Emulation.setLocaleOverride', {
      locale: 'en-US',
    });
    expect(mockSend).toHaveBeenCalledWith('Emulation.setGeolocationOverride', {
      latitude: 41.8781,
      longitude: -87.6298,
      accuracy: 50,
    });
    // Desktop profile (mobile: false): Emulation.setDeviceMetricsOverride is omitted to prevent fractional subpixels
    expect(mockSend).not.toHaveBeenCalledWith(
      'Emulation.setDeviceMetricsOverride',
      expect.anything(),
    );
  });

  it('dispatches Emulation.setDeviceMetricsOverride for mobile profiles', async () => {
    const mobileBundle = {
      ...SAMPLE_BUNDLE,
      uaMetadata: {
        ...SAMPLE_BUNDLE.uaMetadata,
        mobile: true,
      },
    };
    await worker.attach({
      profileId: 'test-profile-mobile',
      cdpWsUrl: 'ws://127.0.0.1:9222/devtools/browser/xyz',
      bundle: mobileBundle,
    });
    expect(mockSend).toHaveBeenCalledWith('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1.0,
      mobile: true,
    });
  });

  it('assertStealthReady succeeds when score >= 0.9 and webdriver is clean', async () => {
    await worker.attach({
      profileId: 'test-profile-1',
      cdpWsUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
      bundle: SAMPLE_BUNDLE,
    });

    mockEvaluate.mockResolvedValueOnce({
      score: 1.0,
      webdriver: false,
      hasWebdriverProp: false,
    });

    const report = await worker.assertStealthReady('test-profile-1');
    expect(report['score']).toBe(1.0);
  });

  it('assertStealthReady throws STEALTH_FAILED if score < 0.9 or webdriver is detected', async () => {
    await worker.attach({
      profileId: 'test-profile-1',
      cdpWsUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
      bundle: SAMPLE_BUNDLE,
    });

    mockEvaluate.mockResolvedValueOnce({
      score: 0.6,
      webdriver: true,
      hasWebdriverProp: true,
    });

    await expect(worker.assertStealthReady('test-profile-1')).rejects.toThrow(
      CrosshairError,
    );
  });

  it('closes session and emits crosshair.detached', async () => {
    const detachedSpy = vi.fn();
    events.on('crosshair.detached', detachedSpy);

    await worker.attach({
      profileId: 'test-profile-1',
      cdpWsUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
      bundle: SAMPLE_BUNDLE,
    });

    await worker.close('test-profile-1');

    expect(worker.hasSession('test-profile-1')).toBe(false);
    expect(mockDetach).toHaveBeenCalled();
    expect(mockBrowserClose).toHaveBeenCalled();
    expect(detachedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'test-profile-1',
      }),
    );
  });
});
