import { z } from 'zod';

import { Id, Tags, Timestamp } from './primitives';
import { Workflow } from './task';

export const TaskTemplateCategory = z.enum([
  'warming',
  'youtube',
  'seo',
  'social',
  'custom',
]);
export type TaskTemplateCategory = z.infer<typeof TaskTemplateCategory>;

export const TaskTemplate = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: TaskTemplateCategory,
  description: z.string(),
  definition: Workflow,
  isBuiltin: z.boolean().default(false),
  tags: Tags.default([]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type TaskTemplate = z.infer<typeof TaskTemplate>;

export const TemplateCreateInput = z.object({
  name: z.string().min(1),
  category: TaskTemplateCategory.default('custom'),
  description: z.string().default(''),
  definition: Workflow,
  tags: Tags.default([]),
});
export type TemplateCreateInput = z.infer<typeof TemplateCreateInput>;

export const TemplateUpdateInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  category: TaskTemplateCategory.optional(),
  description: z.string().optional(),
  definition: Workflow.optional(),
  tags: Tags.optional(),
});
export type TemplateUpdateInput = z.infer<typeof TemplateUpdateInput>;

export const TemplateInstantiateInput = z.object({
  templateId: z.string().min(1),
  taskName: z.string().min(1),
  variables: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
  randomize: z.boolean().default(false).optional(),
  actionProbabilities: z.record(z.number().min(0).max(1)).optional(),
});
export type TemplateInstantiateInput = z.infer<typeof TemplateInstantiateInput>;
