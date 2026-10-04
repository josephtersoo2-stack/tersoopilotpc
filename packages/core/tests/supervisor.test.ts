import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type Config } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import { buildArgs, type SpawnInput } from '../src/supervisor/buildArgs';
import { LaunchError } from '../src/util/errors';

describe('Ticket 1.3: BrowserSupervisor.spawn & buildArgs', () => {
  let tempDir: string;
  let config: Config;
  let events: EventBus;
  let supervisor: BrowserSupervisor;
  let dummyScriptPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-supervisor-test-'));

    // Create a long-lived Node.js dummy script to simulate a browser process
    dummyScriptPath = path.join(tempDir, 'dummy-browser.js');
    fs.writeFileSync(
      dummyScriptPath,
      'setInterval(() => {}, 1000); process.on("SIGTERM", () => process.exit(0));',
    );

    // Use current node binary so spawn actually runs real OS child processes
    config = loadConfig(tempDir, process.execPath, { headless: true });
    events = new EventBus();
    supervisor = new BrowserSupervisor({
      config,
      events,
      crosshair: {} as never,
    });
  });

  afterEach(async () => {
    await supervisor.stopAll();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('buildArgs', () => {
    it('generates all authoritative Chromium launch flags according to Appendix A', () => {
      const input: SpawnInput = {
        profileId: 'p-1',
        userDataDir: path.join(tempDir, 'profiles', 'p-1'),
        forwarderPort: 19842,
        headless: true,
      };

      const args = buildArgs(input);

      // Slashes normalized for Chrome CLI args
      const expectedNormalizedDir = input.userDataDir.replace(/\\/g, '/');

      expect(args).toContain(`--user-data-dir=${expectedNormalizedDir}/chromium`);
      expect(args).toContain(`--disk-cache-dir=${expectedNormalizedDir}/cache`);
      expect(args).toContain(`--crash-dumps-dir=${expectedNormalizedDir}/crash`);
      expect(args).toContain('--remote-debugging-port=0');
      expect(args).toContain('--remote-debugging-address=127.0.0.1');
      // The wildcard origin allowance must NOT be set: it would let any origin
      // that learns the debugging port attach to this profile's DevTools.
      expect(args.some((a) => a.startsWith('--remote-allow-origins'))).toBe(false);
      expect(args).toContain(`--proxy-server=socks5://127.0.0.1:19842`);
      expect(args).toContain('--proxy-bypass-list=<-loopback>');
      expect(args).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
      expect(args).toContain('--disable-features=WebRtcHideLocalIpsWithMdns');
      expect(args).toContain('--disable-blink-features=AutomationControlled');
      expect(args).toContain('--disable-renderer-backgrounding');
      expect(args).toContain('--disable-background-timer-throttling');
      expect(args).toContain('--disable-backgrounding-occluded-windows');
      expect(args).toContain('--no-first-run');
      expect(args).toContain('--no-default-browser-check');
      expect(args).toContain('--password-store=basic');
      expect(args).toContain('--use-mock-keychain');
      expect(args).toContain('--disable-component-update');
      expect(args).toContain('--disable-domain-reliability');
      expect(args).toContain('--disable-sync');
      expect(args).toContain('--metrics-recording-only');
      expect(args).toContain('--mute-audio');
      expect(args).toContain('--headless=new');

      // Target URL must always be the final argument
      expect(args[args.length - 1]).toBe('about:blank');
    });

    it('omits --headless=new when headless is false', () => {
      const input: SpawnInput = {
        profileId: 'p-2',
        userDataDir: path.join(tempDir, 'profiles', 'p-2'),
        forwarderPort: 1080,
        headless: false,
      };

      const args = buildArgs(input);
      expect(args).not.toContain('--headless=new');
      expect(args[args.length - 1]).toBe('about:blank');
    });

    it('appends additionalArgs before about:blank', () => {
      const input: SpawnInput = {
        profileId: 'p-3',
        userDataDir: path.join(tempDir, 'profiles', 'p-3'),
        forwarderPort: 1080,
        additionalArgs: ['--window-size=1280,720', '--lang=en-US'],
      };

      const args = buildArgs(input);
      expect(args).toContain('--window-size=1280,720');
      expect(args).toContain('--lang=en-US');
      expect(args[args.length - 1]).toBe('about:blank');
    });

    it('omits --proxy-server and --proxy-bypass-list when forwarderPort is 0', () => {
      const input: SpawnInput = {
        profileId: 'p-direct',
        userDataDir: path.join(tempDir, 'profiles', 'p-direct'),
        forwarderPort: 0,
      };

      const args = buildArgs(input);
      expect(args.some((a) => a.startsWith('--proxy-server='))).toBe(false);
      expect(args.includes('--proxy-bypass-list=<-loopback>')).toBe(false);
    });
  });

  describe('BrowserSupervisor integration', () => {
    it('spawns real OS child process, assigns PID, and tracks instance', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, 'profiles', profileId);

      const instance = await supervisor.spawn({
        profileId,
        userDataDir: profileDir,
        forwarderPort: 1080,
        additionalArgs: [dummyScriptPath],
      });

      expect(instance).toBeDefined();
      expect(instance.profileId).toBe(profileId);
      expect(typeof instance.pid).toBe('number');
      expect(instance.pid).toBeGreaterThan(0);
      expect(instance.state).toBe('starting');
      expect(instance.process).toBeDefined();
      expect(instance.process.killed).toBe(false);

      // Verify supervisor tracking methods
      expect(supervisor.has(profileId)).toBe(true);
      expect(supervisor.get(profileId)?.pid).toBe(instance.pid);
      expect(supervisor.list()).toHaveLength(1);
    });

    it('rejects spawning if profile is already running with ALREADY_RUNNING', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, 'profiles', profileId);

      await supervisor.spawn({
        profileId,
        userDataDir: profileDir,
        forwarderPort: 1080,
        additionalArgs: [dummyScriptPath],
      });

      await expect(
        supervisor.spawn({
          profileId,
          userDataDir: profileDir,
          forwarderPort: 1080,
          additionalArgs: [dummyScriptPath],
        }),
      ).rejects.toThrow(LaunchError);

      try {
        await supervisor.spawn({
          profileId,
          userDataDir: profileDir,
          forwarderPort: 1080,
          additionalArgs: [dummyScriptPath],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(LaunchError);
        expect((err as LaunchError).code).toBe('ALREADY_RUNNING');
      }
    });

    it('throws SPAWN_FAILED if Chrome binary path does not exist', async () => {
      const brokenConfig = loadConfig(tempDir, path.join(tempDir, 'non-existent-chrome.exe'));
      const brokenSupervisor = new BrowserSupervisor({
        config: brokenConfig,
        events,
        crosshair: {} as never,
      });

      const profileId = crypto.randomUUID();
      await expect(
        brokenSupervisor.spawn({
          profileId,
          userDataDir: path.join(tempDir, profileId),
          forwarderPort: 1080,
        }),
      ).rejects.toThrow(LaunchError);

      try {
        await brokenSupervisor.spawn({
          profileId,
          userDataDir: path.join(tempDir, profileId),
          forwarderPort: 1080,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(LaunchError);
        expect((err as LaunchError).code).toBe('SPAWN_FAILED');
      }
    });

    it('stops spawned process cleanly and removes instance from registry', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, 'profiles', profileId);

      const instance = await supervisor.spawn({
        profileId,
        userDataDir: profileDir,
        forwarderPort: 1080,
        additionalArgs: [dummyScriptPath],
      });

      expect(supervisor.has(profileId)).toBe(true);

      await supervisor.stop(profileId);

      expect(supervisor.has(profileId)).toBe(false);
      expect(supervisor.get(profileId)).toBeUndefined();
      expect(supervisor.list()).toHaveLength(0);
      expect(instance.process.killed).toBe(true);
    });

    it('stops all running instances concurrently with stopAll', async () => {
      const p1 = crypto.randomUUID();
      const p2 = crypto.randomUUID();

      await supervisor.spawn({
        profileId: p1,
        userDataDir: path.join(tempDir, 'p1'),
        forwarderPort: 1081,
        additionalArgs: [dummyScriptPath],
      });

      await supervisor.spawn({
        profileId: p2,
        userDataDir: path.join(tempDir, 'p2'),
        forwarderPort: 1082,
        additionalArgs: [dummyScriptPath],
      });

      expect(supervisor.list()).toHaveLength(2);

      await supervisor.stopAll();

      expect(supervisor.list()).toHaveLength(0);
      expect(supervisor.has(p1)).toBe(false);
      expect(supervisor.has(p2)).toBe(false);
    });
  });
});
