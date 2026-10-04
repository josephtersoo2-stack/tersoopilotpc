import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
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

describe('Ticket 3.6: Subsystem Integration (ProfileService.launch & CdpEmulator)', () => {
  let tempDir: string;
  let config: Config;
  let db: AppDatabase<DB>;
  let repos: Repos;
  let events: EventBus;
  let supervisor: BrowserSupervisor;
  let service: ProfileService;

  let dummyScriptPath: string;
  let mockServer: http.Server;
  let mockPort: number;
  const receivedCdpCommands: { id: number; method: string; params?: Record<string, unknown> }[] = [];

  const presetId = crypto.randomUUID();
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    console.log('[DEBUG] beforeEach started');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-subsystem-test-'));
    clearActiveLocalLocks();
    receivedCdpCommands.length = 0;

    // Start a mock CDP HTTP + WebSocket server
    await new Promise<void>((resolve) => {
      console.log('[DEBUG] creating mockServer');
      mockServer = http.createServer((req, res) => {
        if (req.url === '/json/list' || req.url === '/json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([
              {
                id: 'target-page-1',
                type: 'page',
                title: 'New Tab',
                url: 'about:blank',
                webSocketDebuggerUrl: `ws://127.0.0.1:${mockPort}/devtools/page/target-page-1`,
              },
            ]),
          );
          return;
        }
        res.writeHead(404);
        res.end();
      });

      // Handle WebSocket upgrade
      mockServer.on('upgrade', (req, socket) => {
        // Simple mock WebSocket handshake
        const key = req.headers['sec-websocket-key'];
        const accept = crypto
          .createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');

        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
        );

        socket.on('data', (buffer) => {
          // Minimal unmasking for mock JSON frames
          let payload = buffer;
          if (buffer[0] === 0x81) {
            const hasMask = (buffer[1]! & 0x80) !== 0;
            let len = buffer[1]! & 0x7f;
            let offset = 2;
            if (len === 126) {
              len = buffer.readUInt16BE(2);
              offset = 4;
            }
            if (hasMask) {
              const mask = buffer.subarray(offset, offset + 4);
              offset += 4;
              const unmasked = Buffer.alloc(len);
              for (let i = 0; i < len; i++) {
                unmasked[i] = buffer[offset + i]! ^ mask[i % 4]!;
              }
              payload = unmasked;
            } else {
              payload = buffer.subarray(offset, offset + len);
            }
          }

          try {
            const parsed = JSON.parse(payload.toString('utf8')) as {
              id: number;
              method: string;
              params?: Record<string, unknown>;
            };
            receivedCdpCommands.push(parsed);

            // Send successful JSON-RPC response back
            const responseObj = { id: parsed.id, result: { identifier: 'injected-42' } };
            const jsonStr = JSON.stringify(responseObj);
            const respBuf = Buffer.alloc(2 + jsonStr.length);
            respBuf[0] = 0x81; // text frame
            respBuf[1] = jsonStr.length;
            respBuf.write(jsonStr, 2);
            socket.write(respBuf);
          } catch {
            // Ignore malformed
          }
        });
      });

    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = (mockServer.address() as { port: number }).port;
      resolve();
    });
  });

  // Dummy Chromium script that creates DevToolsActivePort pointing to mockPort
  dummyScriptPath = path.join(tempDir, 'dummy-chrome.js');
  fs.writeFileSync(
    dummyScriptPath,
    `
const fs = require('fs');
const path = require('path');
const arg = process.argv.find(a => a.startsWith('--user-data-dir='));
if (arg) {
  const rawDir = arg.slice('--user-data-dir='.length);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(path.join(rawDir, 'chromium'), { recursive: true });
  const content = '${mockPort}\\n/devtools/browser/test-uuid\\n';
  fs.writeFileSync(path.join(rawDir, 'DevToolsActivePort'), content);
  fs.writeFileSync(path.join(rawDir, 'chromium', 'DevToolsActivePort'), content);
}
setInterval(() => {}, 1000);
process.on('SIGTERM', () => process.exit(0));
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
    name: 'Windows 11 Preset',
    version: 1,
    platform: 'windows',
    bundle: JSON.stringify({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
    }),
    created_at: Date.now(),
    updated_at: Date.now(),
  });
});

afterEach(async () => {
  if (mockServer) {
    mockServer.closeAllConnections?.();
    mockServer.close();
  }
  clearActiveLocalLocks();
  if (supervisor) {
    await supervisor.stopAll();
  }
  if (db) {
    db.close();
  }
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore Windows file lock latency
  }
});

it('orchestrates launch, discovers CDP, connects WebSocket, and applies CdpEmulator overrides', async () => {
  const profile = await service.create({
    name: 'Stealth Launch Integration Profile',
    presetId,
  });

  const launchResult = await service.launch(profile.id);

  expect(launchResult.instance.state).toBe('ready');
  expect(launchResult.instance.cdpPort).toBe(mockPort);
  expect(launchResult.instance.stealthInjected).toBe(true);

  // Verify commands sent over CDP WebSocket:
  const commandMethods = receivedCdpCommands.map((c) => c.method);
  expect(commandMethods).toContain('Page.enable');
  expect(commandMethods).toContain('Page.addScriptToEvaluateOnNewDocument');
  expect(commandMethods).toContain('Network.enable');
  // Emulation overrides: on direct connection (no proxy), timezone is preserved to host.
  // On desktop presets (mobile: false), device metrics override is omitted to prevent fractional DPI zoom.
  expect(commandMethods).not.toContain('Emulation.setTimezoneOverride');
  expect(commandMethods).not.toContain('Emulation.setDeviceMetricsOverride');

  // Clean stop
  await service.stop(profile.id);
  const stopped = await service.get(profile.id);
  expect(stopped.state).toBe('idle');
});
});
