import { z } from 'zod';

export const LlmProvider = z.enum(['openrouter', 'gemini', 'openai', 'deepseek']);
export type LlmProvider = z.infer<typeof LlmProvider>;

export const LlmModelInfo = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(['openrouter', 'gemini']),
  contextLength: z.number().optional(),
  supportsVision: z.boolean().default(false),
  supportsJson: z.boolean().default(true),
  pricing: z
    .object({
      promptPerM: z.union([z.number(), z.string()]).optional(),
      completionPerM: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
  isFree: z.boolean().default(false),
});
export type LlmModelInfo = z.infer<typeof LlmModelInfo>;

export const LlmConfig = z.object({
  provider: LlmProvider.default('openrouter'),
  text_model: z.string().default('deepseek/deepseek-chat'),
  vision_model: z.string().nullable().optional(),
  vision_enabled: z.union([z.boolean(), z.number()]).transform((v) => Boolean(v)),
  max_attempts: z.number().optional().default(3),
  backoff_ms: z.string().optional().default('[1000, 3000, 9000]'),
  hasOpenrouterKey: z.boolean().optional(),
  hasGeminiKey: z.boolean().optional(),
});
export type LlmConfig = z.infer<typeof LlmConfig>;

export const LlmKeySetInput = z.object({
  provider: z.enum(['openrouter', 'gemini']),
  apiKey: z.string(),
});
export type LlmKeySetInput = z.infer<typeof LlmKeySetInput>;

export const LlmKeyStatus = z.object({
  hasKey: z.boolean(),
  maskedKey: z.string(),
});
export type LlmKeyStatus = z.infer<typeof LlmKeyStatus>;

export const LlmTestInput = z.object({
  prompt: z.string().optional().default('Ping connection test. Respond with {"status":"ok"}.'),
  provider: z.enum(['openrouter', 'gemini']).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});
export type LlmTestInput = z.infer<typeof LlmTestInput>;

export const LlmTestResult = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  response: z.string(),
  provider: z.string(),
  model: z.string(),
});
export type LlmTestResult = z.infer<typeof LlmTestResult>;
