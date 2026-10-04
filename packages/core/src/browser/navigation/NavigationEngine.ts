import type { Page } from 'playwright-core';
import type { LlmService } from '../../llm/LlmService';
import { AIRecovery } from '../ai/AIRecovery';
import { AuthDetector } from './AuthDetector';
import { ErrorPageDetector } from './ErrorPageDetector';
import {
  classifyHttpStatus,
  classifyNavigationError,
  parseRetryAfter,
} from './NavigationClassifier';
import { NavigationError, type NavigationFailureCode } from './NavigationError';
import { NavigationPolicy } from './NavigationPolicy';
import { NavigationRecovery } from './NavigationRecovery';
import type {
  NavigationFailure,
  NavigationOptions,
  NavigationResult,
  NavigationSuccess,
} from './NavigationResult';
import { PageReadiness } from './PageReadiness';
import { RedirectValidator } from './RedirectValidator';
import { RetryPolicy } from './RetryPolicy';

export class NavigationEngine {
  constructor(
    private readonly page: Page,
    private readonly llm?: LlmService,
    private readonly artifactsDir?: string,
  ) {}

  private isPageClosed(): boolean {
    return typeof this.page.isClosed === 'function' ? this.page.isClosed() : false;
  }

  private getPageUrl(): string {
    return typeof this.page.url === 'function' ? this.page.url() : '';
  }

  async navigate(
    rawUrl: string,
    options: NavigationOptions = {},
  ): Promise<NavigationResult> {
    const config: NavigationOptions = {
      timeoutMs: 30_000,
      maxRetries: 2,
      retryDelayMs: 500,
      allowRedirects: true,
      maxRedirectChanges: 5,
      detectAuthentication: true,
      detectErrors: true,
      captureArtifactsOnFailure: true,
      useAIRecovery: true,
      allowHistoryNavigation: false,
      ...options,
    };

    const startedAt = Date.now();
    let requested: URL;

    try {
      requested = NavigationPolicy.validateNavigationUrl(rawUrl, config.allowedHosts);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid navigation URL';
      const failureCode: NavigationFailureCode =
        error instanceof NavigationError ? error.code : 'INVALID_URL';
      return {
        success: false,
        requestedUrl: rawUrl,
        url: this.getPageUrl(),
        attempts: 0,
        durationMs: Date.now() - startedAt,
        failureCode,
        message: msg,
        recoverable: false,
        redirectCount: 0,
        redirectChain: [],
      };
    }

    const deadline = startedAt + (config.timeoutMs ?? 30_000);
    let lastFailure: NavigationFailure | null = null;
    const maxRetries = config.maxRetries ?? 2;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const remaining = Math.max(0, deadline - Date.now());

      if (remaining <= 0) {
        lastFailure = {
          success: false,
          requestedUrl: requested.toString(),
          url: this.getPageUrl(),
          attempts: attempt - 1,
          durationMs: Date.now() - startedAt,
          failureCode: 'TIMEOUT',
          message: 'Navigation total deadline exceeded',
          recoverable: false,
          redirectCount: 0,
          redirectChain: [requested.toString()],
        };
        break;
      }

      try {
        const attemptResult = await this.navigateOnce(requested, config, deadline, attempt, startedAt);

        if (!attemptResult.success) {
          lastFailure = {
            ...attemptResult,
            attempts: attempt,
          };

          // AI Recovery check
          if (
            config.useAIRecovery &&
            this.llm &&
            !this.isPageClosed() &&
            (lastFailure.failureCode === 'REQUIRED_ELEMENT_MISSING' ||
              lastFailure.failureCode === 'PAGE_UNREADY' ||
              lastFailure.failureCode === 'REDIRECT_UNEXPECTED' ||
              lastFailure.failureCode === 'AI_DECISION_REQUIRED')
          ) {
            const recovered = await AIRecovery.attemptRecovery(
              this.page,
              config.goal || `Navigate to ${requested.toString()}`,
              this.llm,
              config.allowedHosts,
            ).catch(() => false);

            if (recovered) {
              const finalUrl = this.getPageUrl() || requested.toString();
              return {
                success: true,
                requestedUrl: requested.toString(),
                url: finalUrl,
                attempts: attempt,
                durationMs: Date.now() - startedAt,
                redirected: requested.toString() !== finalUrl,
                redirectCount: lastFailure.redirectCount,
                redirectChain: lastFailure.redirectChain,
                title: typeof this.page.title === 'function' ? await this.page.title().catch(() => '') : '',
                recoverable: true,
              };
            }
          }

          if (!RetryPolicy.shouldRetry(attemptResult.failureCode, attempt, config)) {
            break;
          }

          const remainingAfterFailure = deadline - Date.now();
          if (remainingAfterFailure <= 0 || attempt >= maxRetries + 1) {
            break;
          }

          const policyDelay = RetryPolicy.calculateDelay(attempt, config.retryDelayMs);
          const retryAfterDelay = lastFailure.retryAfterMs ?? 0;
          const retryDelay = Math.min(
            Math.max(policyDelay, retryAfterDelay),
            remainingAfterFailure,
          );

          await new Promise((res) => setTimeout(res, retryDelay));
          continue;
        }

        return attemptResult;
      } catch (error) {
        const failureCode = classifyNavigationError(error);
        const msg = error instanceof Error ? error.message : 'Navigation failed';

        lastFailure = {
          success: false,
          requestedUrl: requested.toString(),
          url: this.getPageUrl(),
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          failureCode,
          message: msg,
          recoverable: RetryPolicy.shouldRetry(failureCode, attempt, config),
          redirectCount: 0,
          redirectChain: [requested.toString()],
        };

        // AI Recovery on caught exception
        if (
          config.useAIRecovery &&
          this.llm &&
          !this.isPageClosed() &&
          (failureCode === 'REQUIRED_ELEMENT_MISSING' ||
            failureCode === 'PAGE_UNREADY' ||
            failureCode === 'REDIRECT_UNEXPECTED')
        ) {
          const recovered = await AIRecovery.attemptRecovery(
            this.page,
            config.goal || `Navigate to ${requested.toString()}`,
            this.llm,
            config.allowedHosts,
          ).catch(() => false);

          if (recovered) {
            const finalUrl = this.getPageUrl() || requested.toString();
            return {
              success: true,
              requestedUrl: requested.toString(),
              url: finalUrl,
              attempts: attempt,
              durationMs: Date.now() - startedAt,
              redirected: requested.toString() !== finalUrl,
              redirectCount: 0,
              redirectChain: [requested.toString()],
              title: typeof this.page.title === 'function' ? await this.page.title().catch(() => '') : '',
              recoverable: true,
            };
          }
        }

        if (!RetryPolicy.shouldRetry(failureCode, attempt, config)) {
          break;
        }

        const remainingAfterFailure = deadline - Date.now();
        if (remainingAfterFailure <= 0 || attempt >= maxRetries + 1) {
          break;
        }

        const policyDelay = RetryPolicy.calculateDelay(attempt, config.retryDelayMs);
        const retryDelay = Math.min(policyDelay, remainingAfterFailure);
        await new Promise((res) => setTimeout(res, retryDelay));
      }
    }

    const finalFailure: NavigationFailure = lastFailure ?? {
      success: false,
      requestedUrl: requested.toString(),
      url: this.getPageUrl(),
      attempts: maxRetries + 1,
      durationMs: Date.now() - startedAt,
      failureCode: 'RETRY_EXHAUSTED',
      message: 'Navigation retries exhausted',
      recoverable: false,
      redirectCount: 0,
      redirectChain: [requested.toString()],
    };

    if (config.captureArtifactsOnFailure && !this.isPageClosed()) {
      try {
        finalFailure.artifactPaths = await NavigationRecovery.captureNavigationArtifacts(
          this.page,
          this.artifactsDir,
        );
      } catch {}
    }

    return finalFailure;
  }

  private async navigateOnce(
    requested: URL,
    options: NavigationOptions,
    deadline: number,
    attempt: number,
    startedAt: number,
  ): Promise<NavigationSuccess | NavigationFailure> {
    const timeout = Math.max(100, deadline - Date.now());

    let response: any = null;
    try {
      response = await this.page.goto(requested.toString(), {
        waitUntil: options.waitUntil ?? 'domcontentloaded',
        timeout,
      });
    } catch (gotoError) {
      const code = classifyNavigationError(gotoError);
      return {
        success: false,
        requestedUrl: requested.toString(),
        url: this.getPageUrl(),
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        failureCode: code,
        message: gotoError instanceof Error ? gotoError.message : String(gotoError),
        recoverable: RetryPolicy.shouldRetry(code, attempt, options),
        redirectCount: 0,
        redirectChain: [requested.toString()],
      };
    }

    let redirectChain: string[] = [requested.toString()];
    let redirectCount = 0;
    let httpStatus: number | undefined;
    let retryAfterMs: number | undefined;

    if (response) {
      if (typeof response.status === 'function') {
        httpStatus = response.status();
      }
      retryAfterMs = parseRetryAfter(response);

      if (typeof response.request === 'function') {
        try {
          const chain: string[] = [response.request().url()];
          let current = response.request();
          while (typeof current.redirectedFrom === 'function') {
            const previous = current.redirectedFrom();
            if (!previous) break;
            chain.unshift(previous.url());
            current = previous;
          }
          redirectChain = chain;
          redirectCount = Math.max(0, chain.length - 1);
        } catch {}
      }
    }

    // Validate redirect chain
    try {
      RedirectValidator.validateRedirectChain(requested.toString(), redirectChain, options);
    } catch (redirectError) {
      if (redirectError instanceof NavigationError) {
        return {
          success: false,
          requestedUrl: requested.toString(),
          url: this.getPageUrl(),
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          failureCode: redirectError.code,
          message: redirectError.message,
          recoverable: false,
          redirectCount,
          redirectChain,
          httpStatus,
        };
      }
    }

    // Classify HTTP response status
    if (httpStatus !== undefined && httpStatus >= 400) {
      const httpFailure = classifyHttpStatus(httpStatus);
      return {
        success: false,
        requestedUrl: requested.toString(),
        url: this.getPageUrl(),
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        failureCode: httpFailure,
        message: `Navigation received HTTP ${httpStatus}`,
        recoverable: httpFailure === 'RATE_LIMITED' || httpFailure === 'SERVER_ERROR',
        redirectCount,
        redirectChain,
        httpStatus,
        retryAfterMs,
      };
    }

    // Expected URL assertion
    if (options.expectedUrl && typeof this.page.waitForURL === 'function') {
      try {
        await this.page.waitForURL(options.expectedUrl, {
          timeout: Math.max(100, Math.min(15_000, deadline - Date.now())),
        });
      } catch (err) {
        return {
          success: false,
          requestedUrl: requested.toString(),
          url: this.getPageUrl(),
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          failureCode: 'PAGE_UNREADY',
          message: `Expected URL condition '${options.expectedUrl}' was not reached: ${err instanceof Error ? err.message : String(err)}`,
          recoverable: false,
          redirectCount,
          redirectChain,
          httpStatus,
        };
      }
    }

    // Expected pathname assertion
    if (options.expectedPathname) {
      const currentUrl = this.getPageUrl();
      let pathname = '';
      try {
        pathname = new URL(currentUrl).pathname;
      } catch {
        pathname = currentUrl;
      }
      const matches =
        options.expectedPathname instanceof RegExp
          ? ((options.expectedPathname.lastIndex = 0), options.expectedPathname.test(pathname))
          : pathname === options.expectedPathname || pathname.startsWith(options.expectedPathname);

      if (!matches) {
        return {
          success: false,
          requestedUrl: requested.toString(),
          url: currentUrl,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          failureCode: 'PAGE_UNREADY',
          message: `Expected pathname '${options.expectedPathname}' did not match '${pathname}'`,
          recoverable: false,
          redirectCount,
          redirectChain,
          httpStatus,
        };
      }
    }

    // Check authentication barriers
    if (options.detectAuthentication) {
      try {
        await AuthDetector.assertNotBlocked(this.page);
      } catch (authError) {
        if (authError instanceof NavigationError) {
          return {
            success: false,
            requestedUrl: requested.toString(),
            url: this.getPageUrl(),
            attempts: attempt,
            durationMs: Date.now() - startedAt,
            failureCode: 'AUTH_REQUIRED',
            message: authError.message,
            recoverable: false,
            redirectCount,
            redirectChain,
            httpStatus,
          };
        }
      }
    }

    // Check error pages
    if (options.detectErrors) {
      try {
        await ErrorPageDetector.assertHealthy(this.page, Math.max(100, deadline - Date.now()));
      } catch (pageError) {
        if (pageError instanceof NavigationError) {
          return {
            success: false,
            requestedUrl: requested.toString(),
            url: this.getPageUrl(),
            attempts: attempt,
            durationMs: Date.now() - startedAt,
            failureCode: pageError.code,
            message: pageError.message,
            recoverable: false,
            redirectCount,
            redirectChain,
            httpStatus,
          };
        }
      }
    }

    // Readiness
    try {
      await PageReadiness.waitUntilReady(this.page, options, deadline);
    } catch (readinessError) {
      if (readinessError instanceof NavigationError) {
        return {
          success: false,
          requestedUrl: requested.toString(),
          url: this.getPageUrl(),
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          failureCode: readinessError.code,
          message: readinessError.message,
          recoverable: true,
          redirectCount,
          redirectChain,
          httpStatus,
        };
      }
    }

    const finalUrl = this.getPageUrl() || requested.toString();
    return {
      success: true,
      requestedUrl: requested.toString(),
      url: finalUrl,
      attempts: attempt,
      durationMs: Date.now() - startedAt,
      redirected: redirectCount > 0 || (finalUrl !== requested.toString()),
      redirectCount,
      redirectChain,
      httpStatus,
      title: typeof this.page.title === 'function' ? await this.page.title().catch(() => '') : '',
    };
  }
}
