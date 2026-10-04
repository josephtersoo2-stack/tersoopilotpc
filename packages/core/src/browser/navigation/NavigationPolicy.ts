import { NavigationError } from './NavigationError';

const BLOCKED_PROTOCOLS = new Set(['javascript:', 'file:', 'data:']);
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'about:', 'chrome:']);

export class NavigationPolicy {
  private readonly allowedHostsList?: string[] | undefined;
  private readonly historyAllowed: boolean;

  constructor(options?: { allowedHosts?: string[] | undefined; allowHistoryNavigation?: boolean | undefined }) {
    this.allowedHostsList = options?.allowedHosts;
    this.historyAllowed = options?.allowHistoryNavigation ?? false;
  }

  static validateNavigationUrl(rawUrl: string, allowedHosts?: string[]): URL {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      throw new NavigationError('INVALID_URL', 'URL cannot be empty');
    }

    let urlString = trimmed;
    // Normalize bare domains like "google.com" or "www.youtube.com" to "https://"
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlString)) {
      urlString = `https://${urlString}`;
    }

    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      throw new NavigationError('INVALID_URL', `Invalid URL format: ${rawUrl}`);
    }

    const protocol = parsed.protocol.toLowerCase();
    if (BLOCKED_PROTOCOLS.has(protocol)) {
      throw new NavigationError(
        'INVALID_URL',
        `Unsupported or blocked navigation protocol: ${parsed.protocol}`,
      );
    }

    if (!ALLOWED_PROTOCOLS.has(protocol)) {
      throw new NavigationError(
        'INVALID_URL',
        `Disallowed navigation protocol: ${parsed.protocol}`,
      );
    }

    // Security: Reject credentials embedded in URLs (e.g. https://user:pass@host)
    if (parsed.username || parsed.password) {
      throw new NavigationError(
        'INVALID_URL',
        'Embedded credentials in URLs are blocked for security',
      );
    }

    // Security: Block cloud metadata endpoints
    if (parsed.hostname === '169.254.169.254') {
      throw new NavigationError(
        'ACCESS_DENIED',
        'Access to cloud metadata IP is strictly blocked',
      );
    }

    if (allowedHosts && allowedHosts.length > 0 && parsed.hostname) {
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = allowedHosts.some((h) => {
        const lowerH = h.toLowerCase();
        return hostname === lowerH || hostname.endsWith(`.${lowerH}`);
      });
      if (!isAllowed) {
        throw new NavigationError(
          'ACCESS_DENIED',
          `Navigation blocked for host: ${parsed.hostname}. Allowed hosts: ${allowedHosts.join(', ')}`,
        );
      }
    }

    return parsed;
  }

  assertUrlAllowed(rawUrl: string): URL {
    return NavigationPolicy.validateNavigationUrl(rawUrl, this.allowedHostsList);
  }

  allowHistoryNavigation(): boolean {
    return this.historyAllowed;
  }

  validateUrlPattern(pattern: string): void {
    if (!pattern || !pattern.trim()) {
      throw new NavigationError('INVALID_URL', 'URL pattern cannot be empty');
    }
  }

  static assertUrlAllowed(url: string, allowedHosts?: string[]): URL {
    return NavigationPolicy.validateNavigationUrl(url, allowedHosts);
  }
}

export const validateNavigationUrl = NavigationPolicy.validateNavigationUrl;
