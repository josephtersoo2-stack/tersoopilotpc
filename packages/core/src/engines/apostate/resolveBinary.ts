import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { LaunchError } from '../../util/errors';

export function resolveApostateBinary(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  if (process.env.APOSTATE_BINARY && fs.existsSync(process.env.APOSTATE_BINARY)) {
    return process.env.APOSTATE_BINARY;
  }

  if (process.env.APOSTATE_BIN_PATH && fs.existsSync(process.env.APOSTATE_BIN_PATH)) {
    return process.env.APOSTATE_BIN_PATH;
  }

  const platform = process.platform;
  const candidates: string[] = [];

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';

    // 1. Apostate local cache
    const apostateCache = path.join(localAppData, 'apostate', 'cache');
    if (fs.existsSync(apostateCache)) {
      const knownPath = path.join(
        apostateCache,
        '155.0.8059.31',
        'windows-x64',
        'install',
        'chrome.exe',
      );
      if (fs.existsSync(knownPath)) {
        process.env.APOSTATE_BINARY = knownPath;
        return knownPath;
      }

      // Check version directories in cache
      try {
        const entries = fs.readdirSync(apostateCache);
        for (const entry of entries) {
          const exe = path.join(apostateCache, entry, 'windows-x64', 'install', 'chrome.exe');
          if (fs.existsSync(exe)) {
            process.env.APOSTATE_BINARY = exe;
            return exe;
          }
        }
      } catch {
        // ignore cache scan error
      }
    }

    if (process.env.TERSOO_CHROME_BINARY && fs.existsSync(process.env.TERSOO_CHROME_BINARY)) {
      return process.env.TERSOO_CHROME_BINARY;
    }

    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  } else if (platform === 'darwin') {
    if (process.env.TERSOO_CHROME_BINARY && fs.existsSync(process.env.TERSOO_CHROME_BINARY)) {
      return process.env.TERSOO_CHROME_BINARY;
    }
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    if (process.env.TERSOO_CHROME_BINARY && fs.existsSync(process.env.TERSOO_CHROME_BINARY)) {
      return process.env.TERSOO_CHROME_BINARY;
    }
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new LaunchError(
    'SPAWN_FAILED',
    'Apostate/Chromium binary not configured or found on host system',
  );
}
