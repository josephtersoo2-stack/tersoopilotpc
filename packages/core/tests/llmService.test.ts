import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmService } from '../src/llm/LlmService';
import { callOpenRouter } from '../src/llm/providers/openrouter';
import type { LlmDecision, VisionDecision } from '../src/llm/types';
import type { LlmConfigRepo } from '../src/persistence/repos/llmConfigRepo';
import type { LlmConfigRow } from '../src/persistence/schema';
import { MemorySecretDriver, SecretVault } from '../src/secrets/SecretVault';
import { TersooError } from '../src/util/errors';

describe('Phase 6: LLM Service & OpenRouter Integration', () => {
  describe('OpenRouter Provider Client (callOpenRouter)', () => {
    it('dispatches HTTP request with proper headers, model, and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ action: 'click', ref: 42 }),
              },
            },
          ],
        }),
      });

      const response = await callOpenRouter(
        {
          apiKey: 'sk-or-test-key',
          model: 'anthropic/claude-3.5-haiku',
          responseFormat: 'json_object',
        },
        [{ role: 'user', content: 'test message' }],
        mockFetch as unknown as typeof fetch,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(init.headers['Authorization']).toBe('Bearer sk-or-test-key');
      expect(init.headers['HTTP-Referer']).toBe('https://tersoopilot.dev');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('anthropic/claude-3.5-haiku');
      expect(body.response_format).toEqual({ type: 'json_object' });

      expect(JSON.parse(response)).toEqual({ action: 'click', ref: 42 });
    });

    it('throws TersooError with LLM_API_ERROR on non-200 HTTP response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(
        callOpenRouter(
          { apiKey: 'sk-or-test-key', model: 'anthropic/claude-3.5-haiku' },
          [{ role: 'user', content: 'test' }],
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrowError(TersooError);
    });

    it('throws LLM_API_ERROR when OpenRouter response has empty choices', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }),
      });

      await expect(
        callOpenRouter(
          { apiKey: 'sk-or-test-key', model: 'anthropic/claude-3.5-haiku' },
          [{ role: 'user', content: 'test' }],
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow('OpenRouter returned empty response');
    });

    it('falls back to reasoning content if message.content is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: '',
                reasoning: 'I have reasoned through the answer: Connected!',
              },
            },
          ],
        }),
      });

      const res = await callOpenRouter(
        { apiKey: 'sk-or-test-key', model: 'deepseek/deepseek-v4.1-flash' },
        [{ role: 'user', content: 'test' }],
        mockFetch as unknown as typeof fetch,
      );

      expect(res).toBe('I have reasoned through the answer: Connected!');
    });

    it('throws descriptive error when tokens exhausted (finish_reason: length) with empty content', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: 'length',
              message: {
                role: 'assistant',
                content: '',
              },
            },
          ],
        }),
      });

      await expect(
        callOpenRouter(
          { apiKey: 'sk-or-test-key', model: 'deepseek/deepseek-v4.1-flash', maxTokens: 200 },
          [{ role: 'user', content: 'test' }],
          mockFetch as unknown as typeof fetch,
        ),
      ).rejects.toThrow(/token limit \(200\) reached before completion/);
    });
  });

  describe('LlmService (decideFromTree, decideFromScreenshot, test)', () => {
    let mockSecrets: SecretVault;
    let mockConfigRepo: LlmConfigRepo;
    let defaultConfig: LlmConfigRow;

    beforeEach(async () => {
      mockSecrets = new SecretVault(new MemorySecretDriver());
      await mockSecrets.set('llm.openrouter.key', 'vault-secret-key-12345');

      defaultConfig = {
        id: 1,
        provider: 'openrouter',
        text_model: 'anthropic/claude-3.5-haiku',
        vision_model: 'anthropic/claude-3.5-sonnet',
        api_key_ref: 'llm.openrouter.key',
        max_attempts: 3,
        backoff_ms: '[10, 20, 30]',
        vision_enabled: 1,
        updated_at: Date.now(),
      };

      mockConfigRepo = {
        get: vi.fn().mockResolvedValue(defaultConfig),
        update: vi.fn().mockResolvedValue(undefined),
      } as unknown as LlmConfigRepo;
    });

    it('decides action from accessibility tree and retrieves API key from vault', async () => {
      const expectedDecision: LlmDecision = {
        action: 'click',
        ref: 12,
        reason: 'Submit order button',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(expectedDecision) } }],
        }),
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      const decision = await service.decideFromTree(
        { ref: 1, role: 'WebArea', name: 'Checkout' },
        'Click the submit button',
      );

      expect(decision).toEqual(expectedDecision);
      // Verify API key used in call was from the vault
      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Authorization']).toBe('Bearer vault-secret-key-12345');
    });

    it('successfully parses decision wrapped in markdown code fences', async () => {
      const expectedDecision: LlmDecision = {
        action: 'click',
        ref: 12,
        reason: 'Submit order button',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '```json\n' + JSON.stringify(expectedDecision) + '\n```' } }],
        }),
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      const decision = await service.decideFromTree(
        { ref: 1, role: 'WebArea', name: 'Checkout' },
        'Click the submit button',
      );

      expect(decision).toEqual(expectedDecision);
    });

    it('retries on transient failure and succeeds on subsequent attempt', async () => {
      const expectedDecision: LlmDecision = { action: 'done', reason: 'Finished' };

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(expectedDecision) } }],
          }),
        };
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      const decision = await service.decideFromTree(
        { ref: 1, role: 'WebArea', name: 'Home' },
        'Confirm completed',
      );

      expect(callCount).toBe(2);
      expect(decision).toEqual(expectedDecision);
    });

    it('throws LLM_EXHAUSTED when all retry attempts fail', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      await expect(
        service.decideFromTree({ ref: 1, role: 'WebArea', name: 'Home' }, 'Do something'),
      ).rejects.toThrowError(TersooError);
    });

    it('decides action from screenshot using vision model', async () => {
      const expectedVision: VisionDecision = {
        action: 'click',
        x: 120,
        y: 340,
        reason: 'Select motorcycle tile',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(expectedVision) } }],
        }),
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      const fakeImage = Buffer.from('fake-png-data');
      const decision = await service.decideFromScreenshot(fakeImage, 'Solve captcha');

      expect(decision).toEqual(expectedVision);
      const [, init] = mockFetch.mock.calls[0]!;
      const body = JSON.parse(init.body);
      expect(body.model).toBe('anthropic/claude-3.5-sonnet');
      expect(body.messages[1].content[1].image_url.url).toContain('data:image/png;base64,');
    });

    it('throws VISION_DISABLED when vision_enabled is 0', async () => {
      defaultConfig.vision_enabled = 0;
      const service = new LlmService(mockConfigRepo, mockSecrets);
      const fakeImage = Buffer.from('fake-png-data');

      await expect(service.decideFromScreenshot(fakeImage, 'Solve captcha')).rejects.toThrow(
        expect.objectContaining({ code: 'VISION_DISABLED' }),
      );
    });

    it('throws VISION_MODEL_MISSING when vision_model is null', async () => {
      defaultConfig.vision_model = null;
      const service = new LlmService(mockConfigRepo, mockSecrets);
      const fakeImage = Buffer.from('fake-png-data');

      await expect(service.decideFromScreenshot(fakeImage, 'Solve captcha')).rejects.toThrow(
        expect.objectContaining({ code: 'VISION_MODEL_MISSING' }),
      );
    });

    it('test() method invokes decision and returns structured test result', async () => {
      const expectedDecision: LlmDecision = { action: 'done' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(expectedDecision) } }],
        }),
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      const res = await service.test('Say hello');
      expect(res.ok).toBe(true);
      expect(res.provider).toBe('openrouter');
      expect(res.model).toBe('anthropic/claude-3.5-haiku');
      expect(res.response).toBe(JSON.stringify(expectedDecision));
      expect(typeof res.latencyMs).toBe('number');
    });

    it('routes to Gemini when provider is gemini', async () => {
      defaultConfig.provider = 'gemini';
      defaultConfig.text_model = 'gemini-1.5-flash';
      mockSecrets.get = vi.fn().mockResolvedValue('fake-gemini-key');

      const expectedDecision: LlmDecision = { action: 'done' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(expectedDecision) }] } }],
        }),
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      const res = await service.decideFromTree({ ref: 1, role: 'root', name: 'Root' }, 'Click Next');
      expect(res).toEqual(expectedDecision);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=fake-gemini-key'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('fetches live models from provider', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'google/gemini-2.0-flash',
              name: 'Google Gemini 2.0 Flash',
              context_length: 1048576,
              architecture: { modality: 'multimodal' },
              pricing: { prompt: '0', completion: '0' },
            },
          ],
        }),
      });

      const service = new LlmService(mockConfigRepo, mockSecrets, mockFetch as unknown as typeof fetch);
      const models = await service.fetchModels('openrouter');
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('google/gemini-2.0-flash');
      expect(models[0].supportsVision).toBe(true);
      expect(models[0].isFree).toBe(true);
    });

    it('saves API key and returns status', async () => {
      const service = new LlmService(mockConfigRepo, mockSecrets);
      await service.saveApiKey('gemini', 'AIzaSyTestKey123456');
      const storedKey = await mockSecrets.get('llm/gemini/key');
      expect(storedKey).toBe('AIzaSyTestKey123456');

      const statusRes = await service.getApiKeyStatus('gemini');
      expect(statusRes.hasKey).toBe(true);
      expect(statusRes.maskedKey).toContain('AIzaSy');
    });
  });
});
