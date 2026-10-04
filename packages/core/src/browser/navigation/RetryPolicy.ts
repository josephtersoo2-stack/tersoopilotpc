import type { NavigationFailureCode } from './NavigationError';
import type { NavigationOptions } from './NavigationResult';

export class RetryPolicy {
  static shouldRetry(
    failure: NavigationFailureCode,
    attempt: number,
    options: NavigationOptions,
  ): boolean {
    const maxRetries = options.maxRetries ?? 2;
    if (attempt > maxRetries) {
      return false;
    }

    // Only retry transient failures
    return ['TIMEOUT', 'NETWORK_ERROR', 'PAGE_CRASHED', 'RATE_LIMITED', 'UNKNOWN'].includes(failure);
  }

  static calculateDelay(attempt: number, baseDelayMs = 500): number {
    const jitter = Math.floor(Math.random() * 250);
    return baseDelayMs * Math.pow(2, attempt - 1) + jitter;
  }

  static async delay(attempt: number, baseDelayMs = 500): Promise<void> {
    const delayMs = RetryPolicy.calculateDelay(attempt, baseDelayMs);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
