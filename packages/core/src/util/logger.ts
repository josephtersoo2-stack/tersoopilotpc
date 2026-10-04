import pino from 'pino';

export type LoggerScope = 'supervisor' | 'proxy' | 'task' | 'ui' | 'security' | 'db';

export interface IEventAppender {
  append(
    level: string,
    scope: LoggerScope,
    event: string,
    data?: unknown,
    ctx?: Record<string, unknown>,
  ): void | Promise<void>;
}

/**
 * Key names whose values are never written to a log or an event row.
 *
 * Matching is on a normalised key (lowercased, non-alphanumerics removed) and
 * by suffix, so `apiKey`, `api_key`, `apiKeyRef` and `data.apiKeyRef` are all
 * caught rather than only the exact spellings listed before.
 */
const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'passwd',
  'apikey',
  'token',
  'secret',
  'authorization',
  'authheader',
  'credential',
  'privatekey',
  'sessioncookie',
  'proxyauthorization',
  'apikeyfref',
  'keyref',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_SUBSTRINGS.some((needle) => normalized.includes(needle));
}

function redactObject<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactObject(item)) as unknown as T;
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      copy[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      copy[k] = redactObject(v);
    } else {
      copy[k] = v;
    }
  }
  return copy as T;
}

export function createLogger(opts: { level: string; eventRepo?: IEventAppender }) {
  const base = pino({
    level: opts.level,
    base: null,
    timestamp: pino.stdTimeFunctions.epochTime,
    redact: {
      paths: [
        'password',
        'apiKey',
        'api_key',
        'apiKeyRef',
        'api_key_ref',
        'token',
        'secret',
        'authorization',
        'credentials',
        'proxyUrl',
        '*.password',
        '*.apiKey',
        '*.api_key',
        '*.apiKeyRef',
        '*.api_key_ref',
        '*.token',
        '*.secret',
        '*.authorization',
        '*.credentials',
        '*.proxyUrl',
        'data.password',
        'data.apiKey',
        'data.api_key',
        'data.apiKeyRef',
        'data.api_key_ref',
        'data.token',
        'data.secret',
        'data.authorization',
        'data.credentials',
        'data.proxyUrl',
      ],
      censor: '[REDACTED]',
    },
  });

  return {
    child(scope: LoggerScope, ctx: Record<string, unknown> = {}) {
      const child = base.child({ scope, ...ctx });
      return {
        debug: (event: string, data?: unknown) => {
          child.debug({ event, data });
        },
        info: (event: string, data?: unknown) => {
          child.info({ event, data });
          void opts.eventRepo?.append('info', scope, event, redactObject(data), redactObject(ctx));
        },
        warn: (event: string, data?: unknown) => {
          child.warn({ event, data });
          void opts.eventRepo?.append('warn', scope, event, redactObject(data), redactObject(ctx));
        },
        error: (event: string, data?: unknown) => {
          child.error({ event, data });
          void opts.eventRepo?.append('error', scope, event, redactObject(data), redactObject(ctx));
        },
      };
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
