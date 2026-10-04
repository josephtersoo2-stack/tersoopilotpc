import type { NavigationFailureCode } from './NavigationError';

export type ReadinessAssertion =
  | {
      kind: 'role';
      role: string;
      name?: string | RegExp | undefined;
      exact?: boolean | undefined;
      state?: 'attached' | 'visible' | 'hidden' | undefined;
      timeoutMs?: number | undefined;
      label?: string | undefined;
    }
  | {
      kind: 'testId';
      value: string;
      state?: 'attached' | 'visible' | 'hidden' | undefined;
      timeoutMs?: number | undefined;
      label?: string | undefined;
    }
  | {
      kind: 'text';
      value: string;
      exact?: boolean | undefined;
      state?: 'attached' | 'visible' | 'hidden' | undefined;
      timeoutMs?: number | undefined;
      label?: string | undefined;
    }
  | {
      kind: 'css';
      selector: string;
      allowFallback?: boolean | undefined;
      state?: 'attached' | 'visible' | 'hidden' | undefined;
      timeoutMs?: number | undefined;
      label?: string | undefined;
    };

export interface NavigationOptions {
  timeoutMs?: number | undefined;
  waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle' | undefined;
  expectedUrl?: string | RegExp | undefined;
  expectedPathname?: string | RegExp | undefined;
  allowedHosts?: string[] | undefined;
  assertions?: ReadinessAssertion[] | undefined;
  requiredSelectors?: string[] | undefined;
  requiredText?: string[] | undefined;
  requiredRoles?: Array<{
    role: string;
    name?: string | RegExp | undefined;
    exact?: boolean | undefined;
  }> | undefined;
  requiredTestIds?: string[] | undefined;
  maxRetries?: number | undefined;
  retryDelayMs?: number | undefined;
  allowRedirects?: boolean | undefined;
  maxRedirectChanges?: number | undefined;
  detectAuthentication?: boolean | undefined;
  detectErrors?: boolean | undefined;
  captureArtifactsOnFailure?: boolean | undefined;
  useAIRecovery?: boolean | undefined;
  allowHistoryNavigation?: boolean | undefined;
  goal?: string | undefined;
  isMobile?: boolean | undefined;
}

export interface NavigationSuccess {
  success: true;
  requestedUrl: string;
  url: string;
  attempts: number;
  durationMs: number;
  redirected: boolean;
  redirectCount: number;
  redirectChain: string[];
  httpStatus?: number | undefined;
  title?: string | undefined;
  recoverable?: boolean | undefined;
}

export interface NavigationFailure {
  success: false;
  requestedUrl: string;
  url: string;
  attempts: number;
  durationMs: number;
  failureCode: NavigationFailureCode;
  message: string;
  recoverable: boolean;
  redirectCount: number;
  redirectChain: string[];
  httpStatus?: number | undefined;
  retryAfterMs?: number | undefined;
  artifactPaths?: string[] | undefined;
  title?: string | undefined;
}

export type NavigationResult = NavigationSuccess | NavigationFailure;
