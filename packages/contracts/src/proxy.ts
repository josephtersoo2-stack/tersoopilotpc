import { z } from 'zod';

import { Id, ProxyProtocol, ProxyStatus, Timestamp } from './primitives';

export const ProxySummary = z.object({
  id: Id,
  protocol: ProxyProtocol,
  host: z.string(),
  port: z.number().int(),
  username: z.string().nullable(),
  geoCountry: z.string().nullable(),
  geoCity: z.string().nullable(),
  geoTz: z.string().nullable(),
  geoIsp: z.string().nullable(),
  exitIp: z.string().nullable(),
  status: ProxyStatus,
  statusReason: z.string().nullable(),
  lastCheckedAt: Timestamp.nullable(),
  lastLatencyMs: z.number().int().nullable(),
  createdAt: Timestamp,
});

export const ProxyCreateInput = z.object({
  protocol: ProxyProtocol,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const ProxyBulkImportInput = z
  .object({
    text: z.string().optional(),
    filePath: z.string().optional(),
    format: z.enum(['auto', 'ip:port:user:pass', 'url', 'ip:port']).default('auto'),
  })
  .refine((d) => d.text || d.filePath, 'text or filePath required');

export const ImportReport = z.object({
  parsed: z.number().int(),
  imported: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ line: z.number().int(), reason: z.string() })),
});

export const HealthResult = z.object({
  proxyId: Id,
  ok: z.boolean(),
  latencyMs: z.number().int().nullable(),
  exitIp: z.string().nullable(),
  geo: z.object({
    country: z.string().nullable(),
    city: z.string().nullable(),
    tz: z.string().nullable(),
    isp: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
  }),
  webrtcSafe: z.boolean(),
  dnsSafe: z.boolean(),
  error: z.string().nullable(),
});

export const LeaseSummary = z.object({
  id: Id,
  proxyId: Id,
  profileId: Id,
  state: z.enum(['active', 'released', 'expired']),
  acquiredAt: Timestamp,
  expiresAt: Timestamp,
  heartbeatAt: Timestamp,
});

export type ProxySummary = z.infer<typeof ProxySummary>;
export type ProxyCreateInput = z.infer<typeof ProxyCreateInput>;
export type ProxyBulkImportInput = z.infer<typeof ProxyBulkImportInput>;
export type ImportReport = z.infer<typeof ImportReport>;
export type HealthResult = z.infer<typeof HealthResult>;
export type LeaseSummary = z.infer<typeof LeaseSummary>;
