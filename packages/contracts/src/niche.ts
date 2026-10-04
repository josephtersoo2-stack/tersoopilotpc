import { z } from 'zod';

import { Id, Tags, Timestamp } from './primitives';

export const Niche = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  keywords: z.array(z.string()).default([]),
  seedUrls: z.array(z.string()).default([]),
  tags: Tags.default([]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Niche = z.infer<typeof Niche>;

export const NicheCreateInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().default(''),
  keywords: z.array(z.string()).optional().default([]),
  seedUrls: z.array(z.string()).optional().default([]),
  tags: Tags.optional().default([]),
});
export type NicheCreateInput = z.infer<typeof NicheCreateInput>;

export const NicheUpdateInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  seedUrls: z.array(z.string()).optional(),
  tags: Tags.optional(),
});
export type NicheUpdateInput = z.infer<typeof NicheUpdateInput>;
