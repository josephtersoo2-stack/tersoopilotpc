import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type Config } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { BrowserSupervisor } from '../src/supervisor/BrowserSupervisor';
import {
  checkTcpPort,
  discoverCdpEndpoint,
} from '../src/supervisor/cdpDiscovery';
import { LaunchError } from '../src/util/errors';

describe('Ticket 1.4: DevToolsActivePort CDP discovery', () => {
  let tempDir: string;
  let config: Config;
  let events: EventBus;
  let supervisor: BrowserSupervisor;
  let tcpServers: net.Server[] = [];

  function startTcpServer(): Promise<{ server: net.Server; port: number }> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as net.AddressInfo;
        tcpServers.push(server);
        resolve({ server, port: address.port });
      });
    });
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-cdp-discovery-test-'));
    config = loadConfig(tempDir, process.execPath, { cdpDiscoveryTimeoutMs: 2000 });
    events = new EventBus();
    supervisor = new BrowserSupervisor({
      config,
      events,
      crosshair: {} as never,
    });
  });

  afterEach(async () => {
    await supervisor.stopAll();
    for (const server of tcpServers) {
      server.close();
    }
    tcpServers = [];

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('checkTcpPort', () => {
    it('returns true when a port accepts TCP connections', async () => {
      const { port } = await startTcpServer();
      const isOpen = await checkTcpPort(port, '127.0.0.1', 500);
      expect(isOpen).toBe(true);
    });

    it('returns false when port is not listening', async () => {
      // Ephemeral port that was closed
      const { server, port } = await startTcpServer();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      const isOpen = await checkTcpPort(port, '127.0.0.1', 200);
      expect(isOpen).toBe(false);
    });
  });

  describe('discoverCdpEndpoint', () => {
    it('discovers endpoint and validates TCP port from chromium/DevToolsActivePort', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, profileId);
      const chromiumDir = path.join(profileDir, 'chromium');
      fs.mkdirSync(chromiumDir, { recursive: true });

      const { port } = await startTcpServer();
      const wsPath = `/devtools/browser/${crypto.randomUUID()}`;

      // Write standard DevToolsActivePort file
      fs.writeFileSync(
        path.join(chromiumDir, 'DevToolsActivePort'),
        `${port}\n${wsPath}\n`,
      );

      const endpoint = await discoverCdpEndpoint({
        profileId,
        userDataDir: profileDir,
        timeoutMs: 1500,
      });

      expect(endpoint.port).toBe(port);
      expect(endpoint.wsPath).toBe(wsPath);
      expect(endpoint.wsUrl).toBe(`ws://127.0.0.1:${port}${wsPath}`);
    });

    it('discovers endpoint when path has no leading slash and normalizes it', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, profileId);
      const chromiumDir = path.join(profileDir, 'chromium');
      fs.mkdirSync(chromiumDir, { recursive: true });

      const { port } = await startTcpServer();
      const wsPathWithoutSlash = `browser/test-uuid-path`;

      fs.writeFileSync(
        path.join(chromiumDir, 'DevToolsActivePort'),
        `${port}\n${wsPathWithoutSlash}\n`,
      );

      const endpoint = await discoverCdpEndpoint({
        profileId,
        userDataDir: profileDir,
        timeoutMs: 1500,
      });

      expect(endpoint.port).toBe(port);
      expect(endpoint.wsPath).toBe(`/${wsPathWithoutSlash}`);
      expect(endpoint.wsUrl).toBe(`ws://127.0.0.1:${port}/${wsPathWithoutSlash}`);
    });

    it('discovers endpoint located directly at {userDataDir}/DevToolsActivePort', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, profileId);
      fs.mkdirSync(profileDir, { recursive: true });

      const { port } = await startTcpServer();
      const wsPath = `/devtools/browser/direct`;

      fs.writeFileSync(
        path.join(profileDir, 'DevToolsActivePort'),
        `${port}\n${wsPath}\n`,
      );

      const endpoint = await discoverCdpEndpoint({
        profileId,
        userDataDir: profileDir,
        timeoutMs: 1500,
      });

      expect(endpoint.port).toBe(port);
      expect(endpoint.wsPath).toBe(wsPath);
    });

    it('polls until file is written asynchronously', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, profileId);
      const chromiumDir = path.join(profileDir, 'chromium');
      fs.mkdirSync(chromiumDir, { recursive: true });

      const { port } = await startTcpServer();
      const wsPath = `/devtools/browser/delayed`;

      // Delay writing the file by 120ms
      setTimeout(() => {
        fs.writeFileSync(
          path.join(chromiumDir, 'DevToolsActivePort'),
          `${port}\n${wsPath}\n`,
        );
      }, 120);

      const endpoint = await discoverCdpEndpoint({
        profileId,
        userDataDir: profileDir,
        timeoutMs: 2000,
        pollIntervalMs: 30,
      });

      expect(endpoint.port).toBe(port);
      expect(endpoint.wsPath).toBe(wsPath);
    });

    it('handles temporary malformed or empty content during polling', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, profileId);
      const chromiumDir = path.join(profileDir, 'chromium');
      fs.mkdirSync(chromiumDir, { recursive: true });

      const filePath = path.join(chromiumDir, 'DevToolsActivePort');
      // Initially write empty / partial file
      fs.writeFileSync(filePath, '');

      const { port } = await startTcpServer();
      const wsPath = `/devtools/browser/recovered`;

      setTimeout(() => {
        fs.writeFileSync(filePath, `${port}\n${wsPath}\n`);
      }, 100);

      const endpoint = await discoverCdpEndpoint({
        profileId,
        userDataDir: profileDir,
        timeoutMs: 2000,
        pollIntervalMs: 25,
      });

      expect(endpoint.port).toBe(port);
      expect(endpoint.wsPath).toBe(wsPath);
    });

    it('fails fast if process terminates prematurely during discovery', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, profileId);

      let processAlive = true;
      setTimeout(() => {
        processAlive = false;
      }, 80);

      await expect(
        discoverCdpEndpoint({
          profileId,
          userDataDir: profileDir,
          timeoutMs: 3000,
          pollIntervalMs: 20,
          isProcessAlive: () => processAlive,
        }),
      ).rejects.toThrow(LaunchError);

      try {
        await discoverCdpEndpoint({
          profileId,
          userDataDir: profileDir,
          timeoutMs: 3000,
          pollIntervalMs: 20,
          isProcessAlive: () => false,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(LaunchError);
        expect((err as LaunchError).code).toBe('SPAWN_FAILED');
      }
    });

    it('throws CDP_TIMEOUT when DevToolsActivePort is never written within timeout', async () => {
      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, profileId);

      await expect(
        discoverCdpEndpoint({
          profileId,
          userDataDir: profileDir,
          timeoutMs: 200,
          pollIntervalMs: 30,
        }),
      ).rejects.toThrow(LaunchError);

      try {
        await discoverCdpEndpoint({
          profileId,
          userDataDir: profileDir,
          timeoutMs: 150,
          pollIntervalMs: 30,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(LaunchError);
        expect((err as LaunchError).code).toBe('CDP_TIMEOUT');
      }
    });
  });

  describe('BrowserSupervisor.waitForCdpEndpoint integration', () => {
    it('discovers endpoint and mutates instance with cdpPort and cdpWsUrl', async () => {
      const dummyScript = path.join(tempDir, 'dummy.js');
      fs.writeFileSync(dummyScript, 'setInterval(() => {}, 1000);');

      const profileId = crypto.randomUUID();
      const profileDir = path.join(tempDir, 'profiles', profileId);
      const chromiumDir = path.join(profileDir, 'chromium');
      fs.mkdirSync(chromiumDir, { recursive: true });

      const instance = await supervisor.spawn({
        profileId,
        userDataDir: profileDir,
        forwarderPort: 1080,
        additionalArgs: [dummyScript],
      });

      expect(instance.cdpPort).toBeNull();
      expect(instance.cdpWsUrl).toBeNull();

      const { port } = await startTcpServer();
      const wsPath = `/devtools/browser/supervisor-test`;

      fs.writeFileSync(
        path.join(chromiumDir, 'DevToolsActivePort'),
        `${port}\n${wsPath}\n`,
      );

      const endpoint = await supervisor.waitForCdpEndpoint(instance, {
        timeoutMs: 2000,
        pollIntervalMs: 25,
      });

      expect(endpoint.port).toBe(port);
      expect(instance.cdpPort).toBe(port);
      expect(instance.cdpWsUrl).toBe(`ws://127.0.0.1:${port}${wsPath}`);
    });
  });
});
