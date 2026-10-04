import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright-core';
import {
  AuthDetector,
  classifyHttpStatus,
  classifyNavigationError,
  ErrorPageDetector,
  NavigationEngine,
  NavigationError,
  NavigationPolicy,
  PageReadiness,
  parseRetryAfter,
  RedirectValidator,
  RetryPolicy,
  ActionValidator,
  type AIAction,
  BrowserContextManager,
  NavigationOrchestrator,
  DefaultApprovalPolicy,
} from '../src/browser';

describe('TersooPilot Safe & Accurate Playwright Navigation (Revision 2)', () => {
  describe('NavigationPolicy (URL & Security)', () => {
    it('normalizes bare domains to https://', () => {
      const url = NavigationPolicy.validateNavigationUrl('google.com');
      expect(url.href).toBe('https://google.com/');
    });

    it('accepts valid http and https URLs', () => {
      const u1 = NavigationPolicy.validateNavigationUrl('http://example.com/test');
      const u2 = NavigationPolicy.validateNavigationUrl('https://example.com/test');
      expect(u1.protocol).toBe('http:');
      expect(u2.protocol).toBe('https:');
    });

    it('rejects forbidden protocols (javascript:, file:, data:)', () => {
      expect(() => NavigationPolicy.validateNavigationUrl('javascript:alert(1)')).toThrow(NavigationError);
      expect(() => NavigationPolicy.validateNavigationUrl('file:///etc/passwd')).toThrow(NavigationError);
      expect(() => NavigationPolicy.validateNavigationUrl('data:text/html,<h1>hi</h1>')).toThrow(NavigationError);
    });

    it('blocks embedded credentials in URLs for security', () => {
      expect(() => NavigationPolicy.validateNavigationUrl('https://user:pass@example.com')).toThrow(NavigationError);
    });

    it('blocks cloud metadata endpoint (169.254.169.254)', () => {
      expect(() => NavigationPolicy.validateNavigationUrl('http://169.254.169.254/latest/meta-data/')).toThrow(NavigationError);
    });

    it('enforces allowedHosts whitelist', () => {
      expect(() =>
        NavigationPolicy.validateNavigationUrl('https://malicious.com', ['example.com', 'google.com']),
      ).toThrow(NavigationError);

      const allowed = NavigationPolicy.validateNavigationUrl('https://sub.example.com/page', ['example.com']);
      expect(allowed.hostname).toBe('sub.example.com');
    });

    it('rejects empty or invalid URLs', () => {
      expect(() => NavigationPolicy.validateNavigationUrl('')).toThrow(NavigationError);
    });
  });

  describe('NavigationClassifier & HTTP Status', () => {
    it('classifies timeouts correctly', () => {
      expect(classifyNavigationError(new Error('Navigation timeout of 30000ms exceeded'))).toBe('TIMEOUT');
    });

    it('classifies network connection failures', () => {
      expect(classifyNavigationError(new Error('net::ERR_CONNECTION_REFUSED at https://example.com'))).toBe('NETWORK_ERROR');
      expect(classifyNavigationError(new Error('getaddrinfo ENOTFOUND example.com'))).toBe('NETWORK_ERROR');
    });

    it('classifies browser/page crashes', () => {
      expect(classifyNavigationError(new Error('Target page, context or browser has been closed'))).toBe('PAGE_CRASHED');
    });

    it('classifies HTTP statuses (401, 403, 404, 429, 500)', () => {
      expect(classifyHttpStatus(401)).toBe('AUTH_REQUIRED');
      expect(classifyHttpStatus(403)).toBe('ACCESS_DENIED');
      expect(classifyHttpStatus(404)).toBe('NOT_FOUND');
      expect(classifyHttpStatus(429)).toBe('RATE_LIMITED');
      expect(classifyHttpStatus(502)).toBe('SERVER_ERROR');
      expect(classifyHttpStatus(500)).toBe('SERVER_ERROR');
    });

    it('parses Retry-After headers in seconds and dates', () => {
      const respSeconds = { headers: () => ({ 'retry-after': '30' }) };
      expect(parseRetryAfter(respSeconds)).toBe(30_000);

      const futureDate = new Date(Date.now() + 10_000).toUTCString();
      const respDate = { headers: () => ({ 'Retry-After': futureDate }) };
      const parsedMs = parseRetryAfter(respDate);
      expect(parsedMs).toBeGreaterThan(0);
      expect(parsedMs).toBeLessThanOrEqual(10_500);
    });
  });

  describe('RetryPolicy', () => {
    it('retries only transient errors up to maxRetries', () => {
      expect(RetryPolicy.shouldRetry('TIMEOUT', 1, { maxRetries: 2 })).toBe(true);
      expect(RetryPolicy.shouldRetry('NETWORK_ERROR', 2, { maxRetries: 2 })).toBe(true);
      expect(RetryPolicy.shouldRetry('RATE_LIMITED', 1, { maxRetries: 2 })).toBe(true);
      expect(RetryPolicy.shouldRetry('PAGE_CRASHED', 2, { maxRetries: 2 })).toBe(true);

      // Exceeded maxRetries
      expect(RetryPolicy.shouldRetry('TIMEOUT', 3, { maxRetries: 2 })).toBe(false);

      // Non-transient errors should never be automatically retried
      expect(RetryPolicy.shouldRetry('NOT_FOUND', 1, { maxRetries: 2 })).toBe(false);
      expect(RetryPolicy.shouldRetry('ACCESS_DENIED', 1, { maxRetries: 2 })).toBe(false);
      expect(RetryPolicy.shouldRetry('AUTH_REQUIRED', 1, { maxRetries: 2 })).toBe(false);
      expect(RetryPolicy.shouldRetry('CAPTCHA', 1, { maxRetries: 2 })).toBe(false);
    });

    it('computes exponential backoff with jitter', async () => {
      const delay = RetryPolicy.calculateDelay(1, 100);
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThan(350);
    });
  });

  describe('AuthDetector (Hardened Regex)', () => {
    it('detects authentication URLs based on pathname regex', async () => {
      const mockPageLogin = {
        url: () => 'https://example.com/login',
      } as unknown as Page;
      expect(await AuthDetector.isAuthenticationPage(mockPageLogin)).toBe(true);

      const mockPageSignin = {
        url: () => 'https://example.com/auth/sign-in',
      } as unknown as Page;
      expect(await AuthDetector.isAuthenticationPage(mockPageSignin)).toBe(true);
    });

    it('does NOT false-positive on words containing auth like /authors', async () => {
      const mockPageAuthors = {
        url: () => 'https://example.com/authors/profile-123',
      } as unknown as Page;
      expect(await AuthDetector.isAuthenticationPage(mockPageAuthors)).toBe(false);
    });
  });

  describe('ErrorPageDetector', () => {
    it('detects 404, 403, and server error signatures', async () => {
      const mockPage404 = {
        url: () => 'https://example.com/missing',
        title: async () => '404 Not Found',
        locator: vi.fn().mockReturnValue({
          innerText: async () => 'The requested URL was not found',
        }),
      } as unknown as Page;

      await expect(ErrorPageDetector.assertHealthy(mockPage404)).rejects.toThrow(NavigationError);

      const mockPage403 = {
        url: () => 'https://example.com/admin',
        title: async () => 'Access Denied',
        locator: vi.fn().mockReturnValue({
          innerText: async () => '403 Forbidden',
        }),
      } as unknown as Page;

      await expect(ErrorPageDetector.assertHealthy(mockPage403)).rejects.toThrow(NavigationError);
    });

    it('detects Google sorry challenge page', async () => {
      const mockPageSorry = {
        url: () => 'https://www.google.com/sorry/index?continue=...',
        title: async () => 'Sorry...',
        locator: vi.fn().mockReturnValue({
          innerText: async () => 'Our systems have detected unusual traffic',
        }),
      } as unknown as Page;

      await expect(ErrorPageDetector.assertHealthy(mockPageSorry)).rejects.toThrow(
        expect.objectContaining({ code: 'CAPTCHA' }),
      );
    });
  });

  describe('RedirectValidator (Chain Enforcement)', () => {
    it('blocks redirects when allowRedirects is false and redirect occurred', () => {
      expect(() =>
        RedirectValidator.validateRedirectChain(
          'https://site.com',
          ['https://site.com/step1', 'https://site.com/step2'],
          { allowRedirects: false },
        ),
      ).toThrow(expect.objectContaining({ code: 'REDIRECT_UNEXPECTED' }));
    });

    it('blocks when redirect count exceeds maxRedirectChanges', () => {
      expect(() =>
        RedirectValidator.validateRedirectChain(
          'https://site.com',
          ['https://site.com/1', 'https://site.com/2', 'https://site.com/3'],
          { maxRedirectChanges: 1 },
        ),
      ).toThrow(expect.objectContaining({ code: 'REDIRECT_LIMIT_EXCEEDED' }));
    });

    it('validates every intermediate hop against allowedHosts', () => {
      expect(() =>
        RedirectValidator.validateRedirectChain(
          'https://safe.com',
          ['https://safe.com/start', 'https://tracker.com/click', 'https://safe.com/end'],
          { allowedHosts: ['safe.com'] },
        ),
      ).toThrow(expect.objectContaining({ code: 'REDIRECT_UNEXPECTED' }));
    });
  });

  describe('ActionValidator (AI Navigation & History Guard)', () => {
    const validator = new ActionValidator(['example.com', 'google.com'], false);

    it('validates safe AI navigation actions', async () => {
      const navAction: AIAction = { type: 'navigate', url: 'https://example.com/docs' };
      await expect(validator.validate(navAction)).resolves.toBeUndefined();

      const tabAction: AIAction = { type: 'open_tab', url: 'https://example.com/tab' };
      await expect(validator.validate(tabAction)).resolves.toBeUndefined();

      const clickAction: AIAction = { type: 'click', target: { role: 'button', name: 'Submit' } };
      await expect(validator.validate(clickAction)).resolves.toBeUndefined();

      const fillAction: AIAction = { type: 'fill', target: { name: 'search' }, value: 'query', pressEnter: true };
      await expect(validator.validate(fillAction)).resolves.toBeUndefined();
    });

    it('blocks history navigation when allowHistoryNavigation is false', async () => {
      await expect(validator.validate({ type: 'back' })).rejects.toThrow(
        expect.objectContaining({ code: 'REDIRECT_UNEXPECTED' }),
      );
      await expect(validator.validate({ type: 'forward' })).rejects.toThrow(
        expect.objectContaining({ code: 'REDIRECT_UNEXPECTED' }),
      );
    });

    it('allows history navigation when explicitly enabled', async () => {
      const permissiveValidator = new ActionValidator(['example.com'], true);
      await expect(permissiveValidator.validate({ type: 'back' })).resolves.toBeUndefined();
      await expect(permissiveValidator.validate({ type: 'forward' })).resolves.toBeUndefined();
    });

    it('rejects navigation outside allowed hosts', async () => {
      const maliciousNav: AIAction = { type: 'navigate', url: 'https://attacker.com' };
      await expect(validator.validate(maliciousNav)).rejects.toThrow();
    });
  });

  describe('NavigationEngine Execution (Revision 2 Discriminated Results)', () => {
    it('returns NavigationSuccess for valid navigation with response', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue({
          status: () => 200,
          headers: () => ({}),
          request: () => ({
            url: () => 'https://example.com/welcome',
            redirectedFrom: () => null,
          }),
        }),
        url: () => 'https://example.com/welcome',
        title: async () => 'Welcome Page',
        locator: vi.fn().mockReturnValue({
          count: async () => 0,
          innerText: async () => 'Welcome to the dashboard',
          first: () => ({
            waitFor: vi.fn().mockResolvedValue(null),
            isVisible: vi.fn().mockResolvedValue(false),
          }),
        }),
        isClosed: () => false,
      } as unknown as Page;

      const engine = new NavigationEngine(mockPage);
      const res = await engine.navigate('example.com/welcome', {
        detectAuthentication: true,
        detectErrors: true,
      });

      expect(res.success).toBe(true);
      expect(res.requestedUrl).toBe('https://example.com/welcome');
      expect(res.url).toBe('https://example.com/welcome');
      expect(res.attempts).toBe(1);
      expect(res.httpStatus).toBe(200);
      expect(res.redirectCount).toBe(0);
      expect(res.title).toBe('Welcome Page');
    });

    it('returns NavigationFailure on HTTP 404 response without throwing', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue({
          status: () => 404,
          headers: () => ({}),
          request: () => ({
            url: () => 'https://example.com/missing',
            redirectedFrom: () => null,
          }),
        }),
        url: () => 'https://example.com/missing',
        isClosed: () => false,
      } as unknown as Page;

      const engine = new NavigationEngine(mockPage);
      const res = await engine.navigate('https://example.com/missing', {
        maxRetries: 0,
        captureArtifactsOnFailure: false,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.failureCode).toBe('NOT_FOUND');
        expect(res.httpStatus).toBe(404);
        expect(res.recoverable).toBe(false);
      }
    });

    it('returns NavigationFailure on HTTP 429 response with Retry-After parsed', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue({
          status: () => 429,
          headers: () => ({ 'retry-after': '5' }),
          request: () => ({
            url: () => 'https://example.com/api',
            redirectedFrom: () => null,
          }),
        }),
        url: () => 'https://example.com/api',
        isClosed: () => false,
      } as unknown as Page;

      const engine = new NavigationEngine(mockPage);
      const res = await engine.navigate('https://example.com/api', {
        maxRetries: 0,
        captureArtifactsOnFailure: false,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.failureCode).toBe('RATE_LIMITED');
        expect(res.httpStatus).toBe(429);
        expect(res.retryAfterMs).toBe(5000);
      }
    });

    it('enforces total deadline budget across retries', async () => {
      let attempts = 0;
      const mockPage = {
        goto: vi.fn().mockImplementation(async () => {
          attempts++;
          await new Promise((r) => setTimeout(r, 60));
          throw new Error('Navigation timeout of 30000ms exceeded');
        }),
        url: () => 'about:blank',
        isClosed: () => false,
      } as unknown as Page;

      const engine = new NavigationEngine(mockPage);
      const res = await engine.navigate('https://example.com/slow', {
        timeoutMs: 100,
        maxRetries: 5,
        retryDelayMs: 20,
        captureArtifactsOnFailure: false,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.failureCode).toBe('TIMEOUT');
      }
      expect(attempts).toBeLessThan(4); // Stopped early due to total deadline
    });
  });

  describe('BrowserContextManager (Multi-Tab & Lifecycle)', () => {
    it('tracks pages and enforces tab limits', () => {
      const p1 = { isClosed: () => false, close: vi.fn(), on: vi.fn() } as unknown as Page;
      const p2 = { isClosed: () => false, close: vi.fn(), on: vi.fn() } as unknown as Page;
      const p3 = { isClosed: () => false, close: vi.fn(), on: vi.fn() } as unknown as Page;

      const mockContext = {
        pages: () => [p1],
        on: vi.fn(),
      } as unknown as any;

      const manager = new BrowserContextManager(mockContext, { maxTabs: 2 });
      expect(manager.getActivePage()).toBe(p1);
      expect(manager.getOpenPages().length).toBe(1);

      manager.registerPage(p2);
      expect(manager.getOpenPages().length).toBe(2);

      // Registering beyond maxTabs should close excess page immediately
      manager.registerPage(p3);
      expect(p3.close).toHaveBeenCalled();
      expect(manager.getOpenPages().length).toBe(2);
    });

    it('manages active page switching', () => {
      const p1 = { isClosed: () => false, on: vi.fn() } as unknown as Page;
      const p2 = { isClosed: () => false, on: vi.fn() } as unknown as Page;

      const mockContext = { pages: () => [p1, p2], on: vi.fn() } as unknown as any;
      const manager = new BrowserContextManager(mockContext);

      manager.setActivePage(p2);
      expect(manager.getActivePage()).toBe(p2);

      manager.setActivePage(0);
      expect(manager.getActivePage()).toBe(p1);
    });
  });

  describe('NavigationOrchestrator (Hybrid Navigation)', () => {
    it('returns deterministic success without calling AI when deterministic engine succeeds', async () => {
      const mockEngine = {
        navigate: vi.fn().mockResolvedValue({
          success: true,
          requestedUrl: 'https://example.com',
          url: 'https://example.com',
          attempts: 1,
          durationMs: 50,
          redirected: false,
          redirectCount: 0,
          redirectChain: ['https://example.com'],
        }),
      } as unknown as NavigationEngine;

      const mockAI = {
        run: vi.fn(),
      } as unknown as any;

      const orchestrator = new NavigationOrchestrator(mockEngine, mockAI);
      const res = await orchestrator.navigateWithHybridStrategy('Go to dashboard', 'https://example.com');

      expect(res.success).toBe(true);
      expect(mockAI.run).not.toHaveBeenCalled();
    });

    it('escalates to AI on REQUIRED_ELEMENT_MISSING', async () => {
      const mockEngine = {
        navigate: vi.fn().mockResolvedValue({
          success: false,
          failureCode: 'REQUIRED_ELEMENT_MISSING',
          requestedUrl: 'https://example.com',
          url: 'https://example.com',
          attempts: 1,
          durationMs: 50,
          message: 'Element missing',
          redirectCount: 0,
          redirectChain: ['https://example.com'],
        }),
      } as unknown as NavigationEngine;

      const mockAI = {
        run: vi.fn().mockResolvedValue({
          status: 'SUCCESS',
          stepsExecuted: 2,
        }),
      } as unknown as any;

      const orchestrator = new NavigationOrchestrator(mockEngine, mockAI);
      const res = await orchestrator.navigateWithHybridStrategy('Find submit button', 'https://example.com');

      expect(res.success).toBe(true);
      expect(mockAI.run).toHaveBeenCalledWith('Find submit button');
    });

    it('does NOT escalate to AI on hard security blocks (AUTH_REQUIRED, ACCESS_DENIED)', async () => {
      const mockEngine = {
        navigate: vi.fn().mockResolvedValue({
          success: false,
          failureCode: 'AUTH_REQUIRED',
          requestedUrl: 'https://example.com/login',
          url: 'https://example.com/login',
          attempts: 1,
          durationMs: 50,
          message: 'Auth required',
          redirectCount: 0,
          redirectChain: ['https://example.com/login'],
        }),
      } as unknown as NavigationEngine;

      const mockAI = {
        run: vi.fn(),
      } as unknown as any;

      const orchestrator = new NavigationOrchestrator(mockEngine, mockAI);
      const res = await orchestrator.navigateWithHybridStrategy('Check settings', 'https://example.com/settings');

      expect(res.success).toBe(false);
      expect(mockAI.run).not.toHaveBeenCalled();
    });
  });

  describe('ApprovalPolicy (Action Risk Management)', () => {
    const policy = new DefaultApprovalPolicy();

    it('correctly classifies risk levels', () => {
      expect(policy.classifyRisk({ type: 'wait_for_url', pattern: '.*' })).toBe('read');
      expect(policy.classifyRisk({ type: 'navigate', url: 'https://example.com' })).toBe('reversible-write');
      expect(policy.classifyRisk({ type: 'click', target: { name: 'Delete Account' } })).toBe('irreversible-write');
      expect(policy.classifyRisk({ type: 'click', target: { name: 'Purchase Now' } })).toBe('irreversible-write');
      expect(policy.classifyRisk({ type: 'click', target: { name: 'Send Message' } })).toBe('sensitive-write');
      expect(policy.classifyRisk({ type: 'click', target: { name: 'Next' } })).toBe('reversible-write');
    });

    it('throws HUMAN_REQUIRED on unapproved irreversible actions', async () => {
      const irreversibleAction: AIAction = { type: 'click', target: { name: 'Delete Account' } };
      await expect(
        policy.assertApprovedIfRequired({
          action: irreversibleAction,
          resolvedTarget: {},
          risk: 'irreversible-write',
        }),
      ).rejects.toThrow(expect.objectContaining({ code: 'HUMAN_REQUIRED' }));
    });
  });
});
