import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserWindow, shell } from 'electron';

export interface MainWindowOptions {
  preloadPath?: string;
  show?: boolean;
  /**
   * Exact origins the renderer is allowed to navigate to, e.g.
   * `http://127.0.0.1:5173`. Empty means "local files only", which is the
   * packaged default.
   */
  allowedOrigins?: string[];
}

/**
 * Hosts we are willing to hand to the OS browser. Anything else is dropped
 * rather than launched, so a hostile page cannot use the app to open arbitrary
 * scheme handlers or internal addresses.
 */
const EXTERNAL_LINK_ALLOWLIST: ReadonlySet<string> = new Set([
  'github.com',
  'www.github.com',
  'docs.github.com',
  'githubusercontent.com',
  'www.google.com',
  'openrouter.ai',
  'aistudio.google.com',
]);

function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

function isAllowedExternalUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  // Never hand a loopback or private address to the OS browser.
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return false;
  }
  if (host.endsWith('.localhost') || host.endsWith('.local')) return false;
  return EXTERNAL_LINK_ALLOWLIST.has(host);
}

export function resolvePreloadPath(): string {
  let dir = '';
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  }

  const candidates: string[] = [
    path.resolve(dir, '../preload/index.cjs'),
    path.resolve(dir, '../preload/index.js'),
    path.resolve(dir, '../../dist/preload/index.cjs'),
    path.resolve(dir, '../../dist/preload/index.js'),
    path.resolve(process.cwd(), 'apps/desktop/dist/preload/index.cjs'),
    path.resolve(process.cwd(), 'apps/desktop/dist/preload/index.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}

export function createMainWindow(options?: MainWindowOptions): BrowserWindow {
  const allowedOrigins = new Set(
    (options?.allowedOrigins ?? []).map(normalizeOrigin).filter((o) => o.length > 0),
  );

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: options?.show ?? false,
    webPreferences: {
      preload: options?.preloadPath ?? resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Navigation lockdown: only the app's own documents and the exact dev-server
  // origin are allowed. A wildcard "any loopback host" rule would let any local
  // process that wins a port take over a window holding the full preload bridge.
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.protocol === 'file:') return;
      if (allowedOrigins.has(`${parsed.protocol}//${parsed.host}`)) return;
    } catch {
      // Unparseable URL: block.
    }
    event.preventDefault();
  });

  // Window open lockdown: internal popups are denied; external links go to the
  // OS browser only for an allowlisted host over http(s).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Webview tag prevention
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  return win;
}
