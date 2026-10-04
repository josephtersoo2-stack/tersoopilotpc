# Anti-Bot Hardening & Stealth Coherence Plan

> **Living Specification & Tracking Document**  
> Source: Forensic investigation of Pixelscan, CreepJS, and BrowserScan detections.  
> Status: **Completed & Fully Verified** (Fixes 1–7 Live Verified in Chromium)

---

## Executive Summary

Anti-bot systems (Pixelscan, CreepJS, BrowserScan, DataDome, Cloudflare) detect automation by identifying **internal contradictions** between the browser environment, network signals, and JavaScript APIs. Rather than seeking an impossible "permanent 100% green" score, our objective is **eliminating all trivially detectable contradictions and leaks**.

---

## Implementation Roadmap & Status Board

| Priority | Vector / Fix | Target Files | Status | Verification Criteria |
| :---: | :--- | :--- | :---: | :--- |
| **Fix 1** | **Timezone Coherence (Three-State Policy)** | `packages/core/src/services/ProfileService.ts`, `CdpEmulator.ts` | ✅ **Verified** | IP geo and JS `Intl`/`Date` match exactly; direct connection preserves host timezone |
| **Fix 2** | **Canvas Idempotency & Reference Guard** | `packages/stealth/src/stealth_shim.js` | ✅ **Verified** | Offscreen clone, `read1 === read2` idempotent, solid probes unperturbed |
| **Fix 3** | **Prototype-Free Native Method Wrappers** | `packages/stealth/src/stealth_shim.js` | ✅ **Verified** | ES6 method shorthand, `'prototype' in fn === false`, `new fn()` throws TypeError |
| **Fix 4** | **Window Geometry via CLI (Drop Desktop CDP Scaling)** | `packages/core/src/supervisor/buildArgs.ts`, `CdpEmulator.ts` | ✅ **Verified** | `--window-size` + `--force-device-scale-factor=1`; `outerWidth - innerWidth <= 16px`; integer screen resolution |
| **Fix 5** | **`Runtime.enable` CDP Leak Suppression** | `packages/core/package.json`, root `package.json` | ✅ **Verified** | `bot-detector.rebrowser.net` shows `runtimeEnableLeak: PASS`; console getters un-triggered |
| **Fix 6** | **Deep Platform Coherence Vectors (6a - 6j)** | `packages/stealth/src/stealth_shim.js` | ✅ **Verified** | Android vs Windows font, speech voices, plugins, connection, battery, media queries aligned |
| **Fix 7** | **WebRTC ICE Leak & STUN Verification** | `packages/core/src/supervisor/buildArgs.ts`, `stealth_shim.js` | ✅ **Verified** | Zero host LAN IP (`192.168.x.x`) leakage via STUN; mDNS candidates sanitized |

---

## Detailed Specifications

### Fix 1: Timezone Coherence (Three-State Policy)

**Problem:** Hardcoded preset timezone (`America/New_York`) applied regardless of whether a proxy is active. Local IP in Nigeria (`GMT+0100`) + New York JS (`GMT-0400`) = instant red flag on Pixelscan.

**Three-State Policy Logic:**
```
IF proxy leased AND proxy.geo_tz is non-null:
    timezone = proxy.geo_tz           // authoritative, from HealthProbe
ELSE IF no proxy leased (direct connection):
    timezone = null                   // host fallback: do NOT call Emulation.setTimezoneOverride
ELSE (proxy leased BUT proxy.geo_tz is null):
    BLOCK LAUNCH with FINGERPRINT_INCOHERENT
```

**Implementation Rules:**
- Remove `--timezone=` from `buildArgs()`. (No such stable Chromium argument exists; Windows ignores `TZ` env var).
- On Windows, `Emulation.setTimezoneOverride` via CDP is the authoritative mechanism.
- If `targetTz` is `null`, skip `Emulation.setTimezoneOverride`, allowing Chromium to naturally report the host machine's timezone.

---

### Fix 2: Canvas Noise Idempotency & Reference Guard

**Problem:** `putImageData` directly mutates the caller's canvas. Two consecutive `toDataURL()` calls produce differing hashes. Real hardware graphics pipelines are strictly idempotent.

**Three-Layer Solution:**

#### Layer A: Never Mutate Caller Canvas
- When reading pixels for `toDataURL()` or `toBlob()`, copy pixel data to an **offscreen canvas**.
- Apply noise perturbation strictly on the offscreen copy.
- Return `offscreenCanvas.toDataURL()`. The caller's DOM canvas remains completely pristine.

#### Layer B: Reference-Probe Guard
- Detectors draw small canvases filled with solid reference colors to verify if an anti-detect script is blindly injecting noise.
- Count distinct colors in the image buffer:
```javascript
function shouldApplyNoise(data, width, height) {
  if (width * height < 1024) return false; // Skip small buffers (probes)
  const colors = new Set();
  for (let i = 0; i < data.length; i += 4) {
    colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (colors.size > 8) return true; // Complex rendering: safe to perturb
  }
  return false; // Solid or low-variance fills: leave untouched
}
```

#### Layer C: Content-Hash Idempotency Cache
- Cache the perturbed result based on a fast content checksum of the input canvas.
- Repeated calls on identical canvas state return the exact same cached string/buffer.

---

### Fix 3: Prototype-Free Native Wrappers

**Problem:** Functions declared with `function f() {}` have non-configurable `prototype` properties (`delete f.prototype` fails or throws in strict mode). Detecting `'prototype' in HTMLCanvasElement.prototype.toDataURL` or calling `new toDataURL()` exposes JS monkey-patches.

**Implementation Rules:**
- Use **arrow functions** or **ES6 object method shorthand** which lack an internal `[[Construct]]` slot and do not possess a `.prototype` property:
```javascript
const wrapper = (...args) => {
  return origFn.apply(this, args);
};
// Object.prototype.hasOwnProperty.call(wrapper, 'prototype') === false
// new wrapper() throws TypeError: wrapper is not a constructor
```
- Preserve native function `.name`:
```javascript
Object.defineProperty(wrapper, 'name', {
  value: origName,
  configurable: true,
});
```
- Do **not** set `.toString` as an own property on the wrapper (which leaks via `hasOwnProperty('toString')`). Rely strictly on the centralized `Function.prototype.toString` WeakMap registry.

**Methods Requiring Hardening:**
- `HTMLCanvasElement.prototype.toDataURL`
- `HTMLCanvasElement.prototype.toBlob`
- `CanvasRenderingContext2D.prototype.getImageData`
- `WebGLRenderingContext.prototype.getParameter`
- `WebGL2RenderingContext.prototype.getParameter`
- `AudioBuffer.prototype.getChannelData`
- `Screen.prototype` getters (`width`, `height`, `availWidth`, `availHeight`, `colorDepth`)
- `navigator` getters (`hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`, `languages`)

---

### Fix 4: Window Geometry via CLI (Drop Desktop CDP Scaling)

**Problem:** Calling `Emulation.setDeviceMetricsOverride` on desktop (`mobile: false`) inside an unsynced window triggers layout zooming, subpixel fractional coordinates (`640.000019...`), and massive `outerWidth - innerWidth` differences that trigger Pixelscan's `IsDevtoolOpen: Detected`.

**Implementation Rules:**
1. **Launch Flags:**
   ```bash
   --window-size=${screen.width},${screen.height}
   --window-position=0,0
   --force-device-scale-factor=1
   --high-dpi-support=1
   ```
2. **Conditional CDP Emulation:**
   - **Desktop (`mobile: false`):** NEVER call `Emulation.setDeviceMetricsOverride`. The OS window already matches the preset.
   - **Mobile (`mobile: true`):** Use `Emulation.setDeviceMetricsOverride` with OS window sized $\ge$ emulated dimensions.
3. **`Screen.prototype` Integer Spoofing:**
   - Define getters for `width`, `height`, `availWidth`, `availHeight` returning clean integers matching the preset.

---

### Fix 5: `Runtime.enable` Leak Suppression (`rebrowser-patches`)

**Problem:** Playwright's automatic `Runtime.enable` CDP command causes V8 to evaluate trapped console getters (e.g. `Error.stack`, `Image.id`), revealing an active CDP inspector.

**Implementation Rules:**
- Integrate `rebrowser-playwright-core` (or apply `rebrowser-patches` to `playwright-core`).
- Disables automatic `Runtime.enable` and uses isolated execution contexts (`UtilityScript`).
- Verification via `https://bot-detector.rebrowser.net/` (`runtimeEnableLeak: PASS`).

---

### Fix 6: Deep Platform Coherence Vectors

- **6a (WebRTC ICE):** Enforce `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`; sanitize candidate IP strings.
- **6b (Fonts):** Platform-consistent font sets for Android vs Windows in `document.fonts`.
- **6c (Plugins):** Android reports empty plugins list; Windows reports Chromium standard PDF plugin list.
- **6d (Speech):** Platform-consistent `SpeechSynthesis.getVoices()` (Google TTS for Android, Microsoft SAPI for Windows).
- **6e (Connection):** `navigator.connection` reports `4g` on mobile, undefined/WiFi on desktop.
- **6f (MediaDevices):** Android-appropriate device lists in `navigator.mediaDevices.enumerateDevices()`.
- **6g (Battery):** Android exposes BatteryManager; desktop reports standard status.
- **6h (Client Hints):** `Sec-CH-UA-*` headers must match `navigator.userAgentData`.
- **6i (CSS Media):** `@media (hover: none)` and `(pointer: coarse)` on mobile presets.
- **6j (Orientation):** `screen.orientation` present and coherent with mobile viewport.

---

## Progress Log

- **2026-09-29:** Initialized hardening specification from Pixelscan forensic audit. Prioritized Fixes 1–4 for immediate execution.
- **2026-09-29:** Phase 1 Hardening (Fixes 1–4) verified live in Chromium:
  - Fix 1: Direct connection preserves host timezone (`Africa/Lagos`), eliminating timezone-vs-IP mismatch.
  - Fix 2: Canvas reads verified idempotent (`read1 === read2`), offscreen copy prevents caller mutation, solid probes untouched.
  - Fix 3: Method wrappers transitioned to ES6 method shorthand: `'prototype' in fn === false`, constructor invocation throws `TypeError`.
  - Fix 4: Window geometry governed via CLI flags; `outerWidth - innerWidth = 16px`, integer screen resolution, desktop layout zoom removed.
- **2026-09-29:** Fix 5 (`Runtime.enable` CDP Leak Suppression) verified live in Chromium:
  - Aliased `playwright-core` to `npm:rebrowser-playwright-core@1.47.2` in `packages/core` and root `package.json` pnpm overrides.
  - In-page console trap verified 0 stack lookups (`leakDetected: false`).
  - Live remote benchmark at `https://bot-detector.rebrowser.net/` reported `runtimeEnableLeak: 🟢 PASS (No leak detected)`.
  - All 265 `@tersoo/core` unit/integration tests and monorepo suites pass without regression.
- **2026-09-29:** Fix 6 (Deep Platform Coherence Vectors 6a–6j) verified live in Chromium:
  - Injected Section 13 (platform plugins), Section 17 (`navigator.connection`), Section 18 (`window.matchMedia` hover/pointer queries), Section 19 (`screen.orientation`), Section 20 (`SpeechSynthesis.prototype.getVoices`), Section 21 (`navigator.getBattery`), Section 22 (`navigator.mediaDevices.enumerateDevices`), and Section 23 (`document.fonts.check` font platform isolation).
  - Both Windows 11 Desktop and Android 14 Mobile profiles passed 8/8 automated in-page checks via [`scripts/verify-fix6-coherence.ts`](file:///c:/Users/Akende%20Micheal/Desktop/Antigravity/TersooPilot%20Desktop%20Version/scripts/verify-fix6-coherence.ts).
- **2026-09-29:** Fix 7 (WebRTC ICE Leak & STUN Verification) verified live in Chromium:
  - Verified via [`scripts/verify-fix7-webrtc.ts`](file:///c:/Users/Akende%20Micheal/Desktop/Antigravity/TersooPilot%20Desktop%20Version/scripts/verify-fix7-webrtc.ts) against Google STUN server (`stun.l.google.com:19302`).
  - Candidate host IP sanitized to `.local` mDNS candidate (`hasPrivateIp: false`). Zero host private LAN IP leakage.
- **2026-09-29:** Full monorepo verification:
  - 10/10 Turbo build tasks succeeded.
  - 317 total automated tests passing across `@tersoo/contracts`, `@tersoo/stealth`, `@tersoo/core`, `@tersoo/desktop`, and `@tersoo/renderer` with zero regressions.
