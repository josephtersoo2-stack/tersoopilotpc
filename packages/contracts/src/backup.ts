import { z } from 'zod';

export const BackupInfo = z.object({
  backupId: z.string(),
  filename: z.string(),
  path: z.string(),
  sizeBytes: z.number(),
  createdAt: z.number(),
  version: z.number().optional(),
  name: z.string().optional(),
  stats: z
    .object({
      profilesCount: z.number().optional(),
      tasksCount: z.number().optional(),
      proxiesCount: z.number().optional(),
      runsCount: z.number().optional(),
    })
    .optional(),
});
export type BackupInfo = z.infer<typeof BackupInfo>;

export const BackupCreateInput = z.object({
  name: z.string().min(1).max(100).optional(),
});
export type BackupCreateInput = z.infer<typeof BackupCreateInput>;

export const BackupRestoreInput = z.object({
  backupId: z.string().min(1),
});
export type BackupRestoreInput = z.infer<typeof BackupRestoreInput>;

export const BackupRestoreResult = z.object({
  success: z.boolean(),
  message: z.string(),
  restoredAt: z.number(),
});
export type BackupRestoreResult = z.infer<typeof BackupRestoreResult>;
