import { describe, expect, it, vi } from 'vitest';

import { LaunchError } from '@tersoo/core';

import { detectChrome } from '../src/main/chrome';
import { bootstrap, getContainer, getMainWindow } from '../src/main/index';
import { createMainWindow, resolvePreloadPath } from '../src/main/window';

vi.mock('electron', async () => {
  // A unique temp directory per run. The bootstrap test opens a real database
  // under userData, and a reused directory would carry a stale `migrations`
  // table whose recorded checksums no longer match the current SQL files.
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-window-test-'));

  const MockBrowserWindow = vi.fn().mockImplementation((options: Record<string, unknown>) => ({
    options,
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    show: vi.fn(),
    once: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      openDevTools: vi.fn(),
      // The window registers navigation lockdown and popup handlers on these.
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      send: vi.fn(),
    },
  }));

  return {
    app: {
      getPath: vi.fn().mockReturnValue(userDataDir),
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      quit: vi.fn(),
      exit: vi.fn(),
      isPackaged: false,
    },
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    },
    dialog: {
      showErrorBox: vi.fn(),
    },
    session: {
      defaultSession: {
        webRequest: { onHeadersReceived: vi.fn() },
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      },
    },
    shell: {
      openExternal: vi.fn(),
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn().mockReturnValue(true),
      encryptString: vi.fn((v: string) => Buffer.from(v, 'utf8')),
      decryptString: vi.fn((b: Buffer) => b.toString('utf8')),
    },
  };
});

describe('Ticket 0.10: Electron Main & Window Creation', () => {
  it('creates main window with required security and dimensions', () => {
    const win = createMainWindow({ show: false });
    expect(win).toBeDefined();

    const options = (win as unknown as { options: Record<string, unknown> }).options;
    expect(options.width).toBe(1440);
    expect(options.height).toBe(900);
    expect(options.show).toBe(false);
    expect(options.webPreferences).toEqual(
      expect.objectContaining({
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      }),
    );
  });

  it('resolves preload script path correctly', () => {
    const preload = resolvePreloadPath();
    expect(preload).toContain('preload');
  });

  it('detectChrome returns environment override if provided and exists', () => {
    const originalEnv = process.env.TERSOO_CHROME_BINARY;
    try {
      process.env.TERSOO_CHROME_BINARY = process.execPath; // Node executable always exists
      const detected = detectChrome();
      expect(detected).toBe(process.execPath);
    } finally {
      process.env.TERSOO_CHROME_BINARY = originalEnv;
    }
  });

  it('detectChrome throws LaunchError SPAWN_FAILED when binary is not found', () => {
    const originalEnv = process.env.TERSOO_CHROME_BINARY;
    try {
      process.env.TERSOO_CHROME_BINARY = '/non/existent/path/to/chrome.exe';
      expect(() => detectChrome()).toThrowError(LaunchError);
      expect(() => detectChrome()).toThrowError(/TERSOO_CHROME_BINARY not found/);

      delete process.env.TERSOO_CHROME_BINARY;
      expect(() => detectChrome([])).toThrowError(LaunchError);
      expect(() => detectChrome([])).toThrowError(/Chrome binary not configured or found/);
    } finally {
      process.env.TERSOO_CHROME_BINARY = originalEnv;
    }
  });

  it('bootstraps main window and initializes container and ipc', async () => {
    const originalEnv = process.env.TERSOO_CHROME_BINARY;
    try {
      process.env.TERSOO_CHROME_BINARY = process.execPath;
      const win = await bootstrap();
      expect(win).toBeDefined();
      expect(getMainWindow()).toBe(win);

      const container = getContainer();
      expect(container).toBeDefined();
      expect(container?.events).toBeDefined();
      expect(container?.repos).toBeDefined();

      if (container) {
        await container.dispose();
      }
    } finally {
      process.env.TERSOO_CHROME_BINARY = originalEnv;
    }
  });
});
