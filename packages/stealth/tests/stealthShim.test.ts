import vm from 'node:vm';

import { DEFAULT_PRESET_IDS, type FingerprintBundle } from '@tersoo/contracts';
import { describe, expect, it } from 'vitest';

import { buildStealthScript, getStealthShimSource } from '../src';

const SAMPLE_WINDOWS_BUNDLE: FingerprintBundle = {
  seed: 'test-stealth-seed-98765',
  platform: 'windows',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  uaMetadata: {
    brands: [
      { brand: 'Chromium', version: '128' },
      { brand: 'Google Chrome', version: '128' },
    ],
    platform: 'Windows',
    platformVersion: '15.0.0',
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
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'NVIDIA Corporation',
    unmaskedRenderer: 'NVIDIA GeForce RTX 4070',
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
    cores: 16,
    memoryGb: 32,
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

describe('Ticket 3.2: stealth_shim.js Core Evasions & Prototype Guards', () => {
  it('reads non-empty stealth shim source code', () => {
    const source = getStealthShimSource();
    expect(source).toBeTruthy();
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain('Function.prototype.toString');
    expect(source).toContain('__TERSOO_BUNDLE__');
  });

  it('builds executable script prefixed with serialized bundle', () => {
    const script = buildStealthScript(SAMPLE_WINDOWS_BUNDLE);
    expect(script).toContain('globalThis.__TERSOO_BUNDLE__ =');
    expect(script).toContain(SAMPLE_WINDOWS_BUNDLE.seed);
    expect(script).toContain('hardwareConcurrency');
  });

  it('evaluates in DOM context, removes navigator.webdriver and spoofs hardware', () => {
    // Construct mock browser context
    const sandbox: Record<string, unknown> = {
      console,
      setTimeout,
      clearTimeout,
      Date,
      Math,
      Promise,
      WeakMap,
      Object,
      Function,
      Array,
      JSON,
    };

    // Create realistic Navigator prototype structure
    const NavPrototype = {
      webdriver: true,
      hardwareConcurrency: 4,
      deviceMemory: 8,
      maxTouchPoints: 1,
      language: 'de-DE',
      languages: ['de-DE'],
      platform: 'Linux x86_64',
    };
    const navigator = Object.create(NavPrototype);
    sandbox.navigator = navigator;
    // Create realistic Screen class with prototype getters (matching real browser Screen)
    class Screen {
      get width() { return 800; }
      get height() { return 600; }
      get availWidth() { return 800; }
      get availHeight() { return 560; }
      get colorDepth() { return 24; }
      get pixelDepth() { return 24; }
    }
    sandbox.Screen = Screen;
    sandbox.screen = new Screen();
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);

    // Verify initial polluted state
    expect((context.navigator as Record<string, unknown>).webdriver).toBe(true);

    // Inject and execute
    const scriptCode = buildStealthScript(SAMPLE_WINDOWS_BUNDLE);
    vm.runInContext(scriptCode, context);

    const executedNav = context.navigator as Record<string, unknown>;

    // 1. Assert navigator.webdriver is eliminated
    expect(executedNav.webdriver).not.toBe(true);
    expect('webdriver' in NavPrototype).toBe(false);

    // 2. Assert hardwareConcurrency matches bundle
    expect(executedNav.hardwareConcurrency).toBe(16);

    // 3. Assert deviceMemory matches bundle
    expect(executedNav.deviceMemory).toBe(32);

    // 4. Assert maxTouchPoints matches bundle
    expect(executedNav.maxTouchPoints).toBe(0);

    // 5. Assert languages match bundle
    expect(executedNav.language).toBe('en-US');
    expect(executedNav.languages).toEqual(['en-US', 'en']);

    // 6. Assert platform is Win32
    expect(executedNav.platform).toBe('Win32');

    // 7. Assert window.chrome structure is created and prototype-free
    const chrome = (context as unknown as { chrome: { runtime: { connect: unknown }; loadTimes: () => unknown } }).chrome;
    expect(chrome).toBeDefined();
    expect(chrome.runtime).toBeDefined();
    expect(typeof chrome.runtime.connect).toBe('function');
    expect(typeof chrome.loadTimes).toBe('function');
    expect('prototype' in (chrome.runtime.connect as object)).toBe(false);
    expect('prototype' in (chrome.loadTimes as object)).toBe(false);
    expect(() => new (chrome.loadTimes as any)()).toThrow(TypeError);

    // 8. Assert Screen dimension getters and prototype hygiene
    const screen = context.screen as Record<string, unknown>;
    expect(screen.width).toBe(1920);
    expect(screen.height).toBe(1080);
    expect(screen.availWidth).toBe(1920);
    expect(screen.availHeight).toBe(1040);
    expect(screen.colorDepth).toBe(24);
    expect(screen.pixelDepth).toBe(24);
    expect(context.devicePixelRatio).toBe(1);

    const widthDesc = Object.getOwnPropertyDescriptor(Screen.prototype, 'width');
    expect(widthDesc).toBeDefined();
    expect(typeof widthDesc?.get).toBe('function');
    expect('prototype' in (widthDesc!.get as object)).toBe(false);
    expect(() => new (widthDesc!.get as any)()).toThrow(TypeError);

    // 9. Assert Function.prototype.toString native code guard
    const fnToString = context.Function.prototype.toString;
    expect(fnToString.call(fnToString)).toBe('function toString() { [native code] }');
    expect(fnToString.call(chrome.loadTimes)).toBe('function loadTimes() { [native code] }');
    expect(fnToString.call(widthDesc!.get)).toBe('function get width() { [native code] }');

    // 10. Fix 6 Platform Coherence (Desktop)
    const executedNavRecord = executedNav as Record<string, any>;
    expect(executedNavRecord.plugins.length).toBe(5);
    expect(executedNavRecord.mimeTypes.length).toBe(2);
    expect(executedNavRecord.connection.effectiveType).toBe('4g');
    expect(executedNavRecord.connection.type).toBeUndefined();
    expect(context.screen.orientation.type).toBe('landscape-primary');
    expect(context.screen.orientation.angle).toBe(0);

    // 11. Assert __tersooSelfTest hook returns all expected values
    const selfTestFn = context.__tersooSelfTest as () => {
      webdriver: unknown;
      cores: number;
      memory: number;
      languages: string[];
      toStringGuarded: boolean;
      chromePresent: boolean;
      pluginsCount: number;
      connectionEffectiveType: string;
      orientationType: string;
    };
    expect(typeof selfTestFn).toBe('function');
    const selfTest = selfTestFn();
    expect(selfTest.cores).toBe(16);
    expect(selfTest.memory).toBe(32);
    expect(selfTest.languages).toEqual(['en-US', 'en']);
    expect(selfTest.toStringGuarded).toBe(true);
    expect(selfTest.chromePresent).toBe(true);
    expect(selfTest.pluginsCount).toBe(5);
    expect(selfTest.connectionEffectiveType).toBe('4g');
    expect(selfTest.orientationType).toBe('landscape-primary');
  });

  it('evaluates in mobile context and enforces Android platform coherence', async () => {
    const SAMPLE_ANDROID_BUNDLE: FingerprintBundle = {
      seed: 'test-android-seed-12345',
      platform: 'android',
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      uaMetadata: {
        brands: [
          { brand: 'Chromium', version: '128' },
          { brand: 'Google Chrome', version: '128' },
        ],
        platform: 'Android',
        platformVersion: '14.0.0',
        architecture: 'arm64',
        model: 'Pixel 8 Pro',
        mobile: true,
      },
      screen: {
        width: 412,
        height: 915,
        availWidth: 412,
        availHeight: 915,
        colorDepth: 24,
        dpr: 2.625,
      },
      hardware: {
        cores: 8,
        memoryGb: 12,
        maxTouchPoints: 5,
      },
      locales: {
        languages: ['en-US', 'en'],
        acceptLanguage: 'en-US,en;q=0.9',
      },
      webgl: {
        vendor: 'ARM',
        renderer: 'ARM / Mali-G715 MC11',
        unmaskedVendor: 'ARM',
        unmaskedRenderer: 'Mali-G715 MC11',
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
      timezone: 'America/New_York',
      geolocation: { lat: 40.7, lng: -74.0, accuracy: 50 },
      webrtcPolicy: 'disable_non_proxied_udp',
      webdriverHidden: true,
    };

    const sandbox: Record<string, unknown> = {
      console,
      setTimeout,
      clearTimeout,
      Date,
      Math,
      Promise,
      WeakMap,
      Object,
      Function,
      Array,
      JSON,
    };

    const NavPrototype = {
      webdriver: false,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      maxTouchPoints: 1,
      language: 'en-US',
      languages: ['en-US'],
      platform: 'Linux aarch64',
    };
    const navigator = Object.create(NavPrototype);
    sandbox.navigator = navigator;

    class Screen {
      get width() { return 412; }
      get height() { return 915; }
      get availWidth() { return 412; }
      get availHeight() { return 915; }
      get colorDepth() { return 24; }
      get pixelDepth() { return 24; }
    }
    sandbox.Screen = Screen;
    sandbox.screen = new Screen();

    // Mock matchMedia
    sandbox.matchMedia = (query: string) => ({
      matches: false,
      media: query,
    });

    // Mock speechSynthesis
    class SpeechSynthesis {
      getVoices() {
        return [];
      }
    }
    sandbox.speechSynthesis = new SpeechSynthesis();

    // Mock document with fonts
    sandbox.document = {
      fonts: {
        check: () => true,
      },
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);
    const scriptCode = buildStealthScript(SAMPLE_ANDROID_BUNDLE);
    vm.runInContext(scriptCode, context);

    const executedNav = context.navigator as Record<string, any>;

    // 1. Android plugins must be empty (0 plugins on mobile)
    expect(executedNav.plugins.length).toBe(0);
    expect(executedNav.mimeTypes.length).toBe(0);

    // 2. Android connection must report cellular
    expect(executedNav.connection.effectiveType).toBe('4g');
    expect(executedNav.connection.type).toBe('cellular');

    // 3. Android orientation must be portrait-primary
    expect(context.screen.orientation.type).toBe('portrait-primary');

    // 4. CSS Media Queries on Android
    const matchHoverNone = (context.matchMedia as any)('(hover: none)');
    expect(matchHoverNone.matches).toBe(true);
    const matchHoverHover = (context.matchMedia as any)('(hover: hover)');
    expect(matchHoverHover.matches).toBe(false);
    const matchPointerCoarse = (context.matchMedia as any)('(pointer: coarse)');
    expect(matchPointerCoarse.matches).toBe(true);

    // 5. Speech Synthesis on Android
    const voices = (context.speechSynthesis as any).getVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0].name).toContain('Google');

    // 6. Battery on Android
    const battery = await executedNav.getBattery();
    expect(battery.level).toBe(0.88);
    expect(battery.charging).toBe(false);

    // 7. Font checks on Android
    expect((context.document as any).fonts.check("12px 'Roboto'")).toBe(true);
    expect((context.document as any).fonts.check("12px 'Segoe UI'")).toBe(false);
  });
});
