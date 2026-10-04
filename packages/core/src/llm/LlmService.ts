import type { LlmModelInfo, LlmTestInput, LlmTestResult } from '@tersoo/contracts';

import type { AccessibilityNode } from '../crosshair/accessibility';
import { formatPageTree, type PageTree } from '../crosshair/pageTree';
import type { LlmConfigRepo } from '../persistence/repos/llmConfigRepo';
import type { SecretVault } from '../secrets/SecretVault';
import { TersooError } from '../util/errors';

import { TREE_SYSTEM_PROMPT, VISION_SYSTEM_PROMPT } from './prompts';
import { callGemini, fetchGeminiModels } from './providers/gemini';
import { callOpenRouter, fetchOpenRouterModels, type OpenRouterMessage } from './providers/openrouter';
import { looksLikeRawProviderApiKey } from './rawKeyGuard';
import type { LlmDecision, LlmStepContext, LlmTree, VisionDecision } from './types';
import type { PromptService } from '../services/PromptService';

/** How many past actions are replayed to the model as memory. */
const HISTORY_LIMIT = 12;

const KNOWN_ACTIONS = new Set([
  'click',
  'type',
  'press',
  'scroll',
  'navigate',
  'wait',
  'done',
  'unsolvable',
]);

function stripFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  }
  return cleaned;
}

function parseJsonResponse<T>(content: string): T {
  const cleaned = stripFences(content);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // A model that wrapped its answer in prose is recoverable: take the first
    // balanced JSON object in the reply rather than failing the whole step.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const candidate = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // Fall through to the actionable error below.
      }
    }
    throw new TersooError(
      'LLM_BAD_RESPONSE',
      `The model did not return JSON. First 200 characters: ${cleaned.slice(0, 200)}`,
    );
  }
}

function isPageTree(tree: LlmTree | AccessibilityNode): tree is PageTree {
  return Array.isArray((tree as PageTree).nodes) && typeof (tree as PageTree).source === 'string';
}

/**
 * Renders whichever description the caller has into the text the model reads.
 */
export function renderTreeForModel(tree: LlmTree | AccessibilityNode): string {
  if (isPageTree(tree)) return formatPageTree(tree);
  return JSON.stringify(tree);
}

function asReason(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : undefined;
}

/**
 * Accepts a `ref` that is a number or a numeric string.
 *
 * Models routinely emit `"ref": "12"`; rejecting that would fail an otherwise
 * usable answer.
 */
function toRef(value: unknown): number | null {
  const raw = typeof value === 'string' ? Number(value.trim()) : value;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Returns an absolute http(s) URL, or null.
 *
 * Guards `page.goto` against a model handing back a relative path, a
 * `javascript:` URL, or a shell fragment.
 */
export function normalizeAbsoluteUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();

  // Already absolute: validate but hand back the model's own string, so a URL
  // the model read off the page is not silently rewritten.
  if (/^https?:\/\//i.test(raw)) {
    return isUsableWebUrl(raw) ? raw : null;
  }

  // Models often answer with a bare host ("example.com/search"). Assume https.
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(raw)) {
    return `https://${raw}`;
  }

  return null;
}

function isUsableWebUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export class LlmService {
  constructor(
    private configRepo: LlmConfigRepo,
    private secrets: SecretVault,
    private fetchFn: typeof fetch = fetch,
    private prompts?: PromptService | undefined,
  ) {}

  private async resolveKey(provider: 'openrouter' | 'gemini', explicitKey?: string, fallbackRef?: string): Promise<string> {
    if (explicitKey && explicitKey.trim()) {
      return explicitKey.trim();
    }

    // 1. Check dedicated provider key slot in SecretVault
    const stored = await this.secrets.get(`llm/${provider}/key`);
    if (stored && stored.trim()) {
      return stored.trim();
    }

    // 2. Check fallback ref in SecretVault.
    // A reference that is not in the vault is treated as missing. We never fall
    // back to using the column value itself: that column lives in an
    // unencrypted SQLite file and in every database backup.
    if (fallbackRef) {
      const fromRef = await this.secrets.get(fallbackRef);
      if (fromRef && fromRef.trim()) {
        return fromRef.trim();
      }
    }

    throw new TersooError(
      'LLM_KEY_MISSING',
      `API key missing for ${provider === 'openrouter' ? 'OpenRouter' : 'Google Gemini'}. Please enter and save your API key in Settings.`,
    );
  }

  /**
   * One-time repair for builds that stored a literal API key in
   * `llm_config.api_key_ref`.
   *
   * The value is moved into the OS-backed vault and the column is rewritten to a
   * proper reference, so the plaintext key no longer exists in the database or
   * in backups taken after this runs. Returns a description of what changed for
   * logging; never returns or logs a secret value.
   */
  async migrateLegacyInlineApiKeys(): Promise<{ migrated: boolean; provider: string | null }> {
    const config = await this.configRepo.get();
    const ref = config?.api_key_ref;
    if (!ref || !looksLikeRawProviderApiKey(ref)) {
      return { migrated: false, provider: null };
    }

    const provider = (config?.provider as 'openrouter' | 'gemini') ?? 'openrouter';
    const literal = ref.trim();

    // Only migrate if the vault does not already hold a key for this provider;
    // never clobber a good stored credential with a stale column value.
    const existing = await this.secrets.get(`llm/${provider}/key`);
    if (!existing || !existing.trim()) {
      await this.secrets.set(`llm/${provider}/key`, literal);
    }

    await this.configRepo.update({ api_key_ref: `llm/${provider}/key` });
    return { migrated: true, provider };
  }

  private async executeWithRetry(
    provider: 'openrouter' | 'gemini',
    apiKey: string,
    model: string,
    messages: OpenRouterMessage[],
    maxAttempts = 3,
    backoffMs = [1000, 3000, 9000],
    responseFormat: 'json_object' | 'text' = 'json_object',
  ): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        if (provider === 'gemini') {
          return await callGemini({ apiKey, model, responseFormat }, messages, this.fetchFn);
        } else {
          return await callOpenRouter({ apiKey, model, responseFormat }, messages, this.fetchFn);
        }
      } catch (err) {
        if (i === maxAttempts - 1) throw err;
        await new Promise((r) => setTimeout(r, backoffMs[i] ?? 3000));
      }
    }
    throw new TersooError('LLM_EXHAUSTED', 'All LLM attempts failed');
  }

  /**
   * Asks the model for the next action.
   *
   * The payload deliberately carries more than the page description: the current
   * URL and title (without them the model cannot tell it is on the wrong site
   * and therefore cannot navigate), the actions already taken, and the reason
   * the last one failed. Without that memory the model re-issues the same
   * action every turn and the step dies on the iteration cap.
   */
  async decideFromTree(
    tree: LlmTree,
    goal: string,
    context: LlmStepContext = {},
  ): Promise<LlmDecision> {
    const config = await this.configRepo.get();
    if (!config) throw new TersooError('LLM_CONFIG_MISSING', 'LLM config missing');

    const provider = (config.provider as 'openrouter' | 'gemini') || 'openrouter';
    const apiKey = await this.resolveKey(provider, undefined, config.api_key_ref);
    const attempts = config.max_attempts || 3;
    const backoff = (config.backoff_ms ? JSON.parse(config.backoff_ms) : [1000, 3000, 9000]) as number[];

    const systemPrompt = this.prompts
      ? await this.prompts.getPrompt('tree_system')
      : TREE_SYSTEM_PROMPT;

    const history = context.history ?? [];
    const payload = {
      goal,
      page: {
        url: isPageTree(tree) ? tree.url : '',
        title: isPageTree(tree) ? tree.title : '',
        iteration: context.iteration ?? 1,
        maxIterations: context.maxIterations ?? 1,
      },
      ...(context.persona ? { persona: context.persona } : {}),
      preferredResultRef: context.preferredResultRef ?? null,
      previousActions: history.slice(-HISTORY_LIMIT),
      lastError: context.lastError ?? null,
      tree: renderTreeForModel(tree),
    };

    const content = await this.executeWithRetry(
      provider,
      apiKey,
      config.text_model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      attempts,
      backoff,
      'json_object',
    );

    return this.parseDecision(content);
  }

  /**
   * Turns a model reply into a decision the executor can trust.
   *
   * A malformed or unknown action is reported to the caller as a rejection so
   * the loop can tell the model what went wrong and try again, instead of
   * crashing the run on a stray token.
   */
  private parseDecision(content: string): LlmDecision {
    const parsed = parseJsonResponse<Record<string, unknown>>(content);
    const action = typeof parsed?.action === 'string' ? parsed.action.trim().toLowerCase() : '';

    if (!action || !KNOWN_ACTIONS.has(action)) {
      throw new TersooError(
        'LLM_BAD_RESPONSE',
        `The model returned an unknown action ${JSON.stringify(parsed?.action)}. Allowed: ${[...KNOWN_ACTIONS].join(', ')}.`,
      );
    }

    switch (action) {
      case 'click': {
        const ref = toRef(parsed.ref);
        if (ref === null) {
          throw new TersooError('LLM_BAD_RESPONSE', 'A "click" action needs an integer "ref" from the current tree.');
        }
        const reason = asReason(parsed.reason);
        return reason ? { action: 'click', ref, reason } : { action: 'click', ref };
      }
      case 'type': {
        const ref = toRef(parsed.ref);
        const text = typeof parsed.text === 'string' ? parsed.text : '';
        if (ref === null || !text) {
          throw new TersooError(
            'LLM_BAD_RESPONSE',
            'A "type" action needs an integer "ref" and a non-empty "text".',
          );
        }
        const pressEnter = parsed.pressEnter === true;
        const reason = asReason(parsed.reason);
        return reason
          ? { action: 'type', ref, text, pressEnter, reason }
          : { action: 'type', ref, text, pressEnter };
      }
      case 'press': {
        const key = typeof parsed.key === 'string' ? parsed.key.trim() : '';
        if (!key) {
          throw new TersooError('LLM_BAD_RESPONSE', 'A "press" action needs a "key", e.g. "Enter".');
        }
        const reason = asReason(parsed.reason);
        return reason ? { action: 'press', key, reason } : { action: 'press', key };
      }
      case 'scroll': {
        const direction = parsed.direction === 'up' ? 'up' : 'down';
        const raw = Number(parsed.amount);
        const amount = Number.isFinite(raw) ? Math.min(4000, Math.max(50, Math.abs(raw))) : 400;
        const reason = asReason(parsed.reason);
        return reason ? { action: 'scroll', direction, amount, reason } : { action: 'scroll', direction, amount };
      }
      case 'navigate': {
        const url = normalizeAbsoluteUrl(parsed.url);
        if (!url) {
          throw new TersooError(
            'LLM_BAD_RESPONSE',
            'A "navigate" action needs an absolute http(s) URL, e.g. "https://example.com/page".',
          );
        }
        const reason = asReason(parsed.reason);
        return reason ? { action: 'navigate', url, reason } : { action: 'navigate', url };
      }
      case 'wait': {
        const raw = Number(parsed.ms);
        const ms = Number.isFinite(raw) ? Math.min(30000, Math.max(0, raw)) : 1000;
        const reason = asReason(parsed.reason);
        return reason ? { action: 'wait', ms, reason } : { action: 'wait', ms };
      }
      case 'unsolvable': {
        const reason = typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : 'No reason given.';
        return { action: 'unsolvable', reason };
      }
      default: {
        const reason = asReason(parsed.reason);
        return reason ? { action: 'done', reason } : { action: 'done' };
      }
    }
  }

  async decideFromScreenshot(image: Buffer, prompt: string): Promise<VisionDecision> {
    const config = await this.configRepo.get();
    if (!config) throw new TersooError('LLM_CONFIG_MISSING', 'LLM config missing');
    if (!config.vision_enabled) throw new TersooError('VISION_DISABLED', 'Vision is disabled in Settings');
    if (!config.vision_model) throw new TersooError('VISION_MODEL_MISSING', 'Vision model not configured');

    const provider = (config.provider as 'openrouter' | 'gemini') || 'openrouter';
    const apiKey = await this.resolveKey(provider, undefined, config.api_key_ref);
    const attempts = config.max_attempts || 3;
    const backoff = (config.backoff_ms ? JSON.parse(config.backoff_ms) : [1000, 3000, 9000]) as number[];

    const systemPrompt = this.prompts
      ? await this.prompts.getPrompt('vision_system')
      : VISION_SYSTEM_PROMPT;

    const content = await this.executeWithRetry(
      provider,
      apiKey,
      config.vision_model,
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } },
          ],
        },
      ],
      attempts,
      backoff,
      'json_object',
    );

    return parseJsonResponse<VisionDecision>(content);
  }

  async chat(
    messages: OpenRouterMessage[],
    responseFormat: 'text' | 'json_object' = 'text',
    modelOverride?: string,
  ): Promise<string> {
    const config = await this.configRepo.get();
    if (!config) throw new TersooError('LLM_CONFIG_MISSING', 'LLM configuration missing in Settings');

    const provider = (config.provider as 'openrouter' | 'gemini') || 'openrouter';
    const apiKey = await this.resolveKey(provider, undefined, config.api_key_ref);
    const attempts = config.max_attempts || 3;
    const backoff = (config.backoff_ms ? JSON.parse(config.backoff_ms) : [1000, 3000, 9000]) as number[];
    const model = modelOverride || config.text_model || (provider === 'gemini' ? 'gemini-1.5-flash' : 'google/gemini-flash-1.5');

    return await this.executeWithRetry(
      provider,
      apiKey,
      model,
      messages,
      attempts,
      backoff,
      responseFormat,
    );
  }

  async saveApiKey(provider: 'openrouter' | 'gemini', apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    await this.secrets.set(`llm/${provider}/key`, trimmed);

    // Keep config api_key_ref aligned
    const current = await this.configRepo.get();
    if (current && current.provider === provider) {
      await this.configRepo.update({ api_key_ref: `llm/${provider}/key` });
    }
  }

  async getApiKeyStatus(provider: 'openrouter' | 'gemini'): Promise<{ hasKey: boolean; maskedKey: string }> {
    let key = await this.secrets.get(`llm/${provider}/key`);
    if (!key) {
      const config = await this.configRepo.get();
      if (config?.api_key_ref && !looksLikeRawProviderApiKey(config.api_key_ref)) {
        key = await this.secrets.get(config.api_key_ref);
      }
    }

    if (!key || !key.trim()) {
      return { hasKey: false, maskedKey: '' };
    }

    const trimmed = key.trim();
    const masked =
      trimmed.length > 10
        ? `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`
        : '••••••••••••';

    return { hasKey: true, maskedKey: masked };
  }

  async getApiKey(provider: 'openrouter' | 'gemini' = 'openrouter'): Promise<string> {
    const config = await this.configRepo.get();
    return this.resolveKey(provider, undefined, config?.api_key_ref);
  }

  async fetchModels(provider: 'openrouter' | 'gemini', explicitApiKey?: string): Promise<LlmModelInfo[]> {
    let key = explicitApiKey?.trim();
    if (!key) {
      try {
        key = await this.resolveKey(provider);
      } catch {
        // For OpenRouter, models can even be fetched without an API key!
        if (provider === 'openrouter') {
          return fetchOpenRouterModels(undefined, this.fetchFn);
        }
        throw new TersooError(
          'LLM_KEY_MISSING',
          `Please provide or save your ${provider === 'gemini' ? 'Google Gemini' : 'OpenRouter'} API key to fetch live models.`,
        );
      }
    }

    if (provider === 'gemini') {
      return fetchGeminiModels(key, this.fetchFn);
    } else {
      return fetchOpenRouterModels(key, this.fetchFn);
    }
  }

  async test(input?: LlmTestInput | string): Promise<LlmTestResult> {
    const config = await this.configRepo.get();
    const normalizedInput = typeof input === 'string' ? { prompt: input } : input;
    const provider = normalizedInput?.provider || ((config?.provider as 'openrouter' | 'gemini') ?? 'openrouter');
    const apiKey = await this.resolveKey(provider, normalizedInput?.apiKey, config?.api_key_ref);

    const defaultModel =
      provider === 'gemini' ? 'gemini-1.5-flash' : 'deepseek/deepseek-chat';
    const model = normalizedInput?.model || config?.text_model || defaultModel;
    const prompt = normalizedInput?.prompt || 'Hello! Test connection. Respond with {"status":"ok","message":"Connected"}.';

    const start = Date.now();
    let responseText = '';

    if (provider === 'gemini') {
      responseText = await callGemini(
        { apiKey, model, responseFormat: 'text', maxTokens: 2000 },
        [{ role: 'user', content: prompt }],
        this.fetchFn,
      );
    } else {
      responseText = await callOpenRouter(
        { apiKey, model, responseFormat: 'text', maxTokens: 2000 },
        [{ role: 'user', content: prompt }],
        this.fetchFn,
      );
    }

    const latencyMs = Date.now() - start;

    return {
      ok: true,
      latencyMs,
      response: responseText,
      provider,
      model,
    };
  }
}
