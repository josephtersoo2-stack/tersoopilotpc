import type { Config } from '../config';
import type { EventBus } from '../events/EventBus';

import type { ProxyBroker } from './ProxyBroker';

export interface LeaseSweepSchedulerDeps {
  broker: ProxyBroker;
  events: EventBus;
  config?: Config | undefined;
  sweepIntervalMs?: number | undefined;
  heartbeatIntervalMs?: number | undefined;
  getActiveLeaseIds?: (() => Promise<string[]> | string[]) | undefined;
}

export class LeaseSweepScheduler {
  private sweepTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;
  private isHeartbeating = false;

  constructor(private readonly deps: LeaseSweepSchedulerDeps) {}

  start(): void {
    if (this.sweepTimer || this.heartbeatTimer) return;

    const sweepInterval = this.deps.sweepIntervalMs ?? 15000;
    const heartbeatInterval = this.deps.heartbeatIntervalMs ?? 10000;

    this.sweepTimer = setInterval(() => {
      this.runSweep().catch(() => {});
    }, sweepInterval);
    this.sweepTimer.unref?.();

    if (this.deps.getActiveLeaseIds) {
      this.heartbeatTimer = setInterval(() => {
        this.runHeartbeat().catch(() => {});
      }, heartbeatInterval);
      this.heartbeatTimer.unref?.();
    }
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async runSweep(): Promise<number> {
    if (this.isSweeping) return 0;
    this.isSweeping = true;
    try {
      const numSwept = await this.deps.broker.sweep();
      if (numSwept > 0) {
        await this.deps.events.emit('alert.raised', {
          level: 'info',
          title: 'Leases Swept',
          message: `Swept ${numSwept} expired proxy lease${numSwept > 1 ? 's' : ''}`,
        });
      }
      return numSwept;
    } finally {
      this.isSweeping = false;
    }
  }

  async runHeartbeat(): Promise<void> {
    if (this.isHeartbeating || !this.deps.getActiveLeaseIds) return;
    this.isHeartbeating = true;
    try {
      const leaseIds = await this.deps.getActiveLeaseIds();
      await Promise.allSettled(leaseIds.map((id) => this.deps.broker.heartbeat(id)));
    } finally {
      this.isHeartbeating = false;
    }
  }

  isRunning(): boolean {
    return this.sweepTimer !== null;
  }
}
