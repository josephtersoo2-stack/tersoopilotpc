export type ErrorCode =
  | 'PROFILE_NOT_FOUND'
  | 'ALREADY_RUNNING'
  | 'NO_HEALTHY_PROXY'
  | 'PROXY_MISSING'
  | 'LEASE_CONFLICT'
  | 'FINGERPRINT_INCOHERENT'
  | 'STEALTH_FAILED'
  | 'FORWARDER_UNHEALTHY'
  | 'SPAWN_FAILED'
  | 'CDP_TIMEOUT'
  | 'CDP_ATTACH_FAILED'
  | 'DB_BUSY'
  | 'MIGRATION_FAILED'
  | 'STEP_TIMEOUT'
  | 'STEP_SELECTOR_MISSING'
  | 'NAVIGATION_FAILED'
  | 'POLICY_VIOLATION'
  | 'ENGINE_PLATFORM_MISMATCH'
  | 'LLM_API_ERROR'
  | 'LLM_EXHAUSTED'
  | 'VISION_DISABLED'
  | 'VISION_MODEL_MISSING'
  | 'LLM_CONFIG_MISSING'
  | 'LLM_KEY_MISSING'
  | 'LLM_BAD_RESPONSE'
  | 'CAPTCHA_BUDGET_EXCEEDED'
  | 'CAPTCHA_FAILED'
  | 'RESOURCE_LIMIT'
  | 'TASK_CANCELLED'
  | 'BACKUP_FAILED'
  | 'BACKUP_NOT_FOUND'
  | 'BACKUP_CORRUPT'
  | 'STT_NO_API_KEY'
  | 'STT_API_ERROR'
  | 'TTS_NO_API_KEY'
  | 'TTS_API_ERROR'
  | 'INTERNAL';

export class TersooError extends Error {
  override readonly name: string = 'TersooError';
  readonly code: ErrorCode;
  readonly meta: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, meta: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class LaunchError extends TersooError {
  override readonly name = 'LaunchError';
}

export class ProxyError extends TersooError {
  override readonly name = 'ProxyError';
}

export class ProfileError extends TersooError {
  override readonly name = 'ProfileError';
}

export class TaskError extends TersooError {
  override readonly name = 'TaskError';
}

export class DbError extends TersooError {
  override readonly name = 'DbError';
}

export class StealthError extends TersooError {
  override readonly name = 'StealthError';
}

export class IpcError extends TersooError {
  override readonly name = 'IpcError';
}

export class CrosshairError extends TersooError {
  override readonly name = 'CrosshairError';
}

export class BackupError extends TersooError {
  override readonly name = 'BackupError';
}
