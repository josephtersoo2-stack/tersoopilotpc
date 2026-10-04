import { AINavigator } from './ai/AINavigator';
import { NavigationEngine } from './navigation/NavigationEngine';
import type { NavigationOptions, NavigationResult } from './navigation/NavigationResult';

export class NavigationOrchestrator {
  constructor(
    private readonly navigationEngine: NavigationEngine,
    private readonly aiNavigator?: AINavigator | undefined,
  ) {}

  async navigateWithHybridStrategy(
    goal: string,
    url: string,
    options: NavigationOptions = {},
  ): Promise<NavigationResult> {
    let expectedPathname: string | RegExp | undefined = options.expectedPathname;
    if (!expectedPathname && !options.expectedUrl) {
      try {
        expectedPathname = new URL(url).pathname;
      } catch {}
    }

    const deterministic = await this.navigationEngine.navigate(url, {
      ...options,
      expectedPathname,
      goal,
    });

    if (deterministic.success) {
      return deterministic;
    }

    // Do NOT invoke AI for definitive security / policy barriers
    if (
      deterministic.failureCode === 'ACCESS_DENIED' ||
      deterministic.failureCode === 'AUTH_REQUIRED' ||
      deterministic.failureCode === 'CAPTCHA' ||
      deterministic.failureCode === 'INVALID_URL'
    ) {
      return deterministic;
    }

    // Escalate to AI for element ambiguity, unexpected redirects, or unready state
    if (
      this.aiNavigator &&
      (deterministic.failureCode === 'REQUIRED_ELEMENT_MISSING' ||
        deterministic.failureCode === 'PAGE_UNREADY' ||
        deterministic.failureCode === 'REDIRECT_UNEXPECTED' ||
        deterministic.failureCode === 'AI_DECISION_REQUIRED')
    ) {
      try {
        const aiResult = await this.aiNavigator.run(goal);
        if (aiResult.status === 'SUCCESS') {
          return {
            success: true,
            requestedUrl: deterministic.requestedUrl,
            url: deterministic.url,
            attempts: deterministic.attempts + aiResult.stepsExecuted,
            durationMs: deterministic.durationMs,
            redirected: deterministic.redirectCount > 0,
            redirectCount: deterministic.redirectCount,
            redirectChain: deterministic.redirectChain,
            title: deterministic.title,
            recoverable: true,
          };
        } else if (aiResult.status === 'HUMAN_REQUIRED') {
          return {
            ...deterministic,
            failureCode: 'HUMAN_REQUIRED',
            message: aiResult.reason || 'Human assistance required to proceed with navigation',
            recoverable: false,
          };
        }
      } catch (aiErr) {
        // Fall back to returning deterministic failure if AI run fails
      }
    }

    return deterministic;
  }
}
