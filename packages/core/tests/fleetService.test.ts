import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { ProxyBroker } from '../src/proxy/ProxyBroker';
import { JobQueue } from '../src/queue/JobQueue';
import { FleetService } from '../src/services/FleetService';
import type { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';

describe('FleetService (Phase 5)', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let queue: JobQueue;
  let broker: ProxyBroker;
  let mockSupervisor: BrowserSupervisor;
  let fleetService: FleetService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-fleet-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome', {
      resourceLimits: {
        totalFleetRamMb: 2400,
        perInstanceRamMb: 600,
        memoryPressureThresholdPct: 0.85,
      },
    });
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    queue = new JobQueue(db, { concurrency: 5 });
    broker = new ProxyBroker(repos.leases, repos.proxies, config);

    mockSupervisor = {
      list: vi.fn().mockReturnValue([]),
      get: vi.fn(),
      register: vi.fn(),
      stop: vi.fn(),
      stopAll: vi.fn(),
    } as unknown as BrowserSupervisor;

    fleetService = new FleetService({
      supervisor: mockSupervisor,
      broker,
      queue,
      config,
      repos,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('concurrency governor', () => {
    it('gets and updates JobQueue concurrency limit', () => {
      expect(fleetService.getConcurrency()).toBe(5);
      fleetService.setConcurrency(10);
      expect(fleetService.getConcurrency()).toBe(10);
      expect(queue.getConcurrency()).toBe(10);
    });
  });

  describe('canSpawnAnother pre-spawn checks', () => {
    it('approves spawn under normal memory and budget conditions', async () => {
      vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
      vi.spyOn(os, 'freemem').mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB free (50% used)

      const result = await fleetService.canSpawnAnother();
      expect(result.ok).toBe(true);
    });

    it('rejects spawn when system RAM pressure exceeds threshold', async () => {
      vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
      vi.spyOn(os, 'freemem').mockReturnValue(1.5 * 1024 * 1024 * 1024); // 1.5GB free (~90% used > 85%)

      const result = await fleetService.canSpawnAnother();
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('System RAM pressure');
    });

    it('rejects spawn when fleet RAM budget would be exceeded', async () => {
      vi.spyOn(os, 'totalmem').mockReturnValue(32 * 1024 * 1024 * 1024);
      vi.spyOn(os, 'freemem').mockReturnValue(20 * 1024 * 1024 * 1024);

      // 4 active instances * 600MB = 2400MB. Next instance would be 3000MB > 2400MB totalFleetRamMb
      (mockSupervisor.list as any).mockReturnValue([
        { profileId: 'p1', state: 'ready' },
        { profileId: 'p2', state: 'ready' },
        { profileId: 'p3', state: 'ready' },
        { profileId: 'p4', state: 'ready' },
      ]);

      const result = await fleetService.canSpawnAnother();
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Fleet RAM budget would exceed');
    });
  });

  describe('launch stagger coordination', () => {
    it('enforces delay between successive calls', async () => {
      const start = Date.now();
      await fleetService.acquireLaunchStagger(100, 150);
      await fleetService.acquireLaunchStagger(100, 150);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe('fleet status', () => {
    it('reports accurate active instances and profile status', async () => {
      (mockSupervisor.list as any).mockReturnValue([
        { profileId: 'p1', state: 'ready' },
        { profileId: 'p2', state: 'busy' },
      ]);

      const status = await fleetService.status();
      expect(status.instances).toBe(2);
      expect(status.activeInstances).toBe(2);
      expect(status.running).toBe(2);
      expect(status.runningProfiles).toEqual(['p1', 'p2']);
    });
  });
});
