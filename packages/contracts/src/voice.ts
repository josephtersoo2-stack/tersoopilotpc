import { z } from 'zod';

export const VoiceTranscribeInput = z.object({
  audio: z.union([z.instanceof(Uint8Array), z.string()]), // Support both raw bytes and base64
  format: z.enum(['webm', 'wav', 'mp3', 'ogg', 'm4a', 'flac']).default('webm'),
  language: z.string().optional().nullable(),
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
  audio: z.string(), // base64 encoded audio
  format: z.enum(['mp3', 'wav', 'opus']),
  durationMs: z.number().int().nonnegative(),
});

export const VoiceCostSummary = z.object({
  sttCostUsd: z.number().nonnegative(),
  ttsRequests: z.number().int().nonnegative(),
  sttRequests: z.number().int().nonnegative(),
  totalAudioMs: z.number().int().nonnegative(),
});

export const VoiceSettings = z.object({
  sttModel: z.string().default('openai/whisper-large-v3'),
  sttLanguage: z.string().nullable().default(null),
  ttsModel: z.string().default('mistralai/voxtral-mini-tts-2603'),
  ttsVoice: z.string().default('en_paul_neutral'),
  autoSpeak: z.boolean().default(true),
  wakeWordEnabled: z.boolean().default(true),
  wakeWordModel: z.string().default('hey_tersoo'),
  wakeWordThreshold: z.number().min(0.1).max(1.0).default(0.5),
  greetingText: z.string().default('Yes, how can I help?'),
  commandMaxDurationMs: z.number().int().min(2000).max(900000).default(300000),
  commandSilenceStopMs: z.number().int().min(500).max(30000).default(5000),
  chimeSound: z.enum(['pleasant', 'cyber', 'ping', 'send', 'listen', 'none']).default('pleasant'),
});

export const VoiceModelInfo = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(''),
  category: z.enum(['stt', 'tts']),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
  supportedVoices: z.array(z.string()).default([]),
});

export const VoiceModelsListOutput = z.object({
  sttModels: z.array(VoiceModelInfo),
  ttsModels: z.array(VoiceModelInfo),
});

export const VoiceTestConnectionInput = z.object({
  sttModel: z.string().optional(),
  ttsModel: z.string().optional(),
  ttsVoice: z.string().optional(),
  greetingText: z.string().optional(),
});

export const VoiceTestConnectionOutput = z.object({
  success: z.boolean(),
  latencyMs: z.number().nonnegative(),
  sttModelsCount: z.number().int().nonnegative(),
  ttsModelsCount: z.number().int().nonnegative(),
  sttModel: z.string().optional(),
  ttsModel: z.string().optional(),
  message: z.string(),
  audio: z.string().optional(),
  format: z.string().optional(),
  details: z
    .object({
      openrouterConnected: z.boolean().optional(),
      sttVerified: z.boolean().optional(),
      ttsVerified: z.boolean().optional(),
      sttMessage: z.string().optional(),
      ttsMessage: z.string().optional(),
    })
    .optional(),
});

export type VoiceTranscribeInput = z.infer<typeof VoiceTranscribeInput>;
export type VoiceTranscribeOutput = z.infer<typeof VoiceTranscribeOutput>;
export type VoiceSpeakInput = z.infer<typeof VoiceSpeakInput>;
export type VoiceSpeakOutput = z.infer<typeof VoiceSpeakOutput>;
export type VoiceCostSummary = z.infer<typeof VoiceCostSummary>;
export type VoiceSettings = z.infer<typeof VoiceSettings>;
export type VoiceModelInfo = z.infer<typeof VoiceModelInfo>;
export type VoiceModelsListOutput = z.infer<typeof VoiceModelsListOutput>;
export type VoiceTestConnectionInput = z.infer<typeof VoiceTestConnectionInput>;
export type VoiceTestConnectionOutput = z.infer<typeof VoiceTestConnectionOutput>;
