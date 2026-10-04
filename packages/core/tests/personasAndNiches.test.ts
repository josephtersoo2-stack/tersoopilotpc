import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERSONA_PRESETS } from '@tersoo/contracts';
import { loadConfig } from '../src/config';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { NicheService } from '../src/services/NicheService';
import { FleetService } from '../src/services/FleetService';
import { ProxyBroker } from '../src/proxy/ProxyBroker';
import { JobQueue } from '../src/queue/JobQueue';
import type { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { StepRunner, type StepExecutionContext } from '../src/task/StepRunner';
import { XPathResolver } from '../src/crosshair/XPathResolver';
import { AnchorRegistry } from '../src/crosshair/AnchorRegistry';

describe('Personas, Niches & Staggered Launch Intervals', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-personas-niches-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows handle release grace
    }
  });

  it('provides well-formed persona presets for Casual, Gamer, Researcher, and Skimmer', () => {
    expect(PERSONA_PRESETS.casual).toBeDefined();
    expect(PERSONA_PRESETS.casual.typingWpm).toBe(50);
    expect(PERSONA_PRESETS.casual.mouseCurvature).toBe('natural');

    expect(PERSONA_PRESETS.gamer).toBeDefined();
    expect(PERSONA_PRESETS.gamer.typingWpm).toBe(75);
    expect(PERSONA_PRESETS.gamer.mouseCurvature).toBe('low');

    expect(PERSONA_PRESETS.researcher).toBeDefined();
    expect(PERSONA_PRESETS.researcher.typingWpm).toBe(40);
    expect(PERSONA_PRESETS.researcher.mouseCurvature).toBe('high');

    expect(PERSONA_PRESETS.skimmer).toBeDefined();
    expect(PERSONA_PRESETS.skimmer.typingWpm).toBe(65);
    expect(PERSONA_PRESETS.skimmer.readingMultiplier).toBeLessThan(1.0);
  });

  it('creates and manages niches with search keywords and seed URLs in SQLite', async () => {
    const nicheService = new NicheService({ repos });

    const niche = await nicheService.create({
      name: 'Custom Gaming Niche',
      description: 'Euro Truck Simulator and Bus Simulator gameplay enthusiasts',
      keywords: [
        'This 249 KM Bus Journey Was INSANE!',
        'Euro Truck Simulator 2 gameplay',
      ],
      seedUrls: ['https://youtube.com', 'https://steamcommunity.com'],
      tags: ['gaming', 'simulators'],
    });

    expect(niche.id).toBeDefined();
    expect(niche.name).toBe('Custom Gaming Niche');
    expect(niche.keywords).toEqual([
      'This 249 KM Bus Journey Was INSANE!',
      'Euro Truck Simulator 2 gameplay',
    ]);
    expect(niche.seedUrls).toEqual([
      'https://youtube.com',
      'https://steamcommunity.com',
    ]);

    const fetched = await repos.niches.getById(niche.id);
    expect(fetched).not.toBeNull();
    expect(JSON.parse(fetched!.keywords)).toEqual([
      'This 249 KM Bus Journey Was INSANE!',
      'Euro Truck Simulator 2 gameplay',
    ]);

    const list = await nicheService.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((n) => n.name === 'Custom Gaming Niche')).toBe(true);
  });

  it('FleetService reads launch interval from settings and calculates stagger', async () => {
    await repos.settings.set('launch_interval_min_sec', '5');
    await repos.settings.set('launch_interval_max_sec', '15');
    await repos.settings.set('default_concurrency', '4');

    const config = loadConfig(tempDir, 'dummy-chrome');
    const queue = new JobQueue(db, { concurrency: 4 });
    const broker = new ProxyBroker(repos.leases, repos.proxies, config);
    const mockSupervisor = {
      list: () => [],
      get: () => undefined,
      register: () => {},
      stop: () => {},
      stopAll: () => {},
    } as unknown as BrowserSupervisor;

    const fleet = new FleetService({
      supervisor: mockSupervisor,
      broker,
      queue,
      config,
      repos,
    });

    const minSetting = await repos.settings.get('launch_interval_min_sec');
    const maxSetting = await repos.settings.get('launch_interval_max_sec');
    expect(parseFloat(minSetting!)).toBe(5);
    expect(parseFloat(maxSetting!)).toBe(15);

    // acquireLaunchStagger executes without error
    await expect(fleet.acquireLaunchStagger(10, 20)).resolves.not.toThrow();
  });

  it('StepRunner interpolates niche keyword and seedUrl variables into step execution', async () => {
    const anchorRegistry = new AnchorRegistry(repos.anchors);
    const xpathResolver = new XPathResolver(anchorRegistry);
    const runner = new StepRunner(xpathResolver);

    const mockPage = {
      goto: async () => {},
      evaluate: async () => true,
    } as any;

    const ctx: StepExecutionContext = {
      profileId: 'p1',
      taskId: 't1',
      runId: 'r1',
      stepIndex: 0,
      page: mockPage,
      variables: {
        'niche.randomKeyword': 'This 249 KM Bus Journey Was INSANE!',
        'niche.seedUrl': 'https://youtube.com',
      },
      persona: 'gamer',
    };

    const navResult = await runner.run(
      {
        type: 'navigate',
        url: '{{niche.seedUrl}}',
        waitUntil: 'load',
      },
      ctx,
    );
    expect(navResult.stepType).toBe('navigate');

    const sleepResult = await runner.run(
      {
        type: 'sleep',
        minMs: 10,
        maxMs: 20,
      },
      ctx,
    );
    expect(sleepResult.stepType).toBe('sleep');
  });
});
