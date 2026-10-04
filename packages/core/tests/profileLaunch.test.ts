import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type Config } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { clearActiveLocalLocks } from '../src/persistence/profileLock';
import { Repos } from '../src/persistence/repos';
import type { DB } from '../src/persistence/schema';
import { ProfileService } from '../src/services/ProfileService';
import { EngineFactory } from '../src/engines/EngineFactory';
import { SupervisorBackedTestEngine } from './helpers/supervisorBackedEngine';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';

describe('Ticket 1.6: ProfileService.launch & stop Orchestration', () => {
  let tempDir: string;
  let config: Config;
  let db: AppDatabase<DB>;
  let repos: Repos;
  let events: EventBus;
  let supervisor: BrowserSupervisor;
  let service: ProfileService;

  let dummyScriptPath: string;
  let failingScriptPath: string;

  const presetId = crypto.randomUUID();
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-launch-test-'));
    clearActiveLocalLocks();

    // Script 1: Simulates Chromium writing DevToolsActivePort with active TCP port
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

    // Script 2: Stalls without writing DevToolsActivePort to test timeout recovery
    failingScriptPath = path.join(tempDir, 'failing-chrome.js');
    fs.writeFileSync(
      failingScriptPath,
      'setInterval(() => {}, 1000); process.on("SIGTERM", () => process.exit(0));',
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
    });

    service = new ProfileService({
      repos,
      supervisor,
      events,
      config,
      engineFactory: new EngineFactory(new SupervisorBackedTestEngine({ supervisor })),
    });

    // Seed preset with valid userAgent length
    await repos.presets.create({
      id: presetId,
      name: 'Windows 11 Preset',
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
    clearActiveLocalLocks();
    await supervisor.stopAll();
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('orchestrates happy path profile launch and stop', async () => {
    const stateEvents: Array<{ profileId: string; state: string }> = [];
    events.on('profile.state_changed', (payload) => {
      stateEvents.push(payload);
    });

    const profile = await service.create({
      name: 'Launch Happy Path',
      presetId,
    });

    expect(profile.state).toBe('idle');

    // Launch
    const { instance, runId } = await service.launch(profile.id, {
      cdpTimeoutMs: 2500,
    });

    expect(runId).toBeDefined();
    expect(instance.profileId).toBe(profile.id);
    expect(instance.state).toBe('ready');
    expect(instance.cdpPort).toBeGreaterThan(0);
    expect(instance.cdpWsUrl).toContain(`ws://127.0.0.1:${instance.cdpPort}`);

    // DB state must be 'running' with last_launched_at recorded
    const launched = await service.get(profile.id);
    expect(launched.state).toBe('running');
    expect(launched.lastLaunchedAt).not.toBeNull();

    // Lock file must be released after launch finishes
    expect(await service.isLocked(profile.id)).toBe(false);

    // Audit record for profile.launch
    const audits = await repos.audit.query(10);
    const launchAudit = audits.find(
      (a) => a.action === 'profile.launch' && a.target === profile.id,
    );
    expect(launchAudit).toBeDefined();

    // Event emission
    expect(stateEvents.some((e) => e.profileId === profile.id && e.state === 'running')).toBe(true);

    // Stop profile
    await service.stop(profile.id);

    const stopped = await service.get(profile.id);
    expect(stopped.state).toBe('idle');
    expect(supervisor.getInstance(profile.id)).toBeUndefined();

    // Audit record for profile.stop
    const stopAudit = (await repos.audit.query(10)).find(
      (a) => a.action === 'profile.stop' && a.target === profile.id,
    );
    expect(stopAudit).toBeDefined();

    // Event emission for idle
    expect(stateEvents.some((e) => e.profileId === profile.id && e.state === 'idle')).toBe(true);
  });

  it('rejects duplicate launch with ALREADY_RUNNING', async () => {
    const profile = await service.create({
      name: 'Double Launch Test',
      presetId,
    });

    // Mark as running in DB
    await service.setState(profile.id, 'running');

    await expect(service.launch(profile.id)).rejects.toMatchObject({
      code: 'ALREADY_RUNNING',
    });
  });

  it('rejects launch of non-existent profile with PROFILE_NOT_FOUND', async () => {
    const missingId = crypto.randomUUID();
    await expect(service.launch(missingId)).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
    });
  });

  it('recovers cleanly on launch failure, marks crashed, emits alert, and releases lock', async () => {
    // Point chromeBinary to failing script that stalls and causes timeout
    config.chromeBinary = failingScriptPath;

    const alertEvents: unknown[] = [];
    events.on('alert.raised', (payload) => {
      alertEvents.push(payload);
    });

    const profile = await service.create({
      name: 'Failing Launch Test',
      presetId,
    });

    // Launch with short timeout of 300ms using failing script
    await expect(
      service.launch(profile.id, { cdpTimeoutMs: 300 }),
    ).rejects.toThrow();

    // DB state must be marked 'crashed'
    const failed = await service.get(profile.id);
    expect(failed.state).toBe('crashed');

    // Alert event emitted
    expect(alertEvents).toHaveLength(1);
    expect((alertEvents[0] as { level: string; title: string }).level).toBe('error');

    // Lock file must not be left dangling
    expect(await service.isLocked(profile.id)).toBe(false);
  });

  it('manages proxy lease acquisition and release during launch and stop', async () => {
    const proxyId = crypto.randomUUID();
    await repos.proxies.create({
      id: proxyId,
      protocol: 'http',
      host: '127.0.0.1',
      port: 8080,
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
      name: 'Proxy Bound Profile',
      presetId,
    });

    const leaseAcquiredEvents: unknown[] = [];
    events.on('lease.acquired', (payload) => {
      leaseAcquiredEvents.push(payload);
    });

    const leaseReleasedEvents: unknown[] = [];
    events.on('lease.released', (payload) => {
      leaseReleasedEvents.push(payload);
    });

    // Launch profile with specified proxy
    await service.launch(profile.id, { cdpTimeoutMs: 2500, proxyId });

    const activeLease = await repos.leases.getActiveForProfile(profile.id);
    expect(activeLease).toBeDefined();
    expect(activeLease?.proxy_id).toBe(proxyId);
    expect(leaseAcquiredEvents).toHaveLength(1);

    // Stop profile
    await service.stop(profile.id);

    // Lease must be released
    const postStopLease = await repos.leases.getActiveForProfile(profile.id);
    expect(postStopLease).toBeUndefined();
    expect(leaseReleasedEvents).toHaveLength(1);
  });

  it('runs multiple profiles concurrently without state bleed or lock collisions', async () => {
    const profile1 = await service.create({
      name: 'Concurrent Profile 1',
      presetId,
    });

    const profile2 = await service.create({
      name: 'Concurrent Profile 2',
      presetId,
    });

    const [res1, res2] = await Promise.all([
      service.launch(profile1.id, { cdpTimeoutMs: 2500 }),
      service.launch(profile2.id, { cdpTimeoutMs: 2500 }),
    ]);

    expect(res1.instance.cdpPort).toBeGreaterThan(0);
    expect(res2.instance.cdpPort).toBeGreaterThan(0);
    // Ephemeral ports must be distinct
    expect(res1.instance.cdpPort).not.toBe(res2.instance.cdpPort);

    expect((await service.get(profile1.id)).state).toBe('running');
    expect((await service.get(profile2.id)).state).toBe('running');

    // Stopping profile 1 does not affect profile 2
    await service.stop(profile1.id);
    expect((await service.get(profile1.id)).state).toBe('idle');
    expect((await service.get(profile2.id)).state).toBe('running');

    // Stopping profile 2
    await service.stop(profile2.id);
    expect((await service.get(profile2.id)).state).toBe('idle');
  });
});
