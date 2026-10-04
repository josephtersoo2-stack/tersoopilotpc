import path from 'node:path';

import { z } from 'zod';

export const ResourceLimits = z.object({
  totalFleetRamMb: z.number().int().default(12288),
  perInstanceRamMb: z.number().int().default(600),
  memoryPressureThresholdPct: z.number().min(0).max(1).default(0.95),
});

export type ResourceLimits = z.infer<typeof ResourceLimits>;

export const Config = z.object({
  userDataDir: z.string(),
  chromeBinary: z.string(),
  headless: z.boolean().default(true),
  strictCoherence: z.boolean().default(true),
  leaseTtlMs: z
    .number()
    .int()
    .default(6 * 60 * 60 * 1000),
  leaseHeartbeatMs: z
    .number()
    .int()
    .default(60 * 1000),
  leaseSweepMs: z
    .number()
    .int()
    .default(5 * 60 * 1000),
  forwarderHealthTimeoutMs: z.number().int().default(8000),
  cdpDiscoveryTimeoutMs: z.number().int().default(15_000),
  stealthMinScore: z.number().min(0).max(1).default(0.9),
  defaultConcurrency: z.number().int().min(1).max(64).default(5),
  resourceLimits: ResourceLimits.default({}),
});

export type Config = z.infer<typeof Config>;

export function loadConfig(
  userDataDir: string,
  chromeBinary: string,
  overrides: Partial<Config> = {},
): Config {
  return Config.parse({
    userDataDir: path.resolve(userDataDir),
    chromeBinary,
    ...overrides,
  });
}

export const paths = (cfg: Config) => ({
  db: path.join(cfg.userDataDir, 'tersoopilot.db'),
  logs: path.join(cfg.userDataDir, 'logs'),
  profiles: path.join(cfg.userDataDir, 'profiles'),
  profileDir: (id: string) => path.join(cfg.userDataDir, 'profiles', id),
  profileChrome: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'chromium'),
  profileCache: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'cache'),
  profileCrash: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'crash'),
  profileLock: (id: string) => path.join(cfg.userDataDir, 'profiles', id, 'profile.lock'),
  artifacts: (id: string, runId: string) =>
    path.join(cfg.userDataDir, 'profiles', id, 'artifacts', runId),
});
