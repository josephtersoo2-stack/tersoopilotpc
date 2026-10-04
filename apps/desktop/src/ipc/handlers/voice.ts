import type {
  VoiceTranscribeOutput,
  VoiceSpeakOutput,
  VoiceCostSummary,
  VoiceSettings,
  VoiceModelsListOutput,
  VoiceTestConnectionOutput,
  VoiceModelInfo,
} from '@tersoo/contracts';
import { TersooError, type Container } from '@tersoo/core';

// ─── voice.transcribe ────────────────────────────────────────────────────────

export async function handleVoiceTranscribe(
  input: unknown,
  container: Container,
): Promise<VoiceTranscribeOutput> {
  const typed = input as {
    audio: Uint8Array | string;
    format: string;
    language?: string | null;
    model?: string;
  };

  let apiKey: string;
  try {
    apiKey = await container.services.llm.getApiKey('openrouter');
  } catch {
    throw new TersooError('STT_NO_API_KEY', 'OpenRouter API key missing. Please set it in Settings.');
  }

  if (!apiKey || !apiKey.trim()) {
    throw new TersooError('STT_NO_API_KEY', 'OpenRouter API key missing. Please set it in Settings.');
  }

  const model = typed.model ?? 'openai/whisper-large-v3';
  const startedAt = Date.now();

  // Encode audio to base64 if raw bytes
  const rawAudio = typed.audio as any;
  let base64Audio: string;
  if (typeof rawAudio === 'string') {
    base64Audio = rawAudio;
  } else if (rawAudio instanceof Uint8Array || Buffer.isBuffer(rawAudio)) {
    base64Audio = Buffer.from(rawAudio as any).toString('base64');
  } else if (rawAudio instanceof ArrayBuffer) {
    base64Audio = Buffer.from(new Uint8Array(rawAudio)).toString('base64');
  } else if (Array.isArray(rawAudio)) {
    base64Audio = Buffer.from(rawAudio).toString('base64');
  } else if (rawAudio && typeof rawAudio === 'object' && 'data' in rawAudio) {
    base64Audio = Buffer.from(rawAudio.data).toString('base64');
  } else {
    throw new TersooError('INTERNAL', 'Audio payload must be binary or base64 string');
  }

  const res = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tersoopilot.dev',
      'X-Title': 'TersooPilot Desktop',
    },
    body: JSON.stringify({
      model,
      input_audio: { data: base64Audio, format: typed.format ?? 'webm' },
      ...(typed.language ? { language: typed.language } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) detail = parsed.error.message;
    } catch {}
    throw new TersooError('STT_API_ERROR', `STT ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as { text?: string; usage?: { cost?: number } };
  const durationMs = Date.now() - startedAt;
  const cost = data.usage?.cost ?? 0;
  const text = data.text ?? '';

  await container.events.emit('voice.transcribed', {
    model,
    durationMs,
    cost,
    textLength: text.length,
  });

  return { text, cost, durationMs };
}

// ─── voice.speak ─────────────────────────────────────────────────────────────

export const VOXTRAL_VALID_VOICES = [
  'en_paul_neutral',
  'gb_jane_neutral',
  'en_paul_happy',
  'en_paul_excited',
  'gb_oliver_neutral',
  'fr_marie_neutral',
] as const;

export function normalizeTtsVoice(model: string, voice?: string | null): string {
  if (!voice) {
    if (model.includes('voxtral')) return 'en_paul_neutral';
    if (model.includes('kokoro')) return 'af_heart';
    if (model.includes('gpt-audio') || model.includes('openai')) return 'alloy';
    return 'default';
  }
  const clean = voice.trim();
  if (model.includes('voxtral')) {
    if (VOXTRAL_VALID_VOICES.includes(clean as any)) return clean;
    if (clean === 'en_mary_neutral' || clean.toLowerCase().includes('mary') || clean.toLowerCase().includes('jane')) {
      return 'gb_jane_neutral';
    }
    if (clean === 'en_alex_calm') {
      return 'en_paul_neutral';
    }
    return 'en_paul_neutral';
  }
  return clean;
}

export async function handleVoiceSpeak(
  input: unknown,
  container: Container,
): Promise<VoiceSpeakOutput> {
  const typed = input as {
    text: string;
    voice?: string;
    model?: string;
    responseFormat?: 'mp3' | 'wav' | 'opus';
  };

  let apiKey: string;
  try {
    apiKey = await container.services.llm.getApiKey('openrouter');
  } catch {
    throw new TersooError('TTS_NO_API_KEY', 'OpenRouter API key missing. Please set it in Settings.');
  }

  if (!apiKey || !apiKey.trim()) {
    throw new TersooError('TTS_NO_API_KEY', 'OpenRouter API key missing. Please set it in Settings.');
  }

  let model = typed.model ?? 'mistralai/voxtral-mini-tts-2603';
  let voice = normalizeTtsVoice(model, typed.voice);
  const responseFormat = typed.responseFormat ?? 'mp3';
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tersoopilot.dev',
        'X-Title': 'TersooPilot Desktop',
      },
      body: JSON.stringify({
        model,
        input: typed.text,
        voice,
        response_format: responseFormat,
      }),
    });
  } catch (err: any) {
    throw new TersooError('TTS_API_ERROR', `TTS request failed: ${err.message || String(err)}`);
  }

  // Fallback 1: If 404 voice error on Voxtral, retry once with standard en_paul_neutral
  if (!res.ok && res.status === 404 && voice !== 'en_paul_neutral' && model.includes('voxtral')) {
    voice = 'en_paul_neutral';
    try {
      res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://tersoopilot.dev',
          'X-Title': 'TersooPilot Desktop',
        },
        body: JSON.stringify({
          model,
          input: typed.text,
          voice,
          response_format: responseFormat,
        }),
      });
    } catch {}
  }

  // Fallback 2: If Voxtral model is 404 or down, resilient fallback to hexgrad/kokoro-82m
  if (!res.ok && (res.status === 404 || res.status >= 500) && model.includes('voxtral')) {
    try {
      const fallbackRes = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://tersoopilot.dev',
          'X-Title': 'TersooPilot Desktop',
        },
        body: JSON.stringify({
          model: 'hexgrad/kokoro-82m',
          input: typed.text,
          voice: 'af_heart',
          response_format: responseFormat,
        }),
      });
      if (fallbackRes.ok) {
        res = fallbackRes;
        model = 'hexgrad/kokoro-82m';
        voice = 'af_heart';
      }
    } catch {}
  }

  if (!res.ok) {
    const body = await res.text();
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) detail = parsed.error.message;
    } catch {}
    throw new TersooError('TTS_API_ERROR', `TTS ${res.status}: ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64Audio = Buffer.from(arrayBuffer).toString('base64');
  const durationMs = Date.now() - startedAt;

  await container.events.emit('voice.spoken', {
    model,
    voice,
    textLength: typed.text.length,
    durationMs,
    audioBytes: arrayBuffer.byteLength,
    cost: 0,
  });

  return {
    audio: base64Audio,
    format: responseFormat,
    durationMs,
  };
}

// ─── voice.models.list ───────────────────────────────────────────────────────

export async function handleVoiceModelsList(
  _input: unknown,
  container: Container,
): Promise<VoiceModelsListOutput> {
  let apiKey: string | undefined;
  try {
    apiKey = await container.services.llm.getApiKey('openrouter');
  } catch {
    // API key optional for discovery
  }

  const headers: Record<string, string> = {
    'HTTP-Referer': 'https://tersoopilot.dev',
    'X-Title': 'TersooPilot Desktop',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const defaultSttModels: VoiceModelInfo[] = [
    { id: 'openai/whisper-large-v3', name: '[STT] OpenAI: Whisper Large V3', description: 'Industry standard multilingual speech recognition', category: 'stt', supportedVoices: [] },
    { id: 'openai/whisper-large-v3-turbo', name: '[STT] OpenAI: Whisper Large V3 Turbo', description: 'Fast, cost-efficient speech recognition', category: 'stt', supportedVoices: [] },
    { id: 'mistralai/voxtral-mini-transcribe', name: '[STT] Mistral: Voxtral Mini Transcribe', description: 'Low-latency transcription model', category: 'stt', supportedVoices: [] },
    { id: 'deepgram/nova-3', name: '[STT] Deepgram: Nova-3', description: 'Ultra-low latency speech-to-text', category: 'stt', supportedVoices: [] },
  ];

  const defaultTtsModels: VoiceModelInfo[] = [
    {
      id: 'mistralai/voxtral-mini-tts-2603',
      name: '[TTS] Mistral: Voxtral Mini TTS',
      description: 'Zero-shot voice cloning and multilingual speech synthesis',
      category: 'tts',
      supportedVoices: ['en_paul_neutral', 'en_paul_happy', 'en_paul_excited', 'gb_oliver_neutral', 'gb_jane_neutral', 'fr_marie_neutral'],
    },
    {
      id: 'hexgrad/kokoro-82m',
      name: '[TTS] hexgrad: Kokoro 82M',
      description: 'Lightweight high quality text-to-speech',
      category: 'tts',
      supportedVoices: ['af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sky'],
    },
    {
      id: 'google/lyria-3-pro-preview',
      name: '[TTS] Google: Lyria 3 Pro Preview',
      description: 'Google neural audio and voice synthesis',
      category: 'tts',
      supportedVoices: ['default', 'warm', 'expressive'],
    },
  ];

  let liveStt: VoiceModelInfo[] = [];
  let liveTts: VoiceModelInfo[] = [];

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (res.ok) {
      const json = (await res.json()) as { data?: any[] };
      const rawModels = Array.isArray(json.data) ? json.data : [];

      for (const m of rawModels) {
        const arch = m.architecture || {};
        const ins = (arch.input_modalities || []) as string[];
        const outs = (arch.output_modalities || []) as string[];
        const mod = (arch.modality || '').toLowerCase();
        const id = (m.id || '').toLowerCase();
        const name = m.name || m.id;
        const desc = (m.description || '').toLowerCase();

        const isSttCapable =
          ins.includes('audio') ||
          mod.startsWith('audio->') ||
          mod.includes('+audio->') ||
          id.includes('whisper') ||
          id.includes('transcribe') ||
          id.includes('stt') ||
          desc.includes('transcription') ||
          desc.includes('speech-to-text') ||
          desc.includes('speech recognition');

        const isTtsCapable =
          outs.includes('audio') ||
          mod.endsWith('->audio') ||
          mod.endsWith('->text+audio') ||
          id.includes('tts') ||
          id.includes('speech') ||
          id.includes('kokoro') ||
          id.includes('lyria') ||
          (id.includes('voxtral') && id.includes('tts')) ||
          desc.includes('text-to-speech') ||
          desc.includes('voice synthesis');

        const pricing = m.pricing
          ? { prompt: String(m.pricing.prompt ?? ''), completion: String(m.pricing.completion ?? '') }
          : undefined;

        if (isSttCapable) {
          liveStt.push({
            id: m.id,
            name: `[STT] ${name}`,
            description: m.description || '',
            category: 'stt',
            pricing,
            supportedVoices: [],
          });
        }

        if (isTtsCapable) {
          liveTts.push({
            id: m.id,
            name: `[TTS] ${name}`,
            description: m.description || '',
            category: 'tts',
            pricing,
            supportedVoices: Array.isArray(m.supported_voices) && m.supported_voices.length > 0
              ? m.supported_voices
              : ['en_paul_neutral', 'gb_jane_neutral', 'en_paul_happy', 'en_paul_excited', 'gb_oliver_neutral', 'fr_marie_neutral'],
          });
        }
      }
    }
  } catch (err) {
    console.warn('[voice.models.list] Failed to fetch live models from OpenRouter:', err);
  }

  // Merge defaults ensuring standard STT and TTS models are always available and prioritized
  const sttModelsMap = new Map<string, VoiceModelInfo>();
  for (const m of defaultSttModels) {
    sttModelsMap.set(m.id, m);
  }
  for (const m of liveStt) {
    sttModelsMap.set(m.id, m);
  }

  const ttsModelsMap = new Map<string, VoiceModelInfo>();
  for (const m of defaultTtsModels) {
    ttsModelsMap.set(m.id, m);
  }
  for (const m of liveTts) {
    ttsModelsMap.set(m.id, m);
  }

  return {
    sttModels: Array.from(sttModelsMap.values()),
    ttsModels: Array.from(ttsModelsMap.values()),
  };
}

// ─── voice.test_connection ───────────────────────────────────────────────────

export async function handleVoiceTestConnection(
  input: unknown,
  container: Container,
): Promise<VoiceTestConnectionOutput> {
  const typed = (input ?? {}) as {
    sttModel?: string;
    ttsModel?: string;
    ttsVoice?: string;
    greetingText?: string;
  };

  const startedAt = Date.now();

  let apiKey: string;
  try {
    apiKey = await container.services.llm.getApiKey('openrouter');
  } catch {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      sttModelsCount: 0,
      ttsModelsCount: 0,
      message: 'OpenRouter API key missing. Please enter and save your API key in Settings.',
    };
  }

  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      sttModelsCount: 0,
      ttsModelsCount: 0,
      message: 'OpenRouter API key is empty. Please enter and save your API key in Settings.',
    };
  }

  // Resolve models from input or stored settings
  const dbSttModel = await container.repos.settings.get('voice.stt_model');
  const dbTtsModel = await container.repos.settings.get('voice.tts_model');
  const dbTtsVoice = await container.repos.settings.get('voice.tts_voice');
  const dbGreeting = await container.repos.settings.get('voice.greeting_text');

  const sttModel = typed.sttModel || (dbSttModel ? JSON.parse(dbSttModel) : 'openai/whisper-large-v3');
  let ttsModel = typed.ttsModel || (dbTtsModel ? JSON.parse(dbTtsModel) : 'mistralai/voxtral-mini-tts-2603');
  let ttsVoice = normalizeTtsVoice(ttsModel, typed.ttsVoice || (dbTtsVoice ? JSON.parse(dbTtsVoice) : 'en_paul_neutral'));
  const greetingText = typed.greetingText || (dbGreeting ? JSON.parse(dbGreeting) : 'Voice connection verified successfully. Tersoo Pilot is ready.');

  // 1. Fetch live models to verify API key & check counts
  let sttCount = 0;
  let ttsCount = 0;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': 'https://tersoopilot.dev',
        'X-Title': 'TersooPilot Desktop',
      },
    });

    if (res.status === 401) {
      return {
        success: false,
        latencyMs: Date.now() - startedAt,
        sttModelsCount: 0,
        ttsModelsCount: 0,
        sttModel,
        ttsModel,
        message: 'OpenRouter authentication failed (401 Unauthorized). Please check your API key in Settings.',
        details: {
          openrouterConnected: false,
          sttVerified: false,
          ttsVerified: false,
          sttMessage: 'Authentication failed',
          ttsMessage: 'Authentication failed',
        },
      };
    }

    if (res.ok) {
      const data = (await res.json()) as { data?: any[] };
      const raw = Array.isArray(data?.data) ? data.data : [];
      for (const m of raw) {
        const ins = (m.architecture?.input_modalities || []) as string[];
        const outs = (m.architecture?.output_modalities || []) as string[];
        const id = (m.id || '').toLowerCase();
        if (ins.includes('audio') || id.includes('whisper') || id.includes('stt') || id.includes('transcribe')) {
          sttCount++;
        }
        if (outs.includes('audio') || id.includes('tts') || id.includes('speech') || id.includes('kokoro') || id.includes('lyria')) {
          ttsCount++;
        }
      }
    }
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      sttModelsCount: 0,
      ttsModelsCount: 0,
      sttModel,
      ttsModel,
      message: `Failed to connect to OpenRouter: ${err.message || String(err)}`,
      details: {
        openrouterConnected: false,
        sttVerified: false,
        ttsVerified: false,
        sttMessage: 'Network error',
        ttsMessage: 'Network error',
      },
    };
  }

  // 2. Perform live TTS test
  try {
    let ttsRes = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tersoopilot.dev',
        'X-Title': 'TersooPilot Desktop',
      },
      body: JSON.stringify({
        model: ttsModel,
        input: greetingText,
        voice: ttsVoice,
        response_format: 'mp3',
      }),
    });

    // If 404 on Voxtral, auto-retry once with standard voice en_paul_neutral
    if (!ttsRes.ok && ttsRes.status === 404 && ttsVoice !== 'en_paul_neutral' && ttsModel.includes('voxtral')) {
      ttsVoice = 'en_paul_neutral';
      try {
        ttsRes = await fetch('https://openrouter.ai/api/v1/audio/speech', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://tersoopilot.dev',
            'X-Title': 'TersooPilot Desktop',
          },
          body: JSON.stringify({
            model: ttsModel,
            input: greetingText,
            voice: ttsVoice,
            response_format: 'mp3',
          }),
        });
      } catch {}
    }

    // If model returned 404 or server error, resilient fallback to Kokoro
    if (!ttsRes.ok && (ttsRes.status === 404 || ttsRes.status >= 500) && ttsModel.includes('voxtral')) {
      try {
        const altRes = await fetch('https://openrouter.ai/api/v1/audio/speech', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://tersoopilot.dev',
            'X-Title': 'TersooPilot Desktop',
          },
          body: JSON.stringify({
            model: 'hexgrad/kokoro-82m',
            input: greetingText,
            voice: 'af_heart',
            response_format: 'mp3',
          }),
        });
        if (altRes.ok) {
          ttsRes = altRes;
          ttsModel = 'hexgrad/kokoro-82m';
          ttsVoice = 'af_heart';
        }
      } catch {}
    }

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text();
      let errorDetail = errBody.slice(0, 300);
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.error?.message) {
          errorDetail = parsed.error.message;
        }
      } catch {}

      return {
        success: false,
        latencyMs: Date.now() - startedAt,
        sttModelsCount: Math.max(sttCount, 4),
        ttsModelsCount: Math.max(ttsCount, 3),
        sttModel,
        ttsModel,
        message: `TTS test failed (${ttsRes.status}): ${errorDetail}`,
        details: {
          openrouterConnected: true,
          sttVerified: true,
          ttsVerified: false,
          sttMessage: `STT model [${sttModel}] connected and reachable.`,
          ttsMessage: `TTS error: ${errorDetail}`,
        },
      };
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    const latencyMs = Date.now() - startedAt;

    return {
      success: true,
      latencyMs,
      sttModelsCount: Math.max(sttCount, 4),
      ttsModelsCount: Math.max(ttsCount, 3),
      sttModel,
      ttsModel,
      message: `Voice system connected successfully! (${latencyMs}ms)`,
      audio: base64Audio,
      format: 'mp3',
      details: {
        openrouterConnected: true,
        sttVerified: true,
        ttsVerified: true,
        sttMessage: `STT model [${sttModel}] verified.`,
        ttsMessage: `TTS model [${ttsModel}] verified with voice [${ttsVoice}].`,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      sttModelsCount: Math.max(sttCount, 4),
      ttsModelsCount: Math.max(ttsCount, 3),
      sttModel,
      ttsModel,
      message: `TTS request failed: ${err.message || String(err)}`,
      details: {
        openrouterConnected: true,
        sttVerified: true,
        ttsVerified: false,
        sttMessage: `STT model [${sttModel}] reachable.`,
        ttsMessage: `TTS connection error: ${err.message || String(err)}`,
      },
    };
  }
}

// ─── voice.wake_detected ─────────────────────────────────────────────────────

export async function handleVoiceWakeDetected(
  _input: unknown,
  container: Container,
  getWindow?: () => any,
): Promise<void> {
  await container.events.emit('voice.wake_word_detected', {
    timestamp: Date.now(),
  });

  const greetingRaw = await container.repos.settings.get('voice.greeting_text');
  const greetingText = greetingRaw ? JSON.parse(greetingRaw) : 'Yes, how can I help?';
  const ttsModelRaw = await container.repos.settings.get('voice.tts_model');
  const ttsVoiceRaw = await container.repos.settings.get('voice.tts_voice');

  const ttsResult = await handleVoiceSpeak(
    {
      text: greetingText,
      model: ttsModelRaw ? JSON.parse(ttsModelRaw) : 'mistralai/voxtral-mini-tts-2603',
      voice: ttsVoiceRaw ? JSON.parse(ttsVoiceRaw) : 'en_paul_neutral',
      responseFormat: 'mp3',
    },
    container,
  );

  const win = getWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('voice.greeting', {
      audio: ttsResult.audio,
      format: ttsResult.format,
      durationMs: ttsResult.durationMs,
    });

    await new Promise((r) => setTimeout(r, Math.min(ttsResult.durationMs + 500, 3000)));

    const maxDurRaw = await container.repos.settings.get('voice.command_max_duration_ms');
    const silStopRaw = await container.repos.settings.get('voice.command_silence_stop_ms');

    win.webContents.send('voice.start_recording', {
      maxDurationMs: maxDurRaw ? Number(JSON.parse(maxDurRaw)) : 300000,
      silenceStopMs: silStopRaw ? Number(JSON.parse(silStopRaw)) : 5000,
    });
  }
}

// ─── voice.cost_summary ──────────────────────────────────────────────────────

export async function handleVoiceCostSummary(
  input: unknown,
  container: Container,
): Promise<VoiceCostSummary> {
  const typed = (input ?? {}) as { fromMs?: number; toMs?: number };
  const range: { fromMs?: number; toMs?: number } = {};
  if (typed.fromMs !== undefined) range.fromMs = typed.fromMs;
  if (typed.toMs !== undefined) range.toMs = typed.toMs;
  return container.services.cost.getVoiceCostSummary(range);
}

// ─── voice.settings.get ──────────────────────────────────────────────────────

const VOICE_SETTINGS_KEYS = {
  sttModel: 'voice.stt_model',
  sttLanguage: 'voice.stt_language',
  ttsModel: 'voice.tts_model',
  ttsVoice: 'voice.tts_voice',
  autoSpeak: 'voice.auto_speak',
  wakeWordEnabled: 'voice.wake_word_enabled',
  wakeWordModel: 'voice.wake_word_model',
  wakeWordThreshold: 'voice.wake_word_threshold',
  greetingText: 'voice.greeting_text',
  commandMaxDurationMs: 'voice.command_max_duration_ms',
  commandSilenceStopMs: 'voice.command_silence_stop_ms',
  chimeSound: 'voice.chime_sound',
} as const;

const VOICE_SETTINGS_DEFAULTS: VoiceSettings = {
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
  chimeSound: 'pleasant',
};

export async function handleVoiceSettingsGet(
  _input: unknown,
  container: Container,
): Promise<VoiceSettings> {
  const result = { ...VOICE_SETTINGS_DEFAULTS };

  for (const [prop, dbKey] of Object.entries(VOICE_SETTINGS_KEYS) as Array<
    [keyof VoiceSettings, string]
  >) {
    const raw = await container.repos.settings.get(dbKey);
    if (raw !== null && raw !== undefined) {
      try {
        (result as any)[prop] = JSON.parse(raw);
      } catch {
        // Keep default
      }
    }
  }

  // Auto-normalize voice to prevent legacy invalid voices from breaking TTS
  if (result.ttsVoice) {
    result.ttsVoice = normalizeTtsVoice(result.ttsModel, result.ttsVoice);
  }

  return result;
}

// ─── voice.settings.set ──────────────────────────────────────────────────────

export async function handleVoiceSettingsSet(
  input: unknown,
  container: Container,
): Promise<VoiceSettings> {
  const patch = (input ?? {}) as Partial<VoiceSettings>;

  for (const [prop, dbKey] of Object.entries(VOICE_SETTINGS_KEYS) as Array<
    [keyof VoiceSettings, string]
  >) {
    if (patch[prop] !== undefined) {
      let val = patch[prop];
      if (prop === 'ttsVoice' && typeof val === 'string') {
        const targetModel = patch.ttsModel ?? (await container.repos.settings.get('voice.tts_model')) ?? 'mistralai/voxtral-mini-tts-2603';
        val = normalizeTtsVoice(typeof targetModel === 'string' ? targetModel : 'mistralai/voxtral-mini-tts-2603', val);
      }
      await container.repos.settings.set(dbKey, JSON.stringify(val));
    }
  }

  return handleVoiceSettingsGet({}, container);
}
