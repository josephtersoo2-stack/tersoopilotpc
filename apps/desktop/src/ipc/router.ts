import { Commands, Events, type CommandName, type LlmConfig } from '@tersoo/contracts';
import { IpcError, type Container } from '@tersoo/core';
import { ipcMain, screen, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';

import {
  handleVoiceTranscribe,
  handleVoiceSpeak,
  handleVoiceWakeDetected,
  handleVoiceCostSummary,
  handleVoiceSettingsGet,
  handleVoiceSettingsSet,
  handleVoiceModelsList,
  handleVoiceTestConnection,
} from './handlers/voice';

/**
 * Fields of `llm_config` the renderer may change.
 *
 * The handler picks these explicitly instead of forwarding the caller's object,
 * so a renderer-side bug or a tampered payload cannot introduce an unknown
 * column. `api_key_ref` is additionally validated downstream: it must be a
 * vault reference, never a literal API key.
 */
const LLM_CONFIG_WRITABLE_FIELDS = [
  'provider',
  'text_model',
  'vision_model',
  'api_key_ref',
  'max_attempts',
  'backoff_ms',
  'vision_enabled',
] as const;

function pickLlmConfigPatch(input: unknown): Record<string, unknown> {
  const source = (input ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of LLM_CONFIG_WRITABLE_FIELDS) {
    if (source[field] !== undefined) patch[field] = source[field];
  }
  return patch;
}

function requireFiniteNumber(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new IpcError('POLICY_VIOLATION', `${field} must be a finite number`);
  }
  if (opts.integer && !Number.isInteger(n)) {
    throw new IpcError('POLICY_VIOLATION', `${field} must be an integer`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new IpcError('POLICY_VIOLATION', `${field} must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && n > opts.max) {
    throw new IpcError('POLICY_VIOLATION', `${field} must be <= ${opts.max}`);
  }
  return n;
}

export function createHandlers(
  container: Container,
  getWindow: () => BrowserWindow | null = () => null,
): Record<CommandName, (input: unknown) => Promise<unknown>> {
  return {
    'profile.list': (i) =>
      container.services.profiles.list(
        (i as { filter?: Parameters<typeof container.services.profiles.list>[0] } | undefined)?.filter,
      ),
    'profile.get': (i) => container.services.profiles.get((i as { id: string }).id),
    'profile.create': (i) =>
      container.services.profiles.create(
        i as Parameters<typeof container.services.profiles.create>[0],
      ),
    'profile.bulkCreate': (i) =>
      container.services.profiles.bulkCreate(
        i as Parameters<typeof container.services.profiles.bulkCreate>[0],
      ),
    'profile.update': (i) => {
      const typed = i as {
        id: string;
        patch: Parameters<typeof container.services.profiles.update>[1];
      };
      return container.services.profiles.update(typed.id, typed.patch);
    },
    'profile.delete': (i) => container.services.profiles.delete((i as { id: string }).id),
    'profile.launch': (i) => {
      const typed = i as { id: string; headless?: boolean };
      let hostScreen:
        | { width: number; height: number; workAreaWidth: number; workAreaHeight: number }
        | undefined;
      try {
        const primary = screen.getPrimaryDisplay();
        if (primary) {
          hostScreen = {
            width: primary.bounds.width,
            height: primary.bounds.height,
            workAreaWidth: primary.workArea.width,
            workAreaHeight: primary.workArea.height,
          };
        }
      } catch {}
      return container.services.profiles.launch(typed.id, {
        headless: typed.headless,
        hostScreen,
      });
    },
    'profile.stop': (i) => container.services.profiles.stop((i as { id: string }).id),
    'profile.autoMature': (i) => container.services.profiles.autoMatureProfile((i as { id: string }).id),

    'proxy.list': (i) =>
      container.services.proxies.list((i as { filter?: unknown } | undefined)?.filter),
    'proxy.create': (i) => container.services.proxies.create(i),
    'proxy.importBulk': (i) => container.services.proxies.importBulk(i),
    'proxy.check': (i) => container.services.proxies.check((i as { id: string }).id),
    'proxy.assign': (i) => container.services.proxies.assign(i),
    'proxy.release': (i) =>
      container.services.proxies.release((i as { profileId: string }).profileId),
    'proxy.swap': (i) => container.services.proxies.swap((i as { profileId: string }).profileId),
    'proxy.delete': (i) => container.services.proxies.delete((i as { id: string }).id),

    'task.list': () => container.services.tasks.list(),
    'task.get': (i) => container.services.tasks.getById((i as { id: string }).id),
    'task.create': (i) => container.services.tasks.create(i),
    'task.update': (i) => container.services.tasks.update(i),
    'task.delete': (i) => container.services.tasks.delete((i as { id: string }).id),
    'task.dispatch': (i) => container.services.tasks.dispatch(i),

    'run.list': (i) =>
      container.services.runs.list(
        (i as { filter?: { taskId?: string; profileId?: string; state?: string } } | undefined)?.filter,
      ),
    'run.cancel': (i) => container.services.runs.cancel((i as { id: string }).id),
    'run.resume': (i) => container.services.runs.resume((i as { id: string }).id),
    'run.delete': (i) => container.services.runs.delete((i as { id: string }).id),
    'run.clearTerminal': () => container.services.runs.clearTerminal(),

    'fleet.status': () => container.services.fleet.status(),
    'logs.query': (i) =>
      container.repos.events.query(
        i as Parameters<typeof container.repos.events.query>[0],
      ),
    'llm.test': (i) => container.services.llm.test(i as any),
    'llm.models.list': (i) => {
      const typed = i as { provider: 'openrouter' | 'gemini'; apiKey?: string };
      return container.services.llm.fetchModels(typed.provider, typed.apiKey);
    },
    'llm.key.set': async (i) => {
      const typed = i as { provider: 'openrouter' | 'gemini'; apiKey: string };
      await container.services.llm.saveApiKey(typed.provider, typed.apiKey);
      return { ok: true };
    },
    'llm.key.get': (i) => {
      const typed = i as { provider: 'openrouter' | 'gemini' };
      return container.services.llm.getApiKeyStatus(typed.provider);
    },
    'engine.list': () => Promise.resolve(['apostate', 'camoufox'] as const),
    'engine.config.get': (i) =>
      container.repos.engineConfig.get((i as { engine: 'apostate' | 'camoufox' }).engine),
    'engine.config.set': (i) => {
      const typed = i as {
        engine: 'apostate' | 'camoufox';
        patch: {
          action_mode?: 'scripted' | 'llm';
          binary_path?: string | null;
          launch_options?: string | Record<string, unknown>;
        };
      };
      // Explicit field pick: never spread a caller-supplied object into a repo
      // update, where an unexpected key would be written to the database.
      const source = (typed.patch ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (source.action_mode === 'scripted' || source.action_mode === 'llm') {
        patch.action_mode = source.action_mode;
      }
      if (source.binary_path === null || typeof source.binary_path === 'string') {
        patch.binary_path = source.binary_path ?? null;
      }
      if (source.launch_options !== undefined) {
        if (typeof source.launch_options === 'object' && source.launch_options !== null) {
          patch.launch_options = JSON.stringify(source.launch_options);
        } else if (typeof source.launch_options === 'string') {
          try {
            JSON.parse(source.launch_options);
          } catch {
            throw new IpcError('POLICY_VIOLATION', 'launch_options must be valid JSON');
          }
          patch.launch_options = source.launch_options;
        } else {
          throw new IpcError('POLICY_VIOLATION', 'launch_options must be a JSON string or object');
        }
      }
      return container.repos.engineConfig.update(typed.engine, patch as any);
    },
    'llm.config.get': async () => {
      const config = await container.repos.llmConfig.get();
      const openrouterStatus = await container.services.llm.getApiKeyStatus('openrouter');
      const geminiStatus = await container.services.llm.getApiKeyStatus('gemini');
      return {
        provider: config?.provider ?? 'openrouter',
        text_model: config?.text_model ?? 'deepseek/deepseek-chat',
        vision_model: config?.vision_model ?? null,
        vision_enabled: Boolean(config?.vision_enabled),
        max_attempts: config?.max_attempts ?? 3,
        backoff_ms: config?.backoff_ms ?? '[1000, 3000, 9000]',
        hasOpenrouterKey: openrouterStatus.hasKey,
        hasGeminiKey: geminiStatus.hasKey,
      };
    },
    'llm.config.set': (i) => {
      return container.repos.llmConfig.update(pickLlmConfigPatch(i));
    },
    'captcha.events.list': (i) => {
      const typed = i as { runId?: string; profileId?: string } | undefined;
      if (typed?.runId) return container.repos.captchaEvents.listForRun(typed.runId);
      if (typed?.profileId) return container.repos.captchaEvents.listForProfile(typed.profileId);
      return Promise.resolve([]);
    },
    'captcha.budget.get': async (i) => {
      const typed = i as { profileId: string };
      const profile = await container.repos.profiles.getById(typed.profileId);
      const rawBudget = await container.repos.settings.get('captcha_budget');
      const budget = rawBudget ? parseInt(rawBudget, 10) : 3;
      return { used: profile?.captcha_budget_used ?? 0, budget };
    },
    'settings.weights.get': async () => {
      const raw = await container.repos.settings.get('engine_weights');
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {}
      }
      return { apostate: 70, camoufox: 30 };
    },
    'settings.weights.set': async (i) => {
      const typed = i as { apostate?: unknown; camoufox?: unknown };
      const apostate = requireFiniteNumber(typed.apostate, 'apostate weight', { min: 0, max: 100 });
      const camoufox = requireFiniteNumber(typed.camoufox, 'camoufox weight', { min: 0, max: 100 });
      if (apostate + camoufox <= 0) {
        throw new IpcError('POLICY_VIOLATION', 'at least one engine weight must be greater than zero');
      }
      await container.repos.settings.set('engine_weights', JSON.stringify({ apostate, camoufox }));
    },
    'settings.ramCheck.get': async () => {
      const skipRaw = await container.repos.settings.get('skip_ram_check');
      const threshRaw = await container.repos.settings.get('memory_pressure_threshold');
      return {
        skipRamCheck: skipRaw === '1' || skipRaw === 'true',
        memoryPressureThresholdPct: threshRaw ? parseFloat(threshRaw) : 0.95,
      };
    },
    'settings.ramCheck.set': async (i) => {
      const typed = i as { skipRamCheck: boolean; memoryPressureThresholdPct?: number };
      if (typeof typed.skipRamCheck !== 'boolean') {
        throw new IpcError('POLICY_VIOLATION', 'skipRamCheck must be a boolean');
      }
      await container.repos.settings.set('skip_ram_check', typed.skipRamCheck ? '1' : '0');
      if (typed.memoryPressureThresholdPct !== undefined) {
        const threshold = requireFiniteNumber(
          typed.memoryPressureThresholdPct,
          'memoryPressureThresholdPct',
          { min: 0.1, max: 0.99 },
        );
        await container.repos.settings.set('memory_pressure_threshold', String(threshold));
      }
    },
    'profile.export': (i) =>
      container.services.profiles.exportProfile((i as { id: string }).id),
    'profile.import': (i) =>
      container.services.profiles.importProfile(
        i as Parameters<typeof container.services.profiles.importProfile>[0],
      ),
    'settings.launchInterval.get': async () => {
      const minRaw = await container.repos.settings.get('launch_interval_min_sec');
      const maxRaw = await container.repos.settings.get('launch_interval_max_sec');
      const concRaw = await container.repos.settings.get('default_concurrency');
      return {
        minSec: minRaw ? parseFloat(minRaw) : 10,
        maxSec: maxRaw ? parseFloat(maxRaw) : 30,
        concurrency: concRaw ? parseInt(concRaw, 10) : 3,
      };
    },
    'settings.launchInterval.set': async (i) => {
      const typed = i as { minSec?: unknown; maxSec?: unknown; concurrency?: unknown };
      const minSec = requireFiniteNumber(typed.minSec, 'minSec', { min: 0, max: 3600 });
      const maxSec = requireFiniteNumber(typed.maxSec, 'maxSec', { min: 0, max: 3600 });
      if (maxSec < minSec) {
        throw new IpcError('POLICY_VIOLATION', 'maxSec must be greater than or equal to minSec');
      }
      await container.repos.settings.set('launch_interval_min_sec', String(minSec));
      await container.repos.settings.set('launch_interval_max_sec', String(maxSec));
      if (typed.concurrency !== undefined) {
        const concurrency = requireFiniteNumber(typed.concurrency, 'concurrency', {
          min: 1,
          max: 64,
          integer: true,
        });
        await container.repos.settings.set('default_concurrency', String(concurrency));
        container.services.fleet.setConcurrency(concurrency);
      }
    },
    'niche.list': () => container.services.niches.list(),
    'niche.get': (i) => container.services.niches.getById((i as { id: string }).id),
    'niche.create': (i) => container.services.niches.create(i),
    'niche.update': (i) => container.services.niches.update(i),
    'niche.delete': (i) => container.services.niches.delete((i as { id: string }).id),
    'template.list': (i) =>
      container.services.templates.list(
        (i as { category?: string } | undefined)?.category,
      ),
    'template.get': (i) =>
      container.services.templates.getById((i as { id: string }).id),
    'template.create': (i) =>
      container.services.templates.create(
        i as Parameters<typeof container.services.templates.create>[0],
      ),
    'template.update': (i) =>
      container.services.templates.update(
        i as Parameters<typeof container.services.templates.update>[0],
      ),
    'template.delete': (i) =>
      container.services.templates.delete((i as { id: string }).id),
    'template.instantiate': (i) =>
      container.services.templates.instantiate(
        i as Parameters<typeof container.services.templates.instantiate>[0],
      ),
    'backup.create': (i) =>
      container.services.backup.create(
        i as Parameters<typeof container.services.backup.create>[0],
      ),
    'backup.list': () => container.services.backup.list(),
    'backup.restore': (i) =>
      container.services.backup.restore(
        i as Parameters<typeof container.services.backup.restore>[0],
      ),
    'copilot.chat': (i) =>
      container.services.copilot.chat(
        i as Parameters<typeof container.services.copilot.chat>[0],
      ),
    'copilot.executeAction': (i) =>
      container.services.copilot.executeAction(
        i as Parameters<typeof container.services.copilot.executeAction>[0],
      ),
    'prompt.list': () => container.services.prompts.listPrompts(),
    'prompt.update': (i) => {
      const typed = i as { id: string; text: string };
      return container.services.prompts.updatePrompt(typed.id, typed.text);
    },
    'prompt.reset': (i) => {
      const typed = i as { id: string };
      return container.services.prompts.resetPrompt(typed.id);
    },
    'prompt.resetAll': () => container.services.prompts.resetAll(),
    'voice.transcribe': (i) => handleVoiceTranscribe(i, container),
    'voice.speak': (i) => handleVoiceSpeak(i, container),
    'voice.wake_detected': (i) => handleVoiceWakeDetected(i, container, getWindow),
    'voice.cost_summary': (i) => handleVoiceCostSummary(i, container),
    'voice.settings.get': (i) => handleVoiceSettingsGet(i, container),
    'voice.settings.set': (i) => handleVoiceSettingsSet(i, container),
    'voice.models.list': (i) => handleVoiceModelsList(i, container),
    'voice.test_connection': (i) => handleVoiceTestConnection(i, container),
  };
}

export function registerIpc(
  container: Container,
  getWindow: () => BrowserWindow | null,
): void {
  const handlers = createHandlers(container, getWindow);

  for (const [name, def] of Object.entries(Commands)) {
    const commandName = name as CommandName;
    ipcMain.handle(commandName, async (evt: IpcMainInvokeEvent, rawInput) => {
      // Only the main window may drive privileged commands. Without this, a
      // future second window, a stray frame, or a compromised renderer could
      // invoke handlers it was never meant to reach.
      const win = getWindow();
      if (!win || win.isDestroyed()) {
        throw new IpcError('POLICY_VIOLATION', `No window available for ${commandName}`);
      }
      if (evt.sender !== win.webContents) {
        throw new IpcError(
          'POLICY_VIOLATION',
          `IPC ${commandName} rejected: sender is not the main window`,
        );
      }

      const parsed = def.input.safeParse(rawInput);
      if (!parsed.success) {
        throw new IpcError(
          'POLICY_VIOLATION',
          `IPC_INVALID_INPUT:${commandName}:${parsed.error.message}`,
          { channel: commandName, issues: parsed.error.issues },
        );
      }
      const handler = handlers[commandName];
      const result = await handler(parsed.data);
      return def.output.parse(result);
    });
  }

  // Forward EventBus → renderer
  for (const name of Object.keys(Events) as Array<keyof typeof Events>) {
    container.events.on(name, (payload) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(name, payload);
      }
    });
  }
}

export function unregisterIpc(): void {
  for (const name of Object.keys(Commands)) {
    ipcMain.removeHandler(name);
  }
}
