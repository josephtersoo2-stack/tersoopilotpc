import fs from 'node:fs';
import os from 'node:os';

import type { FleetStatus } from '@tersoo/contracts';

import { paths, type Config } from '../config';
import type { Repos } from '../persistence/repos';
import type { LocalForwarder } from '../proxy/LocalForwarder';
import type { ProxyBroker } from '../proxy/ProxyBroker';
import type { JobQueue } from '../queue/JobQueue';
import type { BrowserSupervisor } from '../supervisor/BrowserSupervisor';

export interface FleetServiceDeps {
  supervisor: BrowserSupervisor;
  broker: ProxyBroker;
  queue: JobQueue;
  config: Config;
  repos?: Repos;
  forwarder?: LocalForwarder;
}

export class FleetService {
  private lastLaunchAt = 0;
  private launchQueue: Promise<void> = Promise.resolve();
  private lastCpuTimes: { idle: number; total: number } | null = null;

  constructor(private readonly deps: FleetServiceDeps) {}

  /**
   * Pre-spawn check assessing system RAM pressure and fleet RAM budget before launching a browser.
   * Can be bypassed via the 'skip_ram_check' setting.
   */
  async canSpawnAnother(): Promise<{ ok: boolean; reason?: string }> {
    let effectiveThreshold =
      this.deps.config.resourceLimits?.memoryPressureThresholdPct ?? 0.95;

    // Check if the user has disabled RAM checking via Settings or set a custom threshold
    if (this.deps.repos) {
      try {
        const skipRaw = await this.deps.repos.settings.get('skip_ram_check');
        if (skipRaw === '1' || skipRaw === 'true') {
          return { ok: true };
        }
        const threshRaw = await this.deps.repos.settings.get('memory_pressure_threshold');
        if (threshRaw) {
          const parsed = parseFloat(threshRaw);
          if (!isNaN(parsed) && parsed > 0 && parsed <= 1) {
            effectiveThreshold = parsed;
          }
        }
      } catch {
        // best effort – proceed with checks
      }
    }

    const instances = this.deps.supervisor.list();
    const totalRamMb = os.totalmem() / (1024 * 1024);
    const freeRamMb = os.freemem() / (1024 * 1024);
    const usedRamMb = totalRamMb - freeRamMb;
    const { totalFleetRamMb, perInstanceRamMb } =
      this.deps.config.resourceLimits ?? {
        totalFleetRamMb: 12288,
        perInstanceRamMb: 600,
        memoryPressureThresholdPct: 0.95,
      };

    // Check 1: total system pressure
    if (usedRamMb / totalRamMb > effectiveThreshold) {
      return {
        ok: false,
        reason: `System RAM pressure at ${Math.round((usedRamMb / totalRamMb) * 100)}%`,
      };
    }

    // Check 2: fleet budget
    const fleetBudget = instances.length * perInstanceRamMb;
    if (fleetBudget + perInstanceRamMb > totalFleetRamMb) {
      return {
        ok: false,
        reason: `Fleet RAM budget would exceed ${totalFleetRamMb} MB`,
      };
    }

    return { ok: true };
  }

  /**
   * Concurrency governor controls: delegates to JobQueue.
   */
  setConcurrency(limit: number): void {
    this.deps.queue.setConcurrency(limit);
  }

  getConcurrency(): number {
    return this.deps.queue.getConcurrency();
  }

  /**
   * Staggers profile launches to prevent CPU/IO spikes.
   * Serializes consecutive launches with an enforced delay between minMs and maxMs.
   * Automatically pulls randomized interval from settings if not explicitly specified.
   */
  async acquireLaunchStagger(minMs = 0, maxMs = 0): Promise<void> {
    let effectiveMin = minMs;
    let effectiveMax = maxMs;

    if (effectiveMin <= 0 && effectiveMax <= 0 && this.deps.repos?.settings) {
      try {
        const minRaw = await this.deps.repos.settings.get('launch_interval_min_sec');
        const maxRaw = await this.deps.repos.settings.get('launch_interval_max_sec');
        const minSec = minRaw ? parseFloat(minRaw) : 10;
        const maxSec = maxRaw ? parseFloat(maxRaw) : 30;
        effectiveMin = Math.round(minSec * 1000);
        effectiveMax = Math.round(maxSec * 1000);
      } catch {
        effectiveMin = 10000;
        effectiveMax = 30000;
      }
    } else if (effectiveMin <= 0 && effectiveMax <= 0) {
      effectiveMin = 10000;
      effectiveMax = 30000;
    }

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.launchQueue;
    this.launchQueue = this.launchQueue.then(() => gate);

    await prev;
    try {
      const now = Date.now();
      const elapsed = now - this.lastLaunchAt;
      const targetDelay =
        effectiveMin <= effectiveMax
          ? effectiveMin + Math.floor(Math.random() * (effectiveMax - effectiveMin + 1))
          : effectiveMin;

      if (elapsed < targetDelay && this.lastLaunchAt > 0) {
        await new Promise((resolve) => setTimeout(resolve, targetDelay - elapsed));
      }
      this.lastLaunchAt = Date.now();
    } finally {
      release();
    }
  }

  async status(): Promise<FleetStatus> {
    const instances = this.deps.supervisor.list();
    const activeInstances = instances.filter(
      (i) => i.state === 'ready' || i.state === 'busy' || i.state === 'starting',
    );
    const runningProfiles = activeInstances.map((i) => i.profileId);

    let leasesActive = 0;
    let forwardersBound = 0;
    let runningRuns = 0;
    let proxiesTotal = 0;
    let proxiesHealthy = 0;

    if (this.deps.repos) {
      try {
        const activeLeases = await this.deps.repos.leases.listActive();
        leasesActive = activeLeases.length;
      } catch {
        // best effort
      }

      try {
        runningRuns = await this.deps.repos.runs.count({ state: 'running' });
      } catch {
        // best effort
      }

      try {
        proxiesTotal = await this.deps.repos.proxies.count();
        proxiesHealthy = await this.deps.repos.proxies.count({ status: 'healthy' });
      } catch {
        // best effort
      }
    }

    if (this.deps.forwarder) {
      forwardersBound = this.deps.forwarder.getBoundCount();
    }

    // Hardware Telemetry - Memory
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const memUsedGb = Number((usedBytes / 1073741824).toFixed(1));
    const memTotalGb = Number((totalBytes / 1073741824).toFixed(1));
    const memUsedPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    // Hardware Telemetry - CPU
    let cpuUsagePct = 0;
    try {
      const cpus = os.cpus();
      if (cpus && cpus.length > 0) {
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
          for (const type in cpu.times) {
            total += (cpu.times as unknown as Record<string, number>)[type] || 0;
          }
          idle += cpu.times.idle;
        }

        if (this.lastCpuTimes) {
          const diffIdle = idle - this.lastCpuTimes.idle;
          const diffTotal = total - this.lastCpuTimes.total;
          if (diffTotal > 0) {
            cpuUsagePct = Math.min(100, Math.max(0, Math.round((1 - diffIdle / diffTotal) * 100)));
          }
        } else if (total > 0) {
          cpuUsagePct = Math.min(100, Math.max(0, Math.round((1 - idle / total) * 100)));
        }
        this.lastCpuTimes = { idle, total };
      }
    } catch {
      cpuUsagePct = 0;
    }

    // Database Telemetry - SQLite file size & WAL mode detection
    let dbSizeFormatted = '0.0 MB';
    try {
      const dbPath = paths(this.deps.config).db;
      let totalDbBytes = 0;
      let hasWal = false;
      if (fs.existsSync(dbPath)) {
        totalDbBytes += fs.statSync(dbPath).size;
      }
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        hasWal = true;
        totalDbBytes += fs.statSync(walPath).size;
      }
      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(shmPath)) {
        totalDbBytes += fs.statSync(shmPath).size;
      }
      const mb = (totalDbBytes / 1048576).toFixed(1);
      dbSizeFormatted = hasWal ? `WAL Mode ${mb} MB` : `${mb} MB`;
    } catch {
      dbSizeFormatted = 'WAL Mode 0.0 MB';
    }

    // JobQueue status
    let queueStatus = 'Idle';
    if (this.deps.queue) {
      if (this.deps.queue.isPaused()) {
        queueStatus = 'Paused';
      } else {
        const active = this.deps.queue.activeCount();
        const queued = this.deps.queue.size();
        if (active > 0) {
          queueStatus = queued > 0 ? `Active (${active}/${active + queued})` : `Active (${active})`;
        } else if (queued > 0) {
          queueStatus = `Queued (${queued})`;
        } else {
          queueStatus = 'Idle';
        }
      }
    }

    return {
      running: activeInstances.length,
      idle: Math.max(0, instances.length - activeInstances.length),
      instances: instances.length,
      activeInstances: activeInstances.length,
      runningProfiles,
      leasesActive,
      forwardersBound,
      runningRuns,
      proxiesTotal,
      proxiesHealthy,
      memUsedGb,
      memTotalGb,
      memUsedPct,
      cpuUsagePct,
      dbSizeFormatted,
      queueStatus,
    };
  }
}
