import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { LaunchError } from '@tersoo/core';

export function detectChrome(candidatePaths?: string[]): string {
  if (process.env.TERSOO_CHROME_BINARY) {
    if (fs.existsSync(process.env.TERSOO_CHROME_BINARY)) {
      return process.env.TERSOO_CHROME_BINARY;
    }
    throw new LaunchError(
      'SPAWN_FAILED',
      `Chrome binary configured in TERSOO_CHROME_BINARY not found: ${process.env.TERSOO_CHROME_BINARY}`,
    );
  }

  if (process.env.APOSTATE_BINARY && fs.existsSync(process.env.APOSTATE_BINARY)) {
    return process.env.APOSTATE_BINARY;
  }

  if (process.env.APOSTATE_BIN_PATH && fs.existsSync(process.env.APOSTATE_BIN_PATH)) {
    return process.env.APOSTATE_BIN_PATH;
  }

  const platform = process.platform;
  const candidates: string[] = candidatePaths ? [...candidatePaths] : [];

  if (!candidatePaths) {
    if (platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
      const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';

      // 1. Apostate cache binary
      const apostateCache = path.join(localAppData, 'apostate', 'cache');
      const knownApostate = path.join(apostateCache, '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
      if (fs.existsSync(knownApostate)) {
        process.env.APOSTATE_BINARY = knownApostate;
        return knownApostate;
      }

      candidates.push(
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      );
    } else if (platform === 'darwin') {
      candidates.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      );
    } else {
      candidates.push(
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      );
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new LaunchError('SPAWN_FAILED', 'Chrome binary not configured or found on host system');
}
