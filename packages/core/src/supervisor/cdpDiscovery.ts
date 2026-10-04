import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { LaunchError } from '../util/errors';

export interface CdpEndpoint {
  port: number;
  wsPath: string;
  wsUrl: string;
}

export interface CdpDiscoveryOptions {
  profileId: string;
  userDataDir: string;
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  isProcessAlive?: (() => boolean) | undefined;
}

export function checkTcpPort(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 500,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      cleanup();
      resolve(true);
    });

    socket.once('error', () => {
      cleanup();
      resolve(false);
    });

    socket.once('timeout', () => {
      cleanup();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

export async function discoverCdpEndpoint(
  options: CdpDiscoveryOptions,
): Promise<CdpEndpoint> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  const startTime = Date.now();

  const candidatePaths = [
    path.join(options.userDataDir, 'chromium', 'DevToolsActivePort'),
    path.join(options.userDataDir, 'DevToolsActivePort'),
  ];

  while (Date.now() - startTime < timeoutMs) {
    if (options.isProcessAlive && !options.isProcessAlive()) {
      throw new LaunchError(
        'SPAWN_FAILED',
        `Browser process exited prematurely while discovering CDP endpoint for profile '${options.profileId}'`,
        { profileId: options.profileId },
      );
    }

    for (const filePath of candidatePaths) {
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

          if (lines.length >= 2) {
            const rawPort = lines[0] ?? '';
            const rawWsPath = lines[1] ?? '';
            const port = parseInt(rawPort, 10);

            if (port > 0 && port <= 65535 && rawWsPath) {
              const wsPath = rawWsPath.startsWith('/') ? rawWsPath : `/${rawWsPath}`;
              const isTcpOpen = await checkTcpPort(port, '127.0.0.1', 300);
              if (isTcpOpen) {
                const wsUrl = `ws://127.0.0.1:${port}${wsPath}`;
                return {
                  port,
                  wsPath,
                  wsUrl,
                };
              }
            }
          }
        } catch {
          // File may be locked or partially written by Chromium, retry on next tick
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new LaunchError(
    'CDP_TIMEOUT',
    `Timed out after ${timeoutMs}ms waiting for DevToolsActivePort for profile '${options.profileId}'`,
    { profileId: options.profileId, timeoutMs },
  );
}
