import { z } from 'zod';

export const CopilotAttachmentType = z.enum(['image', 'markdown', 'text', 'json', 'csv']);
export type CopilotAttachmentType = z.infer<typeof CopilotAttachmentType>;

export const CopilotAttachment = z.object({
  id: z.string(),
  name: z.string(),
  type: CopilotAttachmentType,
  size: z.number().int().nonnegative(),
  dataUrl: z.string().optional(),
  textContent: z.string().optional(),
});
export type CopilotAttachment = z.infer<typeof CopilotAttachment>;

export const CopilotContext = z.object({
  activeView: z.string(),
  selectedProfileIds: z.array(z.string()).optional(),
  activeTaskId: z.string().optional(),
  activeNicheId: z.string().optional(),
  activeRunId: z.string().optional(),
  activeProxyCount: z.number().optional(),
  summary: z.string().optional(),
});
export type CopilotContext = z.infer<typeof CopilotContext>;

export const CopilotActionType = z.enum([
  'create_profile',
  'bulk_create_profiles',
  'create_task',
  'dispatch_run',
  'launch_profile',
  'stop_profile',
  'stop_run',
  'create_niche',
  'navigate',
  'create_template',
  'update_template',
  'delete_template',
  'instantiate_template',
]);
export type CopilotActionType = z.infer<typeof CopilotActionType>;

export const CopilotActionProposed = z.object({
  id: z.string(),
  type: CopilotActionType,
  title: z.string(),
  description: z.string(),
  payload: z.record(z.unknown()),
  /**
   * Single-use capability minted by the main process when the action is
   * proposed. `copilot.executeAction` requires it and executes the action
   * stored in the main process, not the copy the renderer sends back. Without
   * this, any code able to call IPC could invoke arbitrary typed actions,
   * because "requiresConfirmation" was only ever a renderer-side flag.
   */
  actionToken: z.string().optional(),
  requiresConfirmation: z.boolean().default(true),
  status: z.enum(['pending', 'confirmed', 'executed', 'rejected']).default('pending'),
});
export type CopilotActionProposed = z.infer<typeof CopilotActionProposed>;

export const CopilotMessage = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.number().int(),
  attachments: z.array(CopilotAttachment).optional(),
  actions: z.array(CopilotActionProposed).optional(),
});
export type CopilotMessage = z.infer<typeof CopilotMessage>;

export const CopilotChatInput = z.object({
  messages: z.array(CopilotMessage).default([]),
  context: CopilotContext,
  userMessage: z.string(),
  attachments: z.array(CopilotAttachment).optional(),
});
export type CopilotChatInput = z.infer<typeof CopilotChatInput>;

export const CopilotChatOutput = z.object({
  reply: CopilotMessage,
});
export type CopilotChatOutput = z.infer<typeof CopilotChatOutput>;

export const CopilotExecuteActionInput = z.object({
  action: CopilotActionProposed,
});
export type CopilotExecuteActionInput = z.infer<typeof CopilotExecuteActionInput>;
export const CopilotExecuteActionOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  result: z.record(z.unknown()).optional(),
});
export type CopilotExecuteActionOutput = z.infer<typeof CopilotExecuteActionOutput>;
