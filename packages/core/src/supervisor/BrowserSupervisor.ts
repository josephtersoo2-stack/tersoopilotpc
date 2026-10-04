import { spawn as cpSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { LeaseSweepScheduler } from '../proxy/LeaseSweepScheduler';
import { LaunchError } from '../util/errors';

import { buildArgs, type SpawnInput } from './buildArgs';
import { discoverCdpEndpoint, type CdpEndpoint } from './cdpDiscovery';
import type { BrowserSupervisorDeps, Instance } from './types';

export class BrowserSupervisor {
  private readonly instances = new Map<string, Instance>();
  private readonly scheduler: LeaseSweepScheduler | null = null;

  constructor(private readonly deps: BrowserSupervisorDeps) {
    if (this.deps.broker) {
      this.scheduler = new LeaseSweepScheduler({
        broker: this.deps.broker,
        events: this.deps.events,
        config: this.deps.config,
        getActiveLeaseIds: () => {
          const ids: string[] = [];
          for (const inst of this.instances.values()) {
            if (inst.leaseId) ids.push(inst.leaseId);
          }
          return ids;
        },
      });
      this.scheduler.start();
    }
  }


  get(profileId: string): Instance | undefined {
    return this.instances.get(profileId);
  }

  list(): Instance[] {
    return Array.from(this.instances.values());
  }

  has(profileId: string): boolean {
    return this.instances.has(profileId);
  }

  register(profileId: string, instance: Instance): void {
    this.instances.set(profileId, instance);
  }

  async spawn(input: SpawnInput): Promise<Instance> {
    const existing = this.instances.get(input.profileId);
    if (existing && existing.state !== 'crashed') {
      throw new LaunchError(
        'ALREADY_RUNNING',
        `Profile '${input.profileId}' is already running with PID ${existing.pid}`,
        { profileId: input.profileId, pid: existing.pid },
      );
    }

    const chromeBinary = this.deps.config.chromeBinary;
    if (!fs.existsSync(chromeBinary)) {
      throw new LaunchError(
        'SPAWN_FAILED',
        `Chrome binary not found at '${chromeBinary}'`,
        { profileId: input.profileId, chromeBinary },
      );
    }

    const headless = input.headless ?? this.deps.config.headless;
    const args = buildArgs({
      ...input,
      headless,
    });

    const isScript =
      chromeBinary.endsWith('.js') ||
      chromeBinary.endsWith('.cjs') ||
      chromeBinary.endsWith('.mjs');
    const spawnExe = isScript ? process.execPath : chromeBinary;
    const spawnArgs = isScript ? [chromeBinary, ...args] : args;

    let child;
    try {
      child = cpSpawn(spawnExe, spawnArgs, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LaunchError(
        'SPAWN_FAILED',
        `Failed to spawn browser process: ${message}`,
        { profileId: input.profileId, error: message },
      );
    }

    if (!child.pid) {
      throw new LaunchError(
        'SPAWN_FAILED',
        'Browser process spawned without a PID',
        { profileId: input.profileId },
      );
    }

    const instance: Instance = {
      profileId: input.profileId,
      pid: child.pid,
      userDataDir: input.userDataDir,
      forwarderPort: input.forwarderPort,
      cdpPort: null,
      cdpWsUrl: null,
      state: 'starting',
      startedAt: Date.now(),
      memoryMb: 0,
      cpuPct: 0,
      crashCount: 0,
      restartBudget: 3,
      lastHeartbeat: Date.now(),
      worker: null,
      process: child,
      leaseId: input.leaseId ?? null,
    };


    child.on('exit', (code, signal) => {
      void this.handleProcessExit(instance, code, signal);
    });

    child.on('error', () => {
      if (instance.state !== 'stopping') {
        instance.state = 'crashed';
        void this.handleProcessExit(instance, -1, null);
      }
    });

    this.instances.set(input.profileId, instance);
    return Promise.resolve(instance);
  }

  async waitForCdpEndpoint(
    instance: Instance,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<CdpEndpoint> {
    const cdp = await discoverCdpEndpoint({
      profileId: instance.profileId,
      userDataDir: instance.userDataDir,
      timeoutMs: options?.timeoutMs ?? this.deps.config.cdpDiscoveryTimeoutMs,
      pollIntervalMs: options?.pollIntervalMs,
      isProcessAlive: () =>
        Boolean(
          instance.process &&
            !instance.process.killed &&
            instance.process.exitCode === null,
        ),
    });

    instance.cdpPort = cdp.port;
    instance.cdpWsUrl = cdp.wsUrl;
    return cdp;
  }

  private async handleProcessExit(
    instance: Instance,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    try {
      if (instance.state !== 'stopping') {
        instance.state = 'crashed';
        instance.crashCount += 1;

        // Update DB profile state to 'crashed'
        if (this.deps.repos?.profiles) {
          try {
            await this.deps.repos.profiles.setState(instance.profileId, 'crashed');
          } catch {
            // ignore DB write errors during shutdown
          }
        }

        // Release any active lease for this profile so it doesn't leak
        if (this.deps.repos?.leases) {
          try {
            const activeLease = await this.deps.repos.leases.getActiveForProfile(
              instance.profileId,
            );
            if (activeLease) {
              await this.deps.repos.leases.release(activeLease.id, 'expired');
              await this.deps.events.emit('lease.released', {
                leaseId: activeLease.id,
                profileId: instance.profileId,
              });
            }
          } catch {
            // ignore lease release errors
          }
        }

        // Close CDP client session if active
        instance.cdpClient?.close();

        // Release profile lock file if present
        const lockPath = path.join(instance.userDataDir, 'profile.lock');
        if (fs.existsSync(lockPath)) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            // ignore lock release errors
          }
        }

        // Record audit record
        if (this.deps.repos?.audit) {
          try {
            await this.deps.repos.audit.record({
              actor: 'system',
              action: 'profile.crashed',
              target: instance.profileId,
              meta: { code, signal, pid: instance.pid },
            });
          } catch {
            // ignore audit errors
          }
        }

        // Emit crash event and raised alert
        await this.deps.events.emit('profile.state_changed', {
          profileId: instance.profileId,
          state: 'crashed',
        });

        const exitReason =
          code !== null
            ? `exit code ${code}`
            : signal
              ? `signal ${signal}`
              : 'abnormal termination';

        await this.deps.events.emit('alert.raised', {
          level: 'error',
          title: 'Profile crashed',
          message: `Browser process for profile '${instance.profileId}' exited unexpectedly (${exitReason}).`,
        });
      }
    } finally {
      this.instances.delete(instance.profileId);
    }
  }

  async handleSessionClose(profileId: string): Promise<void> {
    this.instances.delete(profileId);
    if (this.deps.repos?.profiles) {
      try {
        await this.deps.repos.profiles.setState(profileId, 'idle');
      } catch {}
    }
    if (this.deps.repos?.leases) {
      try {
        const activeLease = await this.deps.repos.leases.getActiveForProfile(profileId);
        if (activeLease) {
          await this.deps.repos.leases.release(activeLease.id, 'released');
        }
      } catch {}
    }
    try {
      await this.deps.events.emit('profile.state_changed', {
        profileId,
        state: 'idle',
      });
    } catch {}
  }

  async stop(
    profileId: string,
    options?: { graceful?: boolean; timeoutMs?: number },
  ): Promise<void> {
    const instance = this.instances.get(profileId);
    if (!instance) return;

    instance.state = 'stopping';

    if (
      instance.process &&
      !instance.process.killed &&
      instance.process.exitCode === null
    ) {
      if (options?.graceful !== false) {
        try {
          instance.process.kill('SIGTERM');
        } catch {
          // Process may have already exited
        }

        await new Promise<void>((resolve) => {
          const timeoutMs = options?.timeoutMs ?? 1500;
          const timeout = setTimeout(() => {
            if (!instance.process.killed && instance.process.exitCode === null) {
              try {
                instance.process.kill('SIGKILL');
              } catch {
                // ignore
              }
            }
            resolve();
          }, timeoutMs);

          instance.process.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } else {
        try {
          instance.process.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }

    // Close CDP client session if active
    instance.cdpClient?.close();

    // Release profile lock file if present
    if (instance.userDataDir) {
      const lockPath = path.join(instance.userDataDir, 'profile.lock');
      if (fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // ignore
        }
      }
    }

    this.instances.delete(profileId);
  }

  async waitForExit(profileId: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (this.instances.has(profileId)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for profile '${profileId}' to exit`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  getInstance(profileId: string): Instance | undefined {
    return this.instances.get(profileId);
  }

  getScheduler(): LeaseSweepScheduler | null {
    return this.scheduler;
  }

  async stopAll(): Promise<void> {
    this.scheduler?.stop();
    const profileIds = Array.from(this.instances.keys());
    await Promise.all(profileIds.map((id) => this.stop(id)));
  }
}

