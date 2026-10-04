import type { LlmModelInfo } from '@tersoo/contracts';
import { TersooError } from '../../util/errors';
import type { OpenRouterMessage } from './openrouter';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json_object' | 'text';
}

export async function callGemini(
  config: GeminiConfig,
  messages: OpenRouterMessage[],
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const modelName = config.model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  let systemInstruction: { parts: Array<{ text: string }> } | undefined;
  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const sysText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      systemInstruction = { parts: [{ text: sysText }] };
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url') {
          const rawUrl = item.image_url.url;
          const match = rawUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1] || 'image/png',
                data: match[2] || '',
              },
            });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: config.temperature ?? 0.2,
      maxOutputTokens: config.maxTokens ?? 4000,
      responseMimeType: config.responseFormat === 'json_object' ? 'application/json' : 'text/plain',
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new TersooError('LLM_API_ERROR', `Google Gemini ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? '')
    .filter(Boolean)
    .join('\n');

  if (!text || text.trim() === '') {
    throw new TersooError('LLM_API_ERROR', 'Google Gemini returned empty response');
  }

  return text;
}

export async function fetchGeminiModels(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<LlmModelInfo[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchFn(url, { method: 'GET' });

  if (!res.ok) {
    const errText = await res.text();
    throw new TersooError('LLM_API_ERROR', `Google Gemini models list ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      description?: string;
      inputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }>;
  };

  const rawModels = data.models ?? [];
  const results: LlmModelInfo[] = [];

  for (const m of rawModels) {
    const methods = m.supportedGenerationMethods ?? [];
    if (!methods.includes('generateContent')) continue;

    const id = (m.name ?? '').replace(/^models\//, '');
    if (!id) continue;

    // Filter to generative chat/vision models
    if (!id.includes('gemini')) continue;

    const displayName = m.displayName || id;
    const isVision =
      id.includes('flash') ||
      id.includes('pro') ||
      id.includes('vision') ||
      (m.description?.toLowerCase().includes('multimodal') ?? false);

    results.push({
      id,
      name: displayName,
      provider: 'gemini',
      contextLength: m.inputTokenLimit ?? 1048576,
      supportsVision: isVision,
      supportsJson: true,
      isFree: id.includes('exp') || id.includes('flash'),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}
