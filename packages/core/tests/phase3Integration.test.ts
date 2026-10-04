import fs from 'node:fs';
import vm from 'node:vm';

import { DEFAULT_PRESET_IDS, type FingerprintBundle } from '@tersoo/contracts';
import {
  buildStealthScript,
  getSelfTestHtmlPath,
  getSelfTestHtmlSource,
} from '@tersoo/stealth';
import { describe, expect, it } from 'vitest';

import { CdpEmulator, type CDPClient } from '../src/fingerprint/CdpEmulator';
import { validateCoherence } from '../src/fingerprint/coherence';
import { FingerprintEngine } from '../src/fingerprint/FingerprintEngine';
import { PRESET_DEFINITIONS } from '../src/fingerprint/presets';
import { evaluateSelfTest, runSelfTestViaCdp } from '../src/fingerprint/selfTest';

function createMockBrowserContext(bundle: FingerprintBundle) {
  const sandbox: Record<string, unknown> = {
    console,
    Date,
    Math,
    Promise,
    WeakMap,
    Object,
    Function,
    Array,
    JSON,
    Float32Array,
    Uint8ClampedArray,
    setTimeout,
    clearTimeout,
  };

  const navProto = {
    webdriver: true,
    hardwareConcurrency: 4,
    deviceMemory: 8,
    maxTouchPoints: 0,
    language: 'en-US',
    languages: ['en-US'],
    platform: 'Win32',
    permissions: {
      query: (params: unknown) =>
        Promise.resolve({
          state: 'granted',
          name: (params as { name: string }).name,
        }),
    },
  };
  sandbox.navigator = Object.create(navProto);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // Mock WebGL
  class WebGLRenderingContext {
    getParameter(param: number): unknown {
      if (param === 0x1f00) return 'Original Vendor';
      if (param === 0x1f01) return 'Original Renderer';
      if (param === 0x9245) return 'Original Unmasked Vendor';
      if (param === 0x9246) return 'Original Unmasked Renderer';
      return null;
    }
    getExtension(_name: string): unknown {
      return null;
    }
    getSupportedExtensions(): string[] {
      return ['OES_texture_float'];
    }
  }

  class WebGL2RenderingContext extends WebGLRenderingContext {}

  sandbox.WebGLRenderingContext = WebGLRenderingContext;
  sandbox.WebGL2RenderingContext = WebGL2RenderingContext;

  // Mock 2D Canvas & ImageData
  class CanvasRenderingContext2D {
    pixels: Uint8ClampedArray;
    constructor() {
      this.pixels = new Uint8ClampedArray(100 * 100 * 4);
      for (let i = 0; i < this.pixels.length; i += 4) {
        this.pixels[i] = (i * 7) % 256; // R
        this.pixels[i + 1] = (i * 13) % 256; // G
        this.pixels[i + 2] = (i * 29) % 256; // B
        this.pixels[i + 3] = 255; // Alpha
      }
    }
    drawImage(source: { getContext(type: string): unknown }) {
      const srcCtx = source.getContext('2d') as CanvasRenderingContext2D | null;
      if (srcCtx && srcCtx.pixels) {
        this.pixels.set(srcCtx.pixels);
      }
    }
    getImageData(_sx: number, _sy: number, sw: number, sh: number) {
      const length = sw * sh * 4;
      const data = new Uint8ClampedArray(this.pixels.subarray(0, length));
      return { data, width: sw, height: sh };
    }
    putImageData(imgData: { data: Uint8ClampedArray }) {
      this.pixels.set(imgData.data.subarray(0, this.pixels.length));
    }
  }

  class HTMLCanvasElement {
    width = 100;
    height = 100;
    private ctx2d: CanvasRenderingContext2D | null = null;
    getContext(type: string): unknown {
      if (type === '2d') {
        if (!this.ctx2d) {
          this.ctx2d = new CanvasRenderingContext2D();
        }
        return this.ctx2d;
      }
      if (type === 'webgl' || type === 'webgl2') return new WebGLRenderingContext();
      return null;
    }
    toDataURL(): string {
      const ctx = this.getContext('2d') as CanvasRenderingContext2D;
      const data = ctx.pixels;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum = (sum * 31 + data[i]!) | 0;
      }
      return 'data:image/png;base64,mock' + (sum >>> 0).toString(16);
    }
    toBlob(callback: (blob: { size: number }) => void): void {
      callback({ size: 1024 });
    }
  }

  sandbox.CanvasRenderingContext2D = CanvasRenderingContext2D;
  sandbox.HTMLCanvasElement = HTMLCanvasElement;

  // Mock AudioBuffer
  class AudioBuffer {
    channel0 = new Float32Array([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, -0.5, -0.2, 0.15, 0.25, 0.35, 0.45,
    ]);
    getChannelData(_channel: number): Float32Array {
      return new Float32Array(this.channel0);
    }
    copyFromChannel(
      destination: Float32Array,
      _channelNumber: number,
      _startInChannel?: number,
    ): void {
      destination.set(this.channel0.subarray(0, destination.length));
    }
  }

  // Mock AnalyserNode
  class AnalyserNode {
    getFloatFrequencyData(array: Float32Array): void {
      for (let i = 0; i < array.length; i++) {
        array[i] = -50.0;
      }
    }
  }

  // Mock RTCPeerConnection
  class RTCPeerConnection {
    private listeners: Record<string, ((ev: unknown) => void)[]> = {};
    private _handler: ((ev: unknown) => void) | null = null;

    get onicecandidate(): ((ev: unknown) => void) | null {
      return this._handler;
    }
    set onicecandidate(val: ((ev: unknown) => void) | null) {
      this._handler = val;
    }

    addEventListener(type: string, listener: (ev: unknown) => void): void {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type]!.push(listener);
    }
  }

  sandbox.AudioBuffer = AudioBuffer;
  sandbox.AnalyserNode = AnalyserNode;
  sandbox.RTCPeerConnection = RTCPeerConnection;

  const context = vm.createContext(sandbox);
  const scriptCode = buildStealthScript(bundle);
  vm.runInContext(scriptCode, context);
  return context;
}

describe('Ticket 3.7: Phase 3 Exit Criteria Verification Suite', () => {
  const dummyPresetRepo = {
    getById: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
  };
  const engine = new FingerprintEngine(dummyPresetRepo as never);

  const presetIds = [
    DEFAULT_PRESET_IDS.windows11,
    DEFAULT_PRESET_IDS.windows10,
    DEFAULT_PRESET_IDS.macosSonoma,
    DEFAULT_PRESET_IDS.macosSequoia,
    DEFAULT_PRESET_IDS.android14,
    DEFAULT_PRESET_IDS.galaxyS24,
  ];

  describe('Exit Criterion 1: Self-test score >= 0.9 on all 6 OS presets', () => {
    for (const presetId of presetIds) {
      it(`verifies self-test passes with score >= 0.9 for preset: ${presetId}`, async () => {
        const bundle = await engine.resolve({
          presetId,
          fingerprintSeed: `phase3-test-seed-${presetId}`,
        });

        expect(bundle).toBeDefined();
        expect(bundle.platform).toBe(PRESET_DEFINITIONS[presetId]!.platform);

        const context = createMockBrowserContext(bundle);
        const selfTestFn = context.__tersooSelfTest as () => unknown;
        expect(typeof selfTestFn).toBe('function');

        const rawTelemetry = selfTestFn() as Record<string, unknown>;
        const testResult = await engine.selfTest(rawTelemetry, bundle);

        expect(testResult.ok).toBe(true);
        expect(testResult.score).toBeGreaterThanOrEqual(0.9);
        expect(testResult.mismatches).toHaveLength(0);

        // Individual evasion checks
        expect(testResult.telemetry.webdriver).toBeUndefined();
        expect(testResult.telemetry.hasWebdriverProp).toBe(false);
        expect(testResult.telemetry.chromePresent).toBe(true);
        expect(testResult.telemetry.toStringGuarded).toBe(true);
        expect(testResult.telemetry.cores).toBe(bundle.hardware.cores);
        expect(testResult.telemetry.memory).toBe(bundle.hardware.memoryGb);
        expect(testResult.telemetry.canvasNoiseEnabled).toBe(true);
        expect(testResult.telemetry.audioNoiseEnabled).toBe(true);
      });
    }
  });

  describe('Exit Criterion 2: Canvas hash differs per seed, stable per profile', () => {
    it('guarantees double-sampling stability for identical profile seed', async () => {
      const bundleA = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'seed-profile-consistent-alpha-999',
      });

      const context1 = createMockBrowserContext(bundleA);
      const canvas1 = new (context1.HTMLCanvasElement as new () => {
        getContext(type: string): {
          getImageData(
            sx: number,
            sy: number,
            sw: number,
            sh: number,
          ): { data: Uint8ClampedArray };
        };
        toDataURL(): string;
      })();
      const ctx1 = canvas1.getContext('2d');

      const dataUrl1 = canvas1.toDataURL();
      const pixels1A = ctx1.getImageData(0, 0, 32, 32).data;
      const pixels1B = ctx1.getImageData(0, 0, 32, 32).data;

      // Double-sampling on same context
      expect(pixels1A).toEqual(pixels1B);

      // Same seed in new context
      const context2 = createMockBrowserContext(bundleA);
      const canvas2 = new (context2.HTMLCanvasElement as new () => {
        getContext(type: string): {
          getImageData(
            sx: number,
            sy: number,
            sw: number,
            sh: number,
          ): { data: Uint8ClampedArray };
        };
        toDataURL(): string;
      })();
      const ctx2 = canvas2.getContext('2d');

      const dataUrl2 = canvas2.toDataURL();
      const pixels2 = ctx2.getImageData(0, 0, 32, 32).data;

      expect(dataUrl1).toBe(dataUrl2);
      expect(pixels1A).toEqual(pixels2);
    });

    it('guarantees seed divergence: distinct seeds produce different canvas hashes', async () => {
      const bundleAlpha = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'seed-divergence-alpha-11111',
      });
      const bundleBeta = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'seed-divergence-beta-22222',
      });

      const contextAlpha = createMockBrowserContext(bundleAlpha);
      const contextBeta = createMockBrowserContext(bundleBeta);

      const canvasAlpha = new (contextAlpha.HTMLCanvasElement as new () => {
        getContext(type: string): {
          getImageData(
            sx: number,
            sy: number,
            sw: number,
            sh: number,
          ): { data: Uint8ClampedArray };
        };
        toDataURL(): string;
      })();
      const canvasBeta = new (contextBeta.HTMLCanvasElement as new () => {
        getContext(type: string): {
          getImageData(
            sx: number,
            sy: number,
            sw: number,
            sh: number,
          ): { data: Uint8ClampedArray };
        };
        toDataURL(): string;
      })();

      const pixelsAlpha = canvasAlpha.getContext('2d').getImageData(0, 0, 32, 32).data;
      const pixelsBeta = canvasBeta.getContext('2d').getImageData(0, 0, 32, 32).data;

      const dataUrlAlpha = canvasAlpha.toDataURL();
      const dataUrlBeta = canvasBeta.toDataURL();

      expect(pixelsAlpha).not.toEqual(pixelsBeta);
      expect(dataUrlAlpha).not.toBe(dataUrlBeta);
    });
  });

  describe('Exit Criterion 3: WebGL vendor and renderer strings match preset exactly', () => {
    for (const presetId of presetIds) {
      it(`intercepts and validates WebGL strings for ${presetId}`, async () => {
        const bundle = await engine.resolve({
          presetId,
          fingerprintSeed: `webgl-test-${presetId}`,
        });

        const context = createMockBrowserContext(bundle);
        const gl = new (context.WebGLRenderingContext as new () => {
          getParameter(param: number): unknown;
          getExtension(name: string): unknown;
        })();

        // Unmasked Vendor & Renderer
        expect(gl.getParameter(0x9245)).toBe(bundle.webgl.unmaskedVendor);
        expect(gl.getParameter(0x9246)).toBe(bundle.webgl.unmaskedRenderer);

        // Masked Vendor & Renderer
        expect(gl.getParameter(0x1f00)).toBe(bundle.webgl.vendor);
        expect(gl.getParameter(0x1f01)).toBe(bundle.webgl.renderer);

        // Debug extension injection
        const debugExt = gl.getExtension('WEBGL_debug_renderer_info') as Record<
          string,
          number
        >;
        expect(debugExt).toBeDefined();
        expect(debugExt.UNMASKED_VENDOR_WEBGL).toBe(0x9245);
        expect(debugExt.UNMASKED_RENDERER_WEBGL).toBe(0x9246);
      });
    }
  });

  describe('Exit Criterion 4: Timezone matches proxy geo-exit override', () => {
    it('sets CDP timezone override to proxy geo timezone over bundle default', async () => {
      const bundle = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'timezone-override-test-seed',
      });

      expect(bundle.timezone).toBe('America/New_York');

      const cdpCalls: { method: string; params?: Record<string, unknown> }[] = [];
      const mockCdp: CDPClient = {
        send: (method, params) => {
          cdpCalls.push({ method, params });
          return Promise.resolve({});
        },
      };

      // 1. With proxy geo timezone Europe/Paris
      await CdpEmulator.applyEmulation(mockCdp, bundle, {
        proxyGeo: {
          timezone: 'Europe/Paris',
          lat: 48.8566,
          lng: 2.3522,
        },
      });

      const tzCallWithProxy = cdpCalls.find(
        (c) => c.method === 'Emulation.setTimezoneOverride',
      );
      expect(tzCallWithProxy).toBeDefined();
      expect(tzCallWithProxy?.params?.timezoneId).toBe('Europe/Paris');

      // Geolocation override verification
      const geoCall = cdpCalls.find(
        (c) => c.method === 'Emulation.setGeolocationOverride',
      );
      expect(geoCall).toBeDefined();
      expect(geoCall?.params?.latitude).toBe(48.8566);
      expect(geoCall?.params?.longitude).toBe(2.3522);

      // 2. Without proxy geo timezone -> three-state policy preserves host system timezone
      cdpCalls.length = 0;
      await CdpEmulator.applyEmulation(mockCdp, bundle, {});
      const tzCallDefault = cdpCalls.find(
        (c) => c.method === 'Emulation.setTimezoneOverride',
      );
      expect(tzCallDefault).toBeUndefined();
    });

    it('verifies cross-subsystem coherence passes with coherent proxy geo', async () => {
      const bundle = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'coherence-test-seed',
      });

      const coherence = validateCoherence(bundle, {
        geo_country: 'US',
        geo_tz: 'America/New_York',
        geo_lat: 40.7128,
        geo_lng: -74.006,
      });

      expect(coherence.ok).toBe(true);
      expect(coherence.reasons).toHaveLength(0);
    });
  });

  describe('Exit Criterion 5: Self-test HTML page asset deliverable', () => {
    it('verifies self-test HTML asset file exists and contains diagnostic elements', () => {
      const htmlPath = getSelfTestHtmlPath();
      expect(fs.existsSync(htmlPath)).toBe(true);

      const htmlSource = getSelfTestHtmlSource();
      expect(htmlSource).toContain('TersooPilot Anti-Detect Self-Test');
      expect(htmlSource).toContain('id="scoreBadge"');
      expect(htmlSource).toContain('id="signalsGrid"');
      expect(htmlSource).toContain('window.__tersooSelfTestResult');
      expect(htmlSource).toContain('tersoo-self-test-complete');
    });
  });

  describe('Exit Criterion 6: Self-test via CDP Runtime.evaluate', () => {
    it('executes and evaluates self-test over CDP connection', async () => {
      const bundle = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'cdp-self-test-seed',
      });

      const context = createMockBrowserContext(bundle);
      const selfTestFn = context.__tersooSelfTest as () => unknown;
      const liveTelemetry = selfTestFn();

      const mockCdp: CDPClient = {
        send: (method) => {
          if (method === 'Runtime.evaluate') {
            return Promise.resolve({
              result: {
                value: liveTelemetry,
              },
            });
          }
          return Promise.resolve({});
        },
      };

      const cdpResult = await runSelfTestViaCdp(mockCdp, bundle);
      expect(cdpResult.ok).toBe(true);
      expect(cdpResult.score).toBeGreaterThanOrEqual(0.9);
      expect(cdpResult.mismatches).toHaveLength(0);
    });

    it('flags mismatches if self-test score or evasions are compromised', async () => {
      const bundle = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'compromised-test-seed',
      });

      // Degraded telemetry
      const compromisedTelemetry = {
        webdriver: true,
        hasWebdriverProp: true,
        cores: 2, // mismatch with bundle
        memory: 4, // mismatch with bundle
        languages: ['de-DE'],
        platform: 'Linux x86_64',
        chromePresent: false,
        toStringGuarded: false,
        webgl: {
          unmaskedVendor: 'Bogus Vendor',
          unmaskedRenderer: 'Bogus Renderer',
        },
        score: 0.2,
      };

      const result = evaluateSelfTest(compromisedTelemetry, bundle);
      expect(result.ok).toBe(false);
      expect(result.score).toBe(0.2);
      expect(result.mismatches.length).toBeGreaterThan(3);
      expect(result.mismatches).toContain(
        'navigator.webdriver was not completely erased or masked',
      );
      expect(result.mismatches).toContain(
        'Self-test score 0.2 is below threshold 0.90',
      );
    });
  });
});
