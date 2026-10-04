import type { FailurePolicy } from '@tersoo/contracts';

export interface PolicyAction {
  action: 'retry' | 'skip' | 'abort' | 'pause';
  retryDelayMs?: number;
  reason: string;
}

/**
 * Evaluates the appropriate recovery action for a failed step based on the workflow failure policy.
 * Handles LLM failures (LLM_UNSOLVABLE, LLM_MAX_ITERATIONS, LLM_API_ERROR) cleanly.
 */
export function evaluateStepFailure(
  policy: FailurePolicy,
  error: unknown,
  attempt: number = 1,
  maxAttempts: number = 3,
): PolicyAction {
  const message = error instanceof Error ? error.message : String(error);

  // If LLM reports an unsolvable step or exceeded max iterations, abort unless skip is chosen
  if (message.startsWith('LLM_UNSOLVABLE:') || message.includes('LLM_MAX_ITERATIONS')) {
    if (policy === 'skip') {
      return { action: 'skip', reason: `Skipping unsolvable step: ${message}` };
    }
    return { action: 'abort', reason: `LLM could not solve step: ${message}` };
  }

  switch (policy) {
    case 'retry':
      if (attempt < maxAttempts) {
        return {
          action: 'retry',
          retryDelayMs: Math.min(1000 * Math.pow(2, attempt - 1), 10000),
          reason: `Retrying after attempt ${attempt}/${maxAttempts}: ${message}`,
        };
      }
      return { action: 'abort', reason: `Exhausted retries (${maxAttempts}): ${message}` };

    case 'skip':
      return { action: 'skip', reason: `Step skipped by policy: ${message}` };

    case 'pause_alert':
      return { action: 'pause', reason: `Workflow paused for alert: ${message}` };

    case 'screenshot_abort':
    default:
      return { action: 'abort', reason: `Aborting with screenshot: ${message}` };
  }
}
