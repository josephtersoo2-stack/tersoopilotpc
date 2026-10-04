import { describe, expect, it } from 'vitest';
import { FingerprintBundle } from '../src/fingerprint';

describe('Contracts: FingerprintBundle', () => {
  const validBundle: FingerprintBundle = {
    seed: 'seed123456',
    platform: 'windows',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    uaMetadata: {
      brands: [
        { brand: 'Chromium', version: '128' },
        { brand: 'Google Chrome', version: '128' },
      ],
      platform: 'Windows',
      platformVersion: '10.0.0',
      architecture: 'x86',
      model: '',
      mobile: false,
    },
    screen: {
      width: 1920,
      height: 1080,
      availWidth: 1920,
      availHeight: 1040,
      colorDepth: 24,
      dpr: 1,
    },
    webgl: {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'NVIDIA Corporation',
      unmaskedRenderer: 'NVIDIA GeForce RTX 3080',
    },
    canvasNoise: {
      enabled: true,
      algorithm: 'gaussian',
      intensity: 0.15,
    },
    audioNoise: {
      enabled: true,
      algorithm: 'gaussian',
      intensity: 0.1,
    },
    hardware: {
      cores: 8,
      memoryGb: 16,
      maxTouchPoints: 0,
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
    },
    timezone: 'America/New_York',
    geolocation: {
      lat: 40.7128,
      lng: -74.006,
      accuracy: 50,
    },
    webrtcPolicy: 'disable_non_proxied_udp',
    webdriverHidden: true,
  };

  it('validates a complete, valid FingerprintBundle', () => {
    const parsed = FingerprintBundle.parse(validBundle);
    expect(parsed).toEqual(validBundle);
  });

  it('allows nullable geolocation', () => {
    const bundleWithNullGeo = {
      ...validBundle,
      geolocation: null,
    };
    const parsed = FingerprintBundle.parse(bundleWithNullGeo);
    expect(parsed.geolocation).toBeNull();
  });

  it('rejects seeds shorter than 8 characters', () => {
    expect(() =>
      FingerprintBundle.parse({
        ...validBundle,
        seed: 'short',
      }),
    ).toThrow();
  });

  it('rejects user agent strings shorter than 20 characters', () => {
    expect(() =>
      FingerprintBundle.parse({
        ...validBundle,
        userAgent: 'Short/1.0',
      }),
    ).toThrow();
  });

  it('enforces literal constraints', () => {
    expect(() =>
      FingerprintBundle.parse({
        ...validBundle,
        // @ts-expect-error Testing invalid literal
        webrtcPolicy: 'allow_all',
      }),
    ).toThrow();

    expect(() =>
      FingerprintBundle.parse({
        ...validBundle,
        // @ts-expect-error Testing invalid literal
        webdriverHidden: false,
      }),
    ).toThrow();
  });
});
