import { Commands, Events, type CommandName } from '@tersoo/contracts';
import { IpcError, TersooError, type Container } from '@tersoo/core';
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createHandlers,
  registerIpc,
  unregisterIpc,
} from '../src/ipc/router';

const registeredHandlers = new Map<string, (evt: unknown, ...args: unknown[]) => Promise<unknown>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (evt: unknown, ...args: unknown[]) => Promise<unknown>) => {
      registeredHandlers.set(channel, fn);
    }),
    removeHandler: vi.fn((channel: string) => {
      registeredHandlers.delete(channel);
    }),
  },
}));

/**
 * The router rejects IPC whose sender is not the main window, so command tests
 * need a window whose webContents also acts as the event sender.
 */
const mainWebContents = { send: vi.fn() };
const mainWindow = {
  isDestroyed: vi.fn().mockReturnValue(false),
  webContents: mainWebContents,
} as unknown as BrowserWindow;
const senderEvent = { sender: mainWebContents } as unknown as Parameters<
  (evt: unknown, raw: unknown) => Promise<unknown>
>[0];
const useMainWindow = (): BrowserWindow => mainWindow;

const dummyBundle = {  seed: 'seed12345678',
  platform: 'windows' as const,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  uaMetadata: {
    brands: [{ brand: 'Google Chrome', version: '128' }],
    platform: 'Windows',
    platformVersion: '10.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
  },
  screen: {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040,
    colorDepth: 24,
    dpr: 1,
  },
  webgl: {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)',
    unmaskedVendor: 'NVIDIA',
    unmaskedRenderer: 'GeForce RTX 3080',
  },
  canvasNoise: { enabled: true, algorithm: 'gaussian' as const, intensity: 0.1 },
  audioNoise: { enabled: true, algorithm: 'gaussian' as const, intensity: 0.1 },
  hardware: { cores: 8, memoryGb: 16, maxTouchPoints: 0 },
  locales: { languages: ['en-US', 'en'], acceptLanguage: 'en-US,en;q=0.9' },
  timezone: 'America/New_York',
  geolocation: null,
  webrtcPolicy: 'disable_non_proxied_udp' as const,
  webdriverHidden: true as const,
};

const dummyProfileDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Profile 1',
  tags: ['production'],
  presetId: '88888888-8888-4888-8888-888888888888',
  state: 'idle' as const,
  platform: 'windows',
  engine: 'apostate' as const,
  captchaBudgetUsed: 0,
  proxyId: null,
  lastLaunchedAt: null,
  createdAt: 1000,
  updatedAt: 1000,
  fingerprintSeed: 'seed12345678',
  fingerprintBundle: dummyBundle,
  userDataDir: '/tmp/profile-1',
  notes: 'test note',
};

function createMockContainer(): {
  container: Container;
  eventListeners: Map<string, (payload: unknown) => void>;
  spies: {
    profiles: Record<string, ReturnType<typeof vi.fn>>;
    proxies: Record<string, ReturnType<typeof vi.fn>>;
    tasks: Record<string, ReturnType<typeof vi.fn>>;
    runs: Record<string, ReturnType<typeof vi.fn>>;
    fleet: Record<string, ReturnType<typeof vi.fn>>;
    llm: Record<string, ReturnType<typeof vi.fn>>;
    repos: { events: Record<string, ReturnType<typeof vi.fn>> };
  };
} {
  const eventListeners = new Map<string, (payload: unknown) => void>();

  const spies = {
    profiles: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(dummyProfileDetail),
      create: vi.fn().mockResolvedValue(dummyProfileDetail),
      update: vi.fn().mockResolvedValue(dummyProfileDetail),
      delete: vi.fn().mockResolvedValue(undefined),
      launch: vi.fn().mockResolvedValue({ runId: '22222222-2222-4222-8222-222222222222' }),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    proxies: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        protocol: 'http',
        host: '1.2.3.4',
        port: 8080,
        authRequired: false,
        status: 'online',
        geoCountry: null,
        geoCity: null,
        geoTz: null,
        latencyMs: 50,
        failCount: 0,
        lastCheckedAt: 1000,
        tags: [],
        createdAt: 1000,
      }),
      importBulk: vi.fn().mockResolvedValue({
        imported: 1,
        duplicates: 0,
        invalid: 0,
        errors: [],
      }),
      check: vi.fn().mockResolvedValue({
        proxyId: '33333333-3333-4333-8333-333333333333',
        status: 'online',
        latencyMs: 45,
        exitIp: '1.2.3.4',
        geoCountry: 'US',
        geoCity: 'NYC',
        geoTz: 'America/New_York',
        geoLat: 40.7,
        geoLng: -74.0,
      }),
      assign: vi.fn().mockResolvedValue({
        id: '44444444-4444-4444-8444-444444444444',
        proxyId: '33333333-3333-4333-8333-333333333333',
        profileId: '11111111-1111-4111-8111-111111111111',
        state: 'active',
        acquiredAt: 1000,
        expiresAt: 2000,
        heartbeatAt: 1000,
      }),
      release: vi.fn().mockResolvedValue(undefined),
      swap: vi.fn().mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        proxyId: '33333333-3333-4333-8333-333333333333',
        profileId: '11111111-1111-4111-8111-111111111111',
        state: 'active',
        acquiredAt: 1000,
        expiresAt: 2000,
        heartbeatAt: 1000,
      }),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Test Task',
        workflowJson: '[]',
        concurrency: 1,
        staggerMs: 1000,
        createdAt: 1000,
        updatedAt: 1000,
      }),
      dispatch: vi.fn().mockResolvedValue({
        runIds: ['77777777-7777-4777-8777-777777777777'],
      }),
    },
    runs: {
      list: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    },
    fleet: {
      status: vi.fn().mockResolvedValue({ running: 0, idle: 5 }),
    },
    llm: {
      // Must satisfy the `llm.test` output schema (LlmTestResult), which the
      // router validates on the way out.
      test: vi.fn().mockResolvedValue({
        ok: true,
        latencyMs: 42,
        response: '{"status":"ok"}',
        provider: 'openrouter',
        model: 'test-model',
      }),
    },
    repos: {
      events: {
        query: vi.fn().mockResolvedValue([]),
      },
    },
  };

  const container = {
    events: {
      on: vi.fn((name: string, listener: (payload: unknown) => void) => {
        eventListeners.set(name, listener);
      }),
    },
    services: spies,
    repos: spies.repos,
  } as unknown as Container;

  return { container, eventListeners, spies };
}

describe('Ticket 0.11: IPC Router & Zod Validation', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    vi.clearAllMocks();
  });

  it('registers all command channels defined in Contracts', () => {
    const { container } = createMockContainer();
    registerIpc(container, useMainWindow);

    const expectedCommands = Object.keys(Commands) as CommandName[];
    for (const cmd of expectedCommands) {
      expect(registeredHandlers.has(cmd)).toBe(true);
    }
  });

  it('executes valid input through Zod input/output parsers and calls appropriate service', async () => {
    const { container, spies } = createMockContainer();
    registerIpc(container, useMainWindow);

    const validId = '11111111-1111-4111-8111-111111111111';
    const profileGetHandler = registeredHandlers.get('profile.get');
    expect(profileGetHandler).toBeDefined();

    const result = await profileGetHandler!(senderEvent, { id: validId });
    expect(spies.profiles.get).toHaveBeenCalledWith(validId);
    expect(result).toEqual(
      expect.objectContaining({
        id: validId,
        name: 'Profile 1',
      }),
    );
  });

  it('executes llm.test command through Zod input/output parsers and calls llm service', async () => {
    const { container, spies } = createMockContainer();
    registerIpc(container, useMainWindow);

    const handler = registeredHandlers.get('llm.test');
    expect(handler).toBeDefined();

    const result = await handler!(senderEvent, { prompt: 'Click submit' });
    // The handler forwards the whole validated `LlmTestInput` object, whose
    // prompt field carries a default when omitted.
    expect(spies.llm.test).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Click submit' }));
    expect(result).toEqual({
      ok: true,
      latencyMs: 42,
      response: '{"status":"ok"}',
      provider: 'openrouter',
      model: 'test-model',
    });
  });

  it('rejects invalid input with IpcError (POLICY_VIOLATION) without invoking the handler', async () => {
    const { container, spies } = createMockContainer();
    registerIpc(container, useMainWindow);

    const profileGetHandler = registeredHandlers.get('profile.get');
    expect(profileGetHandler).toBeDefined();

    await expect(profileGetHandler!(senderEvent, { id: 'invalid-uuid' })).rejects.toThrowError(IpcError);
    await expect(profileGetHandler!(senderEvent, { id: 'invalid-uuid' })).rejects.toThrowError(
      /IPC_INVALID_INPUT:profile.get:/,
    );
    expect(spies.profiles.get).not.toHaveBeenCalled();
  });

  it('verifies IpcError is an instance of TersooError', async () => {
    const { container } = createMockContainer();
    registerIpc(container, useMainWindow);

    const profileGetHandler = registeredHandlers.get('profile.get');
    try {
      await profileGetHandler!(senderEvent, { id: 'bad' });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TersooError);
      expect(err).toBeInstanceOf(IpcError);
      expect((err as IpcError).code).toBe('POLICY_VIOLATION');
      expect((err as IpcError).meta).toHaveProperty('channel', 'profile.get');
    }
  });

  it('fails if service returns output that does not match output schema', async () => {
    const { container, spies } = createMockContainer();
    spies.profiles.get.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      // missing required fields
    });
    registerIpc(container, useMainWindow);

    const profileGetHandler = registeredHandlers.get('profile.get');
    await expect(
      profileGetHandler!(senderEvent, { id: '11111111-1111-4111-8111-111111111111' }),
    ).rejects.toThrow();
  });

  it('registers handlers for all command services', async () => {
    const { container, spies } = createMockContainer();
    const handlers = createHandlers(container);

    await handlers['task.list'](undefined);
    expect(spies.tasks.list).toHaveBeenCalled();

    await handlers['fleet.status'](undefined);
    expect(spies.fleet.status).toHaveBeenCalled();

    await handlers['logs.query']({ limit: 100 });
    expect(spies.repos.events.query).toHaveBeenCalledWith({ limit: 100 });
  });

  it('forwards EventBus events to the active browser window', () => {
    const { container, eventListeners } = createMockContainer();
    const mockSend = vi.fn();
    const mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: mockSend,
      },
    } as unknown as BrowserWindow;

    registerIpc(container, () => mockWindow);

    expect(eventListeners.has('profile.state_changed')).toBe(true);

    const listener = eventListeners.get('profile.state_changed')!;
    const payload = {
      profileId: '11111111-1111-4111-8111-111111111111',
      state: 'idle',
    };
    listener(payload);

    expect(mockSend).toHaveBeenCalledWith('profile.state_changed', payload);
  });

  it('safely skips forwarding when window is null or destroyed', () => {
    const { container, eventListeners } = createMockContainer();
    const mockSend = vi.fn();
    const mockDestroyedWindow = {
      isDestroyed: vi.fn().mockReturnValue(true),
      webContents: {
        send: mockSend,
      },
    } as unknown as BrowserWindow;

    registerIpc(container, () => mockDestroyedWindow);

    const listener = eventListeners.get('profile.state_changed')!;
    listener({ profileId: '11111111-1111-4111-8111-111111111111', state: 'idle' });
    expect(mockSend).not.toHaveBeenCalled();

    // When window is null
    registerIpc(container, () => null);
    expect(() =>
      listener({ profileId: '11111111-1111-4111-8111-111111111111', state: 'idle' }),
    ).not.toThrow();
  });

  it('unregisters all commands properly with unregisterIpc', () => {
    const { container } = createMockContainer();
    registerIpc(container, useMainWindow);
    expect(registeredHandlers.size).toBe(Object.keys(Commands).length);

    unregisterIpc();
    expect(registeredHandlers.size).toBe(0);
  });
});
