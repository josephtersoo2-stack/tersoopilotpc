import { TersooError } from '../../util/errors';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json_object' | 'text';
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    max_tokens?: number;
    exclude?: boolean;
  };
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export async function callOpenRouter(
  config: OpenRouterConfig,
  messages: OpenRouterMessage[],
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const maxTokens = config.maxTokens ?? 4000;
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: maxTokens,
    temperature: config.temperature ?? 0.2,
  };

  if (config.responseFormat === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  if (config.reasoning) {
    payload.reasoning = config.reasoning;
  }

  const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tersoopilot.dev',
      'X-Title': 'TersooPilot Desktop',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new TersooError('LLM_API_ERROR', `OpenRouter ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    error?: { message?: string; code?: number };
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
        reasoning?: string;
        reasoning_content?: string;
      };
    }>;
  };

  if (data.error) {
    const errorMsg = data.error.message || JSON.stringify(data.error);
    throw new TersooError('LLM_API_ERROR', `OpenRouter API error: ${errorMsg}`);
  }

  const choice = data.choices?.[0];
  if (!choice) {
    throw new TersooError('LLM_API_ERROR', 'OpenRouter returned empty response: no completion choices returned');
  }

  let text = '';
  const rawContent = choice.message?.content;
  if (typeof rawContent === 'string') {
    text = rawContent;
  } else if (Array.isArray(rawContent)) {
    text = rawContent
      .map((part) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('');
  }

  // If content is empty, check for reasoning / thinking output (e.g. reasoning models)
  if (!text || text.trim() === '') {
    const reasoning = choice.message?.reasoning || choice.message?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.trim()) {
      text = reasoning.trim();
    }
  }

  if (!text || text.trim() === '') {
    if (choice.finish_reason === 'length') {
      throw new TersooError(
        'LLM_API_ERROR',
        `OpenRouter returned empty response: token limit (${maxTokens}) reached before completion (finish_reason: length). Please increase max tokens or reduce reasoning effort.`,
      );
    }
    throw new TersooError('LLM_API_ERROR', 'OpenRouter returned empty response');
  }

  return text;
}

export async function fetchOpenRouterModels(
  apiKey?: string,
  fetchFn: typeof fetch = fetch,
): Promise<import('@tersoo/contracts').LlmModelInfo[]> {
  const headers: Record<string, string> = {
    'HTTP-Referer': 'https://tersoopilot.dev',
    'X-Title': 'TersooPilot Desktop',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetchFn('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new TersooError('LLM_API_ERROR', `OpenRouter models list ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: {
        prompt?: string;
        completion?: string;
      };
      architecture?: {
        modality?: string;
      };
    }>;
  };

  const rawList = json.data ?? [];
  return rawList.map((m) => {
    const isVision =
      m.architecture?.modality?.includes('image') ||
      m.id.includes('vision') ||
      m.id.includes('4o') ||
      m.id.includes('flash') ||
      m.id.includes('vl');

    const promptPrice = m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : 0;
    const completionPrice = m.pricing?.completion ? parseFloat(m.pricing.completion) * 1_000_000 : 0;
    const isFree = m.id.endsWith(':free') || (promptPrice === 0 && completionPrice === 0);

    return {
      id: m.id,
      name: m.name || m.id,
      provider: 'openrouter' as const,
      contextLength: m.context_length ?? 8192,
      supportsVision: Boolean(isVision),
      supportsJson: true,
      pricing: {
        promptPerM: isFree ? 'Free' : `$${promptPrice.toFixed(2)}/M`,
        completionPerM: isFree ? 'Free' : `$${completionPrice.toFixed(2)}/M`,
      },
      isFree,
    };
  });
}

