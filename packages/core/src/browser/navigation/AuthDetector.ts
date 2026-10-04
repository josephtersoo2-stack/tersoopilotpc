import type { Page } from 'playwright-core';
import { NavigationError } from './NavigationError';

export interface AuthDetectionOptions {
  loginPathPatterns?: RegExp[];
  loginMarkerSelectors?: string[];
  loginMarkerTexts?: string[];
}

export class AuthDetector {
  static async isAuthenticationPage(
    page: Page,
    options: AuthDetectionOptions = {},
  ): Promise<boolean> {
    try {
      const rawUrl = typeof page.url === 'function' ? page.url() : '';
      let pathname = '';
      try {
        pathname = rawUrl ? new URL(rawUrl).pathname : '';
      } catch {
        pathname = rawUrl;
      }

      const patterns = options.loginPathPatterns ?? [
        /(^|\/)(login|signin|sign-in|checkpoint)(\/|$)/i,
      ];

      if (patterns.some((pattern) => pattern.test(pathname))) {
        return true;
      }

      if (typeof page.locator === 'function') {
        for (const selector of options.loginMarkerSelectors ?? []) {
          const visible = await page
            .locator(selector)
            .first()
            .isVisible()
            .catch(() => false);

          if (visible) {
            return true;
          }
        }
      }

      if (typeof page.getByText === 'function') {
        for (const text of options.loginMarkerTexts ?? []) {
          const visible = await page
            .getByText(text, { exact: true })
            .first()
            .isVisible()
            .catch(() => false);

          if (visible) {
            return true;
          }
        }
      }
    } catch {
      // Ignore inspection errors
    }
    return false;
  }

  static async assertNotBlocked(
    page: Page,
    options?: AuthDetectionOptions,
  ): Promise<void> {
    const isAuth = await AuthDetector.isAuthenticationPage(page, options);
    if (isAuth) {
      const currentUrl = typeof page.url === 'function' ? page.url() : '';
      throw new NavigationError(
        'AUTH_REQUIRED',
        `Authentication is required at ${currentUrl}`,
        { currentUrl },
      );
    }
  }
}
