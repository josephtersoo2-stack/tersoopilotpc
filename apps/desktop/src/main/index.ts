import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createContainer,
  createLogger,
  loadConfig,
  cleanupAllStaleLocks,
  ensureCamoufoxDistribution,
  type Container,
  type ISecretDriver,
} from '@tersoo/core';
import { app, dialog, session, type BrowserWindow } from 'electron';

import { registerIpc } from '../ipc/router';

import { detectChrome } from './chrome';
import { SafeStorageSecretDriver, detectLegacyOsKeyedVault } from './secretDriver';
import { createMainWindow } from './window';

const log = createLogger({ level: 'info' }).child('security');

let win: BrowserWindow | null = null;
let container: Container | null = null;

export function configureSecurityPolicies(): void {
  // Permission lockdown: Allow microphone for voice commands; deny other intrusive APIs
  const allowedPermissions = ['clipboard-read', 'clipboard-sanitized-write', 'media', 'microphone', 'audioCapture'];
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.includes(permission);
  });

  // CSP & Security headers injection
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = process.env.NODE_ENV !== 'production' || !!process.env.VITE_DEV_SERVER_URL;
    const scriptSrc = isDev ? "'self' 'unsafe-eval' 'unsafe-inline'" : "'self'";
    const connectSrc = isDev
      ? "'self' ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:* http://localhost:* https://openrouter.ai"
      : "'self' https://openrouter.ai";

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      `connect-src ${connectSrc}`,
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
      },
    });
  });
}

export async function bootstrap(): Promise<BrowserWindow> {
  // Prevent any stray dummy Google OAuth keys from poisoning Chromium DICE reconciliation
  delete process.env.GOOGLE_DEFAULT_CLIENT_ID;
  delete process.env.GOOGLE_DEFAULT_CLIENT_SECRET;

  const localAppData =
    process.env.LOCALAPPDATA ??
    path.join(process.env.USERPROFILE || 'C:\\Users\\Akende Micheal', 'AppData', 'Local');

  // Ensure Camoufox install dir is configured before any engine imports
  // Must point to the directory containing camoufox.exe, not the Cache parent
  if (!process.env.CAMOUFOX_INSTALL_DIR) {
    const cfOfficialRoot = path.join(localAppData, 'camoufox', 'camoufox', 'Cache', 'browsers', 'official');
    if (fs.existsSync(cfOfficialRoot)) {
      try {
        const entries = fs.readdirSync(cfOfficialRoot);
        for (const entry of entries) {
          const dir = path.join(cfOfficialRoot, entry);
          const exe = path.join(dir, 'camoufox.exe');
          if (fs.existsSync(exe)) {
            process.env.CAMOUFOX_INSTALL_DIR = dir;
            break;
          }
        }
      } catch {
        // ignore scan errors
      }
    }
  }

  // Ensure Camoufox binaries and distributions are patched and UI is standard Firefox
  try {
    ensureCamoufoxDistribution();
  } catch (cfErr) {
    console.warn('[desktop] Failed to run ensureCamoufoxDistribution:', cfErr);
  }

  // Ensure Apostate binary is configured
  if (!process.env.APOSTATE_BINARY) {
    const apostateCache = path.join(localAppData, 'apostate', 'cache');
    const knownApostate = path.join(
      apostateCache,
      '155.0.8059.31',
      'windows-x64',
      'install',
      'chrome.exe',
    );
    if (fs.existsSync(knownApostate)) {
      process.env.APOSTATE_BINARY = knownApostate;
    }
  }

  const userDataDir = path.join(app.getPath('userData'), 'tersoopilot');
  await cleanupAllStaleLocks(path.join(userDataDir, 'profiles'), 0).catch(() => {});
  const chromeBinary = process.env.APOSTATE_BINARY ?? process.env.TERSOO_CHROME_BINARY ?? detectChrome();
  const config = loadConfig(userDataDir, chromeBinary, {
    headless: process.env.HEADLESS === 'true',
  });

  // Secrets are protected by the OS keystore (DPAPI / Keychain / libsecret).
  // If the OS backend is unavailable we refuse to start rather than fall back to
  // a store that offers no real protection.
  let secretDriver: ISecretDriver;
  try {
    secretDriver = new SafeStorageSecretDriver(path.join(userDataDir, 'secrets'));
  } catch (err) {
    dialog.showErrorBox(
      'Secure storage unavailable',
      `TersooPilot could not initialise OS-backed secret storage and will not start, ` +
        `because proxy passwords and API keys would otherwise have to be stored without ` +
        `OS protection.\n\n${(err as Error).message}`,
    );
    app.exit(1);
    throw err;
  }

  const legacyDirs = [
    // Pre-hardening build wrote the OS-keyed vault under the home directory.
    path.join(os.homedir(), '.tersoopilot'),
    path.join(userDataDir, 'secrets'),
  ];
  for (const dir of legacyDirs) {
    const legacy = detectLegacyOsKeyedVault(dir);
    if (!legacy.found) continue;
    // The pre-hardening build encrypted with a key derived from hostname and
    // username, which is not a secret. The old file cannot be trusted, so it is
    // quarantined and the user re-enters their secrets.
    try {
      fs.renameSync(legacy.path, `${legacy.path}.insecure-legacy`);
    } catch {
      // Leave it in place; the user can delete it manually.
    }
    log.warn('secrets.legacy_vault_quarantined', { path: legacy.path });
  }

  container = await createContainer(config, { secretDriver });

  configureSecurityPolicies();

  const localRendererHtml = path.join(__dirname, '../renderer/index.html');
  const hasLocalRenderer = fs.existsSync(localRendererHtml);

  // A packaged build must never load its UI from the network. Falling back to a
  // dev-server port here would hand a window with the full preload bridge to
  // whichever local process won that port.
  const devServerUrl = !app.isPackaged
    ? (process.env.VITE_DEV_SERVER_URL ?? (hasLocalRenderer ? null : 'http://127.0.0.1:5173'))
    : null;

  if (app.isPackaged && !hasLocalRenderer) {
    log.error('renderer.missing_in_packaged_build', { path: localRendererHtml });
    dialog.showErrorBox(
      'Application files are incomplete',
      `The renderer bundle is missing from this installation:\n\n${localRendererHtml}\n\n` +
        'Refusing to start, because the app will not load its interface from an ' +
        'untrusted local web server. Please reinstall TersooPilot Desktop.',
    );
    app.exit(1);
    throw new Error(`Packaged renderer missing: ${localRendererHtml}`);
  }

  win = createMainWindow({
    show: false,
    allowedOrigins: devServerUrl ? [devServerUrl] : [],
  });

  registerIpc(container, () => win);

  if (devServerUrl) {
    log.info('renderer.dev_server', { url: devServerUrl });
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(localRendererHtml);
  }

  win.show();
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return win;
}

export function getContainer(): Container | null {
  return container;
}

if (process.env.NODE_ENV !== 'test') {
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
  app
    .whenReady()
    .then(bootstrap)
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Fatal bootstrap error:', err);
      app.exit(1);
    });

  app.on('before-quit', (e) => {
    if (container) {
      e.preventDefault();
      void container.dispose().then(() => {
        app.exit(0);
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

