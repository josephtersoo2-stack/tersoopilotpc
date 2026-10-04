import { z } from 'zod';

import {
  BackupCreateInput,
  BackupInfo,
  BackupRestoreInput,
  BackupRestoreResult,
} from './backup';
import {
  CopilotChatInput,
  CopilotChatOutput,
  CopilotExecuteActionInput,
  CopilotExecuteActionOutput,
} from './copilot';
import {
  LlmConfig,
  LlmKeySetInput,
  LlmKeyStatus,
  LlmModelInfo,
  LlmTestInput,
  LlmTestResult,
} from './llm';
import { Niche, NicheCreateInput, NicheUpdateInput } from './niche';
import { PromptItem, PromptUpdateInput, PromptResetInput } from './prompts';
import {
  VoiceTranscribeInput,
  VoiceTranscribeOutput,
  VoiceSpeakInput,
  VoiceSpeakOutput,
  VoiceCostSummary,
  VoiceSettings,
  VoiceModelsListOutput,
  VoiceTestConnectionInput,
  VoiceTestConnectionOutput,
} from './voice';
import { Id } from './primitives';
import {
  ProfileCreateInput,
  ProfileDetail,
  ProfileExportBundle,
  ProfileImportInput,
  ProfileSummary,
  ProfileUpdateInput,
} from './profile';
import {
  HealthResult,
  ImportReport,
  LeaseSummary,
  ProxyBulkImportInput,
  ProxyCreateInput,
  ProxySummary,
} from './proxy';
import { DispatchInput, RunSummary, TaskCreateInput, TaskDetail, TaskSummary, TaskUpdateInput } from './task';
import {
  TaskTemplate,
  TemplateCreateInput,
  TemplateUpdateInput,
  TemplateInstantiateInput,
} from './template';
import { FleetStatus } from './fleet';

export const Commands = {
  'profile.list': {
    input: z.object({ filter: z.unknown().optional() }),
    output: z.array(ProfileSummary),
  },
  'profile.get': { input: z.object({ id: Id }), output: ProfileDetail },
  'profile.create': { input: ProfileCreateInput, output: ProfileDetail },
  'profile.bulkCreate': {
    input: z.object({
      count: z.number().int().positive(),
      presetId: Id,
      engineDistribution: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('single'), engine: z.enum(['apostate', 'camoufox']) }),
        z.object({ mode: z.literal('mixed'), weights: z.object({ apostate: z.number(), camoufox: z.number() }) }),
      ]),
      tags: z.array(z.string()).optional(),
      persona: z.string().optional(),
      nicheId: z.string().nullable().optional(),
      nicheIds: z.array(z.string()).optional(),
      randomizePersona: z.boolean().optional(),
    }),
    output: z.array(ProfileSummary),
  },
  'profile.update': {
    input: z.object({ id: Id, patch: ProfileUpdateInput }),
    output: ProfileDetail,
  },
  'profile.delete': { input: z.object({ id: Id }), output: z.void() },
  'profile.launch': {
    input: z.object({ id: Id, headless: z.boolean().optional() }),
    output: z.object({ runId: Id.optional() }),
  },
  'profile.stop': { input: z.object({ id: Id }), output: z.void() },
  'profile.autoMature': { input: z.object({ id: Id }), output: ProfileDetail },

  'proxy.list': {
    // Optional because the renderer calls this with no argument to fetch the
    // unfiltered list; the filter is only sent when the user narrows the view.
    input: z.object({ filter: z.unknown().optional() }).optional(),
    output: z.array(ProxySummary),
  },
  'proxy.create': { input: ProxyCreateInput, output: ProxySummary },
  'proxy.importBulk': { input: ProxyBulkImportInput, output: ImportReport },
  'proxy.check': { input: z.object({ id: Id }), output: HealthResult },
  'proxy.assign': {
    input: z.object({
      profileId: Id,
      strategy: z.enum(['manual', 'random']),
      proxyId: Id.optional(),
    }),
    output: LeaseSummary,
  },
  'proxy.release': { input: z.object({ profileId: Id }), output: z.void() },
  'proxy.swap': { input: z.object({ profileId: Id }), output: LeaseSummary },
  'proxy.delete': { input: z.object({ id: Id }), output: z.void() },

  'task.list': { input: z.void(), output: z.array(TaskSummary) },
  'task.get': { input: z.object({ id: Id }), output: TaskDetail.nullable() },
  'task.create': { input: TaskCreateInput, output: TaskDetail },
  'task.update': { input: TaskUpdateInput, output: TaskDetail },
  'task.delete': { input: z.object({ id: Id }), output: z.void() },
  'task.dispatch': { input: DispatchInput, output: z.object({ runIds: z.array(Id) }) },

  'template.list': {
    input: z.object({ category: z.string().optional() }).optional().default({}),
    output: z.array(TaskTemplate),
  },
  'template.get': { input: z.object({ id: Id }), output: TaskTemplate.nullable() },
  'template.create': { input: TemplateCreateInput, output: TaskTemplate },
  'template.update': { input: TemplateUpdateInput, output: TaskTemplate },
  'template.delete': { input: z.object({ id: Id }), output: z.void() },
  'template.instantiate': { input: TemplateInstantiateInput, output: TaskDetail },

  'run.list': { input: z.object({ filter: z.unknown().optional() }), output: z.array(RunSummary) },
  'run.cancel': { input: z.object({ id: Id }), output: z.void() },
  'run.resume': { input: z.object({ id: Id }), output: z.void() },
  'run.delete': { input: z.object({ id: Id }), output: z.void() },
  'run.clearTerminal': { input: z.void(), output: z.number() },

  'fleet.status': { input: z.void(), output: FleetStatus },
  'logs.query': {
    input: z.object({
      scope: z.unknown().optional(),
      profileId: Id.optional(),
      runId: Id.optional(),
      limit: z.number().int().max(1000).default(200),
    }),
    output: z.array(z.unknown()),
  },

  'llm.test': { input: LlmTestInput, output: LlmTestResult },
  'llm.config.get': { input: z.void(), output: LlmConfig },
  'llm.config.set': { input: LlmConfig.partial(), output: z.void() },
  'llm.models.list': {
    input: z.object({ provider: z.enum(['openrouter', 'gemini']), apiKey: z.string().optional() }),
    output: z.array(LlmModelInfo),
  },
  'llm.key.set': { input: LlmKeySetInput, output: z.object({ ok: z.boolean() }) },
  'llm.key.get': { input: z.object({ provider: z.enum(['openrouter', 'gemini']) }), output: LlmKeyStatus },

  'engine.list': { input: z.void(), output: z.array(z.enum(['apostate', 'camoufox'])) },
  'engine.config.get': { input: z.object({ engine: z.enum(['apostate', 'camoufox']) }), output: z.any() },
  'engine.config.set': {
    input: z.object({
      engine: z.enum(['apostate', 'camoufox']),
      patch: z.object({
        action_mode: z.enum(['scripted', 'llm']).optional(),
        binary_path: z.string().nullable().optional(),
        launch_options: z.union([z.string(), z.record(z.unknown())]).optional(),
      }),
    }),
    output: z.void(),
  },

  'captcha.events.list': { input: z.object({ runId: Id.optional(), profileId: Id.optional() }), output: z.array(z.any()) },
  'captcha.budget.get': { input: z.object({ profileId: Id }), output: z.object({ used: z.number(), budget: z.number() }) },

  'settings.weights.get': { input: z.void(), output: z.object({ apostate: z.number(), camoufox: z.number() }) },
  'settings.weights.set': { input: z.object({ apostate: z.number(), camoufox: z.number() }), output: z.void() },

  'settings.ramCheck.get': {
    input: z.void(),
    output: z.object({ skipRamCheck: z.boolean(), memoryPressureThresholdPct: z.number() }),
  },
  'settings.ramCheck.set': {
    input: z.object({ skipRamCheck: z.boolean(), memoryPressureThresholdPct: z.number().optional() }),
    output: z.void(),
  },

  'profile.export': {
    input: z.object({ id: Id }),
    output: ProfileExportBundle,
  },
  'profile.import': {
    input: ProfileImportInput,
    output: ProfileDetail,
  },

  'settings.launchInterval.get': {
    input: z.void(),
    output: z.object({ minSec: z.number(), maxSec: z.number(), concurrency: z.number() }),
  },
  'settings.launchInterval.set': {
    input: z.object({ minSec: z.number(), maxSec: z.number(), concurrency: z.number().optional() }),
    output: z.void(),
  },

  'niche.list': {
    input: z.void(),
    output: z.array(Niche),
  },
  'niche.get': {
    input: z.object({ id: Id }),
    output: Niche,
  },
  'niche.create': {
    input: NicheCreateInput,
    output: Niche,
  },
  'niche.update': {
    input: NicheUpdateInput,
    output: Niche,
  },
  'niche.delete': {
    input: z.object({ id: Id }),
    output: z.void(),
  },

  'backup.create': {
    input: BackupCreateInput,
    output: BackupInfo,
  },
  'backup.list': {
    input: z.void(),
    output: z.array(BackupInfo),
  },
  'backup.restore': {
    input: BackupRestoreInput,
    output: BackupRestoreResult,
  },
  'copilot.chat': {
    input: CopilotChatInput,
    output: CopilotChatOutput,
  },
  'copilot.executeAction': {
    input: CopilotExecuteActionInput,
    output: CopilotExecuteActionOutput,
  },
  'prompt.list': {
    input: z.void(),
    output: z.array(PromptItem),
  },
  'prompt.update': {
    input: PromptUpdateInput,
    output: PromptItem,
  },
  'prompt.reset': {
    input: PromptResetInput,
    output: PromptItem,
  },
  'prompt.resetAll': {
    input: z.void(),
    output: z.array(PromptItem),
  },
  'voice.transcribe': {
    input: VoiceTranscribeInput,
    output: VoiceTranscribeOutput,
  },
  'voice.speak': {
    input: VoiceSpeakInput,
    output: VoiceSpeakOutput,
  },
  'voice.wake_detected': {
    input: z.object({}).optional().default({}),
    output: z.void(),
  },
  'voice.cost_summary': {
    input: z.object({ fromMs: z.number().optional(), toMs: z.number().optional() }).optional(),
    output: VoiceCostSummary,
  },
  'voice.settings.get': {
    input: z.void(),
    output: VoiceSettings,
  },
  'voice.settings.set': {
    input: VoiceSettings.partial(),
    output: VoiceSettings,
  },
  'voice.models.list': {
    input: z.object({ refresh: z.boolean().optional() }).optional().default({}),
    output: VoiceModelsListOutput,
  },
  'voice.test_connection': {
    input: VoiceTestConnectionInput.optional().default({}),
    output: VoiceTestConnectionOutput,
  },
} as const;

export type CommandName = keyof typeof Commands;
export type CommandInput<C extends CommandName> = z.infer<(typeof Commands)[C]['input']>;
export type CommandOutput<C extends CommandName> = z.infer<(typeof Commands)[C]['output']>;
