import { z } from 'zod';

import { Id, RunState, StepState, Tags, Timestamp } from './primitives';

const NAVIGATE_STEP = z.object({
  type: z.literal('navigate'),
  url: z.string().min(1),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('domcontentloaded'),
  expectedUrl: z.string().optional(),
  allowedHosts: z.array(z.string()).optional(),
  requiredSelectors: z.array(z.string()).optional(),
  requiredText: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(100).max(120000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  aiRecovery: z.boolean().optional(),
  goal: z.string().optional(),
});
const WAIT_FOR_STEP = z.object({
  type: z.literal('waitFor'),
  selector: z.string(),
  timeoutMs: z.number().int().min(100).max(120000).default(15000),
});
const WAIT_FOR_URL_STEP = z.object({
  type: z.literal('waitForUrl'),
  url: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(120000).default(15000),
});
const CLICK_STEP = z.object({
  type: z.literal('click'),
  selector: z.string(),
  humanized: z.boolean().default(true),
});
const HOVER_STEP = z.object({
  type: z.literal('hover'),
  selector: z.string(),
  humanized: z.boolean().default(true),
  timeoutMs: z.number().int().min(100).max(120000).default(15000).optional(),
});
const MOUSE_MOVE_STEP = z.object({
  type: z.literal('mouseMove'),
  selector: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  humanized: z.boolean().default(true),
  timeoutMs: z.number().int().min(100).max(120000).default(15000).optional(),
});
const TYPE_STEP = z.object({
  type: z.literal('type'),
  selector: z.string(),
  text: z.string(),
  humanized: z.boolean().default(true),
  pressEnter: z.boolean().optional(),
  clearFirst: z.boolean().optional(),
});
const GO_BACK_STEP = z.object({
  type: z.literal('goBack'),
  timeoutMs: z.number().int().min(100).max(120000).default(30000).optional(),
});
const SCROLL_STEP = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down']),
  amount: z.number().int().min(1),
  kinetic: z.boolean().default(true),
});
const EXTRACT_STEP = z.object({
  type: z.literal('extract'),
  selector: z.string(),
  as: z.string(),
  attribute: z.string().optional(),
});
const SCREENSHOT_STEP = z.object({
  type: z.literal('screenshot'),
  name: z.string(),
});
const SLEEP_STEP = z.object({
  type: z.literal('sleep'),
  minMs: z.number().int().min(0),
  maxMs: z.number().int().min(0),
});
const LLM_STEP = z.object({
  type: z.literal('llm'),
  goal: z.string().min(1),
  maxIterations: z.number().int().min(1).max(50).default(10),
  /**
   * When true, a failure inside this step does not fail the run. Used for
   * judgement calls that are nice-to-have rather than required.
   */
  optional: z.boolean().default(false).optional(),
});
const ENGAGE_STEP = z.object({
  type: z.literal('engage'),
  action: z.enum([
    'like',
    'dislike',
    'subscribe',
    'unsubscribe',
    'comment',
    'skip_ad',
    'share',
    'save',
    'bell',
    'read_description',
  ]),
  commentText: z.string().optional(),
  optional: z.boolean().default(true).optional(),
  timeoutMs: z.number().int().min(100).max(60000).default(10000).optional(),
  probability: z.number().min(0).max(1).optional(),
});

/**
 * Every step type that may appear at the top level of a workflow, and also
 * inside a `repeat` body. Defined once so the two unions cannot drift.
 */
const BASE_STEP_MEMBERS = [
  NAVIGATE_STEP,
  WAIT_FOR_STEP,
  WAIT_FOR_URL_STEP,
  CLICK_STEP,
  HOVER_STEP,
  MOUSE_MOVE_STEP,
  TYPE_STEP,
  GO_BACK_STEP,
  SCROLL_STEP,
  EXTRACT_STEP,
  SCREENSHOT_STEP,
  SLEEP_STEP,
  LLM_STEP,
  ENGAGE_STEP,
] as const;

/**
 * Steps allowed inside a `repeat` body.
 *
 * Deliberately excludes `repeat` itself: a `z.discriminatedUnion` cannot hold a
 * lazily-recursive member, and one level of repetition covers the workflows
 * this app generates. Nesting is rejected by the validator with a clear message
 * rather than failing with an opaque schema error.
 */
export const RepeatableStep = z.discriminatedUnion('type', [...BASE_STEP_MEMBERS]);
export type RepeatableStep = z.infer<typeof RepeatableStep>;

const REPEAT_STEP = z.object({
  type: z.literal('repeat'),
  /**
   * How many times to run the body. Accepts a number or a `{{variable}}`
   * reference so the round count can come from workflow variables instead of
   * being baked into the definition.
   */
  times: z.union([z.number().int().min(1).max(50), z.string().min(1)]),
  /** Human-readable label used in run logs. */
  label: z.string().optional(),
  steps: z.array(RepeatableStep).min(1),
  /**
   * When true, an iteration that throws is logged and the loop continues, so a
   * single flaky page cannot abort a long browsing run.
   */
  continueOnError: z.boolean().default(false).optional(),
});
export type RepeatStep = z.infer<typeof REPEAT_STEP>;

export const Step = z.discriminatedUnion('type', [...BASE_STEP_MEMBERS, REPEAT_STEP]);
export type Step = z.infer<typeof Step>;

export const Workflow = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  variables: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
  steps: z.array(Step).min(1),
});

export const FailurePolicy = z.enum(['skip', 'retry', 'screenshot_abort', 'pause_alert']);

export const TaskSummary = z.object({
  id: Id,
  name: z.string(),
  tags: Tags,
  schemaVersion: z.number().int(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

export const TaskDetail = TaskSummary.extend({
  definition: Workflow,
});

export const TaskCreateInput = z.object({
  name: z.string(),
  tags: Tags.default([]),
  definition: Workflow,
});

export const TaskUpdateInput = z.object({
  id: Id,
  name: z.string().optional(),
  tags: Tags.optional(),
  definition: Workflow.optional(),
});

export const DispatchInput = z.object({
  taskId: Id,
  targets: z.object({
    profileIds: z.array(Id).optional(),
    tags: z.array(z.string()).optional(),
    all: z.boolean().optional(),
  }),
  options: z
    .object({
      concurrency: z.number().int().min(1).max(64).default(5),
      staggerMinMs: z.number().int().min(0).default(10000),
      staggerMaxMs: z.number().int().min(0).default(30000),
      failurePolicy: FailurePolicy.default('retry'),
      maxAttempts: z.number().int().min(1).max(10).default(3),
      randomizeVariables: z.boolean().default(true).optional(),
      shuffleActions: z.boolean().default(false).optional(),
      actionProbabilities: z.record(z.number().min(0).max(1)).optional(),
    })
    .default({}),
});

export const RunSummary = z.object({
  id: Id,
  taskId: Id,
  profileId: Id,
  state: RunState,
  attempt: z.number().int(),
  startedAt: Timestamp.nullable(),
  finishedAt: Timestamp.nullable(),
  errorClass: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const StepRun = z.object({
  id: Id,
  runId: Id,
  stepIndex: z.number().int(),
  stepType: z.string(),
  state: StepState,
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  artifacts: z.record(z.unknown()),
  startedAt: Timestamp.nullable(),
  finishedAt: Timestamp.nullable(),
});

export type Workflow = z.infer<typeof Workflow>;
export type FailurePolicy = z.infer<typeof FailurePolicy>;
export type TaskSummary = z.infer<typeof TaskSummary>;
export type TaskDetail = z.infer<typeof TaskDetail>;
export type TaskCreateInput = z.infer<typeof TaskCreateInput>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;
export type DispatchInput = z.infer<typeof DispatchInput>;
export type RunSummary = z.infer<typeof RunSummary>;
export type StepRun = z.infer<typeof StepRun>;
