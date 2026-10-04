import { z } from 'zod';

import { FingerprintBundle } from './fingerprint';
import { Id, ProfileState, Tags, Timestamp } from './primitives';

export const DEFAULT_PRESET_IDS = {
  windows11: '00000000-0000-4000-8000-000000000001',
  macosSonoma: '00000000-0000-4000-8000-000000000002',
  android14: '00000000-0000-4000-8000-000000000003',
  windows10: '00000000-0000-4000-8000-000000000004',
  macosSequoia: '00000000-0000-4000-8000-000000000005',
  galaxyS24: '00000000-0000-4000-8000-000000000006',
} as const;

export const ProfileSummary = z.object({
  id: Id,
  name: z.string(),
  tags: Tags,
  presetId: Id,
  state: ProfileState,
  platform: z.string(),
  engine: z.enum(['apostate', 'camoufox']).default('apostate'),
  captchaBudgetUsed: z.number().int().default(0),
  proxyId: Id.nullable(),
  lastLaunchedAt: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  webglRenderer: z.string().optional(),
  cores: z.number().int().optional(),
  memoryGb: z.number().optional(),
  screenResolution: z.string().optional(),
  deviceModel: z.string().optional(),
  persona: z.string().optional(),
  nicheId: z.string().nullable().optional(),
  trustScore: z.number().int().min(0).max(100).optional(),
  maturationStage: z.enum(['infant', 'seeding', 'maturing', 'mature']).optional(),
  typingWpm: z.number().int().min(20).max(150).optional(),
  typoRate: z.number().min(0).max(100).optional(),
  patienceIndex: z.number().min(1).max(10).optional(),
  engagementRate: z.number().min(0).max(100).optional(),
  nicheIds: z.array(z.string()).optional(),
  weightedNiches: z.array(z.object({ nicheId: z.string(), weight: z.number().default(50), isPrimary: z.boolean().optional() })).optional(),
});

export const ProfileDetail = ProfileSummary.extend({
  fingerprintSeed: z.string(),
  fingerprintBundle: FingerprintBundle,
  userDataDir: z.string(),
  notes: z.string().nullable(),
});

export const ProfileCreateInput = z.object({
  name: z.string().min(1).max(120),
  presetId: Id,
  engine: z.enum(['apostate', 'camoufox']).optional(),
  persona: z.string().optional(),
  nicheId: z.string().nullable().optional(),
  trustScore: z.number().int().min(0).max(100).optional(),
  maturationStage: z.enum(['infant', 'seeding', 'maturing', 'mature']).optional(),
  typingWpm: z.number().int().min(20).max(150).optional(),
  typoRate: z.number().min(0).max(100).optional(),
  patienceIndex: z.number().min(1).max(10).optional(),
  engagementRate: z.number().min(0).max(100).optional(),
  nicheIds: z.array(z.string()).optional(),
  weightedNiches: z.array(z.object({ nicheId: z.string(), weight: z.number().default(50), isPrimary: z.boolean().optional() })).optional(),
  tags: Tags.default([]),
  notes: z.string().max(2000).optional(),
  proxyId: Id.nullable().optional(),
  fingerprintSeed: z.string().min(8).optional(),
  webglRenderer: z.string().optional(),
  webglVendor: z.string().optional(),
  cpuCores: z.number().int().min(1).max(64).optional(),
  memoryGb: z.number().min(1).max(256).optional(),
  resolution: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  canvasNoise: z.boolean().optional(),
  audioNoise: z.boolean().optional(),
  startUrl: z.string().optional(),
});

export const ProfileUpdateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  tags: Tags.optional(),
  notes: z.string().max(2000).nullable().optional(),
  presetId: Id.optional(),
  persona: z.string().optional(),
  nicheId: z.string().nullable().optional(),
  trustScore: z.number().int().min(0).max(100).optional(),
  maturationStage: z.enum(['infant', 'seeding', 'maturing', 'mature']).optional(),
  typingWpm: z.number().int().min(20).max(150).optional(),
  typoRate: z.number().min(0).max(100).optional(),
  patienceIndex: z.number().min(1).max(10).optional(),
  engagementRate: z.number().min(0).max(100).optional(),
  nicheIds: z.array(z.string()).optional(),
  weightedNiches: z.array(z.object({ nicheId: z.string(), weight: z.number().default(50), isPrimary: z.boolean().optional() })).optional(),
});

export const ProfileExportBundle = z.object({
  version: z.literal(1),
  exportedAt: z.number(),
  profile: z.object({
    name: z.string(),
    tags: Tags,
    presetId: Id,
    engine: z.enum(['apostate', 'camoufox']).default('apostate'),
    notes: z.string().nullable().optional(),
    fingerprintSeed: z.string(),
    fingerprintBundle: FingerprintBundle,
    action_mode: z.enum(['scripted', 'llm']).nullable().optional(),
    storageState: z.record(z.unknown()).optional(),
  }),
});
export type ProfileExportBundle = z.infer<typeof ProfileExportBundle>;

export const ProfileImportInput = z.object({
  bundle: ProfileExportBundle,
  nameOverride: z.string().min(1).max(120).optional(),
});
export type ProfileImportInput = z.infer<typeof ProfileImportInput>;

export type ProfileSummary = z.infer<typeof ProfileSummary>;
export type ProfileDetail = z.infer<typeof ProfileDetail>;
export type ProfileCreateInput = z.infer<typeof ProfileCreateInput>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInput>;
