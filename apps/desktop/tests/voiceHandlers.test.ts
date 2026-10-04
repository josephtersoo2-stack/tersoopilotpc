import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Container } from '@tersoo/core';
import {
  handleVoiceModelsList,
  handleVoiceTestConnection,
  handleVoiceTranscribe,
  handleVoiceSettingsGet,
  handleVoiceSettingsSet,
  normalizeTtsVoice,
} from '../src/ipc/handlers/voice';

describe('Voice IPC Handlers — Model Discovery & Connection Testing', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const createMockContainer = (apiKey = 'test-openrouter-key'): Container => {
    return {
      services: {
        llm: {
          getApiKey: vi.fn().mockImplementation((provider: string) => {
            if (provider === 'openrouter') return Promise.resolve(apiKey);
            return Promise.resolve('');
          }),
        },
      },
      repos: {
        settings: {
          get: vi.fn().mockImplementation((key: string) => {
            if (key === 'voice.stt_model') return Promise.resolve(JSON.stringify('openai/whisper-large-v3'));
            if (key === 'voice.tts_model') return Promise.resolve(JSON.stringify('mistralai/voxtral-mini-tts-2603'));
            if (key === 'voice.tts_voice') return Promise.resolve(JSON.stringify('en_paul_neutral'));
            if (key === 'voice.greeting_text') return Promise.resolve(JSON.stringify('Hello, voice test.'));
            return Promise.resolve(null);
          }),
        },
      },
      events: {
        emit: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Container;
  };

  describe('handleVoiceModelsList', () => {
    it('fetches models from OpenRouter and labels STT and TTS models clearly', async () => {
      const mockOpenRouterModels = {
        data: [
          {
            id: 'openai/gpt-audio-mini',
            name: 'OpenAI: GPT Audio Mini',
            description: 'Audio input and output model',
            architecture: {
              modality: 'text+audio->text+audio',
              input_modalities: ['text', 'audio'],
              output_modalities: ['text', 'audio'],
            },
          },
          {
            id: 'google/gemini-3.8-flash',
            name: 'Google: Gemini 3.8 Flash',
            description: 'Multimodal model with audio input',
            architecture: {
              modality: 'text+image+audio->text',
              input_modalities: ['text', 'image', 'audio'],
              output_modalities: ['text'],
            },
          },
          {
            id: 'google/lyria-3-pro-preview',
            name: 'Google: Lyria 3 Pro Preview',
            description: 'Neural voice generation',
            architecture: {
              modality: 'text->text+audio',
              input_modalities: ['text'],
              output_modalities: ['text', 'audio'],
            },
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOpenRouterModels,
      } as Response);

      const container = createMockContainer();
      const result = await handleVoiceModelsList({}, container);

      expect(result.sttModels.length).toBeGreaterThanOrEqual(4);
      expect(result.ttsModels.length).toBeGreaterThanOrEqual(3);

      // Verify STT models have [STT] label
      for (const m of result.sttModels) {
        expect(m.name).toMatch(/^\[STT\]/);
        expect(m.category).toBe('stt');
      }

      // Verify TTS models have [TTS] label
      for (const m of result.ttsModels) {
        expect(m.name).toMatch(/^\[TTS\]/);
        expect(m.category).toBe('tts');
      }

      // Check specific models
      expect(result.sttModels.some((m) => m.id === 'openai/whisper-large-v3')).toBe(true);
      expect(result.ttsModels.some((m) => m.id === 'mistralai/voxtral-mini-tts-2603')).toBe(true);
      expect(result.sttModels.some((m) => m.id === 'google/gemini-3.8-flash')).toBe(true);
      expect(result.ttsModels.some((m) => m.id === 'google/lyria-3-pro-preview')).toBe(true);
    });

    it('falls back to default models if OpenRouter request fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const container = createMockContainer();
      const result = await handleVoiceModelsList({}, container);

      expect(result.sttModels.length).toBeGreaterThan(0);
      expect(result.ttsModels.length).toBeGreaterThan(0);
      expect(result.sttModels[0]!.id).toBe('openai/whisper-large-v3');
      expect(result.ttsModels[0]!.id).toBe('mistralai/voxtral-mini-tts-2603');
    });
  });

  describe('handleVoiceTestConnection', () => {
    it('returns error if OpenRouter API key is missing', async () => {
      const container = createMockContainer('');
      const result = await handleVoiceTestConnection({}, container);

      expect(result.success).toBe(false);
      expect(result.message).toContain('API key');
    });

    it('returns 401 message when OpenRouter rejects credentials', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response);

      const container = createMockContainer('invalid-key');
      const result = await handleVoiceTestConnection({}, container);

      expect(result.success).toBe(false);
      expect(result.message).toContain('401 Unauthorized');
      expect(result.details?.openrouterConnected).toBe(false);
    });

    it('successfully validates OpenRouter connection and synthesizes speech', async () => {
      const mockModelsData = {
        data: [
          { id: 'openai/whisper-large-v3', architecture: { input_modalities: ['audio'] } },
          { id: 'mistralai/voxtral-mini-tts-2603', architecture: { output_modalities: ['audio'] } },
        ],
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockModelsData,
          });
        }
        if (url.includes('/audio/speech')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
          });
        }
        return Promise.reject(new Error('Unknown URL: ' + url));
      });

      const container = createMockContainer('sk-or-valid');
      const result = await handleVoiceTestConnection(
        {
          sttModel: 'openai/whisper-large-v3',
          ttsModel: 'mistralai/voxtral-mini-tts-2603',
          ttsVoice: 'en_paul_neutral',
        },
        container,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Voice system connected successfully');
      expect(result.audio).toBeDefined();
      expect(result.details?.openrouterConnected).toBe(true);
      expect(result.details?.sttVerified).toBe(true);
      expect(result.details?.ttsVerified).toBe(true);
      expect(result.sttModel).toBe('openai/whisper-large-v3');
      expect(result.ttsModel).toBe('mistralai/voxtral-mini-tts-2603');
    });

    it('reports TTS model error while confirming OpenRouter connectivity', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/models')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [] }),
          });
        }
        if (url.includes('/audio/speech')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: { message: 'Invalid model parameter' } }),
          });
        }
        return Promise.reject(new Error('Unknown URL: ' + url));
      });

      const container = createMockContainer('sk-or-valid');
      const result = await handleVoiceTestConnection(
        {
          ttsModel: 'nonexistent/model',
        },
        container,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('TTS test failed');
      expect(result.details?.openrouterConnected).toBe(true);
      expect(result.details?.ttsVerified).toBe(false);
    });
  });

  describe('handleVoiceTranscribe', () => {
    it('transcribes audio payload passed as Uint8Array via OpenRouter Whisper', async () => {
      let capturedBody: any = null;
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/audio/transcriptions')) {
          capturedBody = JSON.parse(init?.body as string);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              text: 'Create a new profile for fashion niche',
              usage: { cost: 0.0012 },
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL: ' + url));
      });

      const container = createMockContainer('sk-openrouter-whisper-test');
      const audioBytes = new Uint8Array([79, 103, 103, 83, 0, 2]); // dummy bytes

      const result = await handleVoiceTranscribe(
        {
          audio: audioBytes,
          format: 'webm',
          model: 'openai/whisper-large-v3',
          language: 'en',
        },
        container,
      );

      expect(result.text).toBe('Create a new profile for fashion niche');
      expect(result.cost).toBe(0.0012);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      expect(capturedBody).toBeDefined();
      expect(capturedBody.model).toBe('openai/whisper-large-v3');
      expect(capturedBody.input_audio.format).toBe('webm');
      expect(capturedBody.input_audio.data).toBe(Buffer.from(audioBytes).toString('base64'));
      expect(capturedBody.language).toBe('en');

      expect(container.events.emit).toHaveBeenCalledWith(
        'voice.transcribed',
        expect.objectContaining({
          model: 'openai/whisper-large-v3',
          cost: 0.0012,
        }),
      );
    });

    it('transcribes audio payload passed as ArrayBuffer', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Hello world transcription',
          usage: { cost: 0.0005 },
        }),
      });

      const container = createMockContainer('sk-openrouter-key');
      const arrayBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;

      const result = await handleVoiceTranscribe(
        {
          audio: arrayBuffer,
          format: 'webm',
        },
        container,
      );

      expect(result.text).toBe('Hello world transcription');
      expect(result.cost).toBe(0.0005);
    });

    it('handles OpenRouter API errors gracefully with descriptive error message', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Invalid API Key' } }),
      });

      const container = createMockContainer('sk-bad-key');
      await expect(
        handleVoiceTranscribe(
          {
            audio: new Uint8Array([1, 2, 3]),
            format: 'webm',
          },
          container,
        ),
      ).rejects.toThrow('STT 401: Invalid API Key');
    });
  });

  describe('handleVoiceSettingsGet and handleVoiceSettingsSet', () => {
    it('returns new defaults with 5000ms silence stop and pleasant chime', async () => {
      const container = {
        repos: {
          settings: {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
          },
        },
      } as unknown as Container;

      const settings = await handleVoiceSettingsGet({}, container);
      expect(settings.commandSilenceStopMs).toBe(5000);
      expect(settings.commandMaxDurationMs).toBe(300000);
      expect(settings.chimeSound).toBe('pleasant');
      expect(settings.wakeWordModel).toBe('hey_tersoo');
    });

    it('persists and returns updated voice settings', async () => {
      const db: Record<string, string> = {};
      const container = {
        repos: {
          settings: {
            get: vi.fn().mockImplementation((k: string) => Promise.resolve(db[k] ?? null)),
            set: vi.fn().mockImplementation((k: string, v: string) => {
              db[k] = v;
              return Promise.resolve();
            }),
          },
        },
      } as unknown as Container;

      const updated = await handleVoiceSettingsSet(
        {
          commandSilenceStopMs: 7000,
          commandMaxDurationMs: 600000,
          chimeSound: 'cyber',
          wakeWordModel: 'hey_jarvis',
        },
        container,
      );

      expect(updated.commandSilenceStopMs).toBe(7000);
      expect(updated.commandMaxDurationMs).toBe(600000);
      expect(updated.chimeSound).toBe('cyber');
      expect(updated.wakeWordModel).toBe('hey_jarvis');
    });

    it('normalizes legacy or invalid voices to valid alternatives', async () => {
      const container = {
        repos: {
          settings: {
            get: vi.fn().mockImplementation((k: string) => {
              if (k === 'voice.tts_voice') return Promise.resolve(JSON.stringify('en_mary_neutral'));
              if (k === 'voice.tts_model') return Promise.resolve(JSON.stringify('mistralai/voxtral-mini-tts-2603'));
              return Promise.resolve(null);
            }),
            set: vi.fn().mockResolvedValue(undefined),
          },
        },
      } as unknown as Container;

      const settings = await handleVoiceSettingsGet({}, container);
      expect(settings.ttsVoice).toBe('gb_jane_neutral');
    });
  });

  describe('normalizeTtsVoice', () => {
    it('maps en_mary_neutral to gb_jane_neutral for Voxtral', () => {
      expect(normalizeTtsVoice('mistralai/voxtral-mini-tts-2603', 'en_mary_neutral')).toBe('gb_jane_neutral');
    });

    it('maps en_alex_calm to en_paul_neutral for Voxtral', () => {
      expect(normalizeTtsVoice('mistralai/voxtral-mini-tts-2603', 'en_alex_calm')).toBe('en_paul_neutral');
    });

    it('preserves valid Voxtral voices', () => {
      expect(normalizeTtsVoice('mistralai/voxtral-mini-tts-2603', 'en_paul_neutral')).toBe('en_paul_neutral');
      expect(normalizeTtsVoice('mistralai/voxtral-mini-tts-2603', 'gb_jane_neutral')).toBe('gb_jane_neutral');
      expect(normalizeTtsVoice('mistralai/voxtral-mini-tts-2603', 'fr_marie_neutral')).toBe('fr_marie_neutral');
    });
  });
});
