import type { ProfileDetail, ProxySummary } from '@tersoo/contracts';
import type { Browser, BrowserContext, Page } from 'playwright-core';

import type { Humanizer } from '../crosshair/Humanizer';
import type { ForwarderCredentials } from '../proxy/proxyUrl';
import type { Instance } from '../supervisor/types';

export type EngineType = 'apostate' | 'camoufox';

export interface LaunchInput {
  profile: ProfileDetail;
  proxy?: ProxySummary | null | undefined;
  seed: number;
  userDataDir: string;
  forwarderPort: number;
  /**
   * Credentials the local forwarder requires from its client. The forwarder
   * rejects unauthenticated clients, so this must be passed whenever
   * `forwarderPort` is set.
   */
  forwarderAuth?: ForwarderCredentials | null | undefined;
  actionMode: 'scripted' | 'llm';
  headless: boolean;
  /**
   * Extra browser flags. Allowlisted before use; see
   * `engines/shared/argSanitizer.ts`. Internal to the launch path.
   */
  additionalArgs?: string[] | undefined;
  screen?: { width: number; height: number; dpr?: number } | undefined;
  leaseId?: string | null | undefined;
  cdpTimeoutMs?: number | undefined;
  hostScreen?: { width: number; height: number; workAreaWidth?: number; workAreaHeight?: number } | undefined;
}

export interface BrowserSession {
  browser?: Browser | undefined;
  context?: BrowserContext | undefined;
  page?: Page | undefined;
  instance?: Instance | undefined;
  humanizer: Humanizer | null;
  engine: EngineType;
  cdpPort: number | null;
  cdpWsUrl?: string | null | undefined;
  pid?: number | undefined;
  close(): Promise<void>;
}

export interface BrowserEngine {
  readonly type: EngineType;
  launch(input: LaunchInput): Promise<BrowserSession>;
  stop(profileId: string): Promise<void>;
  getSession?(profileId: string): BrowserSession | undefined;
}
