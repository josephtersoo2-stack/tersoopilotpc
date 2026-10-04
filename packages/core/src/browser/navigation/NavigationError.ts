export type NavigationFailureCode =
  | 'INVALID_URL'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'RATE_LIMITED'
  | 'REDIRECT_UNEXPECTED'
  | 'REDIRECT_LIMIT_EXCEEDED'
  | 'AUTH_REQUIRED'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'CAPTCHA'
  | 'PAGE_CRASHED'
  | 'PAGE_UNREADY'
  | 'REQUIRED_ELEMENT_MISSING'
  | 'AI_DECISION_REQUIRED'
  | 'HUMAN_REQUIRED'
  | 'RETRY_EXHAUSTED'
  | 'UNKNOWN';

export interface NavigationErrorOptions {
  requestedUrl?: string | undefined;
  currentUrl?: string | undefined;
  durationMs?: number | undefined;
  recoverable?: boolean | undefined;
  httpStatus?: number | undefined;
  retryAfterMs?: number | undefined;
  redirectCount?: number | undefined;
  redirectChain?: string[] | undefined;
  details?: unknown | undefined;
}

export class NavigationError extends Error {
  public readonly code: NavigationFailureCode;
  public readonly requestedUrl?: string | undefined;
  public readonly currentUrl?: string | undefined;
  public readonly durationMs?: number | undefined;
  public readonly recoverable: boolean;
  public readonly httpStatus?: number | undefined;
  public readonly retryAfterMs?: number | undefined;
  public readonly redirectCount?: number | undefined;
  public readonly redirectChain?: string[] | undefined;
  public readonly details?: unknown | undefined;

  constructor(
    code: NavigationFailureCode,
    message: string,
    options?: NavigationErrorOptions,
  ) {
    super(message);
    this.name = 'NavigationError';
    this.code = code;
    this.requestedUrl = options?.requestedUrl;
    this.currentUrl = options?.currentUrl;
    this.durationMs = options?.durationMs;
    this.recoverable = options?.recoverable ?? false;
    this.httpStatus = options?.httpStatus;
    this.retryAfterMs = options?.retryAfterMs;
    this.redirectCount = options?.redirectCount;
    this.redirectChain = options?.redirectChain;
    this.details = options?.details;
    Object.setPrototypeOf(this, NavigationError.prototype);
  }
}
