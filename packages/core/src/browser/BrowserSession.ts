import type { BrowserContext, Page } from 'playwright-core';
import type { LlmService } from '../llm/LlmService';
import { observeBrowser, type BrowserObservation } from './ai/BrowserObservation';
import { NavigationEngine } from './navigation/NavigationEngine';
import type { NavigationOptions, NavigationResult } from './navigation/NavigationResult';

export interface IBrowserSession {
  readonly id: string;
  readonly page: Page;
  readonly context: BrowserContext;
  navigate(url: string, options?: NavigationOptions): Promise<NavigationResult>;
  observe(): Promise<BrowserObservation>;
  close(): Promise<void>;
}

export class NavigationBrowserSession implements IBrowserSession {
  private readonly navEngine: NavigationEngine;

  constructor(
    public readonly id: string,
    public readonly page: Page,
    public readonly context: BrowserContext,
    llm?: LlmService,
    artifactsDir?: string,
  ) {
    this.navEngine = new NavigationEngine(page, llm, artifactsDir);
  }

  async navigate(url: string, options?: NavigationOptions): Promise<NavigationResult> {
    return this.navEngine.navigate(url, options);
  }

  async observe(): Promise<BrowserObservation> {
    return observeBrowser(this.page);
  }

  async close(): Promise<void> {
    await this.context.close().catch(() => {});
  }
}
