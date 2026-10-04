import { create } from 'zustand';
import { invokeIpc } from '../lib/ipc';
import { playBase64Audio } from '../utils/audioPlayer';

export interface EngineWeights {
  apostate: number;
  camoufox: number;
}

import type {
  LlmModelInfo,
  VoiceSettings,
  VoiceCostSummary,
  VoiceModelInfo,
  VoiceTestConnectionInput,
  VoiceTestConnectionOutput,
} from '@tersoo/contracts';

export interface LlmConfig {
  provider: 'openrouter' | 'openai' | 'gemini' | 'deepseek';
  text_model: string;
  vision_model: string | null;
  api_key_ref: string;
  max_attempts: number;
  backoff_ms: string;
  vision_enabled: boolean;
  hasOpenrouterKey?: boolean;
  hasGeminiKey?: boolean;
}

export interface RamCheckSettings {
  skipRamCheck: boolean;
  memoryPressureThresholdPct: number;
}

export interface LaunchIntervalSettings {
  minSec: number;
  maxSec: number;
  concurrency: number;
}

export interface SettingsState {
  // Engine Distribution Weights
  engineWeights: EngineWeights;
  loadingWeights: boolean;

  // Profile Launch & Concurrency
  launchInterval: LaunchIntervalSettings;
  loadingLaunchInterval: boolean;

  // LLM Settings
  llmConfig: LlmConfig;
  loadingLlm: boolean;
  testingLlm: boolean;
  testLlmResult: { success: boolean; message: string; latencyMs?: number; model?: string } | null;

  // LLM Keys & Live Models
  openrouterKeyStatus: { hasKey: boolean; maskedKey: string };
  geminiKeyStatus: { hasKey: boolean; maskedKey: string };
  modelsList: LlmModelInfo[];
  loadingModels: boolean;
  modelsError: string | null;

  // CAPTCHA Settings
  captchaBudget: number;
  loadingCaptcha: boolean;

  // RAM Check Settings
  ramCheck: RamCheckSettings;

  // Voice & Wake Word
  voice: VoiceSettings;
  voiceCost: VoiceCostSummary | null;
  loadingVoice: boolean;
  testingVoice: boolean;
  sttModels: VoiceModelInfo[];
  ttsModels: VoiceModelInfo[];
  loadingVoiceModels: boolean;
  voiceModelsError: string | null;
  testingVoiceConnection: boolean;
  voiceTestResult: VoiceTestConnectionOutput | null;

  // General state
  error: string | null;

  // Actions
  loadAllSettings: () => Promise<void>;
  updateWeights: (weights: EngineWeights) => Promise<void>;
  updateLaunchInterval: (settings: { minSec: number; maxSec: number; concurrency?: number }) => Promise<void>;
  updateLlmConfig: (patch: Partial<LlmConfig>) => Promise<void>;
  saveApiKey: (provider: 'openrouter' | 'gemini', apiKey: string) => Promise<void>;
  refreshKeyStatus: () => Promise<void>;
  fetchModels: (provider?: 'openrouter' | 'gemini', apiKey?: string) => Promise<void>;
  updateCaptchaBudget: (budget: number) => Promise<void>;
  updateRamCheck: (settings: Partial<RamCheckSettings>) => Promise<void>;
  loadVoiceSettings: () => Promise<void>;
  updateVoiceSettings: (patch: Partial<VoiceSettings>) => Promise<void>;
  loadVoiceCostSummary: (range?: { fromMs?: number; toMs?: number }) => Promise<void>;
  fetchVoiceModels: (forceRefresh?: boolean) => Promise<void>;
  testVoice: (text?: string) => Promise<void>;
  testVoiceConnection: (override?: Partial<VoiceTestConnectionInput>) => Promise<VoiceTestConnectionOutput>;
  testLlmConnection: (
    prompt?: string,
    override?: { provider?: 'openrouter' | 'gemini'; model?: string; apiKey?: string },
  ) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  engineWeights: { apostate: 70, camoufox: 30 },
  loadingWeights: false,

  launchInterval: { minSec: 10, maxSec: 30, concurrency: 3 },
  loadingLaunchInterval: false,

  llmConfig: {
    provider: 'openrouter',
    text_model: 'deepseek/deepseek-chat',
    vision_model: 'deepseek/deepseek-chat',
    api_key_ref: '',
    max_attempts: 3,
    backoff_ms: '[1000, 3000, 9000]',
    vision_enabled: true,
  },
  loadingLlm: false,
  testingLlm: false,
  testLlmResult: null,

  openrouterKeyStatus: { hasKey: false, maskedKey: '' },
  geminiKeyStatus: { hasKey: false, maskedKey: '' },
  modelsList: [],
  loadingModels: false,
  modelsError: null,

  captchaBudget: 3,
  loadingCaptcha: false,
  ramCheck: { skipRamCheck: false, memoryPressureThresholdPct: 0.95 },
  voice: {
    sttModel: 'openai/whisper-large-v3',
    sttLanguage: null,
    ttsModel: 'mistralai/voxtral-mini-tts-2603',
    ttsVoice: 'en_paul_neutral',
    autoSpeak: true,
    wakeWordEnabled: true,
    wakeWordModel: 'hey_tersoo',
    wakeWordThreshold: 0.5,
    greetingText: 'Yes, how can I help?',
    commandMaxDurationMs: 300000,
    commandSilenceStopMs: 5000,
    chimeSound: 'pleasant' as any,
  },
  voiceCost: null,
  loadingVoice: false,
  testingVoice: false,
  sttModels: [],
  ttsModels: [],
  loadingVoiceModels: false,
  voiceModelsError: null,
  testingVoiceConnection: false,
  voiceTestResult: null,
  error: null,

  loadAllSettings: async () => {
    try {
      // 1. Load weights
      set({ loadingWeights: true });
      try {
        const weights = await invokeIpc('settings.weights.get');
        if (weights && typeof weights.apostate === 'number') {
          set({ engineWeights: weights });
        }
      } catch {
        // fallback to default 70/30
      } finally {
        set({ loadingWeights: false });
      }

      // 2. Load LLM config & Key status
      set({ loadingLlm: true });
      try {
        const config = await invokeIpc('llm.config.get');
        if (config) {
          set({
            llmConfig: {
              provider: config.provider ?? 'openrouter',
              text_model: config.text_model ?? 'deepseek/deepseek-chat',
              vision_model: config.vision_model ?? null,
              api_key_ref: '',
              max_attempts: config.max_attempts ?? 3,
              backoff_ms: config.backoff_ms ?? '[1000, 3000, 9000]',
              vision_enabled: Boolean(config.vision_enabled),
              hasOpenrouterKey: Boolean(config.hasOpenrouterKey),
              hasGeminiKey: Boolean(config.hasGeminiKey),
            },
          });
        }
        await get().refreshKeyStatus();
        void get().fetchModels();
      } catch {
        // keep defaults
      } finally {
        set({ loadingLlm: false });
      }

      // 3. Load CAPTCHA budget
      set({ loadingCaptcha: true });
      try {
        set({ captchaBudget: 3 });
      } finally {
        set({ loadingCaptcha: false });
      }

      // 4. Load RAM check settings
      try {
        const rc = await invokeIpc('settings.ramCheck.get');
        if (rc) {
          set({ ramCheck: { skipRamCheck: rc.skipRamCheck, memoryPressureThresholdPct: rc.memoryPressureThresholdPct } });
        }
      } catch {
        // keep defaults
      }

      // 5. Load Launch Interval settings
      set({ loadingLaunchInterval: true });
      try {
        const li = await invokeIpc('settings.launchInterval.get');
        if (li && typeof li.minSec === 'number' && typeof li.maxSec === 'number') {
          set({ launchInterval: { minSec: li.minSec, maxSec: li.maxSec, concurrency: li.concurrency ?? 3 } });
        }
      } catch {
        // keep defaults
      } finally {
        set({ loadingLaunchInterval: false });
      }

      // 6. Load Voice settings, Cost & Models
      await get().loadVoiceSettings();
      void get().loadVoiceCostSummary();
      void get().fetchVoiceModels();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  updateWeights: async (weights: EngineWeights) => {
    try {
      await invokeIpc('settings.weights.set', weights);
      set({ engineWeights: weights });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  updateLaunchInterval: async (settings: { minSec: number; maxSec: number; concurrency?: number }) => {
    try {
      await invokeIpc('settings.launchInterval.set', settings);
      set((state) => ({
        launchInterval: {
          minSec: settings.minSec,
          maxSec: settings.maxSec,
          concurrency: settings.concurrency ?? state.launchInterval.concurrency,
        },
      }));
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  updateLlmConfig: async (patch: Partial<LlmConfig>) => {
    try {
      const updated = { ...get().llmConfig, ...patch };
      await invokeIpc('llm.config.set', {
        provider: updated.provider,
        text_model: updated.text_model,
        vision_model: updated.vision_model,
        vision_enabled: updated.vision_enabled,
        max_attempts: updated.max_attempts,
        backoff_ms: updated.backoff_ms,
      });
      set({ llmConfig: updated, error: null });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  saveApiKey: async (provider: 'openrouter' | 'gemini', apiKey: string) => {
    try {
      await invokeIpc('llm.key.set', { provider, apiKey });
      await get().refreshKeyStatus();
      await get().fetchModels(provider, apiKey);
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  refreshKeyStatus: async () => {
    try {
      const orStatus = await invokeIpc('llm.key.get', { provider: 'openrouter' });
      const gemStatus = await invokeIpc('llm.key.get', { provider: 'gemini' });
      set({
        openrouterKeyStatus: orStatus,
        geminiKeyStatus: gemStatus,
      });
    } catch {
      // best effort
    }
  },

  fetchModels: async (provider?: 'openrouter' | 'gemini', apiKey?: string) => {
    const activeProvider = provider || (get().llmConfig.provider as 'openrouter' | 'gemini') || 'openrouter';
    set({ loadingModels: true, modelsError: null });
    try {
      const list = await invokeIpc('llm.models.list', { provider: activeProvider, apiKey });
      set({ modelsList: list, loadingModels: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ modelsError: msg, loadingModels: false });
    }
  },

  updateCaptchaBudget: async (budget: number) => {
    set({ captchaBudget: budget });
  },

  updateRamCheck: async (patch: Partial<RamCheckSettings>) => {
    try {
      const updated = { ...get().ramCheck, ...patch };
      await invokeIpc('settings.ramCheck.set', updated);
      set({ ramCheck: updated });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  testLlmConnection: async (prompt = 'Ping connection test.', override) => {
    set({ testingLlm: true, testLlmResult: null });
    try {
      const activeProvider = override?.provider || (get().llmConfig.provider as 'openrouter' | 'gemini') || 'openrouter';
      const activeModel = override?.model || get().llmConfig.text_model;
      const res = await invokeIpc('llm.test', {
        prompt,
        provider: activeProvider,
        model: activeModel,
        apiKey: override?.apiKey,
      });
      set({
        testingLlm: false,
        testLlmResult: {
          success: true,
          message: res.response || 'Connection established successfully.',
          latencyMs: res.latencyMs,
          model: res.model,
        },
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        testingLlm: false,
        testLlmResult: { success: false, message: msg },
      });
      return false;
    }
  },

  loadVoiceSettings: async () => {
    set({ loadingVoice: true });
    try {
      const v = await invokeIpc('voice.settings.get');
      if (v) {
        set({ voice: v });
      }
    } catch {
      // keep defaults
    } finally {
      set({ loadingVoice: false });
    }
  },

  updateVoiceSettings: async (patch: Partial<VoiceSettings>) => {
    try {
      const updated = await invokeIpc('voice.settings.set', patch);
      if (updated) {
        set({ voice: updated });
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  },

  loadVoiceCostSummary: async (range?: { fromMs?: number; toMs?: number }) => {
    try {
      const cost = await invokeIpc('voice.cost_summary', range ?? {});
      if (cost) {
        set({ voiceCost: cost });
      }
    } catch {
      // ignore
    }
  },

  fetchVoiceModels: async (forceRefresh = false) => {
    set({ loadingVoiceModels: true, voiceModelsError: null });
    try {
      const res = await invokeIpc('voice.models.list', { refresh: forceRefresh });
      if (res) {
        set({
          sttModels: res.sttModels || [],
          ttsModels: res.ttsModels || [],
          loadingVoiceModels: false,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ voiceModelsError: msg, loadingVoiceModels: false });
    }
  },

  testVoice: async (text?: string) => {
    set({ testingVoice: true });
    try {
      const voice = get().voice;
      const res = await invokeIpc('voice.speak', {
        text: text ?? voice.greetingText ?? 'Yes, how can I help?',
        voice: voice.ttsVoice,
        model: voice.ttsModel,
        responseFormat: 'mp3',
      });
      if (res?.audio) {
        await playBase64Audio(res.audio, res.format ?? 'mp3');
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      set({ testingVoice: false });
    }
  },

  testVoiceConnection: async (override?: Partial<VoiceTestConnectionInput>) => {
    set({ testingVoiceConnection: true, voiceTestResult: null });
    try {
      const voice = get().voice;
      const res = await invokeIpc('voice.test_connection', {
        sttModel: override?.sttModel || voice.sttModel,
        ttsModel: override?.ttsModel || voice.ttsModel,
        ttsVoice: override?.ttsVoice || voice.ttsVoice,
        greetingText: override?.greetingText || voice.greetingText,
      });
      set({ voiceTestResult: res });
      if (res?.audio) {
        try {
          await playBase64Audio(res.audio, res.format ?? 'mp3');
        } catch (playErr) {
          console.warn('[testVoiceConnection] Audio playback failed:', playErr);
        }
      }
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const failResult: VoiceTestConnectionOutput = {
        success: false,
        latencyMs: 0,
        sttModelsCount: 0,
        ttsModelsCount: 0,
        message: msg,
      };
      set({ voiceTestResult: failResult });
      return failResult;
    } finally {
      set({ testingVoiceConnection: false });
    }
  },
}));
