import type { FingerprintBundle } from '@tersoo/contracts';

export interface CoherenceProxyInput {
  geo_tz?: string | null;
  geo_country?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
}

export interface CoherenceResult {
  ok: boolean;
  reasons: string[];
}

export function validateCoherence(
  bundle: FingerprintBundle,
  proxy?: CoherenceProxyInput | null,
): CoherenceResult {
  const reasons: string[] = [];

  // 1. Platform vs UserAgent & uaMetadata
  if (bundle.platform === 'windows') {
    if (!bundle.userAgent.includes('Windows NT')) {
      reasons.push("Windows platform must contain 'Windows NT' in userAgent");
    }
    if (bundle.uaMetadata.platform !== 'Windows') {
      reasons.push("Windows platform must have uaMetadata.platform === 'Windows'");
    }
    if (bundle.uaMetadata.mobile) {
      reasons.push('Windows platform must not be marked as mobile');
    }
  } else if (bundle.platform === 'macos') {
    if (!bundle.userAgent.includes('Macintosh') && !bundle.userAgent.includes('Mac OS X')) {
      reasons.push("macOS platform must contain 'Macintosh' or 'Mac OS X' in userAgent");
    }
    if (bundle.uaMetadata.platform !== 'Macintosh') {
      reasons.push("macOS platform must have uaMetadata.platform === 'Macintosh'");
    }
    if (bundle.uaMetadata.mobile) {
      reasons.push('macOS platform must not be marked as mobile');
    }
  } else if (bundle.platform === 'android') {
    if (!bundle.userAgent.includes('Android')) {
      reasons.push("Android platform must contain 'Android' in userAgent");
    }
    if (bundle.uaMetadata.platform !== 'Android') {
      reasons.push("Android platform must have uaMetadata.platform === 'Android'");
    }
    if (!bundle.uaMetadata.mobile) {
      reasons.push('Android mobile device must have uaMetadata.mobile === true');
    }
    if (bundle.hardware.maxTouchPoints === 0) {
      reasons.push('Android mobile device must have maxTouchPoints > 0');
    }
  }

  // 2. WebGL Renderer Coherence
  const renderer = bundle.webgl.unmaskedRenderer.toLowerCase();
  const rawRenderer = bundle.webgl.renderer.toLowerCase();

  if (bundle.platform === 'windows') {
    if (renderer.includes('apple') || rawRenderer.includes('apple')) {
      reasons.push('Windows platform cannot use an Apple Silicon GPU renderer');
    }
    if (renderer.includes('mali') || renderer.includes('adreno')) {
      reasons.push('Windows platform cannot use a mobile ARM/Adreno GPU renderer');
    }
  } else if (bundle.platform === 'macos') {
    if (rawRenderer.includes('direct3d') || rawRenderer.includes('d3d')) {
      reasons.push('macOS platform cannot use a Microsoft Direct3D WebGL renderer');
    }
    if (renderer.includes('mali') || renderer.includes('adreno')) {
      reasons.push('macOS platform cannot use a mobile ARM/Adreno GPU renderer');
    }
  } else if (bundle.platform === 'android') {
    if (rawRenderer.includes('direct3d') || rawRenderer.includes('d3d')) {
      reasons.push('Android platform cannot use a Microsoft Direct3D WebGL renderer');
    }
    if (renderer.includes('apple') || rawRenderer.includes('apple')) {
      reasons.push('Android platform cannot use an Apple Silicon GPU renderer');
    }
  }

  // 3. Screen Dimensions Coherence
  if (bundle.screen.availWidth > bundle.screen.width) {
    reasons.push('screen.availWidth cannot exceed screen.width');
  }
  if (bundle.screen.availHeight > bundle.screen.height) {
    reasons.push('screen.availHeight cannot exceed screen.height');
  }

  // 4. Proxy Timezone Coherence
  if (proxy?.geo_tz && proxy.geo_tz.trim().length > 0) {
    if (bundle.timezone && bundle.timezone !== proxy.geo_tz) {
      reasons.push(
        `Bundle timezone '${bundle.timezone}' does not match proxy geo timezone '${proxy.geo_tz}'`,
      );
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
