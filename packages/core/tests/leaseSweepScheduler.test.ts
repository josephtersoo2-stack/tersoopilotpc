import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { CrosshairWorker } from '../src/crosshair/CrosshairWorker';
import { EventBus } from '../src/events/EventBus';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { LeaseSweepScheduler } from '../src/proxy/LeaseSweepScheduler';
import { ProxyBroker } from '../src/proxy/ProxyBroker';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';

describe('Ticket 2.6: LeaseSweepScheduler & Supervisor Integration', () => {
  let tempDir: string;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-sweep-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function setup() {
    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    const repos = new Repos(db);
    const events = new EventBus();
    const broker = new ProxyBroker(repos.leases, repos.proxies, config);

    // Seed preset & profile & proxy
    await repos.presets.create({
      id: 'pre-1',
      name: 'Default',
      platform: 'windows',
      bundle: '{}',
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    await repos.profiles.create({
      id: 'prof-s1',
      name: 'Profile S1',
      tags: '[]',
      preset_id: 'pre-1',
      fingerprint_seed: 'seed1',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'ps1'),
      state: 'idle',
      notes: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_launched_at: null,
    });

    const now = Date.now();
    await repos.proxies.create({
      id: 'prx-s1',
      protocol: 'socks5',
      host: '127.0.0.1',
      port: 1080,
      username: null,
      password_ref: null,
      geo_country: 'US',
      geo_city: 'Austin',
      geo_tz: 'America/Chicago',
      geo_isp: 'ISP',
      geo_lat: 30.2672,
      geo_lng: -97.7431,
      exit_ip: '127.0.0.1',
      last_checked_at: now,
      last_latency_ms: 45,
      status: 'healthy',
      status_reason: null,
      created_at: now,
      updated_at: now,
    });

    return { config, db, repos, events, broker };
  }

  it('sweeps expired leases and emits alert.raised event', async () => {
    const { db, repos, events, broker } = await setup();

    // Acquire lease that expired 5 seconds ago
    await repos.leases.acquire('prof-s1', 'prx-s1', -5000);

    let emittedAlert: { level: string; title: string; message: string } | null = null;
    events.on('alert.raised', (payload) => {
      emittedAlert = payload;
    });

    const scheduler = new LeaseSweepScheduler({ broker, events });
    const swept = await scheduler.runSweep();

    expect(swept).toBe(1);
    expect(emittedAlert).toMatchObject({
      title: 'Leases Swept',
      message: expect.stringContaining('1 expired proxy lease'),
    });


    // Lease in DB is marked expired
    const active = await repos.leases.getActiveForProfile('prof-s1');
    expect(active).toBeUndefined();

    db.close();
  });

  it('heartbeats active leases extending their expiration', async () => {
    const { db, repos, events, broker } = await setup();

    const lease = await repos.leases.acquire('prof-s1', 'prx-s1', 10000);
    expect(lease).not.toBeNull();
    const initialExpires = lease!.expiresAt;

    await new Promise((r) => setTimeout(r, 10));

    const scheduler = new LeaseSweepScheduler({
      broker,
      events,
      getActiveLeaseIds: () => [lease!.id],
    });

    await scheduler.runHeartbeat();

    const active = await repos.leases.getActiveForProfile('prof-s1');
    expect(active?.expires_at).toBeGreaterThan(initialExpires);

    db.close();
  });

  it('manages timer lifecycle cleanly with start and stop', () => {
    const events = new EventBus();
    const broker = {} as unknown as ProxyBroker;

    const scheduler = new LeaseSweepScheduler({
      broker,
      events,
      sweepIntervalMs: 1000,
      heartbeatIntervalMs: 500,
      getActiveLeaseIds: () => [],
    });

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('integrates with BrowserSupervisor starting scheduler on boot and stopping on stopAll', async () => {
    const { config, db, repos, events, broker } = await setup();
    const crosshair = new CrosshairWorker({ events, anchors: null as never });

    const supervisor = new BrowserSupervisor({
      config,
      events,
      crosshair,
      repos,
      broker,
    });

    const scheduler = supervisor.getScheduler();
    expect(scheduler).not.toBeNull();
    expect(scheduler?.isRunning()).toBe(true);

    await supervisor.stopAll();
    expect(scheduler?.isRunning()).toBe(false);

    db.close();
  });
});
