# TersooPilot Desktop — Master Plan Addendum C (Wake Word Voice System)

**Document version:** 3.0.0
**Target executor:** Google Antigravity IDE coding agents
**Coordination:** Human reviewer (project owner)
**Status:** Authoritative — additive to the master plan and Addendum A.
**Prerequisite:** AI agent chat must be functional. User can type a command and the agent executes it.

---

## 0. Why This Addendum Exists

TersooPilot Desktop already has an AI agent chat that understands the entire application domain and can execute actions (create profile, delete profile, create niche, dispatch task, etc.).

This addendum adds a **hands-free voice system** on top of that chat. There are **no buttons**. The pipeline is:

1. The app listens for the wake word **"Hey Tersoo"** continuously in the background.
2. When the wake word fires, the app speaks a greeting: **"Yes, how can I help?"**
3. The app records your command automatically.
4. Recording stops when you stop speaking (silence detection) or after a max duration.
5. The audio is transcribed via OpenRouter Whisper.
6. The transcript is sent to the existing AI agent chat automatically.
7. The agent's reply is spoken aloud **and** displayed in chat.

**Critical scope note:** This is a **presentation-layer feature**. It does NOT add new agent capabilities, new MCP tools, new runtime commands, or new automation logic. Voice is a new way to feed text into the existing chat and a new way to consume the existing chat output.

**There is no push-to-talk. There is no microphone button. There is only the wake word.**

---

## 1. Scope

### In Scope

- Wake word detection via openWakeWord (fully local, no API keys).
- Wake word phrase: **"Hey Tersoo"** (custom-trained model).
- Greeting TTS after wake word.
- Automatic command recording with silence detection.
- STT via OpenRouter Whisper (uses existing API key).
- Auto-send transcript to the agent chat.
- TTS of agent replies via OpenRouter.
- Voice settings panel (toggle, threshold, greeting text, voice selection, etc.).
- Cost tracking for STT and TTS in the `events` table.

### Out of Scope

- Push-to-talk or any manual microphone button.
- Wake word wake-up alternatives (keyboard shortcut, etc.).
- Multi-language automatic detection.
- Voice cloning or custom voices.
- Speaker identification.
- Real-time streaming STT.
- Changes to the MCP server, runtime host, or automation engine.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                      TersooPilot Desktop                           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Renderer Process (React)                                    │  │
│  │                                                              │  │
│  │  1. Wake Word Detector                                       │  │
│  │     openWakeWord + ONNX Runtime Web                          │  │
│  │     Always listening (when enabled)                          │  │
│  │                                                              │  │
│  │  2. Command Recorder                                         │  │
│  │     MediaRecorder + RMS-based silence detection              │  │
│  │     Triggered automatically by wake word                     │  │
│  │                                                              │  │
│  │  3. Voice Output                                             │  │
│  │     HTMLAudioElement playing TTS responses                   │  │
│  │                                                              │  │
│  │  4. Chat UI                                                  │  │
│  │     Existing agent chat (unchanged)                          │  │
│  └──────────────┬───────────────────────────────────────────────┘  │
│                 │ IPC                                              │
│                 ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Main Process (Electron)                                     │  │
│  │                                                              │  │
│  │  voice.transcribe     → OpenRouter Whisper API               │  │
│  │  voice.speak          → OpenRouter TTS API                   │  │
│  │  voice.wake_detected  → Orchestrates the pipeline            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  OpenRouter API   │
                    │  (STT + TTS)      │
                    └───────────────────┘
```

**Key design points:**

- The wake word detector runs entirely in the **renderer** using Web Audio APIs and ONNX Runtime Web. No external service, no API key, no network calls.
- STT and TTS both route through **OpenRouter** using the same API key already stored in the keychain.
- The chat itself is unchanged. Voice is a new input/output channel that feeds the same chat.
- **There is no UI microphone button.** Voice input happens only via the wake word.

---

## 3. Provider Decision

| Component | Provider | Model | Cost |
|---|---|---|---|
| **Speech-to-Text** | OpenRouter | `openai/whisper-large-v3` | ~$0.006/min |
| **Text-to-Speech** | OpenRouter | `mistralai/voxtral-mini-tts-2603` | Negligible |
| **Wake Word** | Local (openWakeWord) | Custom "Hey Tersoo" model | Free forever |

---

## 4. Phase Overview

| Phase | Title | Depends On |
|---|---|---|
| **22** | Voice Services Foundation (STT + TTS handlers) | Prerequisites |
| **23** | openWakeWord Setup & Model Hosting | Phase 22 |
| **24** | Wake Word Detection in Renderer | Phase 23 |
| **25** | Wake Word → Record → Agent → Speak Pipeline | Phase 24 |
| **26** | Settings & Polish | Phase 25 |

Sequential. Do not skip.

---

## 5. Phase 22 — Voice Services Foundation

### 5.1 Goal

Build the STT and TTS services in the main process. These are internal services with no UI. They will be consumed by the wake word pipeline in Phase 25.

**There is no microphone button in this phase. There is no recording UI. Only the backend services.**

### 5.2 Files to Create

```
apps/desktop/src/ipc/handlers/voice.ts
packages/contracts/src/voice.ts
packages/core/src/services/CostService.ts
```

### 5.3 Files to Modify

- `packages/contracts/src/channels.ts` — add `voice.transcribe` and `voice.speak`
- `apps/desktop/src/ipc/router.ts` — register the two channels
- `packages/core/src/container/index.ts` — instantiate `CostService`
- `apps/renderer/src/stores/settingsStore.ts` — add voice settings
- `migrations/0003_voice_settings.sql` — new migration

### 5.4 Contracts

```ts
// packages/contracts/src/voice.ts
import { z } from 'zod';

export const VoiceTranscribeInput = z.object({
  audio: z.instanceof(Uint8Array),
  format: z.enum(['webm', 'wav', 'mp3', 'ogg', 'm4a', 'flac']),
  language: z.string().optional(),
  model: z.string().default('openai/whisper-large-v3'),
});

export const VoiceTranscribeOutput = z.object({
  text: z.string(),
  cost: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

export const VoiceSpeakInput = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().default('en_paul_neutral'),
  model: z.string().default('mistralai/voxtral-mini-tts-2603'),
  responseFormat: z.enum(['mp3', 'wav', 'opus']).default('mp3'),
});

export const VoiceSpeakOutput = z.object({
  audio: z.string(),
  format: z.enum(['mp3', 'wav', 'opus']),
  durationMs: z.number().int().nonnegative(),
});

export type VoiceTranscribeInput = z.infer<typeof VoiceTranscribeInput>;
export type VoiceTranscribeOutput = z.infer<typeof VoiceTranscribeOutput>;
export type VoiceSpeakInput = z.infer<typeof VoiceSpeakInput>;
export type VoiceSpeakOutput = z.infer<typeof VoiceSpeakOutput>;
```

```ts
// packages/contracts/src/channels.ts — add
'voice.transcribe': { input: VoiceTranscribeInput, output: VoiceTranscribeOutput },
'voice.speak':      { input: VoiceSpeakInput,      output: VoiceSpeakOutput },
```

### 5.5 Migration

```sql
-- migrations/0003_voice_settings.sql
INSERT INTO settings (key, value, updated_at) VALUES
  ('voice.stt_model', '"openai/whisper-large-v3"', strftime('%s','now')*1000),
  ('voice.stt_language', 'null', strftime('%s','now')*1000),
  ('voice.tts_model', '"mistralai/voxtral-mini-tts-2603"', strftime('%s','now')*1000),
  ('voice.tts_voice', '"en_paul_neutral"', strftime('%s','now')*1000),
  ('voice.auto_speak', 'false', strftime('%s','now')*1000),
  ('voice.wake_word_enabled', 'false', strftime('%s','now')*1000),
  ('voice.wake_word_model', '"hey_tersoo"', strftime('%s','now')*1000),
  ('voice.wake_word_threshold', '0.5', strftime('%s','now')*1000),
  ('voice.greeting_text', '"Yes, how can I help?"', strftime('%s','now')*1000),
  ('voice.command_max_duration_ms', '10000', strftime('%s','now')*1000),
  ('voice.command_silence_stop_ms', '1200', strftime('%s','now')*1000);
```

### 5.6 Main Process Handlers

```ts
// apps/desktop/src/ipc/handlers/voice.ts
import { TersooError } from '@tersoo/core/util/errors';
import {
  VoiceTranscribeInput, type VoiceTranscribeOutput,
  VoiceSpeakInput, type VoiceSpeakOutput,
} from '@tersoo/contracts/voice';
import type { Container } from '@tersoo/core';

export async function handleVoiceTranscribe(
  input: unknown,
  container: Container,
): Promise<VoiceTranscribeOutput> {
  const parsed = VoiceTranscribeInput.safeParse(input);
  if (!parsed.success) throw new TersooError('INVALID_INPUT', parsed.error.message);

  const apiKey = await container.secrets.get('tersoopilot/llm/openrouter');
  if (!apiKey) throw new TersooError('STT_NO_API_KEY', 'OpenRouter API key missing');

  const startedAt = Date.now();
  const base64Audio = Buffer.from(parsed.data.audio).toString('base64');

  const res = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tersoopilot.dev',
      'X-Title': 'TersooPilot Desktop',
    },
    body: JSON.stringify({
      model: parsed.data.model,
      input_audio: { data: base64Audio, format: parsed.data.format },
      language: parsed.data.language,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new TersooError('STT_API_ERROR', `Whisper ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const durationMs = Date.now() - startedAt;

  await container.events.emit('voice.transcribed', {
    model: parsed.data.model,
    durationMs,
    cost: data.usage?.cost ?? 0,
    textLength: (data.text ?? '').length,
  });

  return { text: data.text ?? '', cost: data.usage?.cost ?? 0, durationMs };
}

export async function handleVoiceSpeak(
  input: unknown,
  container: Container,
): Promise<VoiceSpeakOutput> {
  const parsed = VoiceSpeakInput.safeParse(input);
  if (!parsed.success) throw new TersooError('INVALID_INPUT', parsed.error.message);

  const apiKey = await container.secrets.get('tersoopilot/llm/openrouter');
  if (!apiKey) throw new TersooError('TTS_NO_API_KEY', 'OpenRouter API key missing');

  const startedAt = Date.now();

  const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tersoopilot.dev',
      'X-Title': 'TersooPilot Desktop',
    },
    body: JSON.stringify({
      model: parsed.data.model,
      input: parsed.data.text,
      voice: parsed.data.voice,
      response_format: parsed.data.responseFormat,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new TersooError('TTS_API_ERROR', `TTS ${res.status}: ${body.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const durationMs = Date.now() - startedAt;

  await container.events.emit('voice.spoken', {
    model: parsed.data.model,
    voice: parsed.data.voice,
    durationMs,
    textLength: parsed.data.text.length,
    audioBytes: arrayBuffer.byteLength,
  });

  return {
    audio: Buffer.from(arrayBuffer).toString('base64'),
    format: parsed.data.responseFormat,
    durationMs,
  };
}
```

### 5.7 Register Channels

```ts
// apps/desktop/src/ipc/router.ts — add
'voice.transcribe': (i) => handleVoiceTranscribe(i, container),
'voice.speak':      (i) => handleVoiceSpeak(i, container),
```

### 5.8 Cost Service

```ts
// packages/core/src/services/CostService.ts
import type { EventRepo } from '../persistence/repos/eventRepo';

export class CostService {
  constructor(private events: EventRepo) {}

  async getVoiceCostSummary(range: { fromMs: number; toMs: number }) {
    const sttEvents = await this.events.query({ event: 'voice.transcribed', ...range });
    const ttsEvents = await this.events.query({ event: 'voice.spoken', ...range });

    return {
      sttCostUsd: sttEvents.reduce((s, e) => s + (JSON.parse(e.data).cost ?? 0), 0),
      ttsRequests: ttsEvents.length,
      sttRequests: sttEvents.length,
      totalAudioMs: sttEvents.reduce((s, e) => s + (JSON.parse(e.data).durationMs ?? 0), 0),
    };
  }
}
```

### 5.9 Acceptance Criteria

- [ ] Migration `0003_voice_settings.sql` applies cleanly
- [ ] `voice.transcribe` handler returns text for a test audio blob
- [ ] `voice.speak` handler returns base64 audio for test text
- [ ] `voice.transcribed` and `voice.spoken` events appear in the `events` table
- [ ] Cost summary queries correctly
- [ ] No UI changes in this phase
- [ ] Committed with message: `feat(voice): phase 22 — STT and TTS foundation services`

### 5.10 Rollback

Revert the migration and remove the handlers. The rest of the system is unaffected.

### 5.11 Handoff

Phase 23 inherits: working STT and TTS backends with cost tracking.

---

## 6. Phase 23 — openWakeWord Setup & Model Hosting

### 6.1 Goal

Install openWakeWord, download ONNX models, train the custom "Hey Tersoo" wake word, and verify detection in a standalone HTML page.

### 6.2 Files to Create

```
apps/renderer/public/openwakeword/
├── models/
│   ├── melspectrogram.onnx
│   ├── embedding_model.onnx
│   └── hey_tersoo.onnx
├── ort/
│   └── (ONNX Runtime WASM files)
└── test.html
```

### 6.3 Tasks

#### Task 23.1 — Install

```bash
pnpm add openwakeword-web --filter @tersoo/renderer
```

#### Task 23.2 — Download base models

```bash
cd apps/renderer
npx openwakeword-web download-models
```

#### Task 23.3 — Train custom wake word

Train "Hey Tersoo" using the openWakeWord Colab notebook:

1. Generate synthetic positive samples with Piper TTS (~1000 clips)
2. Generate negatives (random speech, noise)
3. Train a small classifier on the frozen feature extractor
4. Export as `.onnx`

Takes ~75–90 min on Colab Pro. Output is ~1.2 MB.

Place at `apps/renderer/public/openwakeword/models/hey_tersoo.onnx`.

#### Task 23.4 — Download ONNX Runtime WASM

```bash
npx onnxruntime-web --download-wasm --output-dir apps/renderer/public/openwakeword/ort/
```

#### Task 23.5 — Standalone smoke test

Create `apps/renderer/public/openwakeword/test.html`:

```html
<!DOCTYPE html>
<html>
<head><title>openWakeWord Test</title></head>
<body>
  <button id="start">Start Listening</button>
  <p id="status">Idle</p>
  <script type="module">
    import { OpenWakeWord } from '/openwakeword-web/dist/index.js';
    import { Microphone } from '/openwakeword-web/dist/microphone.js';

    document.getElementById('start').addEventListener('click', async () => {
      const oww = await OpenWakeWord.create({
        baseUrl: '/openwakeword/models/',
        wakewordModels: ['hey_tersoo'],
        threshold: 0.5,
        onDetection: ({ label, score }) => {
          document.getElementById('status').textContent =
            `Detected: ${label} (${score.toFixed(2)})`;
        },
      });
      const mic = new Microphone(async (frame) => { await oww.predict(frame); });
      await mic.start();
      document.getElementById('status').textContent = 'Listening...';
    });
  </script>
</body>
</html>
```

Serve with `npx serve apps/renderer/public`, open the test page, click "Start Listening", say "Hey Tersoo", and confirm the detection score appears.

### 6.4 Model Size Summary

| Component | Size |
|---|---|
| `melspectrogram.onnx` | ~1.04 MB |
| `embedding_model.onnx` | ~1.27 MB |
| Custom `hey_tersoo.onnx` | ~1.21 MB |
| ONNX Runtime WASM | ~2 MB |
| **Total** | **~5.5 MB** |

### 6.5 Acceptance Criteria

- [ ] `openwakeword-web` installed
- [ ] Base models downloaded
- [ ] Custom "Hey Tersoo" model trained and placed
- [ ] ONNX Runtime WASM self-hosted
- [ ] Standalone HTML page detects "Hey Tersoo" with score > 0.5
- [ ] No API keys required
- [ ] Committed with message: `feat(voice): phase 23 — openWakeWord setup and model hosting`

### 6.6 Rollback

Delete `apps/renderer/public/openwakeword/` and remove the dependency.

### 6.7 Handoff

Phase 24 inherits: a working openWakeWord pipeline verified standalone.

---

## 7. Phase 24 — Wake Word Detection in Renderer

### 7.1 Goal

Integrate openWakeWord into the renderer as a React hook. Show a subtle "listening" indicator when enabled. **No recording, no buttons — just detection.**

### 7.2 Files to Create

```
apps/renderer/src/hooks/useWakeWord.ts
apps/renderer/src/components/WakeIndicator.tsx
```

### 7.3 Files to Modify

- `apps/renderer/src/stores/settingsStore.ts` — add wake word settings

### 7.4 The Hook

```ts
// apps/renderer/src/hooks/useWakeWord.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { OpenWakeWord } from 'openwakeword-web';
import { Microphone } from 'openwakeword-web/microphone';

export interface UseWakeWordOptions {
  enabled: boolean;
  wakeWordModel: string;
  threshold: number;
  onDetected: () => void;
  onError?: (err: Error) => void;
}

export function useWakeWord(opts: UseWakeWordOptions) {
  const owwRef = useRef<OpenWakeWord | null>(null);
  const micRef = useRef<Microphone | null>(null);
  const [listening, setListening] = useState(false);

  const start = useCallback(async () => {
    if (owwRef.current) return;
    try {
      const oww = await OpenWakeWord.create({
        baseUrl: '/openwakeword/models/',
        wakewordModels: [opts.wakeWordModel],
        threshold: opts.threshold,
        onDetection: ({ score }) => {
          if (score >= opts.threshold) opts.onDetected();
        },
      });
      const mic = new Microphone(async (frame) => { await oww.predict(frame); });
      await mic.start();
      owwRef.current = oww;
      micRef.current = mic;
      setListening(true);
    } catch (err) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [opts]);

  const stop = useCallback(() => {
    if (micRef.current) { micRef.current.stop(); micRef.current = null; }
    owwRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    if (opts.enabled) start();
    else stop();
    return () => { stop(); };
  }, [opts.enabled, start, stop]);

  return { listening, start, stop };
}
```

### 7.5 Wake Indicator

```tsx
// apps/renderer/src/components/WakeIndicator.tsx
import { useWakeWord } from '../hooks/useWakeWord';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../hooks/useToast';

interface Props {
  onWake: () => void;
}

export function WakeIndicator({ onWake }: Props) {
  const settings = useSettingsStore();
  const toast = useToast();

  const { listening } = useWakeWord({
    enabled: settings.voice.wakeWordEnabled,
    wakeWordModel: settings.voice.wakeWordModel,
    threshold: settings.voice.wakeWordThreshold,
    onDetected: onWake,
    onError: (err) => toast.error(`Wake word failed: ${err.message}`),
  });

  if (!settings.voice.wakeWordEnabled) return null;

  return (
    <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-zinc-800/80 rounded-full text-zinc-300 text-xs flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${listening ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />
      {listening ? 'Listening for "Hey Tersoo"' : 'Starting...'}
    </div>
  );
}
```

### 7.6 Wire Into App

```tsx
// apps/renderer/src/App.tsx — add
import { WakeIndicator } from './components/WakeIndicator';

// Inside the layout:
<WakeIndicator onWake={() => {
  window.tersoo.invoke('voice.wake_detected', {});
}} />
```

### 7.7 Main Process Handler

```ts
// apps/desktop/src/ipc/handlers/voice.ts — add

export async function handleWakeDetected(
  _input: unknown,
  container: Container,
  win: BrowserWindow | null,
): Promise<void> {
  const greeting = await container.repos.settings.get('voice.greeting_text')
    ?? 'Yes, how can I help?';

  const tts = await handleVoiceSpeak({ text: greeting }, container);
  win?.webContents.send('voice.greeting', tts);

  // Wait roughly for the greeting to finish playing before recording
  await new Promise((r) => setTimeout(r, 1500));

  win?.webContents.send('voice.start_recording', {
    maxDurationMs: Number(await container.repos.settings.get('voice.command_max_duration_ms') ?? 10000),
    silenceStopMs: Number(await container.repos.settings.get('voice.command_silence_stop_ms') ?? 1200),
  });
}
```

### 7.8 Register the Channel

```ts
// apps/desktop/src/ipc/router.ts — add
'voice.wake_detected': (i) => handleWakeDetected(i, container, getWindow()),
```

### 7.9 Acceptance Criteria

- [ ] `useWakeWord` hook manages detector lifecycle
- [ ] Saying "Hey Tersoo" fires `onDetected` and triggers the main process
- [ ] Indicator shows "Listening for Hey Tersoo" when enabled
- [ ] Indicator disappears when disabled
- [ ] Main process speaks the greeting via TTS
- [ ] Main process signals `voice.start_recording` after the greeting
- [ ] No microphone button anywhere in the UI
- [ ] Committed with message: `feat(voice): phase 24 — openWakeWord detection in renderer`

### 7.10 Rollback

Remove the `WakeIndicator` from the app layout.

### 7.11 Handoff

Phase 25 inherits: wake word fires and triggers the greeting/recording signal.

---

## 8. Phase 25 — Wake Word → Record → Agent → Speak Pipeline

### 8.1 Goal

Complete the end-to-end hands-free pipeline: wake word → greeting → record command → transcribe → send to agent → speak reply.

### 8.2 Files to Create

```
packages/core/src/voice/commandRecorder.ts
```

### 8.3 Files to Modify

- `apps/renderer/src/components/WakeIndicator.tsx` — handle recording
- `apps/renderer/src/components/AgentChat.tsx` — auto-speak agent replies

### 8.4 Command Recorder

```ts
// packages/core/src/voice/commandRecorder.ts
export interface RecordOptions {
  maxDurationMs: number;
  silenceStopMs: number;
  minDurationMs: number;
}

export async function recordCommand(opts: RecordOptions): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);
  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const startedAt = Date.now();
  recorder.start();

  let lastVoiceAt = Date.now();

  const silenceCheck = setInterval(() => {
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (const v of dataArray) sum += (v - 128) ** 2;
    const rms = Math.sqrt(sum / dataArray.length);

    if (rms > 8) {
      lastVoiceAt = Date.now();
    } else if (Date.now() - lastVoiceAt > opts.silenceStopMs) {
      recorder.stop();
      clearInterval(silenceCheck);
    }

    if (Date.now() - startedAt > opts.maxDurationMs) {
      recorder.stop();
      clearInterval(silenceCheck);
    }
  }, 100);

  const blob: Blob = await new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
  });

  clearInterval(silenceCheck);
  stream.getTracks().forEach((t) => t.stop());
  await audioContext.close();

  if (Date.now() - startedAt < opts.minDurationMs) {
    throw new Error('RECORDING_TOO_SHORT');
  }

  return blob;
}
```

### 8.5 Update WakeIndicator

```tsx
// apps/renderer/src/components/WakeIndicator.tsx — extend
import { useEffect, useState } from 'react';
import { recordCommand } from '@tersoo/core/voice/commandRecorder';

// Inside the component:
const [state, setState] = useState<'idle' | 'greeting' | 'recording' | 'transcribing'>('idle');

useEffect(() => {
  const off1 = window.tersoo.on('voice.greeting', () => setState('greeting'));

  const off2 = window.tersoo.on('voice.start_recording', async (opts) => {
    setState('recording');
    try {
      const blob = await recordCommand({
        maxDurationMs: opts.maxDurationMs,
        silenceStopMs: opts.silenceStopMs,
        minDurationMs: 500,
      });
      setState('transcribing');

      const arrayBuffer = await blob.arrayBuffer();
      const transcript = await window.tersoo.invoke('voice.transcribe', {
        audio: new Uint8Array(arrayBuffer),
        format: 'webm',
      });

      if (transcript.text.trim()) {
        window.tersoo.emit('voice.transcript_ready', transcript.text.trim());
      }
    } catch (err) {
      if ((err as Error).message !== 'RECORDING_TOO_SHORT') {
        console.error('Command recording failed', err);
      }
    } finally {
      setState('idle');
    }
  });

  return () => { off1(); off2(); };
}, []);

// Show state in the indicator (Recording / Transcribing / Speaking)
```

### 8.6 Auto-Speak Agent Replies

```tsx
// apps/renderer/src/components/AgentChat.tsx — modifications
import { useAgentSpeak } from '../hooks/useAgentSpeak';

const settings = useSettingsStore();

const { speak } = useAgentSpeak({
  voice: settings.voice.ttsVoice,
  model: settings.voice.ttsModel,
});

const handleAgentReply = (replyText: string) => {
  setMessages((prev) => [...prev, { role: 'assistant', content: replyText }]);
  if (settings.voice.autoSpeak) speak(replyText);
};

useEffect(() => {
  const off = window.tersoo.on('voice.transcript_ready', (text) => {
    handleUserSend(text);
  });
  return off;
}, []);
```

### 8.7 Agent Speak Hook

```ts
// apps/renderer/src/hooks/useAgentSpeak.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAgentSpeak(opts: { voice: string; model: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    stop();
    if (!text.trim()) return;
    try {
      const result = await window.tersoo.invoke('voice.speak', {
        text: text.slice(0, 4000),
        voice: opts.voice,
        model: opts.model,
      });
      const audio = new Audio(`data:audio/${result.format};base64,${result.audio}`);
      audioRef.current = audio;
      audio.onplay = () => setSpeaking(true);
      audio.onended = () => { setSpeaking(false); audioRef.current = null; };
      audio.onerror = () => { setSpeaking(false); audioRef.current = null; };
      await audio.play();
    } catch (err) {
      console.error('TTS failed', err);
      setSpeaking(false);
    }
  }, [opts.voice, opts.model, stop]);

  useEffect(() => () => stop(), [stop]);
  return { speak, stop, speaking };
}
```

### 8.8 Acceptance Criteria

- [ ] Say "Hey Tersoo" → greeting plays → recording starts automatically
- [ ] Recording stops on silence or after max duration
- [ ] Transcript sent to agent chat automatically
- [ ] Agent reply spoken via TTS and displayed in chat
- [ ] Wake word ignored while a command is being processed
- [ ] No microphone button anywhere
- [ ] Committed with message: `feat(voice): phase 25 — wake word to agent pipeline`

### 8.9 Rollback

Disable `settings.voice.wakeWordEnabled`. The system reverts to typed chat.

### 8.10 Handoff

Phase 26 inherits: the full hands-free pipeline.

---

## 9. Phase 26 — Settings & Polish

### 9.1 Goal

Add voice settings to the Settings panel. Handle edge cases.

### 9.2 Settings UI

Add a Voice section:

- **Enable wake word** toggle
- **Wake word model** dropdown (`hey_tersoo`, `hey_jarvis`, `alexa`)
- **Detection threshold** slider (0.3 – 0.9)
- **Greeting text** input
- **Command max duration** slider (5s – 30s)
- **Silence stop** slider (0.5s – 3s)
- **TTS model** dropdown
- **TTS voice** dropdown (depends on model)
- **Auto-speak agent replies** toggle
- **Test voice** button (speaks a test phrase)
- **Cost summary** (last 30 days)

### 9.3 Edge Cases

| Case | Handling |
|---|---|
| Microphone already in use | Show error, disable wake word |
| No microphone available | Disable toggle, hide indicator |
| Wake word fires while agent is speaking | Queue greeting; do not overlap |
| Wake word fires 3 times in 10s | Ignore after the second; log warning |
| Recording captures only silence | Discard silently |
| Transcript is empty | Discard; do not send to agent |
| ONNX model fails to load | Show error, disable wake word |
| App goes to sleep | Stop detector; restart on wake |

### 9.4 Acceptance Criteria

- [ ] Wake word can be enabled/disabled via Settings
- [ ] Threshold changes take effect on next detector restart
- [ ] Greeting text is spoken as configured
- [ ] TTS voice is configurable
- [ ] Auto-speak toggle works
- [ ] Cost summary displays correctly
- [ ] All edge cases handled
- [ ] Committed with message: `feat(voice): phase 26 — voice settings and polish`

---

## 10. Cross-Phase Rules

1. **Never store raw audio on disk.** Transcribe in-memory and discard.
2. **Never run wake word detection in the main process.** It runs in the renderer using Web Audio APIs.
3. **Always stop recording before transcribing.** No overlapping audio streams.
4. **Always stop TTS before starting a new greeting.** No audio overlap.
5. **Always respect the wake word cooldown.** Do not fire more than once per 1.5 seconds.
6. **Always check for the API key in the OS keychain.** Never in the DB.
7. **Always emit `voice.transcribed` and `voice.spoken` events** for cost tracking.
8. **Never log audio contents.** Only metadata (duration, size, model, cost).
9. **Always handle microphone unavailability gracefully.** Disable features, don't crash.
10. **There is no microphone button.** Voice input is via wake word only.

---

## 11. Phase Dependency Graph

```
Prerequisites (existing agent chat works)
        │
        ▼
Phase 22 (voice services foundation)
        │
        ▼
Phase 23 (openWakeWord setup)
        │
        ▼
Phase 24 (wake word detection)
        │
        ▼
Phase 25 (wake word → agent pipeline)
        │
        ▼
Phase 26 (settings & polish)
```

Sequential. Do not skip.

---

## 12. Master Acceptance Checklist

At the end of Phase 26:

**Voice Services**
- [ ] `voice.transcribe` returns text for a test audio blob
- [ ] `voice.speak` returns base64 audio for test text
- [ ] Cost tracking works

**Wake Word**
- [ ] "Hey Tersoo" detected with score > 0.5
- [ ] Greeting plays after detection
- [ ] Recording starts automatically
- [ ] Recording stops on silence
- [ ] Transcript sent to agent
- [ ] Agent reply spoken aloud
- [ ] Indicator visible when enabled

**Settings**
- [ ] Voice section in Settings panel
- [ ] All voice settings configurable
- [ ] Cost summary visible

**Security & Privacy**
- [ ] No API keys in DB
- [ ] No raw audio stored on disk
- [ ] No audio contents logged

**No Buttons**
- [ ] No microphone button anywhere in the UI
- [ ] Voice input is triggered exclusively by the wake word

---

## 13. What to Send Back to the Human

After each phase:

1. Commit hash
2. Output of `pnpm -r test`
3. Screen recording: say "Hey Tersoo" → greeting plays → say command → agent responds → reply spoken
4. Screenshot of the Settings panel with voice options
5. Any deviations from this plan

---

## 14. Out of Scope (Future Addendums)

- **Addendum D** — Multi-language wake word models.
- **Addendum E** — Voice cloning or custom TTS voices.
- **Addendum F** — Hands-free continuous mode (no greeting).
- **Addendum G** — Wake word sensitivity auto-tuning.
- **Addendum H** — Streaming STT via Google Cloud Speech-to-Text.

---

## 15. Summary

| Decision | Value |
|---|---|
| **Wake word engine** | openWakeWord (local, ONNX Runtime Web) |
| **Wake word phrase** | "Hey Tersoo" (custom-trained) |
| **STT provider** | OpenRouter (Whisper Large v3) |
| **TTS provider** | OpenRouter (Voxtral Mini TTS) |
| **Model size** | ~5.5 MB total |
| **API keys required** | None for wake word; existing OpenRouter key for STT/TTS |
| **Cost** | Free for wake word; negligible for STT/TTS |
| **Push-to-talk** | None — wake word only |
| **Total phases** | 5 (22 through 26) |

---

**End of addendum C. Version 3.0.0. Frozen.**