import { DEFAULT_PRESET_IDS, type FingerprintBundle } from '@tersoo/contracts';

import type { PresetRepo } from '../persistence/repos/presetRepo';
import type { PresetRow } from '../persistence/schema';

import { validateCoherence, type CoherenceProxyInput, type CoherenceResult } from './coherence';
import { generateFingerprint } from './generator';
import { PRESET_DEFINITIONS, type PresetDefinition } from './presets';
import {
  evaluateSelfTest,
  runSelfTestViaCdp,
  type SelfTestResult,
} from './selfTest';
import type { CDPClient } from './CdpEmulator';

export interface ResolveProfileInput {
  id?: string;
  preset_id?: string;
  presetId?: string;
  platform?: string;
  fingerprint_seed?: string;
  fingerprintSeed?: string;
  fingerprint_bundle?: string;
  fingerprintBundle?: unknown;
}

export class FingerprintEngine {
  constructor(private readonly presetRepo: PresetRepo) {}

  /**
   * Resolves a complete, deterministic FingerprintBundle for a given profile or input.
   * If an explicit override bundle exists, it merges it with the deterministic preset defaults.
   */
  async resolve(profile: ResolveProfileInput): Promise<FingerprintBundle> {
    const seed =
      profile.fingerprint_seed ??
      profile.fingerprintSeed ??
      'tersoo-default-seed-value-12345';
    const presetId =
      profile.preset_id ?? profile.presetId ?? DEFAULT_PRESET_IDS.windows11;

    let presetDef: PresetDefinition | undefined = PRESET_DEFINITIONS[presetId];
    if (!presetDef) {
      const dbRow = await this.presetRepo.getById(presetId);
      if (dbRow) {
        try {
          const parsed = JSON.parse(dbRow.bundle) as Partial<PresetDefinition>;
          presetDef = {
            id: dbRow.id,
            name: dbRow.name,
            platform: dbRow.platform as 'windows' | 'macos' | 'android',
            description: parsed.description ?? dbRow.name,
            baseUserAgent:
              parsed.baseUserAgent ??
              (parsed as { userAgent?: string }).userAgent ??
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            uaMetadata: parsed.uaMetadata ?? {
              brands: [
                { brand: 'Chromium', version: '128' },
                { brand: 'Google Chrome', version: '128' },
              ],
              platform:
                dbRow.platform === 'windows'
                  ? 'Windows'
                  : dbRow.platform === 'macos'
                    ? 'Macintosh'
                    : 'Android',
              platformVersion:
                dbRow.platform === 'windows'
                  ? '15.0.0'
                  : dbRow.platform === 'macos'
                    ? '14.5.0'
                    : '14.0.0',
              architecture:
                dbRow.platform === 'macos'
                  ? 'arm'
                  : dbRow.platform === 'android'
                    ? 'arm64'
                    : 'x86',
              model: '',
              mobile: dbRow.platform === 'android',
            },
            screenOptions: parsed.screenOptions ?? [
              (parsed as { screen?: { width: number; height: number; dpr: number } }).screen ?? {
                width: 1920,
                height: 1080,
                dpr: 1,
              },
            ],
            webglOptions: parsed.webglOptions ?? [
              (parsed as { webgl?: { vendor: string; renderer: string; unmaskedVendor: string; unmaskedRenderer: string } }).webgl ?? {
                vendor: 'Google Inc.',
                renderer: 'ANGLE',
                unmaskedVendor: 'NVIDIA Corporation',
                unmaskedRenderer: 'NVIDIA GeForce RTX 4070',
              },
            ],
            hardwareOptions: parsed.hardwareOptions ?? {
              coreOptions: [8, 12, 16],
              memoryOptionsGb: [16, 32],
              maxTouchPoints: dbRow.platform === 'android' ? 5 : 0,
            },
            locales: parsed.locales ?? {
              languages: ['en-US', 'en'],
              acceptLanguage: 'en-US,en;q=0.9',
            },
            defaultTimezone: parsed.defaultTimezone ?? 'America/New_York',
          };
        } catch {
          presetDef = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]!;
        }
      } else {
        presetDef = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]!;
      }
    }

    let overrides: Partial<FingerprintBundle> = {};
    if (typeof profile.fingerprint_bundle === 'string' && profile.fingerprint_bundle.length > 0) {
      try {
        overrides = JSON.parse(profile.fingerprint_bundle) as Partial<FingerprintBundle>;
      } catch {
        overrides = {};
      }
    } else if (profile.fingerprintBundle && typeof profile.fingerprintBundle === 'object') {
      overrides = profile.fingerprintBundle;
    }

    return generateFingerprint(presetDef, seed, overrides);
  }

  /**
   * Validates cross-subsystem coherence of a bundle with optional proxy details.
   */
  validateCoherence(
    bundle: FingerprintBundle,
    proxy?: CoherenceProxyInput | null,
  ): CoherenceResult {
    return validateCoherence(bundle, proxy);
  }

  /**
   * Returns a preset row by ID.
   */
  async getPreset(id: string): Promise<PresetRow | undefined> {
    return this.presetRepo.getById(id);
  }

  /**
   * Returns all available preset rows.
   */
  async listPresets(): Promise<PresetRow[]> {
    return this.presetRepo.list();
  }

  /**
   * Runs self-test evaluation on a target page or raw telemetry object against a bundle.
   */
  async selfTest(
    target: CDPClient | Record<string, unknown>,
    bundle: FingerprintBundle,
  ): Promise<SelfTestResult> {
    if (
      target &&
      typeof target === 'object' &&
      'send' in target &&
      typeof (target as CDPClient).send === 'function'
    ) {
      return runSelfTestViaCdp(target as CDPClient, bundle);
    }
    return evaluateSelfTest(target, bundle);
  }
}
