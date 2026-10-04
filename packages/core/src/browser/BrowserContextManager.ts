import type { BrowserContext, Page } from 'playwright-core';
import { NavigationError } from './navigation/NavigationError';
import { NavigationPolicy } from './navigation/NavigationPolicy';

export interface ContextManagerOptions {
  maxTabs?: number | undefined;
  allowedHosts?: string[] | undefined;
}

export class BrowserContextManager {
  private activePage: Page | null = null;
  private pagesList: Set<Page> = new Set();
  private readonly maxTabs: number;
  private readonly allowedHosts?: string[] | undefined;

  constructor(
    private readonly context: BrowserContext,
    options: ContextManagerOptions = {},
  ) {
    this.maxTabs = options.maxTabs ?? 10;
    this.allowedHosts = options.allowedHosts;

    // Track existing pages
    if (typeof context.pages === 'function') {
      for (const p of context.pages()) {
        this.registerPage(p);
      }
    }

    // Automatically monitor new tabs/popups
    if (typeof context.on === 'function') {
      context.on('page', (newPage: Page) => {
        this.registerPage(newPage);
      });
    }
  }

  registerPage(page: Page): void {
    if (this.pagesList.has(page)) return;

    if (this.pagesList.size >= this.maxTabs) {
      // Exceeded tab limit, close excess page
      try {
        const res = page.close();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {}
      return;
    }

    this.pagesList.add(page);
    if (!this.activePage || (typeof this.activePage.isClosed === 'function' && this.activePage.isClosed())) {
      this.activePage = page;
    }

    if (typeof page.on === 'function') {
      page.on('close', () => {
        this.pagesList.delete(page);
        if (this.activePage === page) {
          const remaining = Array.from(this.pagesList).filter(
            (p) => typeof p.isClosed !== 'function' || !p.isClosed(),
          );
          this.activePage = (remaining.length > 0 && remaining[remaining.length - 1]) ? remaining[remaining.length - 1]! : null;
        }
      });
    }
  }

  getActivePage(): Page {
    if (
      this.activePage &&
      (typeof this.activePage.isClosed !== 'function' || !this.activePage.isClosed())
    ) {
      return this.activePage;
    }

    const available = Array.from(this.pagesList).filter(
      (p) => typeof p.isClosed !== 'function' || !p.isClosed(),
    );

    const last = available[available.length - 1];
    if (last) {
      this.activePage = last;
      return last;
    }

    throw new NavigationError(
      'PAGE_CRASHED',
      'No active or open browser pages available in context',
    );
  }

  setActivePage(pageOrIndex: Page | number): void {
    if (typeof pageOrIndex === 'number') {
      const all = Array.from(this.pagesList);
      const targetPage = all[pageOrIndex];
      if (pageOrIndex >= 0 && pageOrIndex < all.length && targetPage) {
        this.activePage = targetPage;
        return;
      }
      throw new Error(`Tab index ${pageOrIndex} out of bounds (open tabs: ${all.length})`);
    }

    if (this.pagesList.has(pageOrIndex)) {
      this.activePage = pageOrIndex;
    } else {
      this.registerPage(pageOrIndex);
      this.activePage = pageOrIndex;
    }
  }

  getOpenPages(): Page[] {
    return Array.from(this.pagesList).filter(
      (p) => typeof p.isClosed !== 'function' || !p.isClosed(),
    );
  }

  async waitForNewPage(
    triggerAction?: () => Promise<void>,
    timeoutMs = 15000,
  ): Promise<Page> {
    const pagePromise = new Promise<Page>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new NavigationError('TIMEOUT', `Timed out waiting for new tab/page after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (page: Page) => {
        cleanup();
        this.registerPage(page);
        this.activePage = page;

        // Security: Validate popup destination host if URL available
        const url = typeof page.url === 'function' ? page.url() : '';
        if (url && url !== 'about:blank' && this.allowedHosts) {
          try {
            NavigationPolicy.validateNavigationUrl(url, this.allowedHosts);
          } catch (err) {
            page.close().catch(() => {});
            reject(err);
            return;
          }
        }

        resolve(page);
      };

      const cleanup = () => {
        clearTimeout(timer);
        if (typeof this.context.removeListener === 'function') {
          this.context.removeListener('page', handler);
        }
      };

      if (typeof this.context.on === 'function') {
        this.context.on('page', handler);
      } else {
        clearTimeout(timer);
        reject(new Error('BrowserContext does not support event listeners'));
      }
    });

    if (triggerAction) {
      await triggerAction();
    }

    return pagePromise;
  }

  async closeOtherPages(): Promise<void> {
    const active = this.getActivePage();
    for (const page of this.pagesList) {
      if (page !== active && (typeof page.isClosed !== 'function' || !page.isClosed())) {
        try {
          const res = page.close();
          if (res && typeof res.catch === 'function') {
            await res.catch(() => {});
          }
        } catch {}
      }
    }
    this.pagesList.clear();
    this.pagesList.add(active);
  }
}
