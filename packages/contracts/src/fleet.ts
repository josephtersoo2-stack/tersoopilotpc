import { z } from 'zod';

export const FleetStatus = z.object({
  running: z.number().default(0),
  idle: z.number().default(0),
  instances: z.number().default(0),
  activeInstances: z.number().default(0),
  runningProfiles: z.array(z.string()).default([]),
  leasesActive: z.number().default(0),
  forwardersBound: z.number().default(0),
  runningRuns: z.number().default(0),
  proxiesTotal: z.number().default(0),
  proxiesHealthy: z.number().default(0),
  memUsedGb: z.number().default(0),
  memTotalGb: z.number().default(0),
  memUsedPct: z.number().default(0),
  cpuUsagePct: z.number().default(0),
  dbSizeFormatted: z.string().default('0.0 MB'),
  queueStatus: z.string().default('Idle'),
});

export type FleetStatus = z.infer<typeof FleetStatus>;
