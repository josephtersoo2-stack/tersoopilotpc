// packages/stealth/src/stealth_shim.js
// Executed in the browser page context BEFORE any document script executes.
// Injected via Page.addScriptToEvaluateOnNewDocument (CDP).
// Receives `globalThis.__TERSOO_BUNDLE__`.
(function () {
  'use strict';

  const bundle = globalThis.__TERSOO_BUNDLE__;
  if (!bundle) {
    return;
  }

  // =========================================================================
  // 1. Deterministic Mulberry32 PRNG from Seed
  // =========================================================================
  function hashStringToInt(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(initialSeed) {
    let a = initialSeed | 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const seedInt = hashStringToInt(bundle.seed || 'tersoo-stealth-seed');
  const rand = mulberry32(seedInt);

  // =========================================================================
  // 2. Native Function.prototype.toString Guard with WeakMap Spoofing
  // =========================================================================
  const nativeToString = Function.prototype.toString;
  const spoofedSources = new WeakMap();

  Function.prototype.toString = function () {
    if (spoofedSources.has(this)) {
      return spoofedSources.get(this);
    }
    return nativeToString.call(this);
  };
  spoofedSources.set(Function.prototype.toString, 'function toString() { [native code] }');

  function markNative(fn, source) {
    if (typeof fn === 'function') {
      spoofedSources.set(fn, source || 'function () { [native code] }');
    }
    return fn;
  }

  function createNativeMethod(name, impl, source, targetLength) {
    const src = source || `function ${name}() { [native code] }`;
    // ES6 object method shorthand produces a function that:
    // 1. ('prototype' in fn) === false (matches native V8 methods)
    // 2. new fn() throws TypeError: fn is not a constructor
    // 3. fn.name === name
    // 4. Receives caller 'this' correctly
    // 5. fn.length matches targetLength (or impl.length)
    const holder = {
      [name](...args) {
        return impl.apply(this, args);
      },
    };
    const fn = holder[name];
    const len = typeof targetLength === 'number' ? targetLength : impl.length;
    try {
      Object.defineProperty(fn, 'length', {
        value: len,
        configurable: true,
      });
    } catch {
      // Ignore if length cannot be configured
    }
    markNative(fn, src);
    return fn;
  }

  function defineNativeGetter(obj, key, getterFn, source) {
    const src = source || `function get ${key}() { [native code] }`;
    const holder = {
      get [key]() {
        return getterFn.call(this);
      },
    };
    const desc = Object.getOwnPropertyDescriptor(holder, key);
    const nativeGetter = desc.get;
    markNative(nativeGetter, src);
    Object.defineProperty(obj, key, {
      get: nativeGetter,
      enumerable: true,
      configurable: true,
    });
  }

  function defineNativeProperty(obj, key, value, source) {
    defineNativeGetter(obj, key, () => value, source);
  }

  // =========================================================================
  // 3. navigator.webdriver Complete Removal & Masking
  // =========================================================================
  try {
    const navProto = Object.getPrototypeOf(navigator) || navigator;
    if ('webdriver' in navProto) {
      delete navProto.webdriver;
    }
    if ('webdriver' in navigator) {
      delete navigator.webdriver;
    }
  } catch {
    // Ignore if proto is frozen
  }

  // If still present or accessed via getter, define a false/undefined getter
  if ('webdriver' in navigator) {
    try {
      defineNativeProperty(navigator, 'webdriver', false, 'function get webdriver() { [native code] }');
    } catch {
      // Fallback
    }
  }

  // =========================================================================
  // 4. Hardware Parameters Spoofing
  // =========================================================================
  const navProto = Object.getPrototypeOf(navigator) || navigator;

  if (bundle.hardware) {
    if (typeof bundle.hardware.cores === 'number') {
      defineNativeProperty(
        navProto,
        'hardwareConcurrency',
        bundle.hardware.cores,
        'function get hardwareConcurrency() { [native code] }',
      );
    }

    if (typeof bundle.hardware.memoryGb === 'number') {
      defineNativeProperty(
        navProto,
        'deviceMemory',
        bundle.hardware.memoryGb,
        'function get deviceMemory() { [native code] }',
      );
    }

    if (typeof bundle.hardware.maxTouchPoints === 'number') {
      defineNativeProperty(
        navProto,
        'maxTouchPoints',
        bundle.hardware.maxTouchPoints,
        'function get maxTouchPoints() { [native code] }',
      );
    }
  }

  // =========================================================================
  // 5. Locales & Languages
  // =========================================================================
  if (bundle.locales && Array.isArray(bundle.locales.languages) && bundle.locales.languages.length > 0) {
    const primaryLang = bundle.locales.languages[0];
    const allLangs = Object.freeze([...bundle.locales.languages]);

    defineNativeProperty(
      navProto,
      'language',
      primaryLang,
      'function get language() { [native code] }',
    );

    defineNativeProperty(
      navProto,
      'languages',
      allLangs,
      'function get languages() { [native code] }',
    );
  }

  // =========================================================================
  // 6. Platform & Architecture
  // =========================================================================
  const osPlatform =
    bundle.platform === 'windows'
      ? 'Win32'
      : bundle.platform === 'macos'
        ? 'MacIntel'
        : 'Linux armv8l';

  defineNativeProperty(
    navProto,
    'platform',
    osPlatform,
    'function get platform() { [native code] }',
  );

  // =========================================================================
  // 7. Client Hints (navigator.userAgentData)
  // =========================================================================
  if (bundle.uaMetadata && (globalThis.NavigatorUAData || navigator.userAgentData)) {
    try {
      const uad = navigator.userAgentData;
      const uadProto = uad ? Object.getPrototypeOf(uad) : null;
      const target = uadProto || uad;

      if (target) {
        defineNativeGetter(
          target,
          'brands',
          () => Object.freeze(bundle.uaMetadata.brands.map((b) => ({ ...b }))),
          'function get brands() { [native code] }',
        );

        defineNativeGetter(
          target,
          'mobile',
          () => Boolean(bundle.uaMetadata.mobile),
          'function get mobile() { [native code] }',
        );

        defineNativeGetter(
          target,
          'platform',
          () => bundle.uaMetadata.platform,
          'function get platform() { [native code] }',
        );

        const getHighEntropyValuesFn = createNativeMethod(
          'getHighEntropyValues',
          function getHighEntropyValues(hints) {
            return Promise.resolve({
              architecture: bundle.uaMetadata.architecture,
              bitness: '64',
              brands: bundle.uaMetadata.brands,
              formFactors: bundle.uaMetadata.mobile ? ['Mobile'] : ['Desktop'],
              fullVersionList: bundle.uaMetadata.brands,
              mobile: Boolean(bundle.uaMetadata.mobile),
              model: bundle.uaMetadata.model,
              platform: bundle.uaMetadata.platform,
              platformVersion: bundle.uaMetadata.platformVersion,
              uaFullVersion: '',
              wow64: false,
            });
          },
          'function getHighEntropyValues() { [native code] }',
          1,
        );
        target.getHighEntropyValues = getHighEntropyValuesFn;
      }
    } catch {
      // Ignore if userAgentData cannot be overridden
    }
  }

  // =========================================================================
  // 8. window.chrome & chrome.runtime / chrome.app Structure
  // =========================================================================
  if (!globalThis.chrome) {
    globalThis.chrome = {};
  }

  if (!globalThis.chrome.runtime) {
    globalThis.chrome.runtime = {
      OnInstalledReason: {
        CHROME_UPDATE: 'chrome_update',
        INSTALL: 'install',
        SHARED_MODULE_UPDATE: 'shared_module_update',
        UPDATE: 'update',
      },
      OnRestartRequiredReason: {
        APP_UPDATE: 'app_update',
        OS_UPDATE: 'os_update',
        PERIODIC: 'periodic',
      },
      PlatformArch: {
        ARM: 'arm',
        ARM64: 'arm64',
        MIPS: 'mips',
        MIPS64: 'mips64',
        X86_32: 'x86-32',
        X86_64: 'x86-64',
      },
      PlatformNaclArch: {
        ARM: 'arm',
        MIPS: 'mips',
        MIPS64: 'mips64',
        X86_32: 'x86-32',
        X86_64: 'x86-64',
      },
      PlatformOs: {
        ANDROID: 'android',
        CROS: 'cros',
        LINUX: 'linux',
        MAC: 'mac',
        OPENBSD: 'openbsd',
        WIN: 'win',
      },
      RequestUpdateCheckStatus: {
        NO_UPDATE: 'no_update',
        THROTTLED: 'throttled',
        UPDATE_AVAILABLE: 'update_available',
      },
      connect: createNativeMethod(
        'connect',
        function connect() {
          return {
            name: '',
            onDisconnect: { addListener: () => {}, removeListener: () => {} },
            onMessage: { addListener: () => {}, removeListener: () => {} },
            postMessage: () => {},
          };
        },
        'function connect() { [native code] }',
        0,
      ),
      sendMessage: createNativeMethod(
        'sendMessage',
        function sendMessage() {},
        'function sendMessage() { [native code] }',
        0,
      ),
    };
  }

  if (!globalThis.chrome.app) {
    globalThis.chrome.app = {
      isInstalled: false,
      InstallState: {
        DISABLED: 'disabled',
        INSTALLED: 'installed',
        NOT_INSTALLED: 'not_installed',
      },
      RunningState: {
        CANNOT_RUN: 'cannot_run',
        READY_TO_RUN: 'ready_to_run',
        RUNNING: 'running',
      },
      getDetails: createNativeMethod(
        'getDetails',
        function getDetails() {
          return null;
        },
        'function getDetails() { [native code] }',
        0,
      ),
      getIsInstalled: createNativeMethod(
        'getIsInstalled',
        function getIsInstalled() {
          return false;
        },
        'function getIsInstalled() { [native code] }',
        0,
      ),
      runningState: createNativeMethod(
        'runningState',
        function runningState() {
          return 'cannot_run';
        },
        'function runningState() { [native code] }',
        0,
      ),
    };
  }

  if (!globalThis.chrome.loadTimes) {
    globalThis.chrome.loadTimes = createNativeMethod(
      'loadTimes',
      function loadTimes() {
        const now = Date.now() / 1000;
        return {
          commitLoadTime: now,
          connectionInfo: 'http/1.1',
          finishDocumentLoadTime: now,
          finishLoadTime: now,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: now,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'unknown',
          requestTime: now - 0.05,
          startLoadTime: now - 0.05,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false,
        };
      },
      'function loadTimes() { [native code] }',
      0,
    );
  }

  if (!globalThis.chrome.csi) {
    globalThis.chrome.csi = createNativeMethod(
      'csi',
      function csi() {
        const now = Date.now();
        return {
          onloadT: now,
          pageT: 100 + Math.floor(rand() * 50),
          startE: now - 100,
          tran: 15,
        };
      },
      'function csi() { [native code] }',
      0,
    );
  }

  // =========================================================================
  // 9. WebGL Vendor/Renderer Spoofing & Extensions
  // =========================================================================
  if (bundle.webgl) {
    const UNMASKED_VENDOR_WEBGL = 0x9245;
    const UNMASKED_RENDERER_WEBGL = 0x9246;
    const VENDOR = 0x1f00;
    const RENDERER = 0x1f01;

    const patchWebGLContext = (proto) => {
      if (!proto || typeof proto.getParameter !== 'function') return;

      const origGetParameter = proto.getParameter;
      proto.getParameter = createNativeMethod('getParameter', function getParameter(param) {
        if (param === UNMASKED_VENDOR_WEBGL) {
          return bundle.webgl.unmaskedVendor;
        }
        if (param === UNMASKED_RENDERER_WEBGL) {
          return bundle.webgl.unmaskedRenderer;
        }
        if (param === VENDOR && bundle.webgl.vendor) {
          return bundle.webgl.vendor;
        }
        if (param === RENDERER && bundle.webgl.renderer) {
          return bundle.webgl.renderer;
        }
        return origGetParameter.call(this, param);
      }, 'function getParameter() { [native code] }');

      if (typeof proto.getExtension === 'function') {
        const origGetExtension = proto.getExtension;
        proto.getExtension = createNativeMethod('getExtension', function getExtension(name) {
          if (name === 'WEBGL_debug_renderer_info') {
            return {
              UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR_WEBGL,
              UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER_WEBGL,
            };
          }
          return origGetExtension.call(this, name);
        }, 'function getExtension() { [native code] }');
      }

      if (typeof proto.getSupportedExtensions === 'function') {
        const origGetSupportedExtensions = proto.getSupportedExtensions;
        proto.getSupportedExtensions = createNativeMethod('getSupportedExtensions', function getSupportedExtensions() {
          const exts = origGetSupportedExtensions.call(this) || [];
          if (!exts.includes('WEBGL_debug_renderer_info')) {
            return [...exts, 'WEBGL_debug_renderer_info'];
          }
          return exts;
        }, 'function getSupportedExtensions() { [native code] }');
      }
    };

    if (typeof globalThis.WebGLRenderingContext !== 'undefined') {
      patchWebGLContext(globalThis.WebGLRenderingContext.prototype);
    }
    if (typeof globalThis.WebGL2RenderingContext !== 'undefined') {
      patchWebGLContext(globalThis.WebGL2RenderingContext.prototype);
    }
  }

  // =========================================================================
  // 10. Canvas Noise Evasion Hooks (Deterministic, Strictly Idempotent & Non-Mutating)
  // =========================================================================
  function shouldApplyNoise(data, width, height) {
    if (!data || width * height < 256) return false;
    const colors = new Set();
    const len = Math.min(data.length, 4096);
    for (let i = 0; i < len; i += 4) {
      colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      if (colors.size > 8) return true;
    }
    return false;
  }

  function applyPixelNoise(data, seed, intensity) {
    if (!data || !intensity || intensity <= 0) return;
    const len = data.length;
    // Step by 16 bytes (every 4th pixel) to apply subtle, imperceptible noise
    for (let i = 0; i < len; i += 16) {
      let h = (seed ^ Math.imul(i, 2654435761)) | 0;
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h = (h ^ (h >>> 16)) >>> 0;
      const sign = (h & 1) === 0 ? 1 : -1;
      const delta = sign * ((h % 3) === 0 ? 1 : 0);
      if (delta !== 0) {
        // Perturb only R, G, or B (channel 0, 1, or 2), avoiding alpha (channel 3)
        const channel = (h >>> 8) % 3;
        const idx = i + channel;
        if (idx < len) {
          const val = data[idx] + delta;
          data[idx] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
    }
  }

  if (bundle.canvasNoise && bundle.canvasNoise.enabled) {
    const canvasIntensity = bundle.canvasNoise.intensity ?? 0.15;

    // Patch CanvasRenderingContext2D.prototype.getImageData
    if (typeof globalThis.CanvasRenderingContext2D !== 'undefined') {
      const proto2D = globalThis.CanvasRenderingContext2D.prototype;
      if (typeof proto2D.getImageData === 'function') {
        const origGetImageData = proto2D.getImageData;
        proto2D.getImageData = createNativeMethod(
          'getImageData',
          function getImageData(sx, sy, sw, sh, ...rest) {
            const imgData = origGetImageData.call(this, sx, sy, sw, sh, ...rest);
            if (imgData && imgData.data && shouldApplyNoise(imgData.data, sw, sh)) {
              // Apply noise to newly returned ImageData copy (does not mutate source canvas)
              applyPixelNoise(imgData.data, seedInt, canvasIntensity);
            }
            return imgData;
          },
          'function getImageData() { [native code] }',
          4,
        );
      }
    }

    // Patch HTMLCanvasElement.prototype.toDataURL and toBlob
    if (typeof globalThis.HTMLCanvasElement !== 'undefined') {
      const canvasProto = globalThis.HTMLCanvasElement.prototype;

      // Offscreen canvas: never mutate caller canvas in-place!
      const getNoisyCanvasCopy = (sourceCanvas) => {
        try {
          if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return null;
          const w = sourceCanvas.width;
          const h = sourceCanvas.height;
          if (w * h < 256) return null; // Skip tiny canvases (reference probes)

          let offscreen = null;
          if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            offscreen = document.createElement('canvas');
          } else if (typeof globalThis.OffscreenCanvas !== 'undefined') {
            offscreen = new globalThis.OffscreenCanvas(w, h);
          } else if (typeof globalThis.HTMLCanvasElement === 'function') {
            offscreen = new globalThis.HTMLCanvasElement();
          }
          if (!offscreen) return null;
          offscreen.width = w;
          offscreen.height = h;
          const offCtx = offscreen.getContext('2d');
          if (!offCtx) return null;

          offCtx.drawImage(sourceCanvas, 0, 0);
          const sampleW = Math.min(w, 128);
          const sampleH = Math.min(h, 128);
          const imgData = offCtx.getImageData(0, 0, sampleW, sampleH);
          if (imgData && imgData.data && shouldApplyNoise(imgData.data, sampleW, sampleH)) {
            applyPixelNoise(imgData.data, seedInt, canvasIntensity);
            offCtx.putImageData(imgData, 0, 0);
            return offscreen;
          }
        } catch {
          // Ignore if canvas is tainted or cross-origin
        }
        return null;
      };

      if (typeof canvasProto.toDataURL === 'function') {
        const origToDataURL = canvasProto.toDataURL;
        canvasProto.toDataURL = createNativeMethod(
          'toDataURL',
          function toDataURL(...args) {
            const noisyCopy = getNoisyCanvasCopy(this);
            if (noisyCopy) {
              return origToDataURL.apply(noisyCopy, args);
            }
            return origToDataURL.apply(this, args);
          },
          'function toDataURL() { [native code] }',
          0,
        );
      }

      if (typeof canvasProto.toBlob === 'function') {
        const origToBlob = canvasProto.toBlob;
        canvasProto.toBlob = createNativeMethod(
          'toBlob',
          function toBlob(callback, ...args) {
            const noisyCopy = getNoisyCanvasCopy(this);
            if (noisyCopy) {
              return origToBlob.call(noisyCopy, callback, ...args);
            }
            return origToBlob.call(this, callback, ...args);
          },
          'function toBlob() { [native code] }',
          1,
        );
      }
    }
  }

  // =========================================================================
  // 11. Audio Context Noise Evasion Hooks (Deterministic per Seed)
  // =========================================================================
  function applyFloatNoise(data, seed, intensity) {
    if (!data || !intensity || intensity <= 0) return;
    const len = data.length;
    const scale = intensity * 0.00001;
    for (let i = 0; i < len; i += 8) {
      let h = (seed ^ Math.imul(i, 2654435761)) | 0;
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h = (h ^ (h >>> 16)) >>> 0;
      const sign = (h & 1) === 0 ? 1 : -1;
      const delta = sign * ((h % 5) + 1) * scale;
      data[i] = data[i] + delta;
    }
  }

  if (bundle.audioNoise && bundle.audioNoise.enabled) {
    const audioIntensity = bundle.audioNoise.intensity ?? 0.1;

    if (typeof globalThis.AudioBuffer !== 'undefined') {
      const audioProto = globalThis.AudioBuffer.prototype;
      if (typeof audioProto.getChannelData === 'function') {
        const origGetChannelData = audioProto.getChannelData;
        audioProto.getChannelData = createNativeMethod(
          'getChannelData',
          function getChannelData(channel) {
            const data = origGetChannelData.call(this, channel);
            if (data) {
              applyFloatNoise(data, seedInt, audioIntensity);
            }
            return data;
          },
          'function getChannelData() { [native code] }',
          1,
        );
      }

      if (typeof audioProto.copyFromChannel === 'function') {
        const origCopyFromChannel = audioProto.copyFromChannel;
        audioProto.copyFromChannel = createNativeMethod(
          'copyFromChannel',
          function copyFromChannel(destination, channelNumber, startInChannel) {
            origCopyFromChannel.call(this, destination, channelNumber, startInChannel);
            if (destination) {
              applyFloatNoise(destination, seedInt, audioIntensity);
            }
          },
          'function copyFromChannel() { [native code] }',
          2,
        );
      }
    }

    if (typeof globalThis.AnalyserNode !== 'undefined') {
      const analyserProto = globalThis.AnalyserNode.prototype;
      if (typeof analyserProto.getFloatFrequencyData === 'function') {
        const origGetFloatFreq = analyserProto.getFloatFrequencyData;
        analyserProto.getFloatFrequencyData = createNativeMethod(
          'getFloatFrequencyData',
          function getFloatFrequencyData(array) {
            origGetFloatFreq.call(this, array);
            if (array) {
              applyFloatNoise(array, seedInt, audioIntensity);
            }
          },
          'function getFloatFrequencyData() { [native code] }',
          1,
        );
      }
    }
  }

  // =========================================================================
  // 12. WebRTC Leak Protection
  // =========================================================================
  if (typeof globalThis.RTCPeerConnection !== 'undefined') {
    const isWebrtcDisabled = bundle.webrtcPolicy === 'disabled';
    const isDisableNonProxied = bundle.webrtcPolicy === 'disable_non_proxied_udp';

    if (isWebrtcDisabled) {
      const origRTC = globalThis.RTCPeerConnection;
      globalThis.RTCPeerConnection = markNative(function RTCPeerConnection() {
        throw new DOMException('WebRTC is disabled by policy', 'NotAllowedError');
      }, 'function RTCPeerConnection() { [native code] }');
      globalThis.RTCPeerConnection.prototype = origRTC.prototype;
    } else if (isDisableNonProxied) {
      const rtcProto = globalThis.RTCPeerConnection.prototype;

      const sanitizeCandidateString = (candidateStr) => {
        if (!candidateStr || typeof candidateStr !== 'string') return candidateStr;
        const privateIpRegex = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/g;
        const mdns = `${bundle.seed.slice(0, 8)}-mdns.local`;
        return candidateStr.replace(privateIpRegex, mdns);
      };

      const wrapCandidateEvent = (event) => {
        if (event && event.candidate && event.candidate.candidate) {
          const originalCandidateStr = event.candidate.candidate;
          const sanitized = sanitizeCandidateString(originalCandidateStr);
          if (sanitized !== originalCandidateStr) {
            try {
              Object.defineProperty(event.candidate, 'candidate', {
                value: sanitized,
                configurable: true,
              });
            } catch {
              // Ignore if frozen
            }
          }
        }
        return event;
      };

      const origDescriptor = Object.getOwnPropertyDescriptor(rtcProto, 'onicecandidate');
      const handlerMap = new WeakMap();

      const rtcHandlerHolder = {
        get onicecandidate() {
          if (origDescriptor && origDescriptor.get) {
            return origDescriptor.get.call(this);
          }
          return handlerMap.get(this) || null;
        },
        set onicecandidate(listener) {
          if (typeof listener !== 'function') {
            handlerMap.delete(this);
            if (origDescriptor && origDescriptor.set) {
              return origDescriptor.set.call(this, listener);
            }
            return;
          }
          const wrappedListener = function (event) {
            return listener.call(this, wrapCandidateEvent(event));
          };
          markNative(wrappedListener, 'function () { [native code] }');
          handlerMap.set(this, listener);
          if (origDescriptor && origDescriptor.set) {
            return origDescriptor.set.call(this, wrappedListener);
          }
          this._tersooIceCandidateHandler = wrappedListener;
        },
      };

      const rtcDesc = Object.getOwnPropertyDescriptor(rtcHandlerHolder, 'onicecandidate');
      markNative(rtcDesc.get, 'function get onicecandidate() { [native code] }');
      markNative(rtcDesc.set, 'function set onicecandidate() { [native code] }');

      Object.defineProperty(rtcProto, 'onicecandidate', {
        get: rtcDesc.get,
        set: rtcDesc.set,
        configurable: true,
        enumerable: true,
      });

      if (typeof rtcProto.addEventListener === 'function') {
        const origAddEventListener = rtcProto.addEventListener;
        rtcProto.addEventListener = createNativeMethod(
          'addEventListener',
          function addEventListener(type, listener, ...rest) {
            if (type === 'icecandidate' && typeof listener === 'function') {
              const wrapped = function (event) {
                return listener.call(this, wrapCandidateEvent(event));
              };
              markNative(wrapped, 'function () { [native code] }');
              return origAddEventListener.call(this, type, wrapped, ...rest);
            }
            return origAddEventListener.call(this, type, listener, ...rest);
          },
          'function addEventListener() { [native code] }',
          2,
        );
      }

      if (typeof rtcProto.createOffer === 'function') {
        const origCreateOffer = rtcProto.createOffer;
        rtcProto.createOffer = createNativeMethod(
          'createOffer',
          async function createOffer(...args) {
            const offer = await origCreateOffer.apply(this, args);
            if (offer && offer.sdp) {
              try {
                Object.defineProperty(offer, 'sdp', {
                  value: sanitizeCandidateString(offer.sdp),
                  configurable: true,
                });
              } catch {
                // Ignore if frozen
              }
            }
            return offer;
          },
          'function createOffer() { [native code] }',
          0,
        );
      }

      if (typeof rtcProto.createAnswer === 'function') {
        const origCreateAnswer = rtcProto.createAnswer;
        rtcProto.createAnswer = createNativeMethod(
          'createAnswer',
          async function createAnswer(...args) {
            const answer = await origCreateAnswer.apply(this, args);
            if (answer && answer.sdp) {
              try {
                Object.defineProperty(answer, 'sdp', {
                  value: sanitizeCandidateString(answer.sdp),
                  configurable: true,
                });
              } catch {
                // Ignore if frozen
              }
            }
            return answer;
          },
          'function createAnswer() { [native code] }',
          0,
        );
      }

      if (typeof globalThis.RTCIceCandidate !== 'undefined') {
        const candidateProto = globalThis.RTCIceCandidate.prototype;
        const origDesc = Object.getOwnPropertyDescriptor(candidateProto, 'candidate');
        if (origDesc && origDesc.get) {
          const origCandidateGet = origDesc.get;
          defineNativeGetter(
            candidateProto,
            'candidate',
            function candidate() {
              const raw = origCandidateGet.call(this);
              return sanitizeCandidateString(raw);
            },
            'function get candidate() { [native code] }',
          );
        }
      }
    }
  }

  // =========================================================================
  // 13. Plugins & MimeTypes (Platform Coherent: Empty on Mobile, Standard PDF on Desktop)
  // =========================================================================
  try {
    const isMobile = Boolean(bundle.uaMetadata && bundle.uaMetadata.mobile) || bundle.platform === 'android';

    const standardPlugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    ];

    const standardMimeTypes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    ];

    function createPluginArray(items) {
      const arr = items.map((p) => Object.freeze({ ...p }));
      Object.defineProperty(arr, 'item', {
        value: createNativeMethod('item', (index) => arr[index] || null, 'function item() { [native code] }', 1),
      });
      Object.defineProperty(arr, 'namedItem', {
        value: createNativeMethod(
          'namedItem',
          (name) => arr.find((p) => p.name === name || p.type === name) || null,
          'function namedItem() { [native code] }',
          1,
        ),
      });
      Object.defineProperty(arr, 'refresh', {
        value: createNativeMethod('refresh', () => {}, 'function refresh() { [native code] }', 0),
      });
      return Object.freeze(arr);
    }

    const targetPlugins = isMobile ? [] : standardPlugins;
    const targetMimeTypes = isMobile ? [] : standardMimeTypes;

    defineNativeProperty(navProto, 'plugins', createPluginArray(targetPlugins), 'function get plugins() { [native code] }');
    defineNativeProperty(navProto, 'mimeTypes', createPluginArray(targetMimeTypes), 'function get mimeTypes() { [native code] }');
  } catch {
    // Ignore if plugins cannot be modified
  }

  // =========================================================================
  // 14. Permissions API
  // =========================================================================
  if (navigator && navigator.permissions && typeof navigator.permissions.query === 'function') {
    const origQuery = navigator.permissions.query;
    const queryWrapper = createNativeMethod(
      'query',
      function query(parameters) {
        if (parameters && parameters.name === 'notifications') {
          return Promise.resolve({
            name: 'notifications',
            state: 'prompt',
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          });
        }
        return origQuery.call(this, parameters);
      },
      'function query() { [native code] }',
      1,
    );

    if (globalThis.Permissions && globalThis.Permissions.prototype) {
      globalThis.Permissions.prototype.query = queryWrapper;
    }
    navigator.permissions.query = queryWrapper;
  }

  // =========================================================================
  // 15. Screen Dimensions & DPR Integer Normalization
  // =========================================================================
  if (bundle.screen) {
    try {
      const screenProto = globalThis.Screen
        ? globalThis.Screen.prototype
        : globalThis.screen
          ? Object.getPrototypeOf(globalThis.screen)
          : null;
      if (globalThis.screen) {
        try {
          delete globalThis.screen.width;
          delete globalThis.screen.height;
          delete globalThis.screen.availWidth;
          delete globalThis.screen.availHeight;
          delete globalThis.screen.colorDepth;
          delete globalThis.screen.pixelDepth;
        } catch {
          // Ignore if frozen
        }
      }

      if (screenProto) {
        const w = Math.round(bundle.screen.width);
        const h = Math.round(bundle.screen.height);
        const availW = Math.round(bundle.screen.availWidth ?? w);
        const availH = Math.round(bundle.screen.availHeight ?? h);
        const colorDepth = Math.round(bundle.screen.colorDepth ?? 24);

        defineNativeProperty(screenProto, 'width', w, 'function get width() { [native code] }');
        defineNativeProperty(screenProto, 'height', h, 'function get height() { [native code] }');
        defineNativeProperty(screenProto, 'availWidth', availW, 'function get availWidth() { [native code] }');
        defineNativeProperty(screenProto, 'availHeight', availH, 'function get availHeight() { [native code] }');
        defineNativeProperty(screenProto, 'colorDepth', colorDepth, 'function get colorDepth() { [native code] }');
        defineNativeProperty(screenProto, 'pixelDepth', colorDepth, 'function get pixelDepth() { [native code] }');
      }

      if (typeof bundle.screen.dpr === 'number') {
        defineNativeProperty(globalThis, 'devicePixelRatio', bundle.screen.dpr, 'function get devicePixelRatio() { [native code] }');
      }
    } catch {
      // Ignore if screen cannot be patched
    }
  }

  // =========================================================================
  // 17. Network Information API (navigator.connection Coherence)
  // =========================================================================
  try {
    const isMobile = Boolean(bundle.uaMetadata && bundle.uaMetadata.mobile) || bundle.platform === 'android';
    const connObj = {
      effectiveType: '4g',
      rtt: 50,
      downlink: 10,
      saveData: false,
      ...(isMobile ? { type: 'cellular' } : {}),
      onchange: null,
      addEventListener: createNativeMethod('addEventListener', () => {}, 'function addEventListener() { [native code] }', 2),
      removeEventListener: createNativeMethod('removeEventListener', () => {}, 'function removeEventListener() { [native code] }', 2),
      dispatchEvent: createNativeMethod('dispatchEvent', () => false, 'function dispatchEvent() { [native code] }', 1),
    };
    defineNativeProperty(navProto, 'connection', Object.freeze(connObj), 'function get connection() { [native code] }');
  } catch {
    // Ignore
  }

  // =========================================================================
  // 18. CSS Media Query Coherence (matchMedia for hover / pointer)
  // =========================================================================
  if (typeof globalThis.matchMedia === 'function') {
    const origMatchMedia = globalThis.matchMedia;
    const isMobile = Boolean(bundle.uaMetadata && bundle.uaMetadata.mobile) || bundle.platform === 'android';

    globalThis.matchMedia = createNativeMethod(
      'matchMedia',
      function matchMedia(query) {
        const mql = origMatchMedia.call(this, query);
        if (typeof query === 'string') {
          const q = query.toLowerCase().replace(/\s+/g, '');
          let overrideMatches = null;
          if (q.includes('(hover:none)')) overrideMatches = isMobile;
          else if (q.includes('(hover:hover)')) overrideMatches = !isMobile;
          else if (q.includes('(pointer:coarse)')) overrideMatches = isMobile;
          else if (q.includes('(pointer:fine)')) overrideMatches = !isMobile;
          else if (q.includes('(any-hover:none)')) overrideMatches = isMobile;
          else if (q.includes('(any-hover:hover)')) overrideMatches = !isMobile;
          else if (q.includes('(any-pointer:coarse)')) overrideMatches = isMobile;
          else if (q.includes('(any-pointer:fine)')) overrideMatches = !isMobile;

          if (overrideMatches !== null) {
            return new Proxy(mql, {
              get(target, prop, receiver) {
                if (prop === 'matches') return overrideMatches;
                return Reflect.get(target, prop, receiver);
              },
            });
          }
        }
        return mql;
      },
      'function matchMedia() { [native code] }',
      1,
    );
  }

  // =========================================================================
  // 19. Screen Orientation Coherence (screen.orientation)
  // =========================================================================
  try {
    const isMobile = Boolean(bundle.uaMetadata && bundle.uaMetadata.mobile) || bundle.platform === 'android';
    const isPortrait = bundle.screen ? bundle.screen.height > bundle.screen.width : isMobile;
    const orientationType = isPortrait ? 'portrait-primary' : 'landscape-primary';

    if (globalThis.screen) {
      const orientationObj = {
        angle: 0,
        type: orientationType,
        onchange: null,
        lock: createNativeMethod('lock', () => Promise.resolve(), 'function lock() { [native code] }', 1),
        unlock: createNativeMethod('unlock', () => {}, 'function unlock() { [native code] }', 0),
        addEventListener: createNativeMethod('addEventListener', () => {}, 'function addEventListener() { [native code] }', 2),
        removeEventListener: createNativeMethod('removeEventListener', () => {}, 'function removeEventListener() { [native code] }', 2),
        dispatchEvent: createNativeMethod('dispatchEvent', () => false, 'function dispatchEvent() { [native code] }', 1),
      };
      const screenProto = globalThis.Screen ? globalThis.Screen.prototype : Object.getPrototypeOf(globalThis.screen);
      if (screenProto) {
        defineNativeProperty(screenProto, 'orientation', Object.freeze(orientationObj), 'function get orientation() { [native code] }');
      }
    }
  } catch {
    // Ignore
  }

  // =========================================================================
  // 20. SpeechSynthesis Voices Platform Coherence (SpeechSynthesis.prototype.getVoices)
  // =========================================================================
  try {
    const platform = bundle.platform;
    const voiceDefs =
      platform === 'android'
        ? [
            { name: 'Google US English', lang: 'en-US', default: true, localService: true, voiceURI: 'Google US English' },
            { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: true, voiceURI: 'Google UK English Female' },
          ]
        : platform === 'macos'
          ? [
              { name: 'Samantha', lang: 'en-US', default: true, localService: true, voiceURI: 'Samantha' },
              { name: 'Alex', lang: 'en-US', default: false, localService: true, voiceURI: 'Alex' },
            ]
          : [
              { name: 'Microsoft David - English (United States)', lang: 'en-US', default: true, localService: true, voiceURI: 'Microsoft David - English (United States)' },
              { name: 'Microsoft Mark - English (United States)', lang: 'en-US', default: false, localService: true, voiceURI: 'Microsoft Mark - English (United States)' },
              { name: 'Microsoft Zira - English (United States)', lang: 'en-US', default: false, localService: true, voiceURI: 'Microsoft Zira - English (United States)' },
            ];

    const voices = Object.freeze(
      voiceDefs.map((v) => Object.freeze({ ...v }))
    );

    const getVoicesFn = createNativeMethod(
      'getVoices',
      function getVoices() {
        return voices;
      },
      'function getVoices() { [native code] }',
      0,
    );

    const synthProto = (globalThis.SpeechSynthesis && globalThis.SpeechSynthesis.prototype) ||
      (typeof globalThis.speechSynthesis !== 'undefined' ? Object.getPrototypeOf(globalThis.speechSynthesis) : null);
    if (synthProto) {
      synthProto.getVoices = getVoicesFn;
    }
    if (typeof globalThis.speechSynthesis !== 'undefined') {
      try {
        globalThis.speechSynthesis.getVoices = getVoicesFn;
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore
  }

  // =========================================================================
  // 21. Battery Status API Coherence (navigator.getBattery)
  // =========================================================================
  if (typeof navigator !== 'undefined') {
    try {
      const isMobile = Boolean(bundle.uaMetadata && bundle.uaMetadata.mobile) || bundle.platform === 'android';
      const batteryManager = {
        charging: !isMobile,
        chargingTime: isMobile ? 3600 : 0,
        dischargingTime: isMobile ? 18000 : Infinity,
        level: isMobile ? 0.88 : 1.0,
        onchargingchange: null,
        onchargingtimechange: null,
        ondischargingtimechange: null,
        onlevelchange: null,
        addEventListener: createNativeMethod('addEventListener', () => {}, 'function addEventListener() { [native code] }', 2),
        removeEventListener: createNativeMethod('removeEventListener', () => {}, 'function removeEventListener() { [native code] }', 2),
        dispatchEvent: createNativeMethod('dispatchEvent', () => false, 'function dispatchEvent() { [native code] }', 1),
      };

      const getBatteryFn = createNativeMethod(
        'getBattery',
        function getBattery() {
          return Promise.resolve(batteryManager);
        },
        'function getBattery() { [native code] }',
        0,
      );

      const navTarget = (typeof globalThis.Navigator !== 'undefined' && globalThis.Navigator.prototype) || navProto;
      if (navTarget) {
        try {
          Object.defineProperty(navTarget, 'getBattery', {
            value: getBatteryFn,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch {
          navTarget.getBattery = getBatteryFn;
        }
      }
      try {
        Object.defineProperty(navigator, 'getBattery', {
          value: getBatteryFn,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        navigator.getBattery = getBatteryFn;
      }
    } catch {
      // Ignore
    }
  }

  // =========================================================================
  // 22. MediaDevices API Coherence (navigator.mediaDevices.enumerateDevices)
  // =========================================================================
  if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
    try {
      const mediaDevicesProto = Object.getPrototypeOf(navigator.mediaDevices) || navigator.mediaDevices;
      const mockDevices = [
        { deviceId: '', kind: 'audioinput', label: '', groupId: `${bundle.seed.slice(0, 8)}-audio-grp` },
        { deviceId: '', kind: 'videoinput', label: '', groupId: `${bundle.seed.slice(0, 8)}-video-grp` },
        { deviceId: '', kind: 'audiooutput', label: '', groupId: `${bundle.seed.slice(0, 8)}-audio-grp` },
      ];

      mediaDevicesProto.enumerateDevices = createNativeMethod(
        'enumerateDevices',
        function enumerateDevices() {
          return Promise.resolve(mockDevices.map((d) => Object.freeze({ ...d })));
        },
        'function enumerateDevices() { [native code] }',
        0,
      );
    } catch {
      // Ignore
    }
  }

  // =========================================================================
  // 23. Font Platform Coherence (FontFaceSet.prototype.check)
  // =========================================================================
  try {
    const platform = bundle.platform;
    const windowsOnlyFonts = ['segoe ui', 'calibri', 'cambria', 'consolas', 'tahoma'];
    const macosOnlyFonts = ['san francisco', 'helvetica neue', 'monaco', 'menlo', 'apple color emoji'];
    const androidOnlyFonts = ['roboto', 'droid sans', 'noto sans'];

    const patchFontCheckHolder = (holder) => {
      if (!holder || typeof holder.check !== 'function') return;
      const origFontsCheck = holder.check;
      holder.check = createNativeMethod(
        'check',
        function check(font, text) {
          if (typeof font === 'string') {
            const fontLower = font.toLowerCase();
            if (platform === 'android') {
              if (windowsOnlyFonts.some((f) => fontLower.includes(f))) return false;
              if (macosOnlyFonts.some((f) => fontLower.includes(f))) return false;
              if (androidOnlyFonts.some((f) => fontLower.includes(f))) return true;
            } else if (platform === 'windows') {
              if (androidOnlyFonts.some((f) => fontLower.includes(f))) return false;
              if (macosOnlyFonts.some((f) => fontLower.includes(f))) return false;
              if (windowsOnlyFonts.some((f) => fontLower.includes(f))) return true;
            } else if (platform === 'macos') {
              if (windowsOnlyFonts.some((f) => fontLower.includes(f))) return false;
              if (androidOnlyFonts.some((f) => fontLower.includes(f))) return false;
              if (macosOnlyFonts.some((f) => fontLower.includes(f))) return true;
            }
          }
          return origFontsCheck.call(this, font, text);
        },
        'function check() { [native code] }',
        1,
      );
    };

    if (globalThis.FontFaceSet && globalThis.FontFaceSet.prototype) {
      patchFontCheckHolder(globalThis.FontFaceSet.prototype);
    }
    if (typeof document !== 'undefined' && document.fonts) {
      patchFontCheckHolder(document.fonts);
      const docFontsProto = Object.getPrototypeOf(document.fonts);
      if (docFontsProto) {
        patchFontCheckHolder(docFontsProto);
      }
    }
  } catch {
    // Ignore
  }

  // =========================================================================
  // 16. Self-Test Hook (__tersooSelfTest)
  // =========================================================================
  globalThis.__tersooSelfTest = () => {
    let score = 0;
    const checks = {
      webdriver: !navigator.webdriver && !('webdriver' in navProto),
      hardware: typeof navigator.hardwareConcurrency === 'number' && typeof navigator.deviceMemory === 'number',
      languages: Array.isArray(navigator.languages) && navigator.languages.length > 0,
      platform: typeof navigator.platform === 'string' && navigator.platform.length > 0,
      chrome: Boolean(globalThis.chrome && globalThis.chrome.runtime),
      toStringGuarded:
        Function.prototype.toString.call(Function.prototype.toString).includes('[native code]') &&
        Function.prototype.toString.call(globalThis.chrome.loadTimes).includes('[native code]'),
      webgl: Boolean(bundle.webgl && bundle.webgl.unmaskedRenderer),
      noise: Boolean(bundle.canvasNoise?.enabled && bundle.audioNoise?.enabled),
    };

    if (checks.webdriver) score += 0.15;
    if (checks.hardware) score += 0.15;
    if (checks.languages) score += 0.1;
    if (checks.platform) score += 0.1;
    if (checks.chrome) score += 0.1;
    if (checks.toStringGuarded) score += 0.15;
    if (checks.webgl) score += 0.15;
    if (checks.noise) score += 0.1;

    return {
      webdriver: navigator.webdriver,
      hasWebdriverProp: 'webdriver' in navigator,
      ua: navigator.userAgent,
      platform: navigator.platform,
      cores: navigator.hardwareConcurrency,
      memory: navigator.deviceMemory,
      languages: Array.isArray(navigator.languages) ? [...navigator.languages] : [navigator.language],
      maxTouchPoints: navigator.maxTouchPoints,
      chromePresent: Boolean(globalThis.chrome && globalThis.chrome.runtime),
      toStringGuarded: checks.toStringGuarded,
      webgl: {
        vendor: bundle.webgl ? bundle.webgl.vendor : null,
        renderer: bundle.webgl ? bundle.webgl.renderer : null,
        unmaskedVendor: bundle.webgl ? bundle.webgl.unmaskedVendor : null,
        unmaskedRenderer: bundle.webgl ? bundle.webgl.unmaskedRenderer : null,
      },
      canvasNoiseEnabled: Boolean(bundle.canvasNoise && bundle.canvasNoise.enabled),
      audioNoiseEnabled: Boolean(bundle.audioNoise && bundle.audioNoise.enabled),
      webrtcPolicy: bundle.webrtcPolicy,
      pluginsCount: navigator.plugins ? navigator.plugins.length : 0,
      connectionEffectiveType: navigator.connection ? navigator.connection.effectiveType : null,
      orientationType: globalThis.screen?.orientation ? globalThis.screen.orientation.type : null,
      score: Math.round(score * 100) / 100,
    };
  };
})();
