import { NavigationError } from './NavigationError';
import type { NavigationOptions } from './NavigationResult';

export class RedirectValidator {
  static validateRedirectChain(
    requestedUrl: string,
    redirectChain: string[],
    options: NavigationOptions,
  ): void {
    const redirectCount = Math.max(0, redirectChain.length - 1);

    if (options.allowRedirects === false && redirectCount > 0) {
      throw new NavigationError(
        'REDIRECT_UNEXPECTED',
        'Navigation was redirected but redirects are disabled by policy',
        { requestedUrl, currentUrl: redirectChain[redirectChain.length - 1], redirectCount, redirectChain },
      );
    }

    const maxRedirects = options.maxRedirectChanges ?? 5;
    if (redirectCount > maxRedirects) {
      throw new NavigationError(
        'REDIRECT_LIMIT_EXCEEDED',
        `Redirect limit exceeded: ${redirectCount} (maximum allowed: ${maxRedirects})`,
        { requestedUrl, currentUrl: redirectChain[redirectChain.length - 1], redirectCount, redirectChain },
      );
    }

    if (options.allowedHosts && options.allowedHosts.length > 0) {
      const allUrls = [requestedUrl, ...redirectChain];
      for (const rawUrl of allUrls) {
        try {
          const parsed = new URL(rawUrl);
          if (parsed.protocol === 'about:' || !parsed.hostname) continue;

          const host = parsed.hostname.toLowerCase();
          const isAllowed = options.allowedHosts.some((h) => {
            const lowerH = h.toLowerCase();
            return host === lowerH || host.endsWith(`.${lowerH}`);
          });

          if (!isAllowed) {
            throw new NavigationError(
              'REDIRECT_UNEXPECTED',
              `Navigation reached disallowed host: ${parsed.hostname} in redirect chain`,
              { requestedUrl, currentUrl: rawUrl, redirectCount, redirectChain },
            );
          }
        } catch (err) {
          if (err instanceof NavigationError) throw err;
        }
      }
    }
  }

  static validate(
    requestedUrl: string,
    currentUrl: string,
    options: NavigationOptions,
  ): void {
    RedirectValidator.validateRedirectChain(requestedUrl, [currentUrl], options);
  }
}
