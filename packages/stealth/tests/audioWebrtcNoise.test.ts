import vm from 'node:vm';

import type { FingerprintBundle } from '@tersoo/contracts';
import { describe, expect, it } from 'vitest';

import { buildStealthScript } from '../src';

const SAMPLE_BUNDLE_A: FingerprintBundle = {
  seed: 'test-audio-seed-11111',
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
  canvasNoise: { enabled: true, algorithm: 'gaussian', intensity: 0.15 },
  audioNoise: { enabled: true, algorithm: 'gaussian', intensity: 0.1 },
  hardware: { cores: 16, memoryGb: 32, maxTouchPoints: 0 },
  locales: { languages: ['en-US', 'en'], acceptLanguage: 'en-US,en;q=0.9' },
  timezone: 'America/New_York',
  geolocation: { lat: 40.7128, lng: -74.006, accuracy: 50 },
  webrtcPolicy: 'disable_non_proxied_udp',
  webdriverHidden: true,
};

const SAMPLE_BUNDLE_B: FingerprintBundle = {
  ...SAMPLE_BUNDLE_A,
  seed: 'test-audio-seed-22222',
};

const SAMPLE_BUNDLE_WEBRTC_DISABLED = {
  ...SAMPLE_BUNDLE_A,
  webrtcPolicy: 'disabled',
} as unknown as FingerprintBundle;

function createMockAudioWebRtcContext(bundle: FingerprintBundle) {
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
    DOMException: class DOMException extends Error {
      constructor(message: string, public name: string) {
        super(message);
      }
    },
  };

  const navProto: Record<string, unknown> = {
    webdriver: true,
    hardwareConcurrency: 4,
    deviceMemory: 8,
    maxTouchPoints: 0,
    language: 'en-US',
    languages: ['en-US'],
    platform: 'Win32',
    permissions: {
      query: (params: unknown) => Promise.resolve({ state: 'granted', name: (params as { name: string }).name }),
    },
  };
  sandbox.navigator = Object.create(navProto);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // Mock AudioBuffer
  class AudioBuffer {
    channel0 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, -0.5, -0.2, 0.15, 0.25, 0.35, 0.45]);
    getChannelData(_channel: number): Float32Array {
      return new Float32Array(this.channel0);
    }
    copyFromChannel(destination: Float32Array, _channelNumber: number, _startInChannel?: number): void {
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

    triggerIceCandidate(candidateStr: string): void {
      const event = { candidate: { candidate: candidateStr } };
      const internalHandler = (this as Record<string, unknown>)._tersooIceCandidateHandler as ((ev: unknown) => void) | undefined;
      if (internalHandler) {
        internalHandler.call(this, event);
      } else if (this._handler) {
        this._handler.call(this, event);
      }
      if (this.listeners['icecandidate']) {
        for (const l of this.listeners['icecandidate']) {
          l.call(this, event);
        }
      }
    }
  }

  sandbox.AudioBuffer = AudioBuffer;
  sandbox.AnalyserNode = AnalyserNode;
  sandbox.RTCPeerConnection = RTCPeerConnection;
  sandbox.Float32Array = Float32Array;

  const context = vm.createContext(sandbox);
  const scriptCode = buildStealthScript(bundle);
  vm.runInContext(scriptCode, context);

  return context;
}

describe('Ticket 3.4: Audio Context Noise & WebRTC Leak Protection', () => {
  it('perturbs getChannelData deterministically per seed and stays stable across repeated calls', () => {
    const ctxA1 = createMockAudioWebRtcContext(SAMPLE_BUNDLE_A);
    const ctxA2 = createMockAudioWebRtcContext(SAMPLE_BUNDLE_A);
    const ctxB = createMockAudioWebRtcContext(SAMPLE_BUNDLE_B);

    const AudioClassA1 = ctxA1.AudioBuffer as unknown as new () => { getChannelData: (c: number) => Float32Array };
    const AudioClassA2 = ctxA2.AudioBuffer as unknown as new () => { getChannelData: (c: number) => Float32Array };
    const AudioClassB = ctxB.AudioBuffer as unknown as new () => { getChannelData: (c: number) => Float32Array };

    const bufA1 = new AudioClassA1();
    const bufA2 = new AudioClassA2();
    const bufB = new AudioClassB();

    const dataA1_first = bufA1.getChannelData(0);
    const dataA1_second = bufA1.getChannelData(0);
    const dataA2 = bufA2.getChannelData(0);
    const dataB = bufB.getChannelData(0);

    // 1. Same instance stability (repeated calls return identical result to defeat double-sampling detection)
    expect(Array.from(dataA1_first)).toEqual(Array.from(dataA1_second));

    // 2. Same seed across distinct sessions produces identical deterministic noise
    expect(Array.from(dataA1_first)).toEqual(Array.from(dataA2));

    // 3. Different seed (SAMPLE_BUNDLE_B) produces DIFFERENT float noise
    expect(Array.from(dataA1_first)).not.toEqual(Array.from(dataB));

    // 4. Native toString guard on getChannelData
    const fnToString = ctxA1.Function.prototype.toString;
    expect(fnToString.call(AudioClassA1.prototype.getChannelData)).toBe('function getChannelData() { [native code] }');
  });

  it('perturbs copyFromChannel and getFloatFrequencyData with native toString guards', () => {
    const ctx = createMockAudioWebRtcContext(SAMPLE_BUNDLE_A);

    const AudioClass = ctx.AudioBuffer as { prototype: { copyFromChannel: (d: Float32Array, c: number) => void } };
    const AnalyserClass = ctx.AnalyserNode as { prototype: { getFloatFrequencyData: (d: Float32Array) => void } };

    const fnToString = ctx.Function.prototype.toString;
    expect(fnToString.call(AudioClass.prototype.copyFromChannel)).toBe('function copyFromChannel() { [native code] }');
    expect(fnToString.call(AnalyserClass.prototype.getFloatFrequencyData)).toBe('function getFloatFrequencyData() { [native code] }');

    const analyser = Object.create(AnalyserClass.prototype);
    const freq = new Float32Array(16);
    analyser.getFloatFrequencyData(freq);

    // At least one float is perturbed from baseline -50.0
    const perturbed = Array.from(freq).some((f) => f !== -50.0);
    expect(perturbed).toBe(true);
  });

  it('sanitizes local private IP in WebRTC ICE candidates when policy is disable_non_proxied_udp', () => {
    const ctx = createMockAudioWebRtcContext(SAMPLE_BUNDLE_A);
    const RTCClass = ctx.RTCPeerConnection as unknown as new () => {
      onicecandidate: ((ev: { candidate: { candidate: string } }) => void) | null;
      addEventListener: (type: string, listener: (ev: { candidate: { candidate: string } }) => void) => void;
      triggerIceCandidate: (s: string) => void;
    };

    const pc = new RTCClass();
    let interceptedCandidateOnProp = '';
    let interceptedCandidateOnListener = '';

    pc.onicecandidate = (event) => {
      interceptedCandidateOnProp = event.candidate.candidate;
    };

    pc.addEventListener('icecandidate', (event) => {
      interceptedCandidateOnListener = event.candidate.candidate;
    });

    // Trigger candidate with private LAN IP
    pc.triggerIceCandidate('candidate:1 1 UDP 2122260223 192.168.1.150 54321 typ host');

    // Assert that the real private IP was replaced with mDNS hostname
    expect(interceptedCandidateOnProp).not.toContain('192.168.1.150');
    expect(interceptedCandidateOnProp).toContain('-mdns.local');
    expect(interceptedCandidateOnListener).not.toContain('192.168.1.150');
    expect(interceptedCandidateOnListener).toContain('-mdns.local');

    // Assert native toString guard
    const fnToString = ctx.Function.prototype.toString;
    expect(fnToString.call(pc.addEventListener)).toBe('function addEventListener() { [native code] }');
  });

  it('blocks RTCPeerConnection creation when policy is disabled', () => {
    const ctx = createMockAudioWebRtcContext(SAMPLE_BUNDLE_WEBRTC_DISABLED);
    const RTCClass = ctx.RTCPeerConnection as unknown as new () => void;

    expect(() => new RTCClass()).toThrow('WebRTC is disabled by policy');
  });

  it('populates standard Chromium plugins and mimeTypes with item and namedItem', () => {
    const ctx = createMockAudioWebRtcContext(SAMPLE_BUNDLE_A);
    const nav = ctx.navigator as {
      plugins: { length: number; namedItem: (name: string) => { name: string } | null; item: (idx: number) => { name: string } | null };
      mimeTypes: { length: number };
    };

    expect(nav.plugins).toBeDefined();
    expect(nav.plugins.length).toBe(5);
    expect(nav.mimeTypes.length).toBe(2);

    const pdfViewer = nav.plugins.namedItem('Chrome PDF Viewer');
    expect(pdfViewer).toBeDefined();
    expect(pdfViewer?.name).toBe('Chrome PDF Viewer');

    const firstPlugin = nav.plugins.item(0);
    expect(firstPlugin).toBeDefined();
    expect(firstPlugin?.name).toBe('PDF Viewer');
  });

  it('intercepts permissions.query for notifications and computes selfTest score >= 0.9', async () => {
    const ctx = createMockAudioWebRtcContext(SAMPLE_BUNDLE_A);
    const nav = ctx.navigator as {
      permissions: { query: (params: { name: string }) => Promise<{ state: string }> };
    };

    const perm = await nav.permissions.query({ name: 'notifications' });
    expect(perm.state).toBe('prompt');

    const selfTestFn = ctx.__tersooSelfTest as () => {
      score: number;
      audioNoiseEnabled: boolean;
      canvasNoiseEnabled: boolean;
      webrtcPolicy: string;
      pluginsCount: number;
    };
    const result = selfTestFn();
    expect(result.audioNoiseEnabled).toBe(true);
    expect(result.canvasNoiseEnabled).toBe(true);
    expect(result.webrtcPolicy).toBe('disable_non_proxied_udp');
    expect(result.pluginsCount).toBe(5);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });
});
