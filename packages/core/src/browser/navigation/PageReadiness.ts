import type { Page } from 'playwright-core';
import { ConsentEngine } from '../../crosshair/ConsentEngine';
import { NavigationError } from './NavigationError';
import type { NavigationOptions, ReadinessAssertion } from './NavigationResult';

export class PageReadiness {
  static async waitUntilReady(
    page: Page,
    options: NavigationOptions,
    deadline?: number,
  ): Promise<void> {
    const calcTimeout = (): number => {
      if (deadline !== undefined) {
        return Math.max(100, Math.min(options.timeoutMs ?? 15000, deadline - Date.now()));
      }
      return Math.min(options.timeoutMs ?? 15000, 15000);
    };

    // Auto-dismiss CMPs/cookie consent banners (Google, YouTube, OneTrust, etc.)
    await ConsentEngine.checkAndHandle(page, {
      isMobile: options.isMobile,
      timeoutMs: Math.min(600, calcTimeout()),
    }).catch(() => false);

    // 1. High-assurance typed assertions
    if (options.assertions && options.assertions.length > 0) {
      for (const assertion of options.assertions) {
        await PageReadiness.executeAssertion(page, assertion, calcTimeout());
      }
    }

    // 2. Semantic Roles
    if (options.requiredRoles && options.requiredRoles.length > 0 && typeof (page as any).getByRole === 'function') {
      for (const roleDef of options.requiredRoles) {
        if (roleDef.name instanceof RegExp) roleDef.name.lastIndex = 0;
        try {
          await (page as any)
            .getByRole(roleDef.role, {
              name: roleDef.name,
              exact: roleDef.exact ?? true,
            })
            .first()
            .waitFor({
              state: 'visible',
              timeout: calcTimeout(),
            });
        } catch (err) {
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          throw new NavigationError(
            'REQUIRED_ELEMENT_MISSING',
            `Required role '${roleDef.role}' was not found: ${err instanceof Error ? err.message : String(err)}`,
            { currentUrl, details: err },
          );
        }
      }
    }

    // 3. Test IDs
    if (options.requiredTestIds && options.requiredTestIds.length > 0 && typeof (page as any).getByTestId === 'function') {
      for (const testId of options.requiredTestIds) {
        try {
          await (page as any)
            .getByTestId(testId)
            .first()
            .waitFor({
              state: 'visible',
              timeout: calcTimeout(),
            });
        } catch (err) {
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          throw new NavigationError(
            'REQUIRED_ELEMENT_MISSING',
            `Required testId '${testId}' was not found: ${err instanceof Error ? err.message : String(err)}`,
            { currentUrl, details: err },
          );
        }
      }
    }

    // 4. Required selectors (CSS fallback)
    if (options.requiredSelectors && options.requiredSelectors.length > 0 && typeof page.locator === 'function') {
      for (const selector of options.requiredSelectors) {
        try {
          await page
            .locator(selector)
            .first()
            .waitFor({
              state: 'visible',
              timeout: calcTimeout(),
            });
        } catch (err) {
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          throw new NavigationError(
            'REQUIRED_ELEMENT_MISSING',
            `Required selector '${selector}' was not visible after navigation: ${err instanceof Error ? err.message : String(err)}`,
            { currentUrl, details: err },
          );
        }
      }
    }

    // 5. Required text
    if (options.requiredText && options.requiredText.length > 0 && typeof page.getByText === 'function') {
      for (const text of options.requiredText) {
        try {
          await page
            .getByText(text, { exact: true })
            .first()
            .waitFor({
              state: 'visible',
              timeout: calcTimeout(),
            });
        } catch (err) {
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          throw new NavigationError(
            'REQUIRED_ELEMENT_MISSING',
            `Required text '${text}' was not found after navigation: ${err instanceof Error ? err.message : String(err)}`,
            { currentUrl, details: err },
          );
        }
      }
    }
  }

  private static async executeAssertion(
    page: Page,
    assertion: ReadinessAssertion,
    defaultTimeout: number,
  ): Promise<void> {
    const timeout = assertion.timeoutMs ?? defaultTimeout;
    const state = assertion.state ?? 'visible';

    try {
      switch (assertion.kind) {
        case 'role': {
          if (assertion.name instanceof RegExp) assertion.name.lastIndex = 0;
          if (typeof (page as any).getByRole !== 'function') return;
          await (page as any)
            .getByRole(assertion.role, {
              name: assertion.name,
              exact: assertion.exact ?? true,
            })
            .first()
            .waitFor({ state, timeout });
          break;
        }
        case 'testId': {
          if (typeof (page as any).getByTestId !== 'function') return;
          await (page as any).getByTestId(assertion.value).first().waitFor({ state, timeout });
          break;
        }
        case 'text': {
          if (typeof page.getByText !== 'function') return;
          await page.getByText(assertion.value, { exact: true }).first().waitFor({ state, timeout });
          break;
        }
        case 'css': {
          if (typeof page.locator !== 'function') return;
          await page.locator(assertion.selector).first().waitFor({ state, timeout });
          break;
        }
      }
    } catch (err) {
      const currentUrl = typeof page.url === 'function' ? page.url() : '';
      const label = assertion.label ?? assertion.kind;
      throw new NavigationError(
        'REQUIRED_ELEMENT_MISSING',
        `Readiness assertion failed [${label}]: ${err instanceof Error ? err.message : String(err)}`,
        { currentUrl, details: err },
      );
    }
  }
}
