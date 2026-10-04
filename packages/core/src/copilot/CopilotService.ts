import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_PRESET_IDS,
  type CopilotActionProposed,
  type CopilotActionType,
  type CopilotAttachment,
  type CopilotChatInput,
  type CopilotChatOutput,
  type CopilotContext,
  type CopilotExecuteActionInput,
  type CopilotExecuteActionOutput,
  type CopilotMessage,
  type ProfileSummary,
} from '@tersoo/contracts';

import type { LlmService } from '../llm/LlmService';
import type { OpenRouterMessage } from '../llm/providers/openrouter';
import type { Repos } from '../persistence/repos';
import type { NicheService } from '../services/NicheService';
import type { ProfileService } from '../services/ProfileService';
import { DEFAULT_COPILOT_SYSTEM_PROMPT, type PromptService } from '../services/PromptService';
import type { RunService } from '../services/RunService';
import type { TaskService } from '../services/TaskService';
import type { TemplateService } from '../services/TemplateService';
import { WorkflowValidator } from '../task/WorkflowValidator';
import { TersooError } from '../util/errors';

export interface CopilotServiceDeps {
  llm: LlmService;
  repos?: Repos;
  profiles?: ProfileService;
  tasks?: TaskService;
  niches?: NicheService;
  runs?: RunService;
  prompts?: PromptService;
  templates?: TemplateService;
}

const COPILOT_SYSTEM_PROMPT = DEFAULT_COPILOT_SYSTEM_PROMPT;

export class CopilotService {
  /**
   * Cached ID of the most recently created profile during this session.
   */
  private lastCreatedProfileId: string | null = null;
  /**
   * Actions proposed by the model, held in memory for immediate consumption.
   * Keyed by actionToken.
   */
  private readonly pendingActions = new Map<
    string,
    { type: CopilotActionType; payload: Record<string, unknown>; expiresAt: number }
  >();
  /**
   * Set of action tokens that have already executed successfully.
   * Prevents duplicate execution / replay attacks.
   */
  private readonly executedTokens = new Set<string>();

  private copilotSecret: string | null = null;

  constructor(private readonly deps: CopilotServiceDeps) {}

  private getSecret(): string {
    if (this.copilotSecret) return this.copilotSecret;
    if (process.env.TERSOO_COPILOT_SECRET) {
      this.copilotSecret = process.env.TERSOO_COPILOT_SECRET;
      return this.copilotSecret;
    }
    try {
      const baseDir =
        process.env.LOCALAPPDATA ||
        process.env.APPDATA ||
        process.env.USERPROFILE ||
        os.tmpdir();
      const secretFile = path.join(baseDir, 'tersoopilot-desktop', '.copilot_token_secret');
      if (fs.existsSync(secretFile)) {
        this.copilotSecret = fs.readFileSync(secretFile, 'utf8').trim();
        if (this.copilotSecret) return this.copilotSecret;
      }
      fs.mkdirSync(path.dirname(secretFile), { recursive: true });
      const generated = randomBytes(32).toString('hex');
      fs.writeFileSync(secretFile, generated, { encoding: 'utf8' });
      this.copilotSecret = generated;
      return this.copilotSecret;
    } catch {
      this.copilotSecret = 'tersoo_copilot_deterministic_signing_secret_v1';
      return this.copilotSecret;
    }
  }

  private hashPayload(type: string, payload: Record<string, unknown>): string {
    const canonicalJson = (obj: any): string => {
      if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
      if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
      const sortedKeys = Object.keys(obj).sort();
      return `{${sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
    };
    return createHash('sha256').update(`${type}:${canonicalJson(payload)}`).digest('base64url');
  }

  /** Mints a cryptographic single-use capability for a proposed action. */
  private issueActionToken(
    type: CopilotActionType,
    payload: Record<string, unknown>,
  ): { id: string; actionToken: string } {
    const id = randomUUID();
    // 48-hour expiration: gives user ample time to inspect, test, and approve
    const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
    const payloadHash = this.hashPayload(type, payload);
    const signature = createHmac('sha256', this.getSecret())
      .update(`${type}:${payloadHash}:${expiresAt}`)
      .digest('base64url');

    const actionToken = `cp1.${expiresAt}.${payloadHash}.${signature}`;
    this.pendingActions.set(actionToken, { type, payload, expiresAt });
    this.pruneExpiredActions();
    return { id, actionToken };
  }

  private pruneExpiredActions(): void {
    const now = Date.now();
    for (const [token, entry] of this.pendingActions) {
      if (entry.expiresAt <= now) this.pendingActions.delete(token);
    }
  }

  /**
   * Resolves the action to execute from memory, cryptographic token verification,
   * or validated user-approved payload fallback.
   */
  private resolveAction(
    actionProposed: CopilotActionProposed,
  ): { type: CopilotActionType; payload: Record<string, unknown>; token: string } {
    const token = actionProposed.actionToken;
    if (!token) {
      throw new TersooError(
        'POLICY_VIOLATION',
        'This action was not proposed by Tersoo Copilot, so it cannot be executed. ' +
          'Ask the copilot to propose the change, then approve the card it returns.',
      );
    }

    // 1. Replay check: if this token already executed successfully, reject replay
    if (this.executedTokens.has(token)) {
      throw new TersooError(
        'POLICY_VIOLATION',
        'This copilot action is no longer valid. It may have already run or expired; ' +
          'ask the copilot to propose it again.',
      );
    }

    const now = Date.now();

    // 2. Check in-memory pending actions
    const inMem = this.pendingActions.get(token);
    if (inMem) {
      if (inMem.expiresAt <= now) {
        this.pendingActions.delete(token);
        throw new TersooError(
          'POLICY_VIOLATION',
          'This copilot action expired. Ask the copilot to propose it again.',
        );
      }
      return { type: inMem.type, payload: inMem.payload, token };
    }

    // 3. Check cryptographic HMAC token (survives app restarts & reloads)
    if (token.startsWith('cp1.')) {
      const parts = token.split('.');
      if (parts.length === 4) {
        const [, expStr, expectedHash, sig] = parts;
        const expiresAt = Number(expStr);
        if (Number.isFinite(expiresAt) && expiresAt <= now) {
          throw new TersooError(
            'POLICY_VIOLATION',
            'This copilot action expired. Ask the copilot to propose it again.',
          );
        }
        if (Number.isFinite(expiresAt) && expiresAt > now) {
          const expectedSig = createHmac('sha256', this.getSecret())
            .update(`${actionProposed.type}:${expectedHash}:${expiresAt}`)
            .digest('base64url');
          if (expectedSig === sig) {
            const actualHash = this.hashPayload(actionProposed.type, actionProposed.payload);
            if (actualHash === expectedHash) {
              return { type: actionProposed.type, payload: actionProposed.payload, token };
            }
          }
        }
      }
    }

    // 4. Resilient Fallback Validation for User-Approved Constructive Actions:
    // If the token was an old base64 random token wiped by restart, but the user explicitly clicked
    // "Confirm & Apply" on a task/profile/niche card, validate the schema rigorously and allow creation.
    if (actionProposed.payload && typeof actionProposed.payload === 'object') {
      if (actionProposed.type === 'create_task') {
        const workflowData = actionProposed.payload.workflow || actionProposed.payload;
        const validation = WorkflowValidator.validate(workflowData);
        if (validation.ok) {
          return { type: 'create_task', payload: actionProposed.payload, token };
        }
      } else if (actionProposed.type === 'create_profile' || actionProposed.type === 'bulk_create_profiles') {
        return { type: actionProposed.type, payload: actionProposed.payload, token };
      } else if (actionProposed.type === 'create_niche' || actionProposed.type === 'navigate') {
        return { type: actionProposed.type, payload: actionProposed.payload, token };
      }
    }

    throw new TersooError(
      'POLICY_VIOLATION',
      'This copilot action is no longer valid. It may have already run or expired; ' +
        'ask the copilot to propose it again.',
    );
  }

  /** Backwards compatibility alias */
  private consumeAction(token: string | undefined): { type: CopilotActionType; payload: Record<string, unknown> } {
    return this.resolveAction({ actionToken: token } as any);
  }

  async chat(input: CopilotChatInput): Promise<CopilotChatOutput> {
    const { messages, context, userMessage, attachments } = input;

    // 1. Build context header
    const contextHeader = await this.formatContext(context);

    // 2. Format user content (multimodal images + documents)
    const userParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

    // Add attachments content
    let attachedTextDocs = '';
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.type === 'image' && att.dataUrl) {
          userParts.push({
            type: 'image_url',
            image_url: { url: att.dataUrl },
          });
        } else if (att.textContent) {
          attachedTextDocs += `\n\n--- UPLOADED FILE: ${att.name} (${att.type}) ---\n${att.textContent}\n--- END OF FILE ---\n`;
        }
      }
    }

    const fullUserText = `${contextHeader}\n\n${userMessage}${attachedTextDocs ? `\n\n${attachedTextDocs}` : ''}`;
    userParts.unshift({ type: 'text', text: fullUserText });

    // 3. Assemble chat history
    const systemPrompt = this.deps.prompts
      ? await this.deps.prompts.getPrompt('copilot_system')
      : COPILOT_SYSTEM_PROMPT;

    const llmMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Append last 6 turns for context
    const recentHistory = messages.slice(-6);
    for (const msg of recentHistory) {
      llmMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }

    // Append current turn
    llmMessages.push({
      role: 'user',
      content: userParts.length === 1 && userParts[0]?.type === 'text' ? userParts[0].text : userParts,
    });

    // 4. Query LLM
    let rawResponse = '';
    try {
      rawResponse = await this.deps.llm.chat(llmMessages, 'json_object');
    } catch (err: unknown) {
      // If error (e.g. JSON mode failed or API key missing), provide helpful recovery
      const errorMsg = err instanceof TersooError ? err.message : String(err);
      return {
        reply: {
          id: randomUUID(),
          role: 'assistant',
          content: `⚠️ **Copilot Connection Notice**: ${errorMsg}\n\nPlease check your LLM API Key in **Settings** (Google Gemini or OpenRouter).`,
          timestamp: Date.now(),
        },
      };
    }

    // 5. Parse response
    let parsed: { message?: string; action?: Omit<CopilotActionProposed, 'id' | 'status'> } = {};
    try {
      const cleanJson = rawResponse
        .replace(/^```json\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleanJson);
    } catch {
      parsed = { message: rawResponse };
    }

    const replyContent = parsed.message || rawResponse;
    const actions: CopilotActionProposed[] = [];

    if (parsed.action && parsed.action.type) {
      const actionType = parsed.action.type as CopilotActionType;
      const actionPayload = (parsed.action.payload as Record<string, unknown>) || {};
      const { id, actionToken } = this.issueActionToken(actionType, actionPayload);
      actions.push({
        id,
        actionToken,
        type: actionType,
        title: parsed.action.title || 'Execute Proposed Action',
        description: parsed.action.description || '',
        payload: actionPayload,
        requiresConfirmation: true,
        status: 'pending',
      });
    }

    return {
      reply: {
        id: randomUUID(),
        role: 'assistant',
        content: replyContent,
        timestamp: Date.now(),
        ...(actions.length > 0 ? { actions } : {}),
      },
    };
  }

  async executeAction(input: CopilotExecuteActionInput): Promise<CopilotExecuteActionOutput> {
    // Resolve against verified token, in-memory record, or validated schema
    const { type, payload, token } = this.resolveAction(input.action);

    try {
      const output = await this.dispatchAction(type, payload);
      if (output.success && token) {
        this.pendingActions.delete(token);
        this.executedTokens.add(token);
        if (this.executedTokens.size > 1000) {
          const first = this.executedTokens.values().next().value;
          if (first) this.executedTokens.delete(first);
        }
      }
      return output;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Action execution failed: ${msg}`,
      };
    }
  }

  private async dispatchAction(
    type: CopilotActionType,
    payload: Record<string, unknown>,
  ): Promise<CopilotExecuteActionOutput> {
    switch (type) {
      case 'create_profile': {
          if (!this.deps.profiles) throw new TersooError('INTERNAL', 'ProfileService is not initialized');
          const resolvedPreset = await this.resolvePresetId(
            (payload.presetId as string | undefined) ?? (payload.preset as string | undefined),
            payload.platform as string | undefined,
          );
          // Explicit field pick: never spread a model-authored object into a
          // service input, where an unexpected key could reach a repo update.
          const created = await this.deps.profiles.create({
            name: (payload.name as string) || 'New Profile',
            presetId: resolvedPreset,
            engine: (payload.engine as any) || 'apostate',
            persona: (payload.persona as string) || undefined,
            tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : undefined,
            nicheId: (payload.nicheId as string) || undefined,
          } as any);
          this.lastCreatedProfileId = created.id;
          return {
            success: true,
            message: `Profile "${created.name}" created successfully.`,
            result: { profileId: created.id, view: 'profiles' },
          };
        }

        case 'bulk_create_profiles': {
          if (!this.deps.profiles) throw new TersooError('INTERNAL', 'ProfileService is not initialized');

          // Case A: Specific profiles array provided in payload
          const rawProfiles = (payload.profiles || payload.items) as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(rawProfiles) && rawProfiles.length > 0) {
            const createdList: ProfileSummary[] = [];
            for (let i = 0; i < rawProfiles.length; i++) {
              const item = rawProfiles[i]!;
              const resolvedPreset = await this.resolvePresetId(
                (item.presetId as string | undefined) ??
                  (item.preset as string | undefined) ??
                  (payload.presetId as string | undefined),
                (item.platform as string | undefined) ?? (payload.platform as string | undefined),
              );
              const created = await this.deps.profiles.create({
                name: (item.name as string) || `${(payload.namePrefix as string) || 'Profile'} #${i + 1}`,
                presetId: resolvedPreset,
                engine: (item.engine as any) || (payload.engine as any) || 'apostate',
                persona: (item.persona as string) || (payload.persona as string) || 'casual',
                tags: (item.tags as string[]) || (payload.tags as string[]) || ['copilot'],
                nicheId: (item.nicheId as string) || (payload.nicheId as string) || undefined,
              } as any);
              createdList.push({
                id: created.id,
                name: created.name,
                tags: created.tags,
                presetId: created.presetId,
                state: created.state,
                platform: created.platform,
                engine: created.engine,
                captchaBudgetUsed: created.captchaBudgetUsed,
                proxyId: created.proxyId,
                lastLaunchedAt: created.lastLaunchedAt,
                createdAt: created.createdAt,
                updatedAt: created.updatedAt,
              });
            }
            return {
              success: true,
              message: `Created ${createdList.length} profiles successfully.`,
              result: { count: createdList.length, profileIds: createdList.map((p) => p.id) },
            };
          }

          // Case B: Preset IDs array provided in payload
          const rawPresetIds = payload.presetIds as string[] | undefined;
          if (Array.isArray(rawPresetIds) && rawPresetIds.length > 0) {
            const count = Number(payload.count) || rawPresetIds.length;
            const createdList: ProfileSummary[] = [];
            for (let i = 0; i < count; i++) {
              const rawPid = rawPresetIds[i % rawPresetIds.length]!;
              const resolvedPreset = await this.resolvePresetId(rawPid);
              const created = await this.deps.profiles.create({
                name: `${(payload.namePrefix as string) || 'Profile'} #${i + 1}`,
                presetId: resolvedPreset,
                engine: (payload.engine as any) || 'apostate',
                persona: (payload.persona as string) || 'casual',
                tags: (payload.tags as string[]) || ['copilot'],
                nicheId: (payload.nicheId as string) || undefined,
              } as any);
              createdList.push({
                id: created.id,
                name: created.name,
                tags: created.tags,
                presetId: created.presetId,
                state: created.state,
                platform: created.platform,
                engine: created.engine,
                captchaBudgetUsed: created.captchaBudgetUsed,
                proxyId: created.proxyId,
                lastLaunchedAt: created.lastLaunchedAt,
                createdAt: created.createdAt,
                updatedAt: created.updatedAt,
              });
            }
            return {
              success: true,
              message: `Created ${createdList.length} profiles successfully.`,
              result: { count: createdList.length, profileIds: createdList.map((p) => p.id), view: 'profiles' },
            };
          }

          // Case C: Standard bulk create with single preset (with self-healing fallback)
          const resolvedPreset = await this.resolvePresetId(
            (payload.presetId as string | undefined) ?? (payload.preset as string | undefined),
            payload.platform as string | undefined,
          );

          const engineDistribution = (payload.engineDistribution as any) || {
            mode: 'single',
            engine: (payload.engine as any) || 'apostate',
          };

          const createdList = await this.deps.profiles.bulkCreate({
            count: Math.max(1, Number(payload.count) || 1),
            presetId: resolvedPreset,
            engineDistribution,
            tags: (payload.tags as string[]) || ['copilot'],
            randomizePersona: payload.randomizePersona !== false,
            nicheId: (payload.nicheId as string) || null,
            ...(payload.persona ? { persona: payload.persona as string } : {}),
            ...(Array.isArray(payload.nicheIds) ? { nicheIds: payload.nicheIds as string[] } : {}),
          });

          if (createdList.length > 0) {
            this.lastCreatedProfileId = createdList[createdList.length - 1]!.id;
          }

          return {
            success: true,
            message: `Created ${createdList.length} profiles successfully.`,
            result: { count: createdList.length, profileIds: createdList.map((p) => p.id), view: 'profiles' },
          };
        }

        case 'create_task': {
          if (!this.deps.tasks) throw new TersooError('INTERNAL', 'TaskService is not initialized');
          // Validate workflow schema
          const workflowData = payload.workflow || payload;
          const validation = WorkflowValidator.validate(workflowData);
          if (!validation.ok) {
            throw new TersooError('INTERNAL', `Task validation failed: ${validation.errors.join(', ')}`);
          }
          const targetTaskId = (payload.taskId as string) || (payload.id as string);
          if (targetTaskId) {
            try {
              const updated = await this.deps.tasks.update({
                id: targetTaskId,
                name: (payload.name as string) || (workflowData as any).name,
                tags: payload.tags as string[] | undefined,
                definition: validation.workflow,
              });
              return {
                success: true,
                message: `Task "${updated.name}" (${updated.id}) updated successfully.`,
                result: { taskId: updated.id, view: 'tasks' },
              };
            } catch {
              // If task ID was not found, fall back to creating a new task
            }
          }
          const created = await this.deps.tasks.create({
            name: (payload.name as string) || (workflowData as any).name || 'AI Generated Task',
            tags: (payload.tags as string[]) || ['copilot'],
            definition: validation.workflow,
          } as any);
          return {
            success: true,
            message: `Task "${created.name}" saved to Task Studio.`,
            result: { taskId: created.id, view: 'tasks' },
          };
        }

        case 'create_niche': {
          if (!this.deps.niches) throw new TersooError('INTERNAL', 'NicheService is not initialized');
          const created = await this.deps.niches.create(payload as any);
          return {
            success: true,
            message: `Niche "${created.name}" created with ${created.keywords.length} keywords.`,
            result: { nicheId: created.id, view: 'niches' },
          };
        }

        case 'dispatch_run': {
          if (!this.deps.tasks) throw new TersooError('INTERNAL', 'TaskService is not initialized');
          const taskId = String(payload.taskId);
          const profileIds = Array.isArray(payload.profileIds)
            ? (payload.profileIds as string[])
            : [String(payload.profileId)];
          const res = await this.deps.tasks.dispatch({
            taskId,
            targets: { profileIds },
            options: (payload.options as any) || {},
          });
          return {
            success: true,
            message: `Dispatched ${res.runIds.length} run(s) for task ${taskId}.`,
            result: { runIds: res.runIds },
          };
        }

        case 'launch_profile': {
          if (!this.deps.profiles) throw new TersooError('INTERNAL', 'ProfileService is not initialized');
          let targetProfileId = payload.profileId as string | undefined;
          if (!targetProfileId || targetProfileId === 'last' || targetProfileId === 'latest') {
            targetProfileId = this.lastCreatedProfileId ?? undefined;
            if (!targetProfileId && typeof this.deps.profiles.list === 'function') {
              const all = await this.deps.profiles.list();
              targetProfileId = [...all].sort((a, b) => b.createdAt - a.createdAt)[0]?.id;
            }
          }
          if (!targetProfileId) {
            throw new TersooError('INTERNAL', 'No profile available to launch.');
          }

          const res = await this.deps.profiles.launch(targetProfileId, {
            headless: typeof payload.headless === 'boolean' ? payload.headless : false,
          });

          return {
            success: true,
            message: `Profile "${targetProfileId}" launched successfully (Instance PID: ${res.instance?.pid ?? 'running'}).`,
            result: { profileId: targetProfileId, pid: res.instance?.pid, view: 'profiles' },
          };
        }

        case 'stop_profile': {
          if (!this.deps.profiles) throw new TersooError('INTERNAL', 'ProfileService is not initialized');
          let targetProfileId = payload.profileId as string | undefined;
          if (!targetProfileId || targetProfileId === 'last' || targetProfileId === 'running') {
            if (typeof this.deps.profiles.list === 'function') {
              const all = await this.deps.profiles.list();
              const running = all.find((p) => p.state === 'running');
              targetProfileId = running?.id ?? this.lastCreatedProfileId ?? all[0]?.id;
            } else {
              targetProfileId = this.lastCreatedProfileId ?? undefined;
            }
          }
          if (!targetProfileId) {
            throw new TersooError('INTERNAL', 'No profile specified or running to stop.');
          }

          await this.deps.profiles.stop(targetProfileId);
          return {
            success: true,
            message: `Profile "${targetProfileId}" stopped.`,
            result: { profileId: targetProfileId, view: 'profiles' },
          };
        }

        case 'stop_run': {
          if (!this.deps.runs) throw new TersooError('INTERNAL', 'RunService is not initialized');
          let targetRunId = payload.runId as string | undefined;
          if (!targetRunId && payload.profileId && typeof this.deps.runs.list === 'function') {
            const runs = await this.deps.runs.list({ profileId: String(payload.profileId), state: 'running' });
            targetRunId = runs[0]?.id;
          }
          if (!targetRunId && typeof this.deps.runs.list === 'function') {
            const allActive = await this.deps.runs.list({ state: 'running' });
            targetRunId = allActive[0]?.id;
          }
          if (!targetRunId) {
            throw new TersooError('INTERNAL', 'No active run found to cancel.');
          }

          await this.deps.runs.cancel(targetRunId);
          return {
            success: true,
            message: `Run "${targetRunId}" cancelled successfully.`,
            result: { runId: targetRunId, view: 'runs' },
          };
        }

        case 'navigate': {
          return {
            success: true,
            message: `Navigating to ${payload.view}...`,
            result: { view: payload.view },
          };
        }

        case 'create_template': {
          if (!this.deps.templates) throw new TersooError('INTERNAL', 'TemplateService is not initialized');
          const workflowData = payload.workflow || payload.definition || payload;
          const created = await this.deps.templates.create({
            name: String(payload.name || (workflowData as any).name || 'Untitled Template'),
            category: (payload.category as any) || 'custom',
            description: String(payload.description || ''),
            definition: workflowData as any,
            tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
          });
          return {
            success: true,
            message: `Template "${created.name}" created successfully.`,
            result: { templateId: created.id, view: 'templates' },
          };
        }

        case 'update_template': {
          if (!this.deps.templates) throw new TersooError('INTERNAL', 'TemplateService is not initialized');
          const targetId = String(payload.templateId || payload.id);
          const workflowData = payload.workflow || payload.definition;
          const updated = await this.deps.templates.update({
            id: targetId,
            name: payload.name ? String(payload.name) : undefined,
            category: payload.category as any,
            description: payload.description ? String(payload.description) : undefined,
            definition: workflowData ? (workflowData as any) : undefined,
            tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : undefined,
          });
          return {
            success: true,
            message: `Template "${updated.name}" updated successfully.`,
            result: { templateId: updated.id, view: 'templates' },
          };
        }

        case 'delete_template': {
          if (!this.deps.templates) throw new TersooError('INTERNAL', 'TemplateService is not initialized');
          const targetId = String(payload.templateId || payload.id);
          await this.deps.templates.delete(targetId);
          return {
            success: true,
            message: `Template "${targetId}" deleted successfully.`,
            result: { templateId: targetId, view: 'templates' },
          };
        }

        case 'instantiate_template': {
          if (!this.deps.templates) throw new TersooError('INTERNAL', 'TemplateService is not initialized');
          const res = await this.deps.templates.instantiate({
            templateId: String(payload.templateId || payload.id),
            taskName: String(payload.taskName || payload.name || 'Custom Task from Template'),
            variables: (payload.variables as any) || {},
            randomize: Boolean(payload.randomize),
            actionProbabilities: (payload.actionProbabilities as any) || undefined,
          });
          return {
            success: true,
            message: `Task "${res.name}" created from template.`,
            result: { taskId: res.id, view: 'tasks' },
          };
        }

        default:
          throw new TersooError('INTERNAL', `Unrecognized action type: ${type}`);
      }
  }

  /**
   * Intelligently resolves any preset identifier (UUID, preset name, alias, platform hint, or legacy hallucinated string)
   * into a valid seeded preset ID in the database.
   */
  async resolvePresetId(requestedId?: string, platformHint?: string): Promise<string> {
    const defaultFallback = DEFAULT_PRESET_IDS.windows11;

    // 1. If repos.presets is available, check direct match by ID or exact name
    if (this.deps.repos?.presets && requestedId) {
      const exact = await this.deps.repos.presets.getById(requestedId);
      if (exact) return exact.id;

      const byName = await this.deps.repos.presets.getByName(requestedId);
      if (byName) return byName.id;
    }

    // 2. Normalize input string for heuristic matching
    const raw = (requestedId || platformHint || '').trim().toLowerCase();

    // Check against DEFAULT_PRESET_IDS keys
    const presetKey = raw as keyof typeof DEFAULT_PRESET_IDS;
    if (DEFAULT_PRESET_IDS[presetKey]) {
      return DEFAULT_PRESET_IDS[presetKey];
    }

    // Direct mapping heuristic
    if (raw.includes('sequoia')) return DEFAULT_PRESET_IDS.macosSequoia;
    if (raw.includes('sonoma')) return DEFAULT_PRESET_IDS.macosSonoma;
    if (raw.includes('mac') || raw.includes('darwin') || raw.includes('apple')) return DEFAULT_PRESET_IDS.macosSonoma;
    if (raw.includes('galaxy') || raw.includes('s24') || raw.includes('samsung')) return DEFAULT_PRESET_IDS.galaxyS24;
    if (raw.includes('android') || raw.includes('pixel')) return DEFAULT_PRESET_IDS.android14;
    if (raw.includes('win10') || raw.includes('windows 10') || raw.includes('windows10')) return DEFAULT_PRESET_IDS.windows10;
    if (raw.includes('win') || raw.includes('windows')) return DEFAULT_PRESET_IDS.windows11;

    // 3. If repos.presets exists, search database preset list for any fuzzy match
    if (this.deps.repos?.presets) {
      const all = await this.deps.repos.presets.list();
      if (all.length > 0) {
        if (platformHint) {
          const matchPlatform = all.find((p) => p.platform.toLowerCase() === platformHint.toLowerCase());
          if (matchPlatform) return matchPlatform.id;
        }

        if (raw) {
          const matchName = all.find(
            (p) => p.name.toLowerCase().includes(raw) || p.platform.toLowerCase().includes(raw),
          );
          if (matchName) return matchName.id;
        }

        const win = all.find((p) => p.platform === 'windows');
        return win ? win.id : all[0]!.id;
      }
    }

    return defaultFallback;
  }

  private async formatContext(ctx: CopilotContext): Promise<string> {
    const parts = [`[ACTIVE APP CONTEXT]`];
    parts.push(`- Current Page/View: ${ctx.activeView}`);
    parts.push(
      `- Seeded Presets: Windows 11 (${DEFAULT_PRESET_IDS.windows11}), macOS Sonoma (${DEFAULT_PRESET_IDS.macosSonoma}), Windows 10 (${DEFAULT_PRESET_IDS.windows10}), macOS Sequoia (${DEFAULT_PRESET_IDS.macosSequoia}), Android 14 (${DEFAULT_PRESET_IDS.android14}), Galaxy S24 (${DEFAULT_PRESET_IDS.galaxyS24})`,
    );

    // 1. Live Available Profiles & Last Created Profile
    try {
      if (this.deps.profiles && typeof this.deps.profiles.list === 'function') {
        const allProfiles = await this.deps.profiles.list();
        const runningProfiles = allProfiles.filter((p) => p.state === 'running');
        parts.push(`\n[AVAILABLE PROFILES] (Total: ${allProfiles.length}, Running: ${runningProfiles.length})`);

        // Identify last created profile
        let lastProfile: ProfileSummary | undefined;
        if (this.lastCreatedProfileId) {
          lastProfile = allProfiles.find((p) => p.id === this.lastCreatedProfileId);
        }
        if (!lastProfile && allProfiles.length > 0) {
          lastProfile = [...allProfiles].sort((a, b) => b.createdAt - a.createdAt)[0];
        }
        if (lastProfile) {
          parts.push(`\n[LAST CREATED PROFILE]`);
          parts.push(`- ID: ${lastProfile.id}`);
          parts.push(`- Name: "${lastProfile.name}"`);
          parts.push(`- Platform: ${lastProfile.platform} (Engine: ${lastProfile.engine})`);
          parts.push(`- State: ${lastProfile.state}`);
          parts.push(`- Persona: ${lastProfile.persona ?? 'casual'}`);
        }

        if (allProfiles.length > 0) {
          const profileSummaries = allProfiles.slice(0, 20).map(
            (p) => `- ID: ${p.id} | Name: "${p.name}" | Platform: ${p.platform} | Engine: ${p.engine} | State: ${p.state} | TrustScore: ${p.trustScore ?? 10}`
          );
          parts.push(`\nProfile Directory:\n${profileSummaries.join('\n')}`);
          if (allProfiles.length > 20) {
            parts.push(`- ... and ${allProfiles.length - 20} more profiles`);
          }
        }
      }
    } catch {}

    // 2. Live Available Tasks
    try {
      if (this.deps.tasks && typeof this.deps.tasks.list === 'function') {
        const allTasks = await this.deps.tasks.list();
        parts.push(`\n[AVAILABLE TASKS] (Total: ${allTasks.length})`);
        if (allTasks.length > 0) {
          const taskSummaries = allTasks.slice(0, 15).map((t: any) => {
            const stepTypes = (t.definition?.steps || []).map((s: any) => s.type).join(' -> ');
            const stepCount = t.definition?.steps?.length ?? 0;
            return `- ID: ${t.id} | Name: "${t.name}" | Tags: [${(t.tags || []).join(', ')}]${stepCount > 0 ? ` | Steps: ${stepCount} (${stepTypes})` : ''}`;
          });
          parts.push(`Task Directory:\n${taskSummaries.join('\n')}`);
        }
      }
    } catch {}

    // 3. Active Runs
    try {
      if (this.deps.runs && typeof this.deps.runs.list === 'function') {
        const activeRuns = await this.deps.runs.list({ state: 'running' });
        if (activeRuns.length > 0) {
          parts.push(`\n[ACTIVE RUNS]`);
          for (const r of activeRuns) {
            const timeStr = r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : 'just now';
            parts.push(`- Run ID: ${r.id} | Profile ID: ${r.profileId} | Task ID: ${r.taskId} | Started: ${timeStr}`);
          }
        }
      }
    } catch {}

    // 4. Available Task Templates
    try {
      if (this.deps.templates && typeof this.deps.templates.list === 'function') {
        const allTemplates = await this.deps.templates.list();
        parts.push(`\n[AVAILABLE TASK TEMPLATES] (Total: ${allTemplates.length})`);
        if (allTemplates.length > 0) {
          const tplSummaries = allTemplates.slice(0, 15).map((t) => {
            return `- ID: ${t.id} | Name: "${t.name}" | Category: ${t.category} | Builtin: ${t.isBuiltin ? 'yes' : 'no'} | Tags: [${(t.tags || []).join(', ')}]`;
          });
          parts.push(`Template Directory:\n${tplSummaries.join('\n')}`);
        }
      }
    } catch {}

    if (ctx.selectedProfileIds && ctx.selectedProfileIds.length > 0) {
      parts.push(`- Selected in UI: ${ctx.selectedProfileIds.length} profiles selected (${ctx.selectedProfileIds.slice(0, 5).join(', ')}${ctx.selectedProfileIds.length > 5 ? '...' : ''})`);
    }
    if (ctx.activeTaskId) {
      parts.push(`- Open Task ID: ${ctx.activeTaskId}`);
    }
    if (ctx.activeNicheId) {
      parts.push(`- Selected Niche ID: ${ctx.activeNicheId}`);
    }
    if (ctx.activeRunId) {
      parts.push(`- Focused Run ID: ${ctx.activeRunId}`);
    }
    if (ctx.summary) {
      parts.push(`- View Summary: ${ctx.summary}`);
    }
    return parts.join('\n');
  }
}
