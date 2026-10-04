import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  FingerprintBundle,
  ProfileCreateInput,
  ProfileExportBundle,
  ProfileImportInput,
  ProfileUpdateInput,
  type ProfileDetail,
  type ProfileState,
  type ProfileSummary,
} from '@tersoo/contracts';
import type { z } from 'zod';

import { paths, type Config } from '../config';
import type { CrosshairWorker } from '../crosshair/CrosshairWorker';
import type { EventBus } from '../events/EventBus';
import type { FingerprintEngine } from '../fingerprint/FingerprintEngine';
import type {
  AcquireLockOptions,
  LockHandle,
  ProfileFilter,
  ProfilePatch,
  Repos,
} from '../persistence/repos';
import type { HealthProbe } from '../proxy/HealthProbe';
import type { LocalForwarder } from '../proxy/LocalForwarder';
import type { SecretVault } from '../secrets/SecretVault';
import type { BrowserSupervisor } from '../supervisor/BrowserSupervisor';
import { WebSocketCdpClient } from '../supervisor/CdpClient';
import type { Instance } from '../supervisor/types';
import { LaunchError, ProfileError, ProxyError, TersooError } from '../util/errors';
import { CdpEmulator } from '../fingerprint/CdpEmulator';
import { EngineFactory } from '../engines/EngineFactory';
import { ApostateEngine } from '../engines/apostate/ApostateEngine';
import type { EngineType } from '../engines/types';
import { hashSeed } from '../engines/shared/fingerprintResolve';

import type { FleetService } from './FleetService';

export interface LaunchOptions {
  cdpTimeoutMs?: number | undefined;
  /**
   * Internal escape hatch for tests and engine bring-up only. Every entry is
   * checked against the allowlist in `engines/shared/argSanitizer.ts`; anything
   * that could override the user-data directory, proxy path, or debugger
   * lockdown throws rather than being passed through.
   */
  additionalArgs?: string[] | undefined;
  proxyId?: string | undefined;
  headless?: boolean | undefined;
  skipEmulation?: boolean | undefined;
  hostScreen?: { width: number; height: number; workAreaWidth?: number; workAreaHeight?: number } | undefined;
}

export interface LaunchResult {
  instance: Instance;
  runId?: string | undefined;
}

export interface ProfileServiceDeps {
  repos: Repos;
  supervisor: BrowserSupervisor;
  events: EventBus;
  config: Config;
  engineFactory?: EngineFactory | undefined;
  forwarder?: LocalForwarder | undefined;
  healthProbe?: HealthProbe | undefined;
  fingerprint?: FingerprintEngine | undefined;
  crosshair?: CrosshairWorker | undefined;
  secrets?: SecretVault | undefined;
  fleet?: FleetService | undefined;
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function buildFingerprintBundle(
  platform: 'windows' | 'macos' | 'android',
  seed: string,
  rawPresetBundle: string | Partial<FingerprintBundle>,
  extraOverrides?: Partial<FingerprintBundle>,
): FingerprintBundle {
  let overrides: Partial<FingerprintBundle> = {};
  if (typeof rawPresetBundle === 'string') {
    try {
      overrides = JSON.parse(rawPresetBundle) as Partial<FingerprintBundle>;
    } catch {
      overrides = {};
    }
  } else if (rawPresetBundle && typeof rawPresetBundle === 'object') {
    overrides = rawPresetBundle;
  }
  if (extraOverrides) {
    overrides = { ...overrides, ...extraOverrides };
  }

  const isWindows = platform === 'windows';
  const isMac = platform === 'macos';
  const osName = isWindows ? 'Windows' : isMac ? 'Macintosh' : 'Android';
  const uaPlatform = isWindows
    ? 'Windows NT 10.0; Win64; x64'
    : isMac
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : 'Linux; Android 13';

  const bundle: FingerprintBundle = {
    seed,
    platform,
    userAgent:
      overrides.userAgent ??
      `Mozilla/5.0 (${uaPlatform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36`,
    uaMetadata: {
      brands: [
        { brand: 'Chromium', version: '128' },
        { brand: 'Google Chrome', version: '128' },
      ],
      platform: osName,
      platformVersion: isWindows ? '10.0.0' : isMac ? '14.5.0' : '13.0.0',
      architecture: isWindows ? 'x86' : isMac ? 'arm' : 'arm64',
      model: '',
      mobile: platform === 'android',
      ...(overrides.uaMetadata ?? {}),
    },
    screen: {
      width: 1920,
      height: 1080,
      availWidth: 1920,
      availHeight: 1040,
      colorDepth: 24,
      dpr: 1,
      ...(overrides.screen ?? {}),
    },
    webgl: {
      vendor: isWindows
        ? (overrides.webgl?.vendor ?? 'Google Inc. (NVIDIA)')
        : platform === 'android'
          ? (overrides.webgl?.vendor ?? 'Qualcomm')
          : (overrides.webgl?.vendor ?? 'Apple Inc.'),
      renderer: isWindows
        ? (overrides.webgl?.renderer ?? 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)')
        : platform === 'android'
          ? (overrides.webgl?.renderer ?? 'Qualcomm / Adreno (TM) 750')
          : (overrides.webgl?.renderer ?? 'Apple M2 Pro'),
      unmaskedVendor: isWindows
        ? (overrides.webgl?.unmaskedVendor ?? 'NVIDIA Corporation')
        : platform === 'android'
          ? (overrides.webgl?.unmaskedVendor ?? 'Qualcomm')
          : (overrides.webgl?.unmaskedVendor ?? 'Apple'),
      unmaskedRenderer: isWindows
        ? (overrides.webgl?.unmaskedRenderer ?? 'NVIDIA GeForce RTX 3080')
        : platform === 'android'
          ? (overrides.webgl?.unmaskedRenderer ?? 'Adreno (TM) 750')
          : (overrides.webgl?.unmaskedRenderer ?? 'Apple M2 Pro'),
      ...(overrides.webgl ?? {}),
    },
    canvasNoise: {
      enabled: true,
      algorithm: 'gaussian',
      intensity: 0.15,
      ...(overrides.canvasNoise ?? {}),
    },
    audioNoise: {
      enabled: true,
      algorithm: 'gaussian',
      intensity: 0.1,
      ...(overrides.audioNoise ?? {}),
    },
    hardware: {
      cores: 8,
      memoryGb: 16,
      maxTouchPoints: platform === 'android' ? 5 : 0,
      ...(overrides.hardware ?? {}),
    },
    locales: {
      languages: ['en-US', 'en'],
      acceptLanguage: 'en-US,en;q=0.9',
      ...(overrides.locales ?? {}),
    },
    timezone: overrides.timezone ?? 'America/New_York',
    geolocation: overrides.geolocation ?? {
      lat: 40.7128,
      lng: -74.006,
      accuracy: 50,
    },
    webrtcPolicy: 'disable_non_proxied_udp',
    webdriverHidden: true,
  };

  return FingerprintBundle.parse(bundle);
}

export class ProfileService {
  private readonly engineFactory: EngineFactory;

  constructor(private readonly deps: ProfileServiceDeps) {
    this.engineFactory =
      deps.engineFactory ??
      new EngineFactory(
        new ApostateEngine({ supervisor: deps.supervisor, config: deps.config }),
      );
  }

  async list(filter?: ProfileFilter): Promise<ProfileSummary[]> {
    const rows = await this.deps.repos.profiles.listWithDetails(filter);
    return rows.map((row) => {
      const bundle = safeJsonParse<Partial<FingerprintBundle>>(row.fingerprint_bundle, {});
      return {
        id: row.id,
        name: row.name,
        tags: safeJsonParse<string[]>(row.tags, []),
        presetId: row.preset_id,
        state: row.state as ProfileState,
        platform: row.platform,
        engine: (row.engine ?? 'apostate') as 'apostate' | 'camoufox',
        captchaBudgetUsed: row.captcha_budget_used ?? 0,
        proxyId: row.activeProxyId,
        lastLaunchedAt: row.last_launched_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        webglRenderer: bundle.webgl?.unmaskedRenderer,
        cores: bundle.hardware?.cores,
        memoryGb: bundle.hardware?.memoryGb,
        screenResolution: bundle.screen ? `${bundle.screen.width} × ${bundle.screen.height}` : undefined,
        deviceModel: bundle.uaMetadata?.model,
        persona: row.persona ?? 'casual',
        nicheId: row.niche_id ?? null,
        trustScore: row.trust_score ?? 10,
        maturationStage: (row.maturation_stage ?? 'infant') as any,
        typingWpm: row.typing_wpm ?? 70,
        typoRate: row.typo_rate ?? 0.03,
        patienceIndex: row.patience_index ?? 5.5,
        engagementRate: row.engagement_rate ?? 0.20,
        nicheIds: safeJsonParse<string[]>(row.niche_ids, []),
        weightedNiches: safeJsonParse<{ nicheId: string; weight: number }[]>(row.weighted_niches, []),
      };
    });
  }

  async get(id: string): Promise<ProfileDetail> {
    const row = await this.deps.repos.profiles.getWithDetails(id);
    if (!row) {
      throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
    }

    const bundle = safeJsonParse<FingerprintBundle>(
      row.fingerprint_bundle,
      {} as FingerprintBundle,
    );

    return {
      id: row.id,
      name: row.name,
      tags: safeJsonParse<string[]>(row.tags, []),
      presetId: row.preset_id,
      state: row.state as ProfileState,
      platform: row.platform,
      engine: (row.engine ?? 'apostate') as 'apostate' | 'camoufox',
      captchaBudgetUsed: row.captcha_budget_used ?? 0,
      proxyId: row.activeProxyId,
      lastLaunchedAt: row.last_launched_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fingerprintSeed: row.fingerprint_seed,
      fingerprintBundle: bundle,
      userDataDir: row.user_data_dir,
      notes: row.notes,
      persona: row.persona ?? 'casual',
      nicheId: row.niche_id ?? null,
      trustScore: row.trust_score ?? 10,
      maturationStage: (row.maturation_stage ?? 'infant') as any,
      typingWpm: row.typing_wpm ?? 70,
      typoRate: row.typo_rate ?? 0.03,
      patienceIndex: row.patience_index ?? 5.5,
      engagementRate: row.engagement_rate ?? 0.20,
      nicheIds: safeJsonParse<string[]>(row.niche_ids, []),
      weightedNiches: safeJsonParse<{ nicheId: string; weight: number }[]>(row.weighted_niches, []),
    };
  }

  async create(
    rawInput: z.input<typeof ProfileCreateInput>,
  ): Promise<ProfileDetail> {
    const input = ProfileCreateInput.parse(rawInput);
    const preset = await this.deps.repos.presets.getById(input.presetId);
    if (!preset) {
      throw new ProfileError('POLICY_VIOLATION', `Preset '${input.presetId}' does not exist`);
    }

    if (input.proxyId) {
      const proxy = await this.deps.repos.proxies.getById(input.proxyId);
      if (!proxy) {
        throw new ProxyError('PROXY_MISSING', `Proxy '${input.proxyId}' does not exist`);
      }
    }

    const engine = (rawInput as { engine?: string })?.engine ?? 'apostate';
    if (engine === 'camoufox' && preset.platform === 'android') {
      throw new TersooError(
        'ENGINE_PLATFORM_MISMATCH',
        'Camoufox does not support Android personas. Use Apostate for Android.',
      );
    }

    const id = crypto.randomUUID();
    const seed = input.fingerprintSeed ?? crypto.randomUUID();

    const overrides: Partial<FingerprintBundle> = {};
    if (input.webglRenderer) {
      const rawGpu = input.webglRenderer.trim();
      const unmasked = rawGpu
        .replace(/ANGLE \([^,]+, ([^,]+).*\)/, '')
        .replace(/^[A-Za-z0-9\s.]+ \/ /, '')
        .trim();
      overrides.webgl = {
        vendor: 'Google Inc.',
        renderer: rawGpu.includes('ANGLE') ? rawGpu : `ANGLE (${rawGpu})`,
        unmaskedVendor: input.webglVendor || (rawGpu.includes('NVIDIA') ? 'NVIDIA Corporation' : rawGpu.includes('Qualcomm') ? 'Qualcomm' : rawGpu.includes('Apple') ? 'Apple' : rawGpu.includes('ARM') ? 'ARM' : rawGpu.includes('Intel') ? 'Intel Inc.' : 'Google Inc.'),
        unmaskedRenderer: unmasked,
      };
    }
    if (input.cpuCores || input.memoryGb) {
      overrides.hardware = {
        cores: input.cpuCores ?? 8,
        memoryGb: input.memoryGb ?? 16,
        maxTouchPoints: preset.platform === 'android' ? 5 : 0,
      };
    }
    if (input.resolution) {
      overrides.screen = {
        width: input.resolution.width,
        height: input.resolution.height,
        availWidth: input.resolution.width,
        availHeight: Math.max(input.resolution.height - 40, 600),
        colorDepth: 24,
        dpr: preset.platform === 'android' ? 2.625 : 1,
      };
    }
    if (input.canvasNoise !== undefined) {
      overrides.canvasNoise = {
        enabled: input.canvasNoise,
        algorithm: 'gaussian',
        intensity: 0.1,
      };
    }
    if (input.audioNoise !== undefined) {
      overrides.audioNoise = {
        enabled: input.audioNoise,
        algorithm: 'gaussian',
        intensity: 0.1,
      };
    }

    const bundle = this.deps.fingerprint
      ? await this.deps.fingerprint.resolve({
          preset_id: input.presetId,
          fingerprint_seed: seed,
          fingerprintBundle: Object.keys(overrides).length > 0 ? overrides : undefined,
        })
      : buildFingerprintBundle(
          preset.platform as 'windows' | 'macos' | 'android',
          seed,
          preset.bundle,
          overrides,
        );
    const userDataDir = paths(this.deps.config).profileDir(id);

    fs.mkdirSync(path.join(userDataDir, 'chromium'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'camoufox'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'cache'), { recursive: true });
    fs.mkdirSync(path.join(userDataDir, 'crash'), { recursive: true });

    await this.deps.repos.profiles.create({
      id,
      name: input.name,
      tags: JSON.stringify(input.tags ?? []),
      preset_id: input.presetId,
      fingerprint_seed: seed,
      fingerprint_bundle: JSON.stringify(bundle),
      user_data_dir: userDataDir,
      state: 'idle',
      notes: input.notes ?? null,
      engine: engine as 'apostate' | 'camoufox',
      action_mode: ((rawInput as { actionMode?: string })?.actionMode as 'scripted' | 'llm') ?? 'scripted',
      persona: input.persona ?? 'casual',
      niche_id: input.weightedNiches?.find((w) => w.isPrimary)?.nicheId ?? input.nicheId ?? (input.nicheIds?.[0] ?? null),
      trust_score: input.trustScore ?? 10,
      maturation_stage: input.maturationStage ?? 'infant',
      typing_wpm: input.typingWpm ?? 70,
      typo_rate: input.typoRate ?? 0.03,
      patience_index: input.patienceIndex ?? 5.5,
      engagement_rate: input.engagementRate ?? 0.20,
      niche_ids: JSON.stringify(input.nicheIds ?? (input.nicheId ? [input.nicheId] : [])),
      weighted_niches: JSON.stringify(input.weightedNiches ?? []),
    });

    if (input.proxyId) {
      const lease = await this.deps.repos.leases.acquire(
        id,
        input.proxyId,
        this.deps.config.leaseTtlMs,
      );
      if (!lease) {
        throw new ProxyError(
          'LEASE_CONFLICT',
          `Proxy '${input.proxyId}' is already leased or profile has active lease`,
        );
      }
      await this.deps.events.emit('lease.acquired', lease);
    }

    await this.deps.events.emit('profile.created', { profileId: id, name: input.name });
    return this.get(id);
  }

  async bulkCreate(input: {
    count: number;
    presetId: string;
    engineDistribution:
      | { mode: 'single'; engine: 'apostate' | 'camoufox' }
      | { mode: 'mixed'; weights: { apostate: number; camoufox: number } };
    tags?: string[];
    persona?: string;
    nicheId?: string | null;
    nicheIds?: string[];
    randomizePersona?: boolean;
  }): Promise<ProfileSummary[]> {
    const preset = await this.deps.repos.presets.getById(input.presetId);
    if (!preset) {
      throw new ProfileError('POLICY_VIOLATION', `Preset '${input.presetId}' does not exist`);
    }

    if (preset.platform === 'android') {
      if (input.engineDistribution.mode === 'single' && input.engineDistribution.engine === 'camoufox') {
        throw new TersooError(
          'ENGINE_PLATFORM_MISMATCH',
          'Camoufox does not support Android personas. Use Apostate for Android.',
        );
      }
      if (input.engineDistribution.mode === 'mixed') {
        input.engineDistribution = { mode: 'single', engine: 'apostate' };
      }
    }

    let apostateCount = input.count;
    if (input.engineDistribution.mode === 'single') {
      apostateCount = input.engineDistribution.engine === 'apostate' ? input.count : 0;
    } else {
      const totalWeight = input.engineDistribution.weights.apostate + input.engineDistribution.weights.camoufox;
      apostateCount = totalWeight > 0
        ? Math.round((input.count * input.engineDistribution.weights.apostate) / totalWeight)
        : input.count;
    }

    const personas = ['casual', 'gamer', 'researcher', 'skimmer'];
    const shouldRandomize = input.randomizePersona !== false;

    const summaries: ProfileSummary[] = [];
    for (let i = 0; i < input.count; i++) {
      const engine = i < apostateCount ? 'apostate' : 'camoufox';
      const persona = shouldRandomize
        ? personas[i % personas.length]!
        : (input.persona || 'casual');

      // Realistic human typing and behavioral dynamics
      let typingWpm = 70;
      let typoRate = 3.5;
      let patienceIndex = 5.5;
      let engagementRate = 22;

      if (shouldRandomize) {
        if (persona === 'gamer') {
          typingWpm = Math.floor(Math.random() * 25) + 75; // 75 - 100 WPM
          typoRate = Number((Math.random() * 2.2 + 1.2).toFixed(1)); // 1.2% - 3.4%
          patienceIndex = Number((Math.random() * 2.5 + 2.8).toFixed(1)); // 2.8 - 5.3
          engagementRate = Math.floor(Math.random() * 25) + 25; // 25% - 50%
        } else if (persona === 'researcher') {
          typingWpm = Math.floor(Math.random() * 18) + 38; // 38 - 56 WPM
          typoRate = Number((Math.random() * 1.8 + 0.8).toFixed(1)); // 0.8% - 2.6%
          patienceIndex = Number((Math.random() * 2.8 + 6.8).toFixed(1)); // 6.8 - 9.6
          engagementRate = Math.floor(Math.random() * 18) + 12; // 12% - 30%
        } else if (persona === 'skimmer') {
          typingWpm = Math.floor(Math.random() * 24) + 65; // 65 - 89 WPM
          typoRate = Number((Math.random() * 3.0 + 2.5).toFixed(1)); // 2.5% - 5.5%
          patienceIndex = Number((Math.random() * 2.5 + 1.8).toFixed(1)); // 1.8 - 4.3
          engagementRate = Math.floor(Math.random() * 18) + 10; // 10% - 28%
        } else {
          // casual
          typingWpm = Math.floor(Math.random() * 24) + 48; // 48 - 72 WPM
          typoRate = Number((Math.random() * 2.8 + 2.0).toFixed(1)); // 2.0% - 4.8%
          patienceIndex = Number((Math.random() * 3.0 + 4.5).toFixed(1)); // 4.5 - 7.5
          engagementRate = Math.floor(Math.random() * 22) + 16; // 16% - 38%
        }
      }

      // Randomize initial trust score within infant stage
      const trustScore = shouldRandomize ? Math.floor(Math.random() * 14) + 10 : 10;
      const maturationStage = 'infant';

      // Distribute & rotate niches across batch
      let assignedNicheId: string | null = null;
      let assignedNicheIds: string[] = [];
      let assignedWeightedNiches: Array<{ nicheId: string; weight: number; isPrimary: boolean }> = [];

      if (input.nicheIds && input.nicheIds.length > 0) {
        const primary = input.nicheIds[i % input.nicheIds.length]!;
        assignedNicheId = primary;
        assignedNicheIds.push(primary);

        // Optionally assign secondary niche for batch diversification
        const secondary = input.nicheIds[(i + 1) % input.nicheIds.length];
        if (secondary && secondary !== primary && (i % 2 === 1 || input.nicheIds.length > 2)) {
          assignedNicheIds.push(secondary);
          assignedWeightedNiches = [
            { nicheId: primary, weight: Math.floor(Math.random() * 15) + 75, isPrimary: true },
            { nicheId: secondary, weight: Math.floor(Math.random() * 15) + 20, isPrimary: false },
          ];
        } else {
          assignedWeightedNiches = [{ nicheId: primary, weight: 100, isPrimary: true }];
        }
      } else if (input.nicheId) {
        assignedNicheId = input.nicheId;
        assignedNicheIds = [input.nicheId];
        assignedWeightedNiches = [{ nicheId: input.nicheId, weight: 100, isPrimary: true }];
      }

      const created = await this.create({
        name: `${preset.name} #${i + 1}`,
        presetId: input.presetId,
        engine,
        tags: input.tags ?? [],
        persona,
        nicheId: assignedNicheId,
        nicheIds: assignedNicheIds,
        weightedNiches: assignedWeightedNiches,
        trustScore,
        maturationStage,
        typingWpm,
        typoRate,
        patienceIndex,
        engagementRate,
      });
      summaries.push({
        id: created.id,
        name: created.name,
        tags: created.tags,
        presetId: created.presetId,
        state: created.state,
        platform: created.platform,
        engine: created.engine,
        captchaBudgetUsed: created.captchaBudgetUsed,
        proxyId: created.proxyId,
        lastLaunchedAt: created.lastLaunchedAt,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        persona: created.persona ?? 'casual',
        nicheId: created.nicheId ?? null,
        trustScore: created.trustScore,
        maturationStage: created.maturationStage,
        typingWpm: created.typingWpm,
        typoRate: created.typoRate,
        patienceIndex: created.patienceIndex,
        engagementRate: created.engagementRate,
        nicheIds: created.nicheIds,
        weightedNiches: created.weightedNiches,
      });
    }

    return summaries;
  }

  async update(id: string, rawPatch: ProfileUpdateInput): Promise<ProfileDetail> {
    const patch = ProfileUpdateInput.parse(rawPatch);
    const existing = await this.deps.repos.profiles.getById(id);
    if (!existing) {
      throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
    }

    if (existing.state === 'running' && patch.presetId && patch.presetId !== existing.preset_id) {
      throw new ProfileError('POLICY_VIOLATION', 'Cannot change preset while profile is running');
    }

    const dbPatch: ProfilePatch = {};

    if (patch.name !== undefined) {
      dbPatch.name = patch.name;
    }
    if (patch.notes !== undefined) {
      dbPatch.notes = patch.notes;
    }
    if (patch.tags !== undefined) {
      dbPatch.tags = JSON.stringify(patch.tags);
    }
    if (patch.presetId !== undefined) {
      const preset = await this.deps.repos.presets.getById(patch.presetId);
      if (!preset) {
        throw new ProfileError('POLICY_VIOLATION', `Preset '${patch.presetId}' does not exist`);
      }
      dbPatch.preset_id = patch.presetId;
      const newBundle = this.deps.fingerprint
        ? await this.deps.fingerprint.resolve({
            preset_id: patch.presetId,
            fingerprint_seed: existing.fingerprint_seed,
          })
        : buildFingerprintBundle(
            preset.platform as 'windows' | 'macos' | 'android',
            existing.fingerprint_seed,
            preset.bundle,
          );
      dbPatch.fingerprint_bundle = JSON.stringify(newBundle);
    }
    if (patch.persona !== undefined) {
      dbPatch.persona = patch.persona;
    }
    if (patch.nicheId !== undefined) {
      dbPatch.niche_id = patch.nicheId;
    }
    if (patch.trustScore !== undefined) {
      dbPatch.trust_score = patch.trustScore;
      if (!patch.maturationStage) {
        const s = patch.trustScore;
        dbPatch.maturation_stage = s >= 76 ? 'mature' : s >= 51 ? 'maturing' : s >= 26 ? 'seeding' : 'infant';
      }
    }
    if (patch.maturationStage !== undefined) {
      dbPatch.maturation_stage = patch.maturationStage;
    }
    if (patch.typingWpm !== undefined) {
      dbPatch.typing_wpm = patch.typingWpm;
    }
    if (patch.typoRate !== undefined) {
      dbPatch.typo_rate = patch.typoRate;
    }
    if (patch.patienceIndex !== undefined) {
      dbPatch.patience_index = patch.patienceIndex;
    }
    if (patch.engagementRate !== undefined) {
      dbPatch.engagement_rate = patch.engagementRate;
    }
    if (patch.nicheIds !== undefined) {
      dbPatch.niche_ids = JSON.stringify(patch.nicheIds);
      if (patch.nicheIds.length > 0 && !patch.nicheId) {
        dbPatch.niche_id = patch.nicheIds[0] ?? null;
      } else if (patch.nicheIds.length === 0 && patch.nicheId === undefined) {
        dbPatch.niche_id = null;
      }
    }
    if (patch.weightedNiches !== undefined) {
      dbPatch.weighted_niches = JSON.stringify(patch.weightedNiches);
      const primary = patch.weightedNiches.find((w) => w.isPrimary)?.nicheId;
      if (primary) {
        dbPatch.niche_id = primary;
      }
    }

    await this.deps.repos.profiles.update(id, dbPatch);
    return this.get(id);
  }

  async autoMatureProfile(id: string): Promise<ProfileDetail> {
    const profile = await this.deps.repos.profiles.getById(id);
    if (!profile) {
      throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
    }

    // 1. Organic age: +1 point per 2 days active, up to +25 points
    const ageDays = Math.max(0, Math.floor((Date.now() - profile.created_at) / (1000 * 60 * 60 * 24)));
    const ageBonus = Math.min(25, Math.floor(ageDays * 0.5));

    // 2. Completed runs count
    const runs = await this.deps.repos.runs.list({ profileId: id });
    const successRuns = runs.filter((r) => r.state === 'completed').length;
    const runBonus = Math.min(40, successRuns * 3); // +3 per successful run up to 40

    // 3. Captcha budget penalties
    const captchaPenalty = (profile.captcha_budget_used ?? 0) * 3;

    // Organic trust score calculation with base floor 10
    const calculatedScore = Math.min(100, Math.max(5, (profile.trust_score || 10) + ageBonus + runBonus - captchaPenalty));

    let stage: 'infant' | 'seeding' | 'maturing' | 'mature' = 'infant';
    if (calculatedScore >= 76) stage = 'mature';
    else if (calculatedScore >= 51) stage = 'maturing';
    else if (calculatedScore >= 26) stage = 'seeding';
    else stage = 'infant';

    await this.deps.repos.profiles.update(id, {
      trust_score: calculatedScore,
      maturation_stage: stage,
    });

    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.deps.repos.profiles.getById(id);
    if (!existing) {
      throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
    }

    if (existing.state === 'running') {
      throw new ProfileError('ALREADY_RUNNING', `Cannot delete running profile '${id}'`);
    }

    const activeLease = await this.deps.repos.leases.getActiveForProfile(id);
    if (activeLease) {
      await this.deps.repos.leases.release(activeLease.id, 'released');
      await this.deps.events.emit('lease.released', { leaseId: activeLease.id, profileId: id });
    }

    await this.deps.repos.profiles.delete(id);
    await this.deps.events.emit('profile.deleted', { profileId: id });

    const dir = paths(this.deps.config).profileDir(id);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (rmErr) {
        // If files are still locked by Windows file handles, non-fatal warning
        console.warn(`[ProfileService] Warning: Could not completely remove dir ${dir}:`, rmErr);
      }
    }
  }

  async updateState(
    id: string,
    state: ProfileState,
    meta?: { lastLaunchedAt?: number },
  ): Promise<void> {
    const existing = await this.deps.repos.profiles.getById(id);
    if (!existing) {
      throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
    }

    await this.deps.repos.profiles.updateState(id, state, meta);
    await this.deps.events.emit('profile.state_changed', { profileId: id, state });
  }

  async setState(
    id: string,
    state: ProfileState,
    meta?: { lastLaunchedAt?: number },
  ): Promise<void> {
    return this.updateState(id, state, meta);
  }

  async getState(id: string): Promise<ProfileState | undefined> {
    return this.deps.repos.profiles.getState(id);
  }

  async transitionState(
    id: string,
    fromState: ProfileState | ProfileState[],
    toState: ProfileState,
    meta?: { lastLaunchedAt?: number },
  ): Promise<ProfileDetail> {
    await this.deps.repos.profiles.transitionState(id, fromState, toState, meta);
    await this.deps.events.emit('profile.state_changed', { profileId: id, state: toState });
    return this.get(id);
  }

  async acquireLock(
    profileId: string,
    options?: AcquireLockOptions,
  ): Promise<LockHandle> {
    return this.deps.repos.profiles.acquireLock(profileId, options);
  }

  async isLocked(profileId: string): Promise<boolean> {
    return this.deps.repos.profiles.isLocked(profileId);
  }

  async forceUnlock(profileId: string): Promise<void> {
    return this.deps.repos.profiles.forceUnlock(profileId);
  }

  setFleet(fleet: FleetService): void {
    this.deps.fleet = fleet;
  }

  async launch(id: string, options?: LaunchOptions): Promise<LaunchResult> {
    const profile = await this.get(id);
    if (!profile) {
      throw new LaunchError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
    }

    if (profile.state === 'running') {
      throw new LaunchError('ALREADY_RUNNING', `Profile '${id}' is already running`);
    }

    if (this.deps.fleet) {
      const check = await this.deps.fleet.canSpawnAnother();
      if (!check.ok) {
        throw new LaunchError(
          'RESOURCE_LIMIT',
          check.reason ?? 'System resource limits exceeded',
        );
      }
    }

    const lock = await this.acquireLock(id);
    try {
      await this.setState(id, 'running');
      await this.deps.repos.profiles.resetCaptchaCount(id);
      await this.deps.repos.audit.record({
        actor: 'system',
        action: 'profile.launch',
        target: id,
      });

      // Lease & proxy handling
      let forwarderPort = 0;
      let forwarderAuth: { username: string; password: string } | null = null;
      let leaseProxyId: string | null = null;
      let activeLeaseId: string | null = null;

      const activeLease = await this.deps.repos.leases.getActiveForProfile(id);
      if (activeLease) {
        leaseProxyId = activeLease.proxy_id;
        activeLeaseId = activeLease.id;
      } else {
        const targetProxyId = options?.proxyId ?? profile.proxyId;
        if (targetProxyId) {
          const acquired = await this.deps.repos.leases.acquire(
            id,
            targetProxyId,
            this.deps.config.leaseTtlMs,
          );
          if (!acquired) {
            throw new LaunchError(
              'NO_HEALTHY_PROXY',
              `Failed to acquire lease for proxy '${targetProxyId}'`,
            );
          }
          leaseProxyId = acquired.proxyId;
          activeLeaseId = acquired.id;
          await this.deps.events.emit('lease.acquired', acquired);
        }
      }

      if (leaseProxyId) {
        const proxy = await this.deps.repos.proxies.getById(leaseProxyId);
        if (!proxy) {
          throw new LaunchError('PROXY_MISSING', `Proxy '${leaseProxyId}' missing`);
        }

        if (
          this.deps.forwarder &&
          'start' in this.deps.forwarder &&
          typeof (this.deps.forwarder as { start?: unknown }).start === 'function'
        ) {
          const upstreamCreds =
            proxy.password_ref && this.deps.secrets
              ? await this.deps.secrets.getProxyCredentials(proxy.id)
              : null;

          const fwd = await (
            this.deps.forwarder as unknown as {
              start: (opts: unknown) => Promise<{
                id: string;
                port: number;
                credentials: { username: string; password: string };
              }>;
            }
          ).start({
            upstream: {
              protocol: proxy.protocol,
              host: proxy.host,
              port: proxy.port,
              username: proxy.username ?? undefined,
              password: upstreamCreds ?? undefined,
            },
            bind: '127.0.0.1',
          });

          if (
            this.deps.healthProbe &&
            'verify' in this.deps.healthProbe &&
            typeof (this.deps.healthProbe as { verify?: unknown }).verify === 'function'
          ) {
            const health = await (
              this.deps.healthProbe as unknown as {
                verify: (
                  port: number,
                  opts: unknown,
                ) => Promise<{ ok: boolean; error?: string }>;
              }
            ).verify(fwd.port, { timeoutMs: 8000 });

            if (!health.ok) {
              if (
                'stop' in this.deps.forwarder &&
                typeof (this.deps.forwarder as { stop?: unknown }).stop === 'function'
              ) {
                await (
                  this.deps.forwarder as unknown as {
                    stop: (id: string) => Promise<void>;
                  }
                ).stop(fwd.id);
              }
              if (activeLeaseId) {
                await this.deps.repos.leases.release(activeLeaseId, 'expired');
              }
              throw new LaunchError(
                'FORWARDER_UNHEALTHY',
                health.error ?? 'Proxy forwarder unhealthy',
              );
            }
          }

          forwarderPort = fwd.port;
          forwarderAuth = fwd.credentials;
        }
      }

      let proxyGeo: { timezone?: string | null; lat?: number | null; lng?: number | null } | undefined;
      if (activeLeaseId && leaseProxyId) {
        const proxy = await this.deps.repos.proxies.getById(leaseProxyId);
        if (!proxy) {
          throw new LaunchError('PROXY_MISSING', `Proxy '${leaseProxyId}' missing`);
        }
        if (!proxy.geo_tz) {
          throw new LaunchError(
            'FINGERPRINT_INCOHERENT',
            `Proxy '${leaseProxyId}' has no geo_tz resolved. Health check incomplete.`,
          );
        }
        proxyGeo = {
          timezone: proxy.geo_tz,
          lat: proxy.geo_lat,
          lng: proxy.geo_lng,
        };
      }

      const cdpTimeoutMs =
        options?.cdpTimeoutMs ?? this.deps.config.cdpDiscoveryTimeoutMs;

      const profileRow = await this.deps.repos.profiles.getById(id);
      const engineType: EngineType = (profileRow?.engine as EngineType) ?? 'apostate';
      const engine = this.engineFactory.getEngine(engineType);

      const session = await engine.launch({
        profile,
        proxy: leaseProxyId ? ({ id: leaseProxyId } as any) : null,
        seed: hashSeed(profile.fingerprintSeed),
        userDataDir: profile.userDataDir,
        forwarderPort,
        forwarderAuth,
        actionMode: (profileRow?.action_mode as 'scripted' | 'llm') ?? 'scripted',
        headless: options?.headless ?? this.deps.config.headless,
        additionalArgs: options?.additionalArgs,
        screen: profile.fingerprintBundle.screen,
        leaseId: activeLeaseId ?? undefined,
        cdpTimeoutMs,
        hostScreen: options?.hostScreen,
      });

      let instance = session.instance ?? this.deps.supervisor.get(id);
      if (!instance) {
        instance = {
          profileId: id,
          pid: session.pid ?? 0,
          userDataDir: profile.userDataDir,
          forwarderPort,
          cdpPort: session.cdpPort ?? null,
          cdpWsUrl: session.cdpWsUrl ?? null,
          state: 'ready',
          startedAt: Date.now(),
          memoryMb: 0,
          cpuPct: 0,
          crashCount: 0,
          restartBudget: 3,
          lastHeartbeat: Date.now(),
          worker: null,
          process: undefined as any,
          leaseId: activeLeaseId ?? null,
        };
        this.deps.supervisor.register(id, instance);
      }

      // Apply stealth fingerprint emulation via CDP
      if (instance.cdpPort && !options?.skipEmulation) {
        try {
          const targetsRes = await fetch(
            `http://127.0.0.1:${instance.cdpPort}/json/list`,
            { signal: AbortSignal.timeout(1500) },
          ).catch(() => null);

          if (targetsRes && targetsRes.ok) {
            const targets = (await targetsRes.json()) as Array<{
              type?: string;
              webSocketDebuggerUrl?: string;
            }>;
            const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
            if (pageTarget && pageTarget.webSocketDebuggerUrl) {
              const cdpClient = await WebSocketCdpClient.connect(pageTarget.webSocketDebuggerUrl, 2000);
              try {
                await CdpEmulator.emulate(cdpClient, profile.fingerprintBundle, { proxyGeo });
                instance.stealthInjected = true;
                instance.cdpClient = cdpClient;
              } catch (err) {
                cdpClient.close();
                throw err;
              }
            }
          }
        } catch {
          // Gracefully continue if target endpoint is a simulated dummy process
        }
      }

      // Crosshair worker attachment if supported and CDP endpoint exists
      if (
        instance.cdpWsUrl &&
        this.deps.crosshair &&
        'attach' in this.deps.crosshair &&
        typeof (this.deps.crosshair as { attach?: unknown }).attach === 'function'
      ) {
        const worker = await (
          this.deps.crosshair as unknown as {
            attach: (opts: unknown) => Promise<{
              applyEmulation?: (b: unknown, p?: unknown) => Promise<void>;
              addInitScript?: (b: unknown) => Promise<void>;
              assertStealthReady?: () => Promise<void>;
            }>;
          }
        ).attach({
          profileId: id,
          cdpWsUrl: instance.cdpWsUrl,
          bundle: profile.fingerprintBundle,
          proxy: proxyGeo ? { geo_tz: proxyGeo.timezone, geo_lat: proxyGeo.lat, geo_lng: proxyGeo.lng } : null,
        });

        if (worker && typeof worker.assertStealthReady === 'function') {
          await worker.assertStealthReady();
        }
        instance.worker = worker as unknown as CrosshairWorker;
      }

      instance.state = 'ready';
      return { instance, runId: crypto.randomUUID() };
    } catch (err: unknown) {
      await this.setState(id, 'crashed');
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.events.emit('alert.raised', {
        level: 'error',
        title: 'Launch failed',
        message,
      });

      if (err instanceof TersooError) {
        throw err;
      }
      throw new LaunchError('SPAWN_FAILED', `Launch failed: ${message}`);
    } finally {
      await lock.release();
    }
  }

  async stop(id: string): Promise<void> {
    const existing = await this.deps.repos.profiles.getById(id);
    if (!existing) {
      throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
    }

    if (
      this.deps.crosshair &&
      'close' in this.deps.crosshair &&
      typeof (this.deps.crosshair as { close?: (id: string) => Promise<void> }).close === 'function'
    ) {
      await (this.deps.crosshair as { close: (id: string) => Promise<void> }).close(id).catch(() => {});
    }

    const engineType: EngineType = (existing.engine as EngineType) ?? 'apostate';
    if (this.engineFactory.hasEngine(engineType)) {
      await this.engineFactory.getEngine(engineType).stop(id);
    } else {
      await this.deps.supervisor.stop(id);
    }

    const activeLease = await this.deps.repos.leases.getActiveForProfile(id);
    if (activeLease) {
      await this.deps.repos.leases.release(activeLease.id, 'released');
      await this.deps.events.emit('lease.released', {
        leaseId: activeLease.id,
        profileId: id,
      });
    }

    await this.setState(id, 'idle');
    await this.deps.repos.audit.record({
      actor: 'system',
      action: 'profile.stop',
      target: id,
    });
  }

  async exportProfile(id: string): Promise<ProfileExportBundle> {
    const profile = await this.get(id);
    return {
      version: 1,
      exportedAt: Date.now(),
      profile: {
        name: profile.name,
        tags: profile.tags,
        presetId: profile.presetId,
        engine: profile.engine,
        notes: profile.notes,
        fingerprintSeed: profile.fingerprintSeed,
        fingerprintBundle: profile.fingerprintBundle,
      },
    };
  }

  async importProfile(input: ProfileImportInput): Promise<ProfileDetail> {
    const { bundle, nameOverride } = input;
    const name = nameOverride ?? `${bundle.profile.name} (Imported)`;
    const id = crypto.randomUUID();
    const userDataDir = paths(this.deps.config).profileDir(id);

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const row = await this.deps.repos.profiles.create({
      id,
      name,
      tags: JSON.stringify(bundle.profile.tags),
      preset_id: bundle.profile.presetId,
      fingerprint_seed: bundle.profile.fingerprintSeed,
      fingerprint_bundle: JSON.stringify(bundle.profile.fingerprintBundle),
      user_data_dir: userDataDir,
      state: 'idle',
      notes: bundle.profile.notes ?? null,
      engine: bundle.profile.engine,
      action_mode: bundle.profile.action_mode ?? null,
      captcha_budget_used: 0,
    });

    await this.deps.events.emit('profile.state_changed', {
      profileId: id,
      state: 'idle',
    });

    return this.get(row.id);
  }
}

