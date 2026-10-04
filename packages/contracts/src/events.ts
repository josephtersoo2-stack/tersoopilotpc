import { z } from 'zod';

import {
  Id,
  LogLevel,
  LogScope,
  ProfileState,
  ProxyStatus,
  RunState,
  Timestamp,
} from './primitives';
import { LeaseSummary } from './proxy';
import { StepRun } from './task';

export const Events = {
  'profile.created': z.object({ profileId: Id, name: z.string().optional() }),
  'profile.deleted': z.object({ profileId: Id }),
  'profile.state_changed': z.object({ profileId: Id, state: ProfileState }),
  'proxy.health_changed': z.object({ proxyId: Id, status: ProxyStatus }),
  'lease.acquired': LeaseSummary,
  'lease.released': z.object({ leaseId: Id, profileId: Id }),
  'run.state_changed': z.object({ runId: Id, state: RunState }),
  'step.state_changed': StepRun,
  'log.appended': z.object({
    ts: Timestamp,
    level: LogLevel,
    scope: LogScope,
    event: z.string(),
    data: z.unknown(),
  }),
  'alert.raised': z.object({
    level: z.enum(['info', 'warn', 'error']),
    title: z.string(),
    message: z.string(),
  }),
  'crosshair.attached': z.object({ profileId: Id }),
  'crosshair.detached': z.object({ profileId: Id }),
  'backup.created': z.object({ backupId: z.string(), filename: z.string(), sizeBytes: z.number() }),
  'backup.restored': z.object({ backupId: z.string(), restoredAt: Timestamp }),
  'voice.transcribed': z.object({
    model: z.string(),
    durationMs: z.number(),
    cost: z.number(),
    textLength: z.number(),
  }),
  'voice.spoken': z.object({
    model: z.string(),
    voice: z.string(),
    durationMs: z.number(),
    textLength: z.number(),
    audioBytes: z.number().optional(),
    cost: z.number().optional(),
  }),
  'voice.wake_word_detected': z.object({
    timestamp: z.number(),
  }),
  'voice.greeting': z.object({
    audio: z.string(),
    format: z.enum(['mp3', 'wav', 'opus']),
    durationMs: z.number(),
  }),
  'voice.start_recording': z.object({
    maxDurationMs: z.number(),
    silenceStopMs: z.number(),
  }),
  'voice.transcript_ready': z.object({
    text: z.string(),
  }),
} as const;

export type EventName = keyof typeof Events;
export type EventPayload<E extends EventName> = z.infer<(typeof Events)[E]>;
