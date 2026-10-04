import type { ElementHandle, Locator, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnchorRegistry } from '../src/crosshair/AnchorRegistry';
import { ShadowDom } from '../src/crosshair/ShadowDom';
import { XPathResolver } from '../src/crosshair/XPathResolver';
import { CrosshairError } from '../src/util/errors';

describe('Ticket 4.4: XPathResolver 5-Tier Fallback Chain', () => {
  let mockPage: Page;
  let mockLocator: Locator;
  let mockElement: ElementHandle<Element>;
  let mockAnchorRegistry: AnchorRegistry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLocator = {
      first: vi.fn().mockReturnThis(),
      waitFor: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(1),
    } as unknown as Locator;

    mockElement = {
      asElement: vi.fn().mockReturnThis(),
    } as unknown as ElementHandle<Element>;

    mockPage = {
      locator: vi.fn().mockReturnValue(mockLocator),
      getByRole: vi.fn().mockReturnValue(mockLocator),
    } as unknown as Page;

    mockAnchorRegistry = {
      generateKey: vi.fn().mockReturnValue('mock-anchor-key'),
      recall: vi.fn().mockResolvedValue(null),
      remember: vi.fn().mockResolvedValue({} as any),
      reinforce: vi.fn().mockResolvedValue({} as any),
      decay: vi.fn().mockResolvedValue({} as any),
    } as unknown as AnchorRegistry;
  });

  it('Tier 1: Resolves natively via XPath when selector starts with //', async () => {
    const resolver = new XPathResolver();

    const res = await resolver.resolve(mockPage, '//button[@id="login"]');

    expect(res.strategy).toBe('xpath_native');
    expect(res.resolvedSelector).toBe('xpath=//button[@id="login"]');
    expect(mockPage.locator).toHaveBeenCalledWith('xpath=//button[@id="login"]');
    expect(res.locator).toBe(mockLocator);
  });

  it('Tier 2: Resolves natively via CSS selector', async () => {
    const resolver = new XPathResolver();

    const res = await resolver.resolve(mockPage, 'button.submit');

    expect(res.strategy).toBe('css_native');
    expect(res.resolvedSelector).toBe('button.submit');
    expect(mockPage.locator).toHaveBeenCalledWith('button.submit');
  });

  it('Tier 3: Falls through to ShadowDom when native locator fails', async () => {
    // Fail native locator
    (mockLocator.waitFor as any).mockRejectedValueOnce(new Error('Timeout'));

    // Mock ShadowDom.findElement success
    const shadowSpy = vi
      .spyOn(ShadowDom, 'findElement')
      .mockResolvedValueOnce(mockElement);

    const resolver = new XPathResolver();
    const res = await resolver.resolve(mockPage, 'nested-custom-btn');

    expect(res.strategy).toBe('shadow_dom');
    expect(res.element).toBe(mockElement);
    expect(shadowSpy).toHaveBeenCalledWith(mockPage, 'nested-custom-btn');
  });

  it('Tier 4: Recalls from AnchorRegistry and reinforces confidence on hit', async () => {
    // Native locator fails
    (mockLocator.waitFor as any).mockRejectedValueOnce(new Error('Native CSS fail'));
    vi.spyOn(ShadowDom, 'findElement').mockResolvedValueOnce(null);

    // AnchorRegistry has cached selector
    (mockAnchorRegistry.recall as any).mockResolvedValueOnce({
      id: 'anchor-id-1',
      selector: '#cached-id-selector',
    });

    const resolver = new XPathResolver(mockAnchorRegistry);
    const res = await resolver.resolve(mockPage, 'flaky-selector', {
      taskId: 'task-123',
    });

    expect(res.strategy).toBe('anchor_registry');
    expect(res.resolvedSelector).toBe('#cached-id-selector');
    expect(mockAnchorRegistry.reinforce).toHaveBeenCalledWith('anchor-id-1');
  });

  it('Tier 4: Decays anchor confidence when recalled selector fails to resolve', async () => {
    // 1. Native locator fails
    (mockLocator.waitFor as any).mockRejectedValueOnce(new Error('Native fail'));
    vi.spyOn(ShadowDom, 'findElement').mockResolvedValueOnce(null);

    // 2. Anchor recall returns stale selector which also fails
    (mockAnchorRegistry.recall as any).mockResolvedValueOnce({
      id: 'stale-anchor',
      selector: '#stale-selector',
    });
    (mockLocator.waitFor as any).mockRejectedValueOnce(new Error('Anchor fail'));

    // 3. Accessibility role succeeds
    (mockPage.getByRole as any).mockReturnValueOnce(mockLocator);

    const resolver = new XPathResolver(mockAnchorRegistry);
    const res = await resolver.resolve(mockPage, 'submit-btn', {
      taskId: 'task-123',
      role: 'button',
      name: 'Submit',
    });

    expect(mockAnchorRegistry.decay).toHaveBeenCalledWith('stale-anchor');
    expect(res.strategy).toBe('accessibility_role');
  });

  it('Tier 5: Resolves via Accessibility Role + Name', async () => {
    // Native and Shadow DOM fail
    (mockLocator.waitFor as any).mockRejectedValueOnce(new Error('Native fail'));
    vi.spyOn(ShadowDom, 'findElement').mockResolvedValueOnce(null);

    const resolver = new XPathResolver();
    const res = await resolver.resolve(mockPage, 'Log In', {
      role: 'button',
      name: 'Log In',
    });

    expect(res.strategy).toBe('accessibility_role');
    expect(mockPage.getByRole).toHaveBeenCalledWith('button', { name: 'Log In' });
  });

  it('remembers resolved selector in AnchorRegistry when taskId is supplied', async () => {
    const resolver = new XPathResolver(mockAnchorRegistry);

    await resolver.resolve(mockPage, 'button.submit', {
      taskId: 'task-auth',
      profileId: 'prof-1',
    });

    expect(mockAnchorRegistry.remember).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-auth',
        profileId: 'prof-1',
        selector: 'button.submit',
        type: 'css',
      }),
    );
  });

  it('Tier 0: Resolves dynamically for video: selector (Method A)', async () => {
    const resolver = new XPathResolver();
    const res = await resolver.resolve(
      mockPage,
      'video: This 249 KM Bus Journey Was INSANE! 🔥 | Bus Simulator Coach Master Gameplay',
    );

    expect(res.strategy).toBe('css_native');
    expect(res.resolvedSelector).toContain('249 KM Bus Journey');
    expect(mockPage.locator).toHaveBeenCalled();
  });

  it('Tier 0: Filters out live streams and shorts when resolving video:0', async () => {
    const liveLocator = {
      isVisible: vi.fn().mockResolvedValue(true),
      evaluate: vi.fn().mockResolvedValue('LIVE'),
    };
    const vodLocator = {
      isVisible: vi.fn().mockResolvedValue(true),
      evaluate: vi.fn().mockResolvedValue('STANDARD_VOD'),
    };

    const multiLocator = {
      count: vi.fn().mockResolvedValue(2),
      nth: vi.fn().mockImplementation((idx: number) => (idx === 0 ? liveLocator : vodLocator)),
    };

    (mockPage.locator as any).mockReturnValue(multiLocator);

    const resolver = new XPathResolver();
    const res = await resolver.resolve(mockPage, 'video:0');

    expect(res.strategy).toBe('css_native');
    expect(res.resolvedSelector).toContain('nth=1');
  });

  it('Tier 0: Resolves live streams when explicitly requested via video:live:0', async () => {
    const liveLocator = {
      isVisible: vi.fn().mockResolvedValue(true),
      evaluate: vi.fn().mockResolvedValue('LIVE'),
    };
    const vodLocator = {
      isVisible: vi.fn().mockResolvedValue(true),
      evaluate: vi.fn().mockResolvedValue('STANDARD_VOD'),
    };

    const multiLocator = {
      count: vi.fn().mockResolvedValue(2),
      nth: vi.fn().mockImplementation((idx: number) => (idx === 0 ? liveLocator : vodLocator)),
    };

    (mockPage.locator as any).mockReturnValue(multiLocator);

    const resolver = new XPathResolver();
    const res = await resolver.resolve(mockPage, 'video:live:0');

    expect(res.strategy).toBe('css_native');
    expect(res.resolvedSelector).toContain('nth=0');
  });

  it('Tier 0: Resolves YouTube shorts when explicitly requested via video:short:0', async () => {
    const shortLocator = {
      isVisible: vi.fn().mockResolvedValue(true),
      evaluate: vi.fn().mockResolvedValue('SHORT'),
    };
    const vodLocator = {
      isVisible: vi.fn().mockResolvedValue(true),
      evaluate: vi.fn().mockResolvedValue('STANDARD_VOD'),
    };

    const multiLocator = {
      count: vi.fn().mockResolvedValue(2),
      nth: vi.fn().mockImplementation((idx: number) => (idx === 0 ? shortLocator : vodLocator)),
    };

    (mockPage.locator as any).mockReturnValue(multiLocator);

    const resolver = new XPathResolver();
    const res = await resolver.resolve(mockPage, 'video:short:0');

    expect(res.strategy).toBe('css_native');
    expect(res.resolvedSelector).toContain('nth=0');
  });

  it('Combined selectors: Resolves comma-separated fallback candidate when first candidate fails', async () => {
    // First candidate fails, second candidate succeeds
    (mockLocator.waitFor as any)
      .mockRejectedValueOnce(new Error('First candidate not found'))
      .mockResolvedValueOnce(undefined);

    const resolver = new XPathResolver();
    const res = await resolver.resolve(
      mockPage,
      '#missing-link, a:has(h3:has-text("YouTube"))',
    );

    expect(res.strategy).toBe('css_native');
    expect(res.resolvedSelector).toBe('a:has(h3:has-text("YouTube"))');
  });

  it('throws CrosshairError STEP_SELECTOR_MISSING when all tiers fail after retries', async () => {
    (mockLocator.waitFor as any).mockRejectedValue(new Error('Element not found'));
    vi.spyOn(ShadowDom, 'findElement').mockResolvedValue(null);

    const resolver = new XPathResolver();

    await expect(
      resolver.resolve(mockPage, 'never-found', {
        maxAttempts: 2,
        retryBackoffMs: 10,
        timeoutMs: 100,
      }),
    ).rejects.toThrow(CrosshairError);
  });
});
