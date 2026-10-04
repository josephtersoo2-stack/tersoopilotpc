import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_PRESET_IDS, FingerprintBundle } from '@tersoo/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import {
  generateFingerprint,
  hashStringToInt,
  mulberry32,
  PRESET_DEFINITIONS,
  SeededRng,
  validateCoherence,
} from '../src/fingerprint';
import { FingerprintEngine } from '../src/fingerprint/FingerprintEngine';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { PresetRepo } from '../src/persistence/repos/presetRepo';
import type { DB } from '../src/persistence/schema';

describe('Ticket 3.1: Presets Library & Seeded Deterministic Fingerprint Generator', () => {
  let tempDir: string;
  let db: AppDatabase<DB>;
  let presetRepo: PresetRepo;
  let engine: FingerprintEngine;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-fingerprint-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb<DB>(config, rootMigrationsDir);
    presetRepo = new PresetRepo(db);
    await presetRepo.seedDefaults();
    engine = new FingerprintEngine(presetRepo);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Deterministic PRNG (Mulberry32 + FNV-1a)', () => {
    it('produces identical 32-bit hash for identical seed strings', () => {
      const seed = 'user-profile-seed-12345';
      const h1 = hashStringToInt(seed);
      const h2 = hashStringToInt(seed);
      expect(h1).toBe(h2);
      expect(typeof h1).toBe('number');
      expect(h1).toBeGreaterThanOrEqual(0);
      expect(h1).toBeLessThanOrEqual(0xffffffff);
    });

    it('produces different hashes for different seed strings', () => {
      const h1 = hashStringToInt('seed-alpha');
      const h2 = hashStringToInt('seed-beta');
      expect(h1).not.toBe(h2);
    });

    it('generates deterministic sequence of numbers in [0, 1)', () => {
      const rng1 = new SeededRng('test-seed-42');
      const rng2 = new SeededRng('test-seed-42');

      const seq1 = Array.from({ length: 25 }, () => rng1.next());
      const seq2 = Array.from({ length: 25 }, () => rng2.next());

      expect(seq1).toEqual(seq2);
      seq1.forEach((n) => {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      });
    });

    it('provides deterministic pick, shuffle, and nextInt', () => {
      const rng1 = new SeededRng('deterministic-seed');
      const rng2 = new SeededRng('deterministic-seed');

      const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
      expect(rng1.pick(items)).toBe(rng2.pick(items));
      expect(rng1.shuffle(items)).toEqual(rng2.shuffle(items));
      expect(rng1.nextInt(10, 50)).toBe(rng2.nextInt(10, 50));
    });
  });

  describe('Presets Library Coverage', () => {
    it('defines all 6 default OS presets with complete configurations', () => {
      const expectedPresets = [
        DEFAULT_PRESET_IDS.windows11,
        DEFAULT_PRESET_IDS.windows10,
        DEFAULT_PRESET_IDS.macosSonoma,
        DEFAULT_PRESET_IDS.macosSequoia,
        DEFAULT_PRESET_IDS.android14,
        DEFAULT_PRESET_IDS.galaxyS24,
      ];

      for (const presetId of expectedPresets) {
        const preset = PRESET_DEFINITIONS[presetId];
        expect(preset).toBeDefined();
        expect(preset!.id).toBe(presetId);
        expect(preset!.name).toBeTruthy();
        expect(preset!.baseUserAgent).toBeTruthy();
        expect(preset!.screenOptions.length).toBeGreaterThan(0);
        expect(preset!.webglOptions.length).toBeGreaterThan(0);
        expect(preset!.hardwareOptions.coreOptions.length).toBeGreaterThan(0);
        expect(preset!.hardwareOptions.memoryOptionsGb.length).toBeGreaterThan(0);
      }
    });

    it('seeds all presets into database and can retrieve them via PresetRepo', async () => {
      const presets = await presetRepo.list();
      expect(presets.length).toBe(6);

      const win11 = await presetRepo.getById(DEFAULT_PRESET_IDS.windows11);
      expect(win11).toBeDefined();
      expect(win11!.platform).toBe('windows');

      const mac = await presetRepo.getById(DEFAULT_PRESET_IDS.macosSonoma);
      expect(mac).toBeDefined();
      expect(mac!.platform).toBe('macos');

      const android = await presetRepo.getById(DEFAULT_PRESET_IDS.android14);
      expect(android).toBeDefined();
      expect(android!.platform).toBe('android');
    });
  });

  describe('Seeded Fingerprint Generation & Schema Adherence', () => {
    it('generates a valid FingerprintBundle strictly conforming to Zod schema', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]!;
      const bundle = generateFingerprint(preset, 'profile-seed-windows-11');

      const parsed = FingerprintBundle.safeParse(bundle);
      expect(parsed.success).toBe(true);
      expect(bundle.platform).toBe('windows');
      expect(bundle.userAgent).toContain('Windows NT 10.0');
      expect(bundle.uaMetadata.platform).toBe('Windows');
      expect(bundle.uaMetadata.mobile).toBe(false);
      expect(bundle.hardware.maxTouchPoints).toBe(0);
      expect(bundle.webrtcPolicy).toBe('disable_non_proxied_udp');
      expect(bundle.webdriverHidden).toBe(true);
    });

    it('is strictly deterministic: identical seed yields identical bundle', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.macosSonoma]!;
      const seed = 'stable-macos-profile-seed-xyz-987';

      const b1 = generateFingerprint(preset, seed);
      const b2 = generateFingerprint(preset, seed);

      expect(b1).toEqual(b2);
      expect(JSON.stringify(b1)).toBe(JSON.stringify(b2));
    });

    it('is seed-sensitive: different seeds produce distinct hardware variations', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]!;
      const b1 = generateFingerprint(preset, 'seed-variation-alpha-111');
      const b2 = generateFingerprint(preset, 'seed-variation-beta-222');

      expect(b1.seed).not.toBe(b2.seed);
      expect(b1.canvasNoise.intensity).not.toBe(b2.canvasNoise.intensity);
      expect(b1.audioNoise.intensity).not.toBe(b2.audioNoise.intensity);
    });

    it('generates coherent macOS bundle with Apple Silicon GPU', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.macosSonoma]!;
      const bundle = generateFingerprint(preset, 'macbook-pro-m2');

      expect(bundle.platform).toBe('macos');
      expect(bundle.userAgent).toContain('Macintosh');
      expect(bundle.uaMetadata.platform).toBe('Macintosh');
      expect(bundle.uaMetadata.architecture).toBe('arm');
      expect(bundle.webgl.unmaskedRenderer).toContain('Apple M2');
      expect(bundle.hardware.maxTouchPoints).toBe(0);
    });

    it('generates coherent Android mobile bundle with touch points and mobile UA', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.android14]!;
      const bundle = generateFingerprint(preset, 'pixel-8-pro-seed');

      expect(bundle.platform).toBe('android');
      expect(bundle.userAgent).toContain('Linux; Android 14');
      expect(bundle.uaMetadata.platform).toBe('Android');
      expect(bundle.uaMetadata.mobile).toBe(true);
      expect(bundle.hardware.maxTouchPoints).toBe(5);
      expect(bundle.webgl.renderer).toMatch(/Adreno|Mali/);
    });
  });

  describe('Coherence Validation', () => {
    it('passes coherence validation for all default generated bundles', () => {
      for (const preset of Object.values(PRESET_DEFINITIONS)) {
        const bundle = generateFingerprint(preset, `test-coherence-${preset.id}`);
        const result = validateCoherence(bundle);
        expect(result.ok).toBe(true);
        expect(result.reasons).toEqual([]);
      }
    });

    it('flags incoherent platform and user agent combination', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]!;
      const bundle = generateFingerprint(preset, 'tampered-seed', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });

      const result = validateCoherence(bundle);
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.includes('Windows NT'))).toBe(true);
    });

    it('flags incoherent WebGL GPU renderer on Windows platform', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]!;
      const bundle = generateFingerprint(preset, 'tampered-gpu-seed', {
        webgl: {
          vendor: 'Apple Inc.',
          renderer: 'Apple M2 Pro',
          unmaskedVendor: 'Apple',
          unmaskedRenderer: 'Apple M2 Pro',
        },
      });

      const result = validateCoherence(bundle);
      expect(result.ok).toBe(false);
      expect(result.reasons.some((r) => r.includes('Apple Silicon GPU'))).toBe(true);
    });

    it('validates timezone against proxy exit timezone', () => {
      const preset = PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]!;
      const bundle = generateFingerprint(preset, 'tz-test-seed', {
        timezone: 'America/New_York',
      });

      const matching = validateCoherence(bundle, { geo_tz: 'America/New_York' });
      expect(matching.ok).toBe(true);

      const mismatched = validateCoherence(bundle, { geo_tz: 'Europe/London' });
      expect(mismatched.ok).toBe(false);
      expect(mismatched.reasons[0]).toContain("timezone 'America/New_York' does not match");
    });
  });

  describe('FingerprintEngine Service Resolution', () => {
    it('resolves bundle via presetId and seed', async () => {
      const bundle = await engine.resolve({
        presetId: DEFAULT_PRESET_IDS.windows11,
        fingerprintSeed: 'engine-resolve-test-seed',
      });

      expect(bundle).toBeDefined();
      expect(bundle.platform).toBe('windows');
      expect(bundle.seed).toBe('engine-resolve-test-seed');
    });

    it('falls back to default Windows 11 preset if preset not found', async () => {
      const bundle = await engine.resolve({
        presetId: 'unknown-preset-id',
        fingerprintSeed: 'engine-fallback-seed',
      });

      expect(bundle).toBeDefined();
      expect(bundle.platform).toBe('windows');
      expect(bundle.seed).toBe('engine-fallback-seed');
    });
  });
});
