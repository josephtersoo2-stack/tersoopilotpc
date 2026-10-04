import type { FingerprintBundle } from '@tersoo/contracts';

export function parseFingerprintBundle(raw: string | FingerprintBundle): FingerprintBundle {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as FingerprintBundle;
  }
  return raw;
}

export function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
