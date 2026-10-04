import { FingerprintBundle } from '@tersoo/contracts';

import type { PresetDefinition } from './presets';
import { SeededRng } from './prng';

export function generateFingerprint(
  preset: PresetDefinition,
  seed: string,
  overrides?: Partial<FingerprintBundle>,
): FingerprintBundle {
  const rng = new SeededRng(seed);

  // Deterministic screen picking
  const chosenScreen = rng.pick(preset.screenOptions);
  const screen = {
    width: chosenScreen.width,
    height: chosenScreen.height,
    availWidth: chosenScreen.availWidth ?? chosenScreen.width,
    availHeight: chosenScreen.availHeight ?? Math.max(chosenScreen.height - 40, 600),
    colorDepth: chosenScreen.colorDepth ?? 24,
    dpr: chosenScreen.dpr,
    ...(overrides?.screen ?? {}),
  };

  // Deterministic WebGL selection
  const chosenWebgl = rng.pick(preset.webglOptions);
  const webgl = {
    vendor: chosenWebgl.vendor,
    renderer: chosenWebgl.renderer,
    unmaskedVendor: chosenWebgl.unmaskedVendor,
    unmaskedRenderer: chosenWebgl.unmaskedRenderer,
    ...(overrides?.webgl ?? {}),
  };

  // Deterministic hardware selection
  const cores = rng.pick(preset.hardwareOptions.coreOptions);
  const memoryGb = rng.pick(preset.hardwareOptions.memoryOptionsGb);
  const hardware = {
    cores,
    memoryGb,
    maxTouchPoints: preset.hardwareOptions.maxTouchPoints,
    ...(overrides?.hardware ?? {}),
  };

  // Deterministic noise intensities
  const canvasNoiseIntensity = Number((0.1 + rng.next() * 0.08).toFixed(4));
  const canvasNoise = {
    enabled: true,
    algorithm: 'gaussian' as const,
    intensity: canvasNoiseIntensity,
    ...(overrides?.canvasNoise ?? {}),
  };

  const audioNoiseIntensity = Number((0.08 + rng.next() * 0.05).toFixed(4));
  const audioNoise = {
    enabled: true,
    algorithm: 'gaussian' as const,
    intensity: audioNoiseIntensity,
    ...(overrides?.audioNoise ?? {}),
  };

  const bundle: FingerprintBundle = {
    seed,
    platform: preset.platform,
    userAgent: overrides?.userAgent ?? preset.baseUserAgent,
    uaMetadata: {
      brands: preset.uaMetadata.brands,
      platform: preset.uaMetadata.platform,
      platformVersion: preset.uaMetadata.platformVersion,
      architecture: preset.uaMetadata.architecture,
      model: preset.uaMetadata.model,
      mobile: preset.uaMetadata.mobile,
      ...(overrides?.uaMetadata ?? {}),
    },
    screen,
    webgl,
    canvasNoise,
    audioNoise,
    hardware,
    locales: {
      languages: preset.locales.languages,
      acceptLanguage: preset.locales.acceptLanguage,
      ...(overrides?.locales ?? {}),
    },
    timezone: overrides?.timezone ?? preset.defaultTimezone,
    geolocation: overrides?.geolocation ?? {
      lat: 40.7128,
      lng: -74.006,
      accuracy: 50,
    },
    webrtcPolicy: 'disable_non_proxied_udp',
    webdriverHidden: true,
  };

  return FingerprintBundle.parse(bundle);
}
