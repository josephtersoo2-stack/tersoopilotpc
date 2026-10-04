import crypto from 'node:crypto';

import {
  type RunState,
  type RunSummary,
  type StepRun,
  type StepState,
  type Workflow,
} from '@tersoo/contracts';
import type { Page } from 'playwright-core';

import type { Config } from '../config';
import { AnchorRegistry } from '../crosshair/AnchorRegistry';
import type { CrosshairWorker } from '../crosshair/CrosshairWorker';
import type { Humanizer } from '../crosshair/Humanizer';
import { XPathResolver } from '../crosshair/XPathResolver';
import type { EngineFactory } from '../engines/EngineFactory';
import type { EventBus } from '../events/EventBus';
import type { LlmService } from '../llm/LlmService';
import type { Repos } from '../persistence/repos';
import type { ProfileRow, RunRow, StepRunRow } from '../persistence/schema';
import type { Job, JobQueue } from '../queue/JobQueue';
import type { BrowserSupervisor } from '../supervisor/BrowserSupervisor';
import { StepRunner, type StepExecutionContext } from '../task/StepRunner';
import { TaskError, TersooError } from '../util/errors';

import type { FleetService } from './FleetService';
import type { ProfileService } from './ProfileService';

export interface RunServiceDeps {
  repos: Repos;
  queue: JobQueue;
  events: EventBus;
  supervisor: BrowserSupervisor;
  crosshair: CrosshairWorker;
  profiles?: ProfileService;
  fleet?: FleetService;
  engineFactory?: EngineFactory;
  xpathResolver?: XPathResolver;
  llm?: LlmService;
  config?: Config;
}

export interface WorkflowRunJobPayload {
  runId: string;
  taskId: string;
  profileId: string;
  options?: {
    concurrency?: number;
    staggerMinMs?: number;
    staggerMaxMs?: number;
    failurePolicy?: 'skip' | 'retry' | 'screenshot_abort' | 'pause_alert';
    maxAttempts?: number;
    headless?: boolean;
  };
  resumeStepIndex?: number;
}

export class RunService {
  private readonly cancelledRunIds = new Set<string>();

  constructor(private readonly deps: RunServiceDeps) {
    // Register workflow.run background worker handler
    this.deps.queue.process(this.handleQueueJob.bind(this));
    // Recover any runs left in 'running' or 'starting' from an app crash
    void this.recoverStaleRuns().catch(() => {});
  }

  setProfiles(profiles: ProfileService): void {
    this.deps.profiles = profiles;
  }

  setFleet(fleet: FleetService): void {
    this.deps.fleet = fleet;
  }

  /**
   * Lists runs filtered by task, profile, or state, formatted as RunSummary contracts.
   */
  async list(filter?: {
    taskId?: string;
    profileId?: string;
    state?: string;
  }): Promise<RunSummary[]> {
    const rows = await this.deps.repos.runs.list(filter);
    return rows.map((r) => this.toRunSummary(r));
  }

  /**
   * Retrieves a single run with all associated step runs and parsed checkpoint data.
   */
  async getById(
    id: string,
  ): Promise<(RunSummary & { steps: StepRun[]; checkpoint: Record<string, unknown> | null }) | null> {
    const row = await this.deps.repos.runs.getById(id);
    if (!row) {
      return null;
    }
    const stepRows = await this.deps.repos.stepRuns.listForRun(id);
    const steps = stepRows.map((sr) => this.toStepRun(sr));

    let checkpoint: Record<string, unknown> | null = null;
    if (row.checkpoint) {
      try {
        checkpoint = JSON.parse(row.checkpoint) as Record<string, unknown>;
      } catch {
        checkpoint = null;
      }
    }

    return {
      ...this.toRunSummary(row),
      steps,
      checkpoint,
    };
  }

  /**
   * Returns all step run records for a specific run.
   */
  async getStepRuns(runId: string): Promise<StepRun[]> {
    const stepRows = await this.deps.repos.stepRuns.listForRun(runId);
    return stepRows.map((sr) => this.toStepRun(sr));
  }

  /**
   * Cancels an active or queued run. Halts active step execution, updates state to 'cancelled',
   * stops the browser profile session, and emits run.state_changed.
   */
  async cancel(id: string): Promise<void> {
    const row = await this.deps.repos.runs.getById(id);
    if (!row) {
      throw new TaskError('INTERNAL', `Run '${id}' not found`);
    }

    if (row.state === 'succeeded' || row.state === 'failed' || row.state === 'cancelled') {
      return; // Already terminal
    }

    this.cancelledRunIds.add(id);
    const now = Date.now();
    await this.deps.repos.runs.updateState(id, 'cancelled', {
      finished_at: now,
      error_class: 'TASK_CANCELLED',
      error_message: 'Run was cancelled by user',
    });

    if (this.deps.profiles) {
      await this.deps.profiles.stop(row.profile_id).catch(() => {});
    }

    await this.deps.events.emit('run.state_changed', {
      runId: id,
      state: 'cancelled',
    });
  }

  /**
   * Deletes a run and its step execution records from persistence.
   */
  async delete(id: string): Promise<void> {
    await this.deps.repos.runs.delete(id);
  }

  /**
   * Deletes all terminal runs (succeeded, failed, cancelled) to clear run history.
   */
  async clearTerminal(): Promise<number> {
    return this.deps.repos.runs.clearTerminal();
  }

  /**
   * Resumes a paused or failed run from its last checkpointed step.
   */
  async resume(id: string): Promise<void> {
    const row = await this.deps.repos.runs.getById(id);
    if (!row) {
      throw new TaskError('INTERNAL', `Run '${id}' not found`);
    }

    if (row.state === 'running' || row.state === 'starting') {
      return; // Already active
    }

    let resumeStepIndex = 0;
    if (row.checkpoint) {
      try {
        const cp = JSON.parse(row.checkpoint) as { lastStepIndex?: number };
        if (typeof cp.lastStepIndex === 'number') {
          resumeStepIndex = cp.lastStepIndex + 1;
        }
      } catch {
        resumeStepIndex = 0;
      }
    }

    this.cancelledRunIds.delete(id);
    await this.deps.repos.runs.updateState(id, 'queued', {
      error_class: null,
      error_message: null,
      finished_at: null,
    });

    await this.deps.events.emit('run.state_changed', {
      runId: id,
      state: 'queued',
    });

    await this.deps.queue.enqueue('workflow.run', {
      runId: id,
      taskId: row.task_id,
      profileId: row.profile_id,
      resumeStepIndex,
    });
  }

  /**
   * Recovers runs left in 'running' or 'starting' state after an unexpected shutdown/crash.
   * Transitions them to 'paused' and records an audit reason so users can resume them.
   */
  async recoverStaleRuns(): Promise<number> {
    const stale = await this.deps.repos.runs.listStaleRuns();
    for (const r of stale) {
      await this.deps.repos.runs.updateState(r.id, 'paused', {
        error_class: 'APP_CRASH_RECOVERED',
        error_message: 'Run paused after unexpected system or application restart',
      });
      await this.deps.events.emit('run.state_changed', {
        runId: r.id,
        state: 'paused',
      });
    }
    return stale.length;
  }

  /**
   * Central job queue dispatcher: delegates workflow.run jobs.
   */
  private async handleQueueJob(job: Job<Record<string, unknown>>): Promise<void> {
    if (job.type === 'workflow.run') {
      await this.executeWorkflowRun(job.payload as unknown as WorkflowRunJobPayload);
    }
  }

  /**
   * Core workflow runner executing steps sequentially with retry policies,
   * checkpointing, and live telemetry emissions.
   */
  private async executeWorkflowRun(payload: WorkflowRunJobPayload): Promise<void> {
    const { runId, taskId, profileId, options } = payload;
    if (!runId || !taskId || !profileId) {
      return;
    }

    // 1. Initial cancellation check
    if (this.cancelledRunIds.has(runId)) {
      this.cancelledRunIds.delete(runId);
      return;
    }

    const runRow = await this.deps.repos.runs.getById(runId);
    if (!runRow || runRow.state === 'cancelled') {
      return;
    }

    // 2. Adjust queue concurrency if provided in options
    if (options?.concurrency && this.deps.fleet) {
      this.deps.fleet.setConcurrency(options.concurrency);
    }

    // 3. Coordinate launch stagger delay
    if (this.deps.fleet) {
      await this.deps.fleet.acquireLaunchStagger(
        options?.staggerMinMs ?? 0,
        options?.staggerMaxMs ?? 0,
      );
    }

    // Re-check cancellation after stagger
    if (this.cancelledRunIds.has(runId)) {
      this.cancelledRunIds.delete(runId);
      return;
    }

    // 4. Mark starting
    const now = Date.now();
    await this.deps.repos.runs.updateState(runId, 'starting', { started_at: now });
    await this.deps.events.emit('run.state_changed', {
      runId,
      state: 'starting',
    });

    // 5. Load and validate task
    const task = await this.deps.repos.tasks.getById(taskId);
    if (!task) {
      await this.deps.repos.runs.updateState(runId, 'failed', {
        finished_at: Date.now(),
        error_class: 'TASK_NOT_FOUND',
        error_message: `Task '${taskId}' not found in database`,
      });
      await this.deps.events.emit('run.state_changed', {
        runId,
        state: 'failed',
      });
      return;
    }

    let workflow: Workflow;
    try {
      workflow = JSON.parse(task.definition) as Workflow;
    } catch (err: unknown) {
      await this.deps.repos.runs.updateState(runId, 'failed', {
        finished_at: Date.now(),
        error_class: 'INVALID_WORKFLOW',
        error_message: `Failed to parse task definition: ${String(err)}`,
      });
      await this.deps.events.emit('run.state_changed', {
        runId,
        state: 'failed',
      });
      return;
    }

    // 6. Resume index & variables resolution
    const variables: Record<string, any> = {};
    if (workflow.variables) {
      for (const [k, v] of Object.entries(workflow.variables)) {
        if (Array.isArray(v)) {
          // Anti-Sybil Keyword/Variable Pool Resolution:
          // Pick one single random item for this profile run to ensure varied behavior across fleet
          if (v.length > 0) {
            const picked = String(v[Math.floor(Math.random() * v.length)] ?? '');
            variables[k] = picked;
            variables[`${k}.pool`] = v;
            v.forEach((item, idx) => {
              variables[`${k}.${idx}`] = String(item ?? '');
            });
          } else {
            variables[k] = '';
          }
        } else {
          variables[k] = v !== null && v !== undefined ? String(v) : '';
        }
      }
    }
    let startIndex = payload.resumeStepIndex ?? 0;
    if (runRow.checkpoint && payload.resumeStepIndex === undefined) {
      try {
        const cp = JSON.parse(runRow.checkpoint) as {
          lastStepIndex?: number;
          variables?: Record<string, string>;
        };
        if (typeof cp.lastStepIndex === 'number') {
          startIndex = cp.lastStepIndex + 1;
        }
        if (cp.variables) {
          Object.assign(variables, cp.variables);
        }
      } catch {
        startIndex = 0;
      }
    }

    // 6b. Enrich variables with profile's niche and persona
    let profilePersonaKey = 'casual';
    let profileRow: ProfileRow | undefined = undefined;
    let parsedWeightedNiches: Array<{ nicheId: string; weight: number; isPrimary?: boolean }> = [];

    if (this.deps.repos?.profiles) {
      profileRow = await this.deps.repos.profiles.getById(profileId);
      if (profileRow) {
        if (profileRow.persona) {
          profilePersonaKey = profileRow.persona;
        }

        // Expose persona & profile variables for workflow step interpolation
        variables['persona.name'] = profilePersonaKey;
        variables['persona_name'] = profilePersonaKey;
        if (profileRow.typing_wpm !== undefined && profileRow.typing_wpm !== null) {
          variables['persona.typingWpm'] = String(profileRow.typing_wpm);
          variables['persona_typingWpm'] = String(profileRow.typing_wpm);
        }
        if (profileRow.typo_rate !== undefined && profileRow.typo_rate !== null) {
          variables['persona.typoRate'] = String(profileRow.typo_rate);
          variables['persona_typoRate'] = String(profileRow.typo_rate);
        }
        if (profileRow.patience_index !== undefined && profileRow.patience_index !== null) {
          variables['persona.patienceIndex'] = String(profileRow.patience_index);
          variables['persona_patienceIndex'] = String(profileRow.patience_index);
        }
        if (profileRow.trust_score !== undefined && profileRow.trust_score !== null) {
          variables['persona.trustScore'] = String(profileRow.trust_score);
          variables['persona_trustScore'] = String(profileRow.trust_score);
        }
        if (profileRow.maturation_stage) {
          variables['persona.maturationStage'] = String(profileRow.maturation_stage);
          variables['persona_maturationStage'] = String(profileRow.maturation_stage);
        }
        variables['profile.id'] = profileId;
        variables['profile_id'] = profileId;
        if (profileRow.name) {
          variables['profile.name'] = profileRow.name;
          variables['profile_name'] = profileRow.name;
        }

        // Determine target niche: check weighted_niches first for proportional random distribution
        let targetNicheId = profileRow.niche_id;

        if (profileRow.weighted_niches) {
          try {
            parsedWeightedNiches = typeof profileRow.weighted_niches === 'string'
              ? JSON.parse(profileRow.weighted_niches)
              : profileRow.weighted_niches;

            if (Array.isArray(parsedWeightedNiches) && parsedWeightedNiches.length > 0) {
              const totalWeight = parsedWeightedNiches.reduce((acc, n) => acc + (Number(n.weight) || 0), 0);
              if (totalWeight > 0) {
                let r = Math.random() * totalWeight;
                for (const wn of parsedWeightedNiches) {
                  r -= (Number(wn.weight) || 0);
                  if (r <= 0) {
                    targetNicheId = wn.nicheId;
                    break;
                  }
                }
              } else {
                targetNicheId = parsedWeightedNiches[0]?.nicheId ?? targetNicheId;
              }
            }
          } catch {
            // fallback to profileRow.niche_id
          }
        }

        if (targetNicheId && this.deps.repos.niches) {
          const nicheRow = await this.deps.repos.niches.getById(targetNicheId);
          if (nicheRow) {
            const keywords = JSON.parse(nicheRow.keywords || '[]') as string[];
            const seedUrls = JSON.parse(nicheRow.seed_urls || '[]') as string[];
            variables['niche.id'] = nicheRow.id;
            variables['niche_id'] = nicheRow.id;
            variables['niche.name'] = nicheRow.name;
            variables['niche_name'] = nicheRow.name;
            if (keywords.length > 0) {
              const pick = keywords[Math.floor(Math.random() * keywords.length)]!;
              variables['niche.randomKeyword'] = pick;
              variables['niche_randomKeyword'] = pick;
              variables['niche.keyword'] = pick;
              variables['niche_keyword'] = pick;
              variables['niche.keywords'] = keywords.join(', ');
              variables['niche_keywords'] = keywords.join(', ');
            }
            if (seedUrls.length > 0) {
              const pickUrl = seedUrls[Math.floor(Math.random() * seedUrls.length)]!;
              variables['niche.seedUrl'] = pickUrl;
              variables['niche_seedUrl'] = pickUrl;
            }
          }
        }
      }
    }

    // 7. Launch browser profile session
    let launched = false;
    try {
      if (this.deps.profiles) {
        await this.deps.profiles.launch(profileId, {
          headless: options?.headless,
        });
        launched = true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof TersooError ? err.code : 'SPAWN_FAILED';
      await this.deps.repos.runs.updateState(runId, 'failed', {
        finished_at: Date.now(),
        error_class: code,
        error_message: msg,
      });
      await this.deps.events.emit('run.state_changed', {
        runId,
        state: 'failed',
      });
      return;
    }

    // 8. Mark running
    await this.deps.repos.runs.updateState(runId, 'running');
    await this.deps.events.emit('run.state_changed', {
      runId,
      state: 'running',
    });

    // 9. Resolve active browser page with polling retry
    let page: Page | undefined;
    let sessionHumanizer: Humanizer | undefined;

    const maxWaitMs = 5000;
    const intervalMs = 250;
    const startWait = Date.now();

    while (!page && Date.now() - startWait < maxWaitMs) {
      if (this.deps.crosshair && this.deps.crosshair.hasSession(profileId)) {
        try {
          page = this.deps.crosshair.getPage(profileId);
        } catch {
          page = undefined;
        }
      }

      if (!page && this.deps.engineFactory) {
        try {
          const engineSession = this.deps.engineFactory.getSession(profileId);
          if (engineSession?.page && !engineSession.page.isClosed()) {
            page = engineSession.page;
            sessionHumanizer = engineSession.humanizer ?? undefined;
          }
        } catch {
          page = undefined;
        }
      }

      if (!page) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    if (!page) {
      await this.deps.repos.runs.updateState(runId, 'failed', {
        finished_at: Date.now(),
        error_class: 'PAGE_NOT_FOUND',
        error_message: `Could not retrieve active browser page for profile '${profileId}'`,
      });
      await this.deps.events.emit('run.state_changed', {
        runId,
        state: 'failed',
      });
      if (launched && this.deps.profiles) {
        await this.deps.profiles.stop(profileId).catch(() => {});
      }
      return;
    }

    // 10. Instantiate StepRunner
    const xpathResolver =
      this.deps.xpathResolver ??
      new XPathResolver(new AnchorRegistry(this.deps.repos.anchors));
    const stepRunner = new StepRunner(xpathResolver);

    /**
     * Re-acquires a live page for this run.
     *
     * The `page` handle above is a snapshot. A browser can close, crash, or swap
     * its tab at any time, and the LLM step spends tens of seconds waiting on the
     * model between actions. Asking the engine again returns the freshest open
     * page (ApostateEngine.getSession already prunes closed ones), so a stale
     * handle cannot fail the run.
     */
    const resolvePage = (): Page | null | undefined => {
      try {
        if (this.deps.crosshair?.hasSession(profileId)) {
          const candidate = this.deps.crosshair.getPage(profileId);
          if (candidate && !candidate.isClosed()) return candidate;
        }
      } catch {
        // Fall through to the engine.
      }

      try {
        const engineSession = this.deps.engineFactory?.getSession(profileId);
        const candidate = engineSession?.page;
        if (candidate && !candidate.isClosed()) {
          return candidate;
        }
      } catch {
        // No live page available.
      }

      return undefined;
    };

    const failurePolicy = options?.failurePolicy ?? 'retry';
    const maxAttempts = options?.maxAttempts ?? 3;

    let profilePlatform: 'windows' | 'macos' | 'android' | 'linux' = 'windows';
    if (profileRow?.fingerprint_bundle) {
      try {
        const bundle = JSON.parse(profileRow.fingerprint_bundle);
        if (bundle.platform) profilePlatform = bundle.platform;
      } catch {}
    } else if (profileRow?.preset_id && profileRow.preset_id.includes('android')) {
      profilePlatform = 'android';
    }
    const isMobile = profilePlatform === 'android';

    const ctx: StepExecutionContext = {
      profileId,
      taskId,
      runId,
      stepIndex: startIndex,
      page,
      resolvePage,
      cdp: this.deps.crosshair?.hasSession(profileId)
        ? this.deps.crosshair.getCdpSession(profileId)
        : undefined,
      humanizer: sessionHumanizer ?? undefined,
      variables,
      llm: this.deps.llm,
      persona: profilePersonaKey,
      platform: profilePlatform,
      isMobile,
      typingWpm: profileRow?.typing_wpm ?? undefined,
      typoRate: profileRow?.typo_rate ?? undefined,
      patienceIndex: profileRow?.patience_index ?? undefined,
      engagementRate: profileRow?.engagement_rate ?? undefined,
      trustScore: profileRow?.trust_score ?? undefined,
      maturationStage: profileRow?.maturation_stage ?? undefined,
      weightedNiches: parsedWeightedNiches.length > 0 ? parsedWeightedNiches : undefined,
    };

    let runHalted = false;

    // 11. Execute steps sequentially
    for (let i = startIndex; i < workflow.steps.length; i++) {
      // Check cancellation before each step
      if (this.cancelledRunIds.has(runId)) {
        this.cancelledRunIds.delete(runId);
        runHalted = true;
        break;
      }

      const step = workflow.steps[i];
      if (!step) {
        continue;
      }

      const stepRunId = crypto.randomUUID();
      const stepStartTime = Date.now();

      await this.deps.repos.stepRuns.create({
        id: stepRunId,
        run_id: runId,
        step_index: i,
        step_type: step.type,
        state: 'running',
        attempts: 1,
        last_error: null,
        artifacts: '{}',
        started_at: stepStartTime,
        finished_at: null,
      });

      await this.deps.events.emit('step.state_changed', {
        id: stepRunId,
        runId,
        stepIndex: i,
        stepType: step.type,
        state: 'running',
        attempts: 1,
        lastError: null,
        artifacts: {},
        startedAt: stepStartTime,
        finishedAt: null,
      });

      ctx.stepIndex = i;
      let stepSucceeded = false;
      let attemptsUsed = 0;
      let stepError: unknown = null;

      const attemptsAllowed = failurePolicy === 'retry' ? maxAttempts : 1;
      for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
        attemptsUsed = attempt;
        try {
          const result = await stepRunner.run(step, ctx);
          stepSucceeded = true;
          const stepEndTime = Date.now();

          await this.deps.repos.stepRuns.updateState(stepRunId, 'succeeded', {
            attempts: attemptsUsed,
            finished_at: stepEndTime,
            artifacts: JSON.stringify(result.artifacts ?? {}),
          });

          // Checkpoint progress
          const checkpointData = {
            lastStepIndex: i,
            variables: ctx.variables,
          };
          await this.deps.repos.runs.updateState(runId, 'running', {
            checkpoint: JSON.stringify(checkpointData),
          });

          await this.deps.events.emit('step.state_changed', {
            id: stepRunId,
            runId,
            stepIndex: i,
            stepType: step.type,
            state: 'succeeded',
            attempts: attemptsUsed,
            lastError: null,
            artifacts: result.artifacts ?? {},
            startedAt: stepStartTime,
            finishedAt: stepEndTime,
          });
          break;
        } catch (err: unknown) {
          stepError = err;
          if (attempt < attemptsAllowed) {
            // Exponential backoff
            await new Promise((r) => setTimeout(r, Math.min(500 * attempt, 3000)));
          }
        }
      }

      if (!stepSucceeded) {
        const errMsg = stepError instanceof Error ? stepError.message : String(stepError);
        const errCode =
          stepError instanceof TersooError ? stepError.code : 'STEP_FAILED';

        if (errCode === 'CAPTCHA_FAILED' || errCode === 'CAPTCHA_BUDGET_EXCEEDED') {
          // A challenge the vision model could not clear is a human problem, not
          // a retry problem: retrying burns the profile's budget and leaves a
          // live challenge on screen. Pause, tell the user, and keep the browser
          // open so the profile can be dealt with.
          const finishedAt = Date.now();
          await this.deps.repos.stepRuns.updateState(stepRunId, 'failed', {
            attempts: attemptsUsed,
            last_error: errMsg,
            finished_at: finishedAt,
          });
          await this.deps.repos.runs.updateState(runId, 'paused', {
            error_class: errCode,
            error_message: errMsg,
          });
          await this.deps.events.emit('alert.raised', {
            level: 'error',
            title: 'CAPTCHA needs manual attention',
            message:
              `${errMsg}\n\nRun #${runId.slice(0, 8)} is paused and the browser is still open. ` +
              `Solve the challenge in the browser window, then check this profile's trust before resuming.`,
          });
          await this.deps.events.emit('step.state_changed', {
            id: stepRunId,
            runId,
            stepIndex: i,
            stepType: step.type,
            state: 'failed',
            attempts: attemptsUsed,
            lastError: errMsg,
            artifacts: {},
            startedAt: stepStartTime,
            finishedAt,
          });
          await this.deps.events.emit('run.state_changed', {
            runId,
            state: 'paused',
          });
          runHalted = true;
          break;
        }

        if (failurePolicy === 'skip') {
          const finishedAt = Date.now();
          await this.deps.repos.stepRuns.updateState(stepRunId, 'skipped', {
            attempts: attemptsUsed,
            last_error: errMsg,
            finished_at: finishedAt,
          });
          await this.deps.events.emit('step.state_changed', {
            id: stepRunId,
            runId,
            stepIndex: i,
            stepType: step.type,
            state: 'skipped',
            attempts: attemptsUsed,
            lastError: errMsg,
            artifacts: {},
            startedAt: stepStartTime,
            finishedAt,
          });
          continue; // Move to next step
        } else if (failurePolicy === 'pause_alert') {
          const finishedAt = Date.now();
          await this.deps.repos.stepRuns.updateState(stepRunId, 'failed', {
            attempts: attemptsUsed,
            last_error: errMsg,
            finished_at: finishedAt,
          });
          await this.deps.repos.runs.updateState(runId, 'paused', {
            error_class: errCode,
            error_message: errMsg,
          });
          await this.deps.events.emit('alert.raised', {
            level: 'warn',
            title: 'Run paused on step failure',
            message: errMsg,
          });
          await this.deps.events.emit('step.state_changed', {
            id: stepRunId,
            runId,
            stepIndex: i,
            stepType: step.type,
            state: 'failed',
            attempts: attemptsUsed,
            lastError: errMsg,
            artifacts: {},
            startedAt: stepStartTime,
            finishedAt,
          });
          await this.deps.events.emit('run.state_changed', {
            runId,
            state: 'paused',
          });
          runHalted = true;
          break;
        } else {
          // 'screenshot_abort' or retry attempts exhausted
          try {
            await page.screenshot({ type: 'png' }).catch(() => null);
          } catch {}

          const finishedAt = Date.now();
          await this.deps.repos.stepRuns.updateState(stepRunId, 'failed', {
            attempts: attemptsUsed,
            last_error: errMsg,
            finished_at: finishedAt,
          });
          await this.deps.repos.runs.updateState(runId, 'failed', {
            finished_at: finishedAt,
            error_class: errCode,
            error_message: errMsg,
          });
          await this.deps.events.emit('step.state_changed', {
            id: stepRunId,
            runId,
            stepIndex: i,
            stepType: step.type,
            state: 'failed',
            attempts: attemptsUsed,
            lastError: errMsg,
            artifacts: {},
            startedAt: stepStartTime,
            finishedAt,
          });
          await this.deps.events.emit('run.state_changed', {
            runId,
            state: 'failed',
          });
          runHalted = true;
          break;
        }
      }
    }

    // 12. Succeeded state transition
    if (!runHalted) {
      await this.deps.repos.runs.updateState(runId, 'succeeded', {
        finished_at: Date.now(),
      });
      await this.deps.events.emit('run.state_changed', {
        runId,
        state: 'succeeded',
      });
    }

    // 13. Tear down browser profile session
    if (launched && this.deps.profiles) {
      await this.deps.profiles.stop(profileId).catch(() => {});
    }
  }

  private toRunSummary(row: RunRow): RunSummary {
    return {
      id: row.id,
      taskId: row.task_id,
      profileId: row.profile_id,
      state: row.state as RunState,
      attempt: row.attempt,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      errorClass: row.error_class,
      errorMessage: row.error_message,
    };
  }

  private toStepRun(row: StepRunRow): StepRun {
    let artifacts: Record<string, unknown> = {};
    if (row.artifacts) {
      try {
        artifacts = JSON.parse(row.artifacts) as Record<string, unknown>;
      } catch {
        artifacts = {};
      }
    }

    return {
      id: row.id,
      runId: row.run_id,
      stepIndex: row.step_index,
      stepType: row.step_type,
      state: row.state as StepState,
      attempts: row.attempts,
      lastError: row.last_error,
      artifacts,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    };
  }
}
