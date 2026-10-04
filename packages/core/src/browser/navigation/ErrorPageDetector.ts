import type { Page } from 'playwright-core';
import { NavigationError } from './NavigationError';

export class ErrorPageDetector {
  static async assertHealthy(page: Page, timeoutMs = 1000): Promise<void> {
    const currentUrl = (typeof page.url === 'function' ? page.url() : '').toLowerCase();

    // Detect Google sorry / CAPTCHA interstitial
    if (currentUrl.includes('google.com/sorry') || currentUrl.includes('sorry/index')) {
      throw new NavigationError(
        'CAPTCHA',
        'Bot detection challenge detected (google.com/sorry)',
        { currentUrl },
      );
    }

    let title = '';
    try {
      if (typeof page.title === 'function') {
        title = (await page.title()).toLowerCase();
      }
    } catch {}

    let bodyText = '';
    try {
      if (typeof page.locator === 'function') {
        bodyText = (await page.locator('body').innerText({ timeout: Math.min(timeoutMs, 1000) }).catch(() => '')).toLowerCase();
      }
    } catch {}

    if (
      title.includes('404') ||
      bodyText.includes('page not found') ||
      bodyText.includes('404 not found')
    ) {
      throw new NavigationError('NOT_FOUND', `Target page was not found (404) at ${currentUrl}`, { currentUrl });
    }

    if (
      title.includes('403') ||
      title.includes('access denied') ||
      bodyText.includes('403 forbidden') ||
      bodyText.includes('access denied')
    ) {
      throw new NavigationError('ACCESS_DENIED', `Access denied (403) at ${currentUrl}`, { currentUrl });
    }

    if (
      bodyText.includes('our systems have detected unusual traffic') ||
      bodyText.includes('unusual traffic from your computer network')
    ) {
      throw new NavigationError('CAPTCHA', `Bot detection challenge active at ${currentUrl}`, { currentUrl });
    }

    if (
      title.includes('500 internal server error') ||
      title.includes('502 bad gateway') ||
      title.includes('503 service unavailable') ||
      title.includes('504 gateway timeout') ||
      bodyText.includes('502 bad gateway') ||
      bodyText.includes('503 service unavailable')
    ) {
      throw new NavigationError('SERVER_ERROR', `Upstream server error detected at ${currentUrl}`, { currentUrl });
    }
  }
}
