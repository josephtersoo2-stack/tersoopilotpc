import type { ChildProcess } from 'node:child_process';

import type { Config } from '../config';
import type { CrosshairWorker } from '../crosshair/CrosshairWorker';
import type { EventBus } from '../events/EventBus';
import type { Repos } from '../persistence/repos';
import type { ProxyBroker } from '../proxy/ProxyBroker';

export type InstanceState =
  | 'starting'
  | 'ready'
  | 'busy'
  | 'paused'
  | 'stopping'
  | 'crashed';

export interface Instance {
  profileId: string;
  pid: number;
  userDataDir: string;
  forwarderPort: number;
  cdpPort: number | null;
  cdpWsUrl: string | null;
  state: InstanceState;
  startedAt: number;
  memoryMb: number;
  cpuPct: number;
  crashCount: number;
  restartBudget: number;
  lastHeartbeat: number;
  worker: CrosshairWorker | null;
  process: ChildProcess;
  leaseId?: string | null;
  stealthInjected?: boolean;
  cdpClient?: { close(): void } | undefined;
}

export interface BrowserSupervisorDeps {
  config: Config;
  events: EventBus;
  crosshair: CrosshairWorker;
  repos?: Repos;
  broker?: ProxyBroker;
}

