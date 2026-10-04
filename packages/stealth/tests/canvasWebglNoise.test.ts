import vm from 'node:vm';

import type { FingerprintBundle } from '@tersoo/contracts';
import { describe, expect, it } from 'vitest';

import { buildStealthScript } from '../src';

const BUNDLE_A: FingerprintBundle = {
  seed: 'seed-profile-alpha-12345',
  platform: 'windows',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
  uaMetadata: {
    brands: [{ brand: 'Chromium', version: '128' }],
    platform: 'Windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
  },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, dpr: 1 },
  webgl: {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    unmaskedVendor: 'NVIDIA Corporation',
    unmaskedRenderer: 'NVIDIA GeForce RTX 4070',
  },
  canvasNoise: {
    enabled: true,
    algorithm: 'gaussian',
    intensity: 0.2,
  },
  audioNoise: {
    enabled: true,
    algorithm: 'gaussian',
    intensity: 0.1,
  },
  hardware: { cores: 16, memoryGb: 32, maxTouchPoints: 0 },
  locales: { languages: ['en-US', 'en'], acceptLanguage: 'en-US,en;q=0.9' },
  timezone: 'America/New_York',
  geolocation: { lat: 40.7128, lng: -74.006, accuracy: 50 },
  webrtcPolicy: 'disable_non_proxied_udp',
  webdriverHidden: true,
};

const BUNDLE_B: FingerprintBundle = {
  ...BUNDLE_A,
  seed: 'seed-profile-beta-67890',
  webgl: {
    vendor: 'Apple Inc.',
    renderer: 'Apple GPU',
    unmaskedVendor: 'Apple',
    unmaskedRenderer: 'Apple M2 Pro',
  },
};

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
  };

  const navProto = {
    webdriver: true,
    hardwareConcurrency: 4,
    deviceMemory: 8,
    maxTouchPoints: 0,
    language: 'en-US',
    languages: ['en-US'],
    platform: 'Win32',
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
    getImageData(_sx: number, _sy: number, sw: number, sh: number) {
      // Generate rich test pattern with varying RGB colors (> 8 distinct colors)
      const length = sw * sh * 4;
      const data = new Uint8ClampedArray(length);
      for (let i = 0; i < length; i += 4) {
        data[i] = (i * 7) % 256; // R
        data[i + 1] = (i * 13) % 256; // G
        data[i + 2] = (i * 29) % 256; // B
        data[i + 3] = 255; // Alpha
      }
      return { data, width: sw, height: sh };
    }
    putImageData() {}
  }

  class HTMLCanvasElement {
    width = 100;
    height = 100;
    getContext(type: string): unknown {
      if (type === '2d') return new CanvasRenderingContext2D();
      if (type === 'webgl') return new WebGLRenderingContext();
      return null;
    }
    toDataURL(): string {
      return 'data:image/png;base64,mockOriginalPng';
    }
    toBlob(callback: (b: unknown) => void) {
      callback(new Blob([]));
    }
  }

  sandbox.CanvasRenderingContext2D = CanvasRenderingContext2D;
  sandbox.HTMLCanvasElement = HTMLCanvasElement;
  sandbox.Uint8ClampedArray = Uint8ClampedArray;
  sandbox.Blob = class Blob {};

  const context = vm.createContext(sandbox);
  const scriptCode = buildStealthScript(bundle);
  vm.runInContext(scriptCode, context);

  return context;
}

describe('Ticket 3.3: Canvas & WebGL Noise Evasion Hooks', () => {
  it('spoofs WebGL vendor and unmasked renderer strings correctly', () => {
    const ctx = createMockBrowserContext(BUNDLE_A);
    const WebGLClass = ctx.WebGLRenderingContext as { prototype: { getParameter: (p: number) => unknown; getExtension: (n: string) => unknown; getSupportedExtensions: () => string[] } };

    const gl = Object.create(WebGLClass.prototype);

    // Assert spoofed values match preset
    expect(gl.getParameter(0x9245)).toBe('NVIDIA Corporation');
    expect(gl.getParameter(0x9246)).toBe('NVIDIA GeForce RTX 4070');
    expect(gl.getParameter(0x1f00)).toBe('Google Inc. (NVIDIA)');
    expect(gl.getParameter(0x1f01)).toBe('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)');

    // Assert WEBGL_debug_renderer_info extension
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as Record<string, number>;
    expect(ext).toBeDefined();
    expect(ext.UNMASKED_VENDOR_WEBGL).toBe(0x9245);
    expect(ext.UNMASKED_RENDERER_WEBGL).toBe(0x9246);

    // Assert getSupportedExtensions includes WEBGL_debug_renderer_info
    const exts = gl.getSupportedExtensions();
    expect(exts).toContain('WEBGL_debug_renderer_info');

    // Assert native toString guard and prototype-free wrapper
    const fnToString = ctx.Function.prototype.toString;
    expect(fnToString.call(gl.getParameter)).toBe('function getParameter() { [native code] }');
    expect(fnToString.call(gl.getExtension)).toBe('function getExtension() { [native code] }');
    expect(fnToString.call(gl.getSupportedExtensions)).toBe('function getSupportedExtensions() { [native code] }');
    expect('prototype' in gl.getParameter).toBe(false);
    expect(() => new (gl.getParameter as any)()).toThrow(TypeError);
  });

  it('spoofs WebGL strings for different presets independently', () => {
    const ctxApple = createMockBrowserContext(BUNDLE_B);
    const WebGLClass = ctxApple.WebGLRenderingContext as { prototype: { getParameter: (p: number) => unknown } };
    const gl = Object.create(WebGLClass.prototype);

    expect(gl.getParameter(0x9245)).toBe('Apple');
    expect(gl.getParameter(0x9246)).toBe('Apple M2 Pro');
    expect(gl.getParameter(0x1f00)).toBe('Apple Inc.');
    expect(gl.getParameter(0x1f01)).toBe('Apple GPU');
  });

  it('perturbs canvas ImageData deterministically per seed and preserves stability', () => {
    const ctxA1 = createMockBrowserContext(BUNDLE_A);
    const ctxA2 = createMockBrowserContext(BUNDLE_A);
    const ctxB = createMockBrowserContext(BUNDLE_B);

    const proto2D_A1 = (ctxA1.CanvasRenderingContext2D as { prototype: { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } } }).prototype;
    const proto2D_A2 = (ctxA2.CanvasRenderingContext2D as { prototype: { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } } }).prototype;
    const proto2D_B = (ctxB.CanvasRenderingContext2D as { prototype: { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } } }).prototype;

    const dataA1_first = proto2D_A1.getImageData(0, 0, 32, 32).data;
    const dataA1_second = proto2D_A1.getImageData(0, 0, 32, 32).data;
    const dataA2 = proto2D_A2.getImageData(0, 0, 32, 32).data;
    const dataB = proto2D_B.getImageData(0, 0, 32, 32).data;

    // 1. Same instance stability (repeated calls return identical result to defeat double-sampling detection)
    expect(Array.from(dataA1_first)).toEqual(Array.from(dataA1_second));

    // 2. Same seed across distinct sessions produces identical deterministic noise
    expect(Array.from(dataA1_first)).toEqual(Array.from(dataA2));

    // 3. Different seed (BUNDLE_B) produces DIFFERENT pixel noise
    expect(Array.from(dataA1_first)).not.toEqual(Array.from(dataB));

    // 4. Alpha channel (every 4th byte starting at 3) is untouched (255)
    for (let i = 3; i < dataA1_first.length; i += 4) {
      expect(dataA1_first[i]).toBe(255);
    }

    // 5. Native toString guard & prototype-free wrapper on getImageData
    const fnToString = ctxA1.Function.prototype.toString;
    expect(fnToString.call(proto2D_A1.getImageData)).toBe('function getImageData() { [native code] }');
    expect('prototype' in proto2D_A1.getImageData).toBe(false);
    expect(() => new (proto2D_A1.getImageData as any)()).toThrow(TypeError);
  });

  it('guards HTMLCanvasElement toDataURL and toBlob with native toString and prototype-free wrappers', () => {
    const ctx = createMockBrowserContext(BUNDLE_A);
    const canvasProto = (ctx.HTMLCanvasElement as { prototype: { toDataURL: unknown; toBlob: unknown } }).prototype;
    const fnToString = ctx.Function.prototype.toString;

    expect(fnToString.call(canvasProto.toDataURL)).toBe('function toDataURL() { [native code] }');
    expect(fnToString.call(canvasProto.toBlob)).toBe('function toBlob() { [native code] }');
    expect('prototype' in (canvasProto.toDataURL as object)).toBe(false);
    expect('prototype' in (canvasProto.toBlob as object)).toBe(false);
    expect(() => new (canvasProto.toDataURL as any)()).toThrow(TypeError);
  });

  it('exposes WebGL strings and canvasNoise status in __tersooSelfTest()', () => {
    const ctx = createMockBrowserContext(BUNDLE_A);
    const selfTestFn = ctx.__tersooSelfTest as () => {
      webgl: { vendor: string; renderer: string; unmaskedVendor: string; unmaskedRenderer: string };
      canvasNoiseEnabled: boolean;
    };

    const result = selfTestFn();
    expect(result.canvasNoiseEnabled).toBe(true);
    expect(result.webgl.unmaskedVendor).toBe('NVIDIA Corporation');
    expect(result.webgl.unmaskedRenderer).toBe('NVIDIA GeForce RTX 4070');
  });

  it('does NOT apply noise to small probe canvases (Layer B: Reference-Probe Guard)', () => {
    const ctx = createMockBrowserContext(BUNDLE_A);
    const proto2D = (ctx.CanvasRenderingContext2D as { prototype: { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } } }).prototype;

    // 8x8 = 64 < 256 area -> reference probe, must NOT be perturbed
    const smallProbe = proto2D.getImageData(0, 0, 8, 8).data;
    // (i * 7) % 256: for byte 0, 0*7=0; byte 1, 0*13=0; byte 2, 0*29=0
    expect(smallProbe[0]).toBe(0);
    expect(smallProbe[1]).toBe(0);
    expect(smallProbe[2]).toBe(0);
    expect(smallProbe[3]).toBe(255);
  });
});
