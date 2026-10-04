import { z } from 'zod';

export const Id = z.string().uuid();
export const Timestamp = z.number().int().nonnegative();
export const Tags = z.array(z.string().min(1).max(64)).max(32);

export const Platform = z.enum(['windows', 'macos', 'android']);
export const ProxyProtocol = z.enum(['socks5', 'http', 'https']);
export const ProxyStatus = z.enum(['unknown', 'healthy', 'slow', 'auth_error', 'dead']);
export const ProfileState = z.enum(['idle', 'running', 'paused', 'crashed', 'archived']);
export const RunState = z.enum([
  'queued',
  'starting',
  'running',
  'paused',
  'succeeded',
  'failed',
  'cancelled',
]);
export const StepState = z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']);
export const LogLevel = z.enum(['debug', 'info', 'warn', 'error', 'fatal']);
export const LogScope = z.enum(['supervisor', 'proxy', 'task', 'ui', 'security', 'db']);

export type Id = z.infer<typeof Id>;
export type Timestamp = z.infer<typeof Timestamp>;
export type Tags = z.infer<typeof Tags>;
export type Platform = z.infer<typeof Platform>;
export type ProxyProtocol = z.infer<typeof ProxyProtocol>;
export type ProxyStatus = z.infer<typeof ProxyStatus>;
export type ProfileState = z.infer<typeof ProfileState>;
export type RunState = z.infer<typeof RunState>;
export type StepState = z.infer<typeof StepState>;
export type LogLevel = z.infer<typeof LogLevel>;
export type LogScope = z.infer<typeof LogScope>;
