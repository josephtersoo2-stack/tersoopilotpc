import { NavigationError, type NavigationFailureCode } from './NavigationError';

export function classifyNavigationError(error: unknown): NavigationFailureCode {
  if (error instanceof NavigationError) {
    return error.code;
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'TIMEOUT';
  }

  if (
    message.includes('net::err_') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('dns_probe') ||
    message.includes('ssl_protocol_error') ||
    message.includes('network error')
  ) {
    return 'NETWORK_ERROR';
  }

  if (
    message.includes('target closed') ||
    message.includes('browser has been closed') ||
    message.includes('context or browser has been closed') ||
    message.includes('crashed') ||
    message.includes('session closed') ||
    message.includes('page is closed')
  ) {
    return 'PAGE_CRASHED';
  }

  if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
    return 'RATE_LIMITED';
  }

  if (message.includes('404') || message.includes('not found')) {
    return 'NOT_FOUND';
  }

  if (message.includes('403') || message.includes('forbidden') || message.includes('access denied')) {
    return 'ACCESS_DENIED';
  }

  if (
    message.includes('captcha') ||
    message.includes('challenge') ||
    message.includes('unusual traffic') ||
    message.includes('sorry/index') ||
    message.includes('google.com/sorry')
  ) {
    return 'CAPTCHA';
  }

  if (
    message.includes('login') ||
    message.includes('auth required') ||
    message.includes('unauthorized') ||
    message.includes('401')
  ) {
    return 'AUTH_REQUIRED';
  }

  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('server error') ||
    message.includes('bad gateway')
  ) {
    return 'SERVER_ERROR';
  }

  if (message.includes('redirect')) {
    return 'REDIRECT_UNEXPECTED';
  }

  return 'UNKNOWN';
}

export function classifyHttpStatus(status: number): NavigationFailureCode {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'ACCESS_DENIED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500 && status <= 599) return 'SERVER_ERROR';
  return 'HTTP_ERROR';
}

export function parseRetryAfter(response?: { headers?: () => Record<string, string> } | null): number | undefined {
  if (!response || typeof response.headers !== 'function') return undefined;
  try {
    const headers = response.headers();
    const raw = headers['retry-after'] || headers['Retry-After'];
    if (!raw) return undefined;
    const seconds = Number(raw);
    if (!Number.isNaN(seconds)) return seconds * 1000;
    const date = Date.parse(raw);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  } catch {}
  return undefined;
}

export function createNavigationError(
  lastError: unknown,
  requestedUrl: string,
  currentUrl: string,
  durationMs: number,
): NavigationError {
  if (lastError instanceof NavigationError) {
    return lastError;
  }

  const code = classifyNavigationError(lastError);
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  return new NavigationError(code, `Navigation to '${requestedUrl}' failed [${code}]: ${msg}`, {
    requestedUrl,
    currentUrl,
    durationMs,
    recoverable: code === 'TIMEOUT' || code === 'NETWORK_ERROR' || code === 'PAGE_CRASHED' || code === 'RATE_LIMITED',
    details: lastError,
  });
}
