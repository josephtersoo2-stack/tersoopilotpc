import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig, type Config } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import type { DB } from '../src/persistence/schema';
import { ProfileService } from '../src/services/ProfileService';
import { EngineFactory } from '../src/engines/EngineFactory';
import { SupervisorBackedTestEngine } from './helpers/supervisorBackedEngine';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { clearActiveLocalLocks } from '../src/persistence/profileLock';

describe('Ticket 1.8: Stop Profile & Crash Detection', () => {
  let tempDir: string;
  let config: Config;
  let db: AppDatabase<DB>;
  let repos: Repos;
  let events: EventBus;
  let supervisor: BrowserSupervisor;
  let service: ProfileService;

  let dummyScriptPath: string;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');
  const presetId = crypto.randomUUID();

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-crash-test-'));
    clearActiveLocalLocks();

    dummyScriptPath = path.join(tempDir, 'dummy-chrome.js');
    fs.writeFileSync(
      dummyScriptPath,
      `
const net = require('net');
const fs = require('fs');
const path = require('path');

const server = net.createServer().listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const arg = process.argv.find(a => a.startsWith('--user-data-dir='));
  if (arg) {
    const rawDir = arg.slice('--user-data-dir='.length);
    fs.mkdirSync(rawDir, { recursive: true });
    const content = port + '\\n/devtools/browser/test-uuid\\n';
    fs.writeFileSync(path.join(rawDir, 'DevToolsActivePort'), content);
    try {
      fs.writeFileSync(path.join(path.dirname(rawDir), 'DevToolsActivePort'), content);
    } catch (e) {}
  }
});
setInterval(() => {}, 1000);
process.on('SIGTERM', () => { server.close(); process.exit(0); });
`,
      'utf8',
    );

    config = loadConfig(tempDir, dummyScriptPath, {
      headless: true,
      cdpDiscoveryTimeoutMs: 3000,
    });
    db = openDb<DB>(config, rootMigrationsDir);
    repos = new Repos(db);
    events = new EventBus();

    supervisor = new BrowserSupervisor({
      config,
      events,
      crosshair: {} as never,
      repos,
    });

    service = new ProfileService({
      repos,
      supervisor,
      events,
      config,
      engineFactory: new EngineFactory(new SupervisorBackedTestEngine({ supervisor })),
    });

    await repos.presets.create({
      id: presetId,
      name: 'Test Windows Preset',
      platform: 'windows',
      bundle: JSON.stringify({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      }),
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    });
  });

  afterEach(async () => {
    await supervisor.stopAll();
    clearActiveLocalLocks();
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('stops a profile gracefully without triggering crash alerts or marking as crashed', async () => {
    const profile = await service.create({
      name: 'Graceful Stop Profile',
      presetId,
    });

    const stateChangedSpy = vi.fn();
    const alertSpy = vi.fn();
    events.on('profile.state_changed', stateChangedSpy);
    events.on('alert.raised', alertSpy);

    // Launch profile
    await service.launch(profile.id);
    expect(supervisor.has(profile.id)).toBe(true);

    const launchedRow = await repos.profiles.getById(profile.id);
    expect(launchedRow?.state).toBe('running');

    // Stop profile gracefully
    await service.stop(profile.id);

    expect(supervisor.has(profile.id)).toBe(false);
    const stoppedRow = await repos.profiles.getById(profile.id);
    expect(stoppedRow?.state).toBe('idle');

    // Alert should NOT be raised for normal stop
    expect(alertSpy).not.toHaveBeenCalled();

    // Verify lock file was removed
    const lockPath = path.join(profile.userDataDir, 'profile.lock');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('detects abnormal process termination, marks DB state as crashed, and raises an alert', async () => {
    const profile = await service.create({
      name: 'Crash Test Profile',
      presetId,
    });

    const stateChangedSpy = vi.fn();
    const alertSpy = vi.fn();
    events.on('profile.state_changed', stateChangedSpy);
    events.on('alert.raised', alertSpy);

    await service.launch(profile.id);
    const instance = supervisor.get(profile.id);
    expect(instance).toBeDefined();

    // Create lock file to verify cleanup on crash
    const lockPath = path.join(profile.userDataDir, 'profile.lock');
    fs.writeFileSync(lockPath, 'test-pid-lock', 'utf8');
    expect(fs.existsSync(lockPath)).toBe(true);

    // Forcibly kill the spawned child process to simulate an unexpected crash
    instance!.process.kill('SIGKILL');
    await supervisor.waitForExit(profile.id);

    // Allow async exit handler to complete DB writes
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify supervisor removed instance
    expect(supervisor.has(profile.id)).toBe(false);

    // Verify DB state transitioned to 'crashed'
    const crashedRow = await repos.profiles.getById(profile.id);
    expect(crashedRow?.state).toBe('crashed');

    // Verify profile lock file was cleaned up on crash
    expect(fs.existsSync(lockPath)).toBe(false);

    // Verify state changed event was emitted with state: 'crashed'
    expect(stateChangedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: profile.id,
        state: 'crashed',
      }),
    );

    // Verify alert was raised with level: 'error'
    expect(alertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        title: 'Profile crashed',
      }),
    );

    // Verify audit log captured profile.crashed
    const auditRows = await repos.audit.query();
    const crashAudit = auditRows.find(
      (a) => a.action === 'profile.crashed' && a.target === profile.id,
    );
    expect(crashAudit).toBeDefined();
  });

  it('releases active proxy lease when process crashes unexpectedly', async () => {
    const proxyId = crypto.randomUUID();
    await repos.proxies.create({
      id: proxyId,
      protocol: 'socks5',
      host: '127.0.0.1',
      port: 9050,
      username: null,
      password_ref: null,
      geo_country: 'US',
      geo_city: 'New York',
      geo_tz: 'America/New_York',
      geo_isp: 'ISP',
      geo_lat: 40.71,
      geo_lng: -74.0,
      exit_ip: '1.2.3.4',
      last_checked_at: Date.now(),
      last_latency_ms: 20,
      status: 'healthy',
      status_reason: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const profile = await service.create({
      name: 'Proxy Crash Profile',
      presetId,
      proxyId,
    });

    const leaseReleasedSpy = vi.fn();
    events.on('lease.released', leaseReleasedSpy);

    await service.launch(profile.id);

    // Verify lease is active
    const activeLease = await repos.leases.getActiveForProfile(profile.id);
    expect(activeLease).toBeDefined();
    expect(activeLease?.proxy_id).toBe(proxyId);

    // Forcibly kill process
    const instance = supervisor.get(profile.id);
    instance!.process.kill('SIGKILL');
    await supervisor.waitForExit(profile.id);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Active lease must be expired / released
    const leaseAfterCrash = await repos.leases.getActiveForProfile(profile.id);
    expect(leaseAfterCrash).toBeUndefined();

    // lease.released event must be emitted
    expect(leaseReleasedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: profile.id,
        leaseId: activeLease!.id,
      }),
    );
  });

  it('isolates crashes across concurrent profiles without state bleed', async () => {
    const profileA = await service.create({
      name: 'Concurrent Profile A',
      presetId,
    });
    const profileB = await service.create({
      name: 'Concurrent Profile B',
      presetId,
    });

    await service.launch(profileA.id);
    await service.launch(profileB.id);

    expect(supervisor.has(profileA.id)).toBe(true);
    expect(supervisor.has(profileB.id)).toBe(true);

    // Kill only Profile A
    const instanceA = supervisor.get(profileA.id);
    instanceA!.process.kill('SIGKILL');
    await supervisor.waitForExit(profileA.id);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Profile A must be crashed
    expect(supervisor.has(profileA.id)).toBe(false);
    const rowA = await repos.profiles.getById(profileA.id);
    expect(rowA?.state).toBe('crashed');

    // Profile B must remain completely intact and running
    expect(supervisor.has(profileB.id)).toBe(true);
    const rowB = await repos.profiles.getById(profileB.id);
    expect(rowB?.state).toBe('running');

    // Stop Profile B normally
    await service.stop(profileB.id);
    expect(supervisor.has(profileB.id)).toBe(false);
    const stoppedB = await repos.profiles.getById(profileB.id);
    expect(stoppedB?.state).toBe('idle');
  });

  it('stops all running instances concurrently and cleans up state', async () => {
    const p1 = await service.create({ name: 'StopAll 1', presetId });
    const p2 = await service.create({ name: 'StopAll 2', presetId });

    await service.launch(p1.id);
    await service.launch(p2.id);

    expect(supervisor.list()).toHaveLength(2);

    await supervisor.stopAll();

    expect(supervisor.list()).toHaveLength(0);
    expect(supervisor.has(p1.id)).toBe(false);
    expect(supervisor.has(p2.id)).toBe(false);
  });
});
