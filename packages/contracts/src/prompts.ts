import { z } from 'zod';

export const PromptCategory = z.enum([
  'copilot',
  'automation',
  'vision',
  'testing',
  'custom',
]);
export type PromptCategory = z.infer<typeof PromptCategory>;

export const PromptItem = z.object({
  id: z.string(),
  title: z.string(),
  category: PromptCategory,
  description: z.string(),
  variables: z.array(z.string()).default([]),
  defaultText: z.string(),
  currentText: z.string(),
  isCustom: z.boolean(),
  updatedAt: z.number().optional(),
});
export type PromptItem = z.infer<typeof PromptItem>;

export const PromptUpdateInput = z.object({
  id: z.string(),
  text: z.string(),
});
export type PromptUpdateInput = z.infer<typeof PromptUpdateInput>;

export const PromptResetInput = z.object({
  id: z.string(),
});
export type PromptResetInput = z.infer<typeof PromptResetInput>;
