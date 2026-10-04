import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthResult } from '@tersoo/contracts';
import { loadConfig } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { type DB } from '../src/persistence/schema';
import type { HealthProbe, ProbeInput } from '../src/proxy/HealthProbe';
import { ProxyBroker } from '../src/proxy/ProxyBroker';
import { MemorySecretDriver, SecretVault } from '../src/secrets/SecretVault';
import { ProfileService } from '../src/services/ProfileService';
import { EngineFactory } from '../src/engines/EngineFactory';
import { SupervisorBackedTestEngine } from './helpers/supervisorBackedEngine';
import { ProxyService } from '../src/services/ProxyService';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { TersooError } from '../src/util/errors';

/**
 * Mock HealthProbe returning deterministic geo and latency telemetry.
 */
class TelemetryHealthProbe implements Partial<HealthProbe> {
  async probe(input: ProbeInput): Promise<HealthResult> {
    return {
      proxyId: input.proxyId,
      ok: true,
      latencyMs: 42,
      exitIp: input.host,
      geo: {
        country: 'US',
        city: 'Ashburn',
        tz: 'America/New_York',
        isp: 'Amazon.com Technologies LLC',
        lat: 39.0438,
        lng: -77.4874,
      },
      webrtcSafe: true,
      dnsSafe: true,
      error: null,
    };
  }
}

describe('Phase 2 Exit Verification: Proxy Vault, LocalForwarder & Broker Lifecycle', () => {
  let tempDir: string;
  let dummyChromePath: string;
  let activeDbs: Array<{ close: () => void }> = [];
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');
  const presetId = 'a1a89047-97d8-4f24-9b55-d3c631c50099';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-phase2-exit-'));
    activeDbs = [];

    // Script to emulate Chrome devtools endpoint creation
    dummyChromePath = path.join(tempDir, 'mock-chrome.js');
    fs.writeFileSync(
      dummyChromePath,
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
    const content = port + '\\n/devtools/browser/test-phase2-uuid\\n';
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
  });

  afterEach(async () => {
    for (const db of activeDbs) {
      db.close();
    }
    activeDbs = [];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function createFixture() {
    const config = loadConfig(tempDir, dummyChromePath, {
      headless: true,
      cdpDiscoveryTimeoutMs: 3000,
      leaseSweepMs: 3600000,
    });
    const db = openDb<DB>(config, rootMigrationsDir);
    activeDbs.push(db);

    const repos = new Repos(db);
    const events = new EventBus();
    const secrets = new SecretVault(new MemorySecretDriver());
    const broker = new ProxyBroker(repos.leases, repos.proxies, config);
    const healthProbe = new TelemetryHealthProbe() as unknown as HealthProbe;

    const supervisor = new BrowserSupervisor({
      config,
      events,
      crosshair: {} as never,
      repos,
      broker,
    });

    const proxyService = new ProxyService({
      repos,
      secrets,
      broker,
      health: healthProbe,
      events,
    });

    const profileService = new ProfileService({
      repos,
      supervisor,
      events,
      config,
      engineFactory: new EngineFactory(new SupervisorBackedTestEngine({ supervisor })),
    });

    // Seed preset for profile launches
    await repos.presets.create({
      id: presetId,
      name: 'Phase 2 Test Preset',
      platform: 'windows',
      bundle: JSON.stringify({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      }),
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    return {
      db,
      repos,
      events,
      secrets,
      broker,
      supervisor,
      proxyService,
      profileService,
    };
  }

  // =========================================================================
  // Exit Criterion 1: Bulk Ingest 100 Proxies in < 1 Second
  // =========================================================================
  it('Exit Criterion 1: imports 100 proxies in < 1s with secret vault isolation and zero plaintext leaks', async () => {
    const { proxyService, repos, secrets } = await createFixture();

    // Generate 100 diverse proxy lines across multiple formats
    const proxyLines: string[] = [];
    for (let i = 1; i <= 100; i++) {
      if (i % 4 === 0) {
        proxyLines.push(`socks5://agent_${i}:passSecret_${i}@192.168.1.${i}:1080`);
      } else if (i % 4 === 1) {
        proxyLines.push(`192.168.2.${i}:8080:agent_${i}:passSecret_${i}`);
      } else if (i % 4 === 2) {
        proxyLines.push(`agent_${i}:passSecret_${i}@192.168.3.${i}:3128`);
      } else {
        proxyLines.push(`https://192.168.4.${i}:8443`);
      }
    }

    const bulkText = proxyLines.join('\n');

    // Benchmark ingest speed
    const start = performance.now();
    const report = await proxyService.importBulk({ text: bulkText });
    const durationMs = performance.now() - start;

    expect(durationMs).toBeLessThan(1000);
    expect(report.imported).toBe(100);
    expect(report.errors).toHaveLength(0);

    // Verify all 100 proxies are properly stored in the database
    const proxiesInDb = await repos.proxies.list();
    expect(proxiesInDb).toHaveLength(100);

    // Verify SecretVault isolation: no raw passwords in SQLite database
    for (const proxy of proxiesInDb) {
      if (proxy.username) {
        expect(proxy.password_ref).not.toBeNull();
        expect(proxy.password_ref).toMatch(/^tersoopilot\/proxy\/.*\/password$/);

        // Retrieve secret through vault to prove accessibility
        const decryptedPassword = await secrets.get(proxy.password_ref!);
        expect(decryptedPassword).toMatch(/^passSecret_/);
      }
    }
  });

  // =========================================================================
  // Exit Criterion 2: Health Probing Returns Geo & Latency Telemetry
  // =========================================================================
  it('Exit Criterion 2: health check returns geo (country, city, timezone, ISP, lat/lng) + latency and updates DB', async () => {
    const { proxyService, repos, events } = await createFixture();

    const created = await proxyService.create({
      protocol: 'socks5',
      host: '198.51.100.42',
      port: 1080,
      username: 'telemetry_user',
      password: 'telemetry_password',
    });

    const healthSpy = vi.fn();
    events.on('proxy.health_changed', healthSpy);

    // Probe proxy health
    const health = await proxyService.check(created.id);

    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBe(42);
    expect(health.exitIp).toBe('198.51.100.42');
    expect(health.geo).toEqual({
      country: 'US',
      city: 'Ashburn',
      tz: 'America/New_York',
      isp: 'Amazon.com Technologies LLC',
      lat: 39.0438,
      lng: -77.4874,
    });
    expect(health.webrtcSafe).toBe(true);
    expect(health.dnsSafe).toBe(true);
    expect(health.error).toBeNull();

    // Verify DB record was updated with geo and latency telemetry
    const updatedProxy = await repos.proxies.getById(created.id);
    expect(updatedProxy).toBeDefined();
    expect(updatedProxy?.status).toBe('healthy');
    expect(updatedProxy?.last_latency_ms).toBe(42);
    expect(updatedProxy?.geo_country).toBe('US');
    expect(updatedProxy?.geo_city).toBe('Ashburn');
    expect(updatedProxy?.geo_tz).toBe('America/New_York');
    expect(updatedProxy?.geo_isp).toBe('Amazon.com Technologies LLC');
    expect(updatedProxy?.last_checked_at).toBeGreaterThan(0);

    // Verify event emission
    expect(healthSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        proxyId: created.id,
        status: 'healthy',
      }),
    );
  });

  // =========================================================================
  // Exit Criterion 3: Two Profiles Cannot Acquire Same Proxy Concurrently
  // =========================================================================
  it('Exit Criterion 3: lease mutual exclusion prevents two profiles from acquiring the same proxy concurrently', async () => {
    const { proxyService, repos, profileService, db } = await createFixture();

    const proxy1 = await proxyService.create({
      protocol: 'socks5',
      host: '192.168.10.1',
      port: 1080,
    });
    // Mark as healthy
    await repos.proxies.updateStatus(proxy1.id, 'healthy');

    const proxy2 = await proxyService.create({
      protocol: 'socks5',
      host: '192.168.10.2',
      port: 1080,
    });
    await repos.proxies.updateStatus(proxy2.id, 'healthy');

    const profileA = await profileService.create({
      name: 'Profile Alpha',
      presetId,
    });

    const profileB = await profileService.create({
      name: 'Profile Beta',
      presetId,
    });

    // Profile Alpha acquires Proxy 1
    const leaseA = await proxyService.assign({
      profileId: profileA.id,
      proxyId: proxy1.id,
      strategy: 'manual',
    });
    expect(leaseA.proxyId).toBe(proxy1.id);
    expect(leaseA.state).toBe('active');

    // Profile Beta attempts to acquire Proxy 1 (must fail with LEASE_CONFLICT)
    await expect(
      proxyService.assign({
        profileId: profileB.id,
        proxyId: proxy1.id,
        strategy: 'manual',
      }),
    ).rejects.toThrow(TersooError);

    // Verify DB level partial unique index enforcement:
    // Attempting a direct raw insert of a second active lease on proxy1 fails at SQLite level
    await expect(
      db
        .insertInto('proxy_leases')
        .values({
          id: 'lse-duplicate-test',
          profile_id: profileB.id,
          proxy_id: proxy1.id,
          state: 'active',
          acquired_at: Date.now(),
          expires_at: Date.now() + 60000,
          heartbeat_at: Date.now(),
        })
        .execute(),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    // Profile Beta acquires random proxy -> must pick proxy2, NOT proxy1
    const leaseB = await proxyService.assign({
      profileId: profileB.id,
      strategy: 'random',
    });
    expect(leaseB.proxyId).toBe(proxy2.id);
    expect(leaseB.proxyId).not.toBe(proxy1.id);
  });

  // =========================================================================
  // Exit Criterion 4: Proxy Lease Released on Profile Stop or Process Crash
  // =========================================================================
  it('Exit Criterion 4: proxy lease is automatically released on profile stop and process crash', async () => {
    const { proxyService, repos, profileService, supervisor } = await createFixture();

    const proxy = await proxyService.create({
      protocol: 'http',
      host: '10.0.0.99',
      port: 8080,
    });
    await repos.proxies.updateHealth(proxy.id, {
      status: 'healthy',
      exit_ip: '10.0.0.99',
      geo_country: 'US',
      geo_city: 'New York',
      geo_tz: 'America/New_York',
    });

    const profile = await profileService.create({
      name: 'Crash & Stop Test Profile',
      presetId,
    });

    // --- Part A: Profile Stop releases lease ---
    // Acquire lease
    await proxyService.assign({
      profileId: profile.id,
      proxyId: proxy.id,
      strategy: 'manual',
    });

    // Launch profile
    await profileService.launch(profile.id);
    expect(supervisor.has(profile.id)).toBe(true);

    // Stop profile normally
    await profileService.stop(profile.id);
    expect(supervisor.has(profile.id)).toBe(false);

    // Verify lease was released with state 'released'
    const leasesAfterStop = await repos.leases.getActiveForProfile(profile.id);
    expect(leasesAfterStop).toBeUndefined();

    // Verify proxy can now be acquired again immediately
    const reacquiredLease = await proxyService.assign({
      profileId: profile.id,
      proxyId: proxy.id,
      strategy: 'manual',
    });
    expect(reacquiredLease.state).toBe('active');

    // --- Part B: Process Crash releases lease ---
    // Launch profile again with active lease
    await profileService.launch(profile.id);
    const instance = supervisor.getInstance(profile.id);
    expect(instance).toBeDefined();

    // Forcibly crash child process
    instance!.process.kill('SIGKILL');
    await supervisor.waitForExit(profile.id);

    // Verify supervisor cleaned up instance
    expect(supervisor.has(profile.id)).toBe(false);

    // Verify DB profile state marked as crashed
    const crashedProfile = await repos.profiles.getById(profile.id);
    expect(crashedProfile?.state).toBe('crashed');

    // Verify proxy lease was automatically released so it doesn't leak
    const activeLeaseAfterCrash = await repos.leases.getActiveForProfile(profile.id);
    expect(activeLeaseAfterCrash).toBeUndefined();

    // Verify the proxy is returned to the pool and can be acquired by a new profile
    const profile2 = await profileService.create({
      name: 'Successor Profile',
      presetId,
    });

    const successorLease = await proxyService.assign({
      profileId: profile2.id,
      proxyId: proxy.id,
      strategy: 'manual',
    });
    expect(successorLease.state).toBe('active');
    expect(successorLease.proxyId).toBe(proxy.id);
  });
});
