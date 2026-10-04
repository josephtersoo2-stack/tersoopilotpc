import type { CDPSession, Locator, Page } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsentEngine } from '../src/crosshair/ConsentEngine';
import { Humanizer } from '../src/crosshair/Humanizer';
import { XPathResolver } from '../src/crosshair/XPathResolver';

describe('Universal Page Perception & Automation Engine', () => {
  let mockPage: Page;
  let mockLocator: Locator;
  let mockCdpSession: CDPSession;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLocator = {
      first: vi.fn().mockReturnThis(),
      nth: vi.fn().mockReturnThis(),
      waitFor: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      // A real click goes through a bounding box and raw mouse events, because
      // locator.click() never dispatches on this engine. See crosshair/mouseClick.ts.
      boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 80, height: 30 }),
      click: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue([]),
    } as unknown as Locator;

    mockCdpSession = {
      send: vi.fn().mockResolvedValue({}),
      detach: vi.fn().mockResolvedValue({}),
    } as unknown as CDPSession;

    mockPage = {
      isClosed: vi.fn().mockReturnValue(false),
      locator: vi.fn().mockReturnValue(mockLocator),
      getByRole: vi.fn().mockReturnValue(mockLocator),
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        down: vi.fn().mockResolvedValue(undefined),
        up: vi.fn().mockResolvedValue(undefined),
      },
      mainFrame: vi.fn().mockReturnThis(),
      frames: vi.fn().mockReturnValue([]),
      evaluate: vi.fn().mockResolvedValue(-1),
      context: vi.fn().mockReturnValue({
        newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
      }),
      viewportSize: vi.fn().mockReturnValue({ width: 412, height: 915 }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;
  });

  describe('ConsentEngine', () => {
    it('detects and clicks known CMP accept selectors when visible', async () => {
      // Mock that the first selector checked is visible
      (mockLocator.isVisible as any).mockResolvedValueOnce(true);

      const handled = await ConsentEngine.checkAndHandle(mockPage);

      expect(handled).toBe(true);
      // Consent is clicked with the mouse, never locator.click(), which does
      // not dispatch on this engine.
      expect(mockPage.mouse.move).toHaveBeenCalled();
      expect(mockPage.mouse.down).toHaveBeenCalled();
      expect(mockPage.mouse.up).toHaveBeenCalled();
      expect(mockLocator.click).not.toHaveBeenCalled();
    });

    it('falls back to multi-lingual ARIA semantic buttons when CMP IDs are not present', async () => {
      // All CMP selectors return false for isVisible
      (mockLocator.isVisible as any).mockResolvedValue(false);
      // The page-side probe reports the index of a matching accept button.
      (mockPage.evaluate as any).mockResolvedValueOnce(0);

      const handled = await ConsentEngine.checkAndHandle(mockPage);

      expect(handled).toBe(true);
      expect(mockLocator.nth).toHaveBeenCalledWith(0);
      expect(mockPage.mouse.up).toHaveBeenCalled();
    });

    it('leaves the page alone when the semantic probe finds no accept button', async () => {
      (mockLocator.isVisible as any).mockResolvedValue(false);
      (mockPage.evaluate as any).mockResolvedValueOnce(-1);

      // A close button that is not inside a dialog is not a consent banner.
      (mockLocator.isVisible as any).mockResolvedValue(false);

      const handled = await ConsentEngine.checkAndHandle(mockPage);
      expect(handled).toBe(false);
    });

    it('returns false when no dialogs or banners are present', async () => {
      (mockLocator.isVisible as any).mockResolvedValue(false);
      (mockPage.evaluate as any).mockResolvedValue(false);
      (mockPage.getByRole as any).mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
      });

      const handled = await ConsentEngine.checkAndHandle(mockPage);
      expect(handled).toBe(false);
    });
  });

  describe('Mobile Touch Engine via CDP', () => {
    it('dispatches touch events with authentic human contact radius and force for touchTap', async () => {
      await Humanizer.touchTap(mockCdpSession, { x: 200, y: 450 });

      // Verify CDP session was invoked for touchStart, touchEnd
      expect(mockCdpSession.send).toHaveBeenCalledWith(
        'Input.dispatchTouchEvent',
        expect.objectContaining({
          type: 'touchStart',
          touchPoints: expect.arrayContaining([
            expect.objectContaining({
              x: expect.any(Number),
              y: expect.any(Number),
              radiusX: expect.any(Number),
              radiusY: expect.any(Number),
              force: expect.any(Number),
            }),
          ]),
        })
      );

      expect(mockCdpSession.send).toHaveBeenCalledWith(
        'Input.dispatchTouchEvent',
        expect.objectContaining({
          type: 'touchEnd',
        })
      );
    });

    it('dispatches interpolated touchSwipe events across duration', async () => {
      await Humanizer.touchSwipe(mockCdpSession, { amount: 200, direction: 'down' });

      // Expect touchStart, multiple touchMove, and touchEnd
      const calls = (mockCdpSession.send as any).mock.calls.filter(
        (c: any[]) => c[0] === 'Input.dispatchTouchEvent'
      );
      expect(calls.length).toBeGreaterThan(3);
      expect(calls[0][1].type).toBe('touchStart');
      expect(calls[calls.length - 1][1].type).toBe('touchEnd');
    });
  });

  describe('Universal Semantic Intent Resolver', () => {
    const resolver = new XPathResolver();

    it('resolves intent:search_input to generic search inputs without hardcoded domains', async () => {
      const res = await resolver.resolve(mockPage, 'intent:search_input');

      expect(res.strategy).toBe('css_native');
      // A real Locator exposes count()/nth(), so the selector is qualified.
      expect(res.resolvedSelector).toMatch(
        /^(textarea\[name="q"\]|input\[type="search"\]|input\[name="q"\]|input\[name="query"\]|input\[id="search"\]|input\[placeholder\*="search" i\]|input\[aria-label\*="search" i\]|input\[placeholder\*="Search" i\]|textarea\[aria-label\*="search" i\]|\[role="searchbox"\]|\[role="search"\] input|\[role="search"\] textarea|form\[role="search"\] input)(\s*>>\s*nth=\d+)?$/,
      );
    });

    it('resolves intent:search_button to search action buttons', async () => {
      const res = await resolver.resolve(mockPage, 'intent:search_button');

      expect(res.strategy).toBe('css_native');
      // A real Locator exposes count()/nth(), so the resolver takes the
      // indexed branch and qualifies the selector it returns.
      expect(res.resolvedSelector).toMatch(
        /^(button\.ytSearchboxComponentSearchButton|button\[title="Search"\]|button\[aria-label="Search"\]|button#search-icon-legacy|button\[type="submit"\]|\[role="search"\] button|button\[aria-label\*="search" i\]|button:has-text\("Search"\))(\s*>>\s*nth=\d+)?$/,
      );
    });

    it('resolves intent:media to any HTML5 video or media element', async () => {
      const res = await resolver.resolve(mockPage, 'intent:media');

      expect(res.strategy).toBe('css_native');
      expect(['#movie_player', 'video', '.html5-video-player']).toContain(res.resolvedSelector);
    });

    it('resolves intent:button("Subscribe") using W3C ARIA role semantics', async () => {
      const res = await resolver.resolve(mockPage, 'intent:button("Subscribe")');

      expect(res.strategy).toBe('accessibility_role');
      expect(mockPage.getByRole).toHaveBeenCalledWith('button', expect.objectContaining({ name: /Subscribe/i }));
    });

    it('resolves intent:link("Sign In") using W3C ARIA link semantics', async () => {
      const res = await resolver.resolve(mockPage, 'intent:link("Sign In")');

      expect(res.strategy).toBe('accessibility_role');
      expect(mockPage.getByRole).toHaveBeenCalledWith('link', expect.objectContaining({ name: /Sign In/i }));
    });

    it('resolves video:0 to generic video containers on arbitrary sites', async () => {
      const res = await resolver.resolve(mockPage, 'video:0');

      expect(res.strategy).toBe('css_native');
      expect(res.resolvedSelector).toContain('video');
    });

    it('resolves intent:top_result to top organic search engine results', async () => {
      const res = await resolver.resolve(mockPage, 'intent:top_result');

      expect(res.strategy).toBe('css_native');
      expect(res.resolvedSelector).toBeTruthy();
    });

    it('resolves intent:search_result("youtube") to organic result link', async () => {
      const res = await resolver.resolve(mockPage, 'intent:search_result("youtube")');

      expect(res.strategy).toBe('css_native');
      expect(res.resolvedSelector).toBeTruthy();
    });

    it('resolves encoded URL link when native CSS fails via evaluate', async () => {
      // Fail native CSS locator
      (mockLocator.waitFor as any).mockRejectedValueOnce(new Error('Timeout'));
      // In-page evaluate finds the matching link
      (mockPage.evaluate as any).mockResolvedValueOnce(true);

      const res = await resolver.resolve(mockPage, 'a[href*="youtube.com"]');

      expect(res.strategy).toBe('css_native');
      expect(res.resolvedSelector).toContain('data-tersoo-res');
    });
  });
});
