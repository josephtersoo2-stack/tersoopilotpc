import { type Step, Workflow } from '@tersoo/contracts';

import { TaskError } from '../util/errors';

export interface WorkflowValidationResult {
  ok: boolean;
  workflow?: Workflow;
  errors: string[];
  warnings: string[];
}

export class WorkflowValidator {
  private static readonly VARIABLE_REGEX = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;
  private static readonly IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  private static readonly BUILTIN_VARIABLES = new Set<string>([
    'niche.name', 'niche.keyword', 'niche.randomKeyword', 'niche.keywords', 'niche.seedUrl', 'niche.id',
    'niche_name', 'niche_keyword', 'niche_randomKeyword', 'niche_keywords', 'niche_seedUrl', 'niche_id',
    'persona.name', 'persona.typingWpm', 'persona.typoRate', 'persona.patienceIndex', 'persona.trustScore', 'persona.maturationStage',
    'persona_name', 'persona_typingWpm', 'persona_typoRate', 'persona_patienceIndex', 'persona_trustScore', 'persona_maturationStage',
    'profile.id', 'profile.name',
    'profile_id', 'profile_name',
  ]);

  /**
   * Automatically normalizes and heals common LLM-generated and user workflow step patterns:
   * - Normalizes aliases: 'wait_for_url' / 'waitForURL' -> 'waitForUrl', 'wait_for' -> 'waitFor', 'mouse_move' -> 'mouseMove'
   * - Normalizes 'wait' -> 'waitFor' (if selector present), 'waitForUrl' (if url present), or 'sleep' (with duration)
   * - Normalizes common field mismatches (e.g. pattern/target -> url for waitForUrl, target/xpath -> selector, value -> text)
   * - Ensures required defaults (schemaVersion: 1, variables: {})
   */
  static normalize(input: unknown): unknown {
    if (!input || typeof input !== 'object') return input;

    const data = { ...(input as Record<string, unknown>) };
    if (!data.schemaVersion) data.schemaVersion = 1;
    if (!data.variables || typeof data.variables !== 'object') {
      data.variables = {};
    } else {
      // Coerce variable values to string or string arrays so numbers, booleans, and pools validate cleanly
      const normVars: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(data.variables as Record<string, unknown>)) {
        if (Array.isArray(v)) {
          normVars[k] = v.map((item) => String(item ?? ''));
        } else {
          normVars[k] = v !== null && v !== undefined ? String(v) : '';
        }
      }
      data.variables = normVars;
    }

    if (Array.isArray(data.steps)) {
      data.steps = data.steps.map((rawStep) => {
        if (!rawStep || typeof rawStep !== 'object') return rawStep;
        const step = { ...(rawStep as Record<string, unknown>) };
        const rawType = String(step.type || '').trim();

        // 1. Alias normalizations
        if (rawType === 'waitForURL' || rawType === 'wait_for_url' || rawType === 'wait_url' || rawType === 'url_wait') {
          step.type = 'waitForUrl';
        } else if (rawType === 'wait_for') {
          step.type = 'waitFor';
        } else if (rawType === 'mouse_move') {
          step.type = 'mouseMove';
        } else if (rawType === 'goto' || rawType === 'open' || rawType === 'nav') {
          step.type = 'navigate';
        } else if (rawType === 'wait') {
          if (step.url || step.pattern) {
            step.type = 'waitForUrl';
          } else if (step.selector || step.target || step.xpath) {
            step.type = 'waitFor';
          } else {
            step.type = 'sleep';
            const dur = Number(step.ms ?? step.duration ?? step.durationMs ?? step.time ?? 2000);
            step.minMs = isNaN(dur) ? 2000 : Math.max(0, Math.round(dur));
            step.maxMs = step.minMs;
          }
        } else if (rawType === 'delay') {
          step.type = 'sleep';
          const dur = Number(step.ms ?? step.duration ?? step.durationMs ?? 2000);
          step.minMs = isNaN(dur) ? 2000 : Math.max(0, Math.round(dur));
          step.maxMs = step.minMs;
        }

        // 2. Field mappings & numeric coercions
        if (step.type === 'navigate') {
          step.url = step.url ?? step.target ?? step.link ?? step.href ?? '';
        } else if (step.type === 'waitForUrl') {
          step.url = step.url ?? step.pattern ?? step.target ?? step.value ?? '';
          if (step.timeoutMs !== undefined || step.timeout !== undefined) {
            const t = Number(step.timeoutMs ?? step.timeout);
            step.timeoutMs = isNaN(t) || t <= 0 ? 15000 : Math.round(t);
          }
        } else if (step.type === 'waitFor') {
          step.selector = step.selector ?? step.target ?? step.xpath ?? '';
          if (step.timeoutMs !== undefined || step.timeout !== undefined) {
            const t = Number(step.timeoutMs ?? step.timeout);
            step.timeoutMs = isNaN(t) || t <= 0 ? 15000 : Math.round(t);
          }
        } else if (step.type === 'click' || step.type === 'hover') {
          step.selector = step.selector ?? step.target ?? step.xpath ?? '';
          if (step.humanized === undefined) step.humanized = true;
        } else if (step.type === 'mouseMove') {
          if (step.humanized === undefined) step.humanized = true;
          if (!step.selector && step.target) step.selector = step.target;
        } else if (step.type === 'type') {
          step.selector = step.selector ?? step.target ?? step.xpath ?? '';
          step.text = step.text !== undefined ? String(step.text) : (step.value !== undefined ? String(step.value) : '');
          if (step.humanized === undefined) step.humanized = true;
          if (step.clearFirst === undefined && (step as any).clear) step.clearFirst = true;
        } else if (step.type === 'scroll') {
          if (step.amount !== undefined) step.amount = Number(step.amount);
          if (step.amount === undefined || isNaN(step.amount as number) || (step.amount as number) <= 0) {
            const px = Number(step.pixels ?? step.distance ?? 400);
            step.amount = isNaN(px) || px <= 0 ? 400 : Math.round(px);
          } else {
            step.amount = Math.round(step.amount as number);
          }
          if (step.direction !== 'up' && step.direction !== 'down') {
            step.direction = String(step.direction).toLowerCase().includes('up') ? 'up' : 'down';
          }
          if (step.kinetic === undefined) step.kinetic = true;
        } else if (step.type === 'sleep') {
          if (step.minMs !== undefined) step.minMs = Number(step.minMs);
          if (step.maxMs !== undefined) step.maxMs = Number(step.maxMs);
          if (step.minMs === undefined || isNaN(step.minMs as number)) {
            const dur = Number(step.ms ?? step.duration ?? step.durationMs ?? step.time ?? 2000);
            step.minMs = isNaN(dur) ? 2000 : Math.max(0, Math.round(dur));
            step.maxMs = step.maxMs !== undefined && !isNaN(step.maxMs as number) ? Math.max(0, Math.round(step.maxMs as number)) : step.minMs;
          } else if (step.maxMs === undefined || isNaN(step.maxMs as number)) {
            step.maxMs = step.minMs;
          }
          step.minMs = Math.max(0, Math.round(Number(step.minMs)));
          step.maxMs = Math.max(0, Math.round(Number(step.maxMs)));
          if (step.maxIterations !== undefined) {
            const m = Number(step.maxIterations);
            step.maxIterations = isNaN(m) || m < 1 ? 10 : Math.min(50, Math.round(m));
          }
        } else if (rawType === 'goback' || rawType === 'back') {
          step.type = 'goBack';
          if (step.timeoutMs !== undefined || step.timeout !== undefined) {
            const t = Number(step.timeoutMs ?? step.timeout);
            step.timeoutMs = isNaN(t) || t <= 0 ? 30000 : Math.round(t);
          } else {
            step.timeoutMs = 30000;
          }
        } else if (rawType === 'engage' || rawType === 'video_action' || rawType === 'videoAction' || rawType === 'social') {
          step.type = 'engage';
          const rawAct = String(step.action || step.engagement || '').toLowerCase().trim();
          if (rawAct.includes('sub') && !rawAct.includes('unsub')) step.action = 'subscribe';
          else if (rawAct.includes('unsub')) step.action = 'unsubscribe';
          else if (rawAct.includes('dislike')) step.action = 'dislike';
          else if (rawAct.includes('like')) step.action = 'like';
          else if (rawAct.includes('comment')) step.action = 'comment';
          else if (rawAct.includes('skip') || rawAct.includes('ad')) step.action = 'skip_ad';
          else if (rawAct.includes('share')) step.action = 'share';
          else if (rawAct.includes('save') || rawAct.includes('playlist')) step.action = 'save';
          else if (rawAct.includes('bell') || rawAct.includes('notif')) step.action = 'bell';
          else step.action = (step.action as any) || 'like';

          if (step.optional === undefined) step.optional = true;
          if (step.text && !step.commentText) step.commentText = String(step.text);
        }

        // 3. Cross-platform root component normalization (Desktop ytd-app vs Mobile ytm-app)
        if (typeof (step as any).selector === 'string') {
          const s = (step as any).selector.trim();
          if (s === 'ytd-app') {
            (step as any).selector = 'ytd-app, ytm-app, main';
          }
        }

        // 4. Repeat bodies get the same normalization as top-level steps, so an
        // authored or model-generated body does not need to be pre-cleaned.
        if (step.type === 'repeat' && Array.isArray(step.steps)) {
          step.steps = (step.steps as unknown[]).map((inner) => {
            if (!inner || typeof inner !== 'object') return inner;
            const innerStep = { ...(inner as Record<string, unknown>) };
            if (typeof innerStep.selector === 'string' && innerStep.selector.trim() === 'ytd-app') {
              innerStep.selector = 'ytd-app, ytm-app, main';
            }
            return innerStep;
          });
          // `times` may arrive as a numeric string (LLM-authored JSON).
          if (typeof step.times === 'string') {
            const parsedTimes = Number(step.times);
            if (Number.isFinite(parsedTimes)) step.times = Math.round(parsedTimes);
          }
        }

        return step;
      });
    }

    return data;
  }

  /**
   * Validates a workflow object or definition against Workflow Schema v1:
   * - Zod structure & types
   * - Variable reference closure (ensuring every referenced variable is declared or extracted prior)
   * - Step semantics (e.g. sleep minMs <= maxMs, non-empty selectors, valid identifiers for extractions)
   */
  /**
   * Walks a raw (unparsed) step list looking for a `repeat` nested inside
   * another `repeat`.
   *
   * The repeat body schema intentionally omits `repeat`, so nesting is already
   * rejected at parse time — but that surfaces as a bare "invalid discriminator"
   * listing every allowed type, which gives no hint about the real mistake.
   * Checking first lets us explain the problem.
   */
  private static findNestedRepeat(steps: unknown, insideRepeat = false): string | null {
    if (!Array.isArray(steps)) return null;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as { type?: unknown; steps?: unknown } | null;
      if (!step || typeof step !== 'object') continue;
      const type = String(step.type ?? '').trim();
      if (type === 'repeat') {
        if (insideRepeat) return `Step ${i + 1}`;
        const nested = this.findNestedRepeat(step.steps, true);
        if (nested) return `${i + 1} → ${nested}`;
        continue;
      }
      const nested = this.findNestedRepeat(step.steps, insideRepeat);
      if (nested) return `${i + 1} → ${nested}`;
    }
    return null;
  }

  static validate(input: unknown): WorkflowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Normalize common LLM variations & Zod schema validation
    const normalized = this.normalize(input);

    const nestedPath = this.findNestedRepeat((normalized as { steps?: unknown }).steps);
    if (nestedPath) {
      return {
        ok: false,
        errors: [
          `Step ${nestedPath} (repeat): Repeat steps cannot be nested. ` +
            `A repeat body may only contain plain steps — flatten the inner repeat into the outer one, ` +
            `or split the workflow into two top-level steps.`,
        ],
        warnings,
      };
    }

    const parsed = Workflow.safeParse(normalized);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`[${issue.path.join('.') || 'root'}]: ${issue.message}`);
      }
      return { ok: false, errors, warnings };
    }

    const workflow = parsed.data;

    // 2. Variable closure & step semantic validation
    //
    // At run time every array variable is expanded by RunService into:
    //   <name>       – one random pick, fixed for the whole run
    //   <name>.pool  – the original array, re-drawn on EVERY interpolation
    //   <name>.<n>   – each element, addressable by index
    // `{{name.pool}}` is therefore the reusable way to say "a different random
    // value each time this step runs", which is what makes a repeating browse
    // cycle able to search a new keyword or result slot every round.
    const availableVariables = new Set<string>([
      ...this.BUILTIN_VARIABLES,
      ...Object.keys(workflow.variables ?? {}),
    ]);
    for (const [name, value] of Object.entries(workflow.variables ?? {})) {
      if (Array.isArray(value)) {
        availableVariables.add(`${name}.pool`);
        value.forEach((_, idx) => availableVariables.add(`${name}.${idx}`));
      }
    }

    for (let index = 0; index < workflow.steps.length; index++) {
      const step = workflow.steps[index]!;
      const stepNum = index + 1;

      // Check referenced variables in string properties
      this.checkStepVariables(step, stepNum, availableVariables, errors);

      // Semantic checks per step type
      switch (step.type) {
        case 'navigate': {
          if (!step.url || step.url.trim().length === 0) {
            errors.push(`Step ${stepNum} (navigate): URL cannot be empty`);
          }
          break;
        }

        case 'waitForUrl': {
          if (!step.url || step.url.trim().length === 0) {
            errors.push(`Step ${stepNum} (waitForUrl): URL pattern cannot be empty`);
          }
          break;
        }

        case 'hover':
        case 'waitFor':
        case 'click': {
          if (!step.selector || step.selector.trim().length === 0) {
            errors.push(`Step ${stepNum} (${step.type}): Selector cannot be empty`);
          }
          break;
        }

        case 'mouseMove': {
          if (!step.selector && step.x === undefined && step.y === undefined) {
            warnings.push(`Step ${stepNum} (mouseMove): Neither selector nor coordinates specified; cursor will wander naturally`);
          }
          break;
        }

        case 'type': {
          if (!step.selector || step.selector.trim().length === 0) {
            errors.push(`Step ${stepNum} (type): Selector cannot be empty`);
          }
          break;
        }

        case 'extract': {
          if (!step.selector || step.selector.trim().length === 0) {
            errors.push(`Step ${stepNum} (extract): Selector cannot be empty`);
          }
          if (!step.as || !this.IDENTIFIER_REGEX.test(step.as)) {
            errors.push(
              `Step ${stepNum} (extract): 'as' variable name '${step.as}' must be a valid alphanumeric identifier (e.g. my_var)`,
            );
          } else {
            // Register as available for subsequent steps
            availableVariables.add(step.as);
          }
          break;
        }

        case 'sleep': {
          if (step.minMs > step.maxMs) {
            errors.push(
              `Step ${stepNum} (sleep): minMs (${step.minMs}) cannot be greater than maxMs (${step.maxMs})`,
            );
          }
          break;
        }

        case 'screenshot': {
          if (!step.name || step.name.trim().length === 0) {
            errors.push(`Step ${stepNum} (screenshot): Name cannot be empty`);
          }
          break;
        }

        case 'scroll': {
          if (step.amount <= 0) {
            errors.push(`Step ${stepNum} (scroll): Amount must be greater than 0`);
          }
          break;
        }

        case 'llm': {
          if (!step.goal || step.goal.trim().length === 0) {
            errors.push(`Step ${stepNum} (llm): Goal cannot be empty`);
          }
          break;
        }

        case 'engage': {
          const validActions = ['like', 'dislike', 'subscribe', 'unsubscribe', 'comment', 'skip_ad', 'share', 'save', 'bell'];
          if (!validActions.includes(step.action)) {
            errors.push(`Step ${stepNum} (engage): Invalid action '${step.action}'. Must be one of: ${validActions.join(', ')}`);
          }
          if (step.action === 'comment' && (!step.commentText || step.commentText.trim().length === 0)) {
            errors.push(`Step ${stepNum} (engage): 'commentText' is required when action is 'comment'`);
          }
          break;
        }

        case 'repeat': {
          if (!step.steps || step.steps.length === 0) {
            errors.push(`Step ${stepNum} (repeat): Body must contain at least one step`);
            break;
          }
          // `times` is either a number or a `{{variable}}` reference, which is
          // only resolvable at run time, so range-check the literal form only.
          if (typeof step.times === 'number') {
            if (!Number.isFinite(step.times) || step.times < 1) {
              errors.push(`Step ${stepNum} (repeat): 'times' must be a number >= 1`);
            } else if (step.times > 50) {
              errors.push(`Step ${stepNum} (repeat): 'times' must be 50 or fewer`);
            }
          } else {
            const raw = String(step.times);
            const isReference = /{{\s*[a-zA-Z0-9_.]+\s*}}/.test(raw);
            if (!isReference && !/^\d+$/.test(raw.trim())) {
              errors.push(
                `Step ${stepNum} (repeat): 'times' must be a number or a {{variable}} reference, got '${raw}'`,
              );
            } else if (isReference) {
              this.checkVariableRefs(raw, stepNum, availableVariables, errors);
            }
          }
          // Nesting is rejected by the schema, but a hand-written or
          // LLM-authored definition can still reach here, so say so plainly.
          const nested = (step.steps as unknown as Step[]).filter(
            (inner) => (inner as { type?: string }).type === 'repeat',
          );
          if (nested.length > 0) {
            errors.push(
              `Step ${stepNum} (repeat): Repeat steps cannot be nested. Flatten the inner repeat into this one.`,
            );
          }
          break;
        }
      }
    }

    return {
      ok: errors.length === 0,
      ...(errors.length === 0 ? { workflow } : {}),
      errors,
      warnings,
    };
  }

  /**
   * Parses JSON string or validates object. Throws TaskError on validation failure.
   */
  static parse(input: unknown): Workflow {
    let data = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch (err) {
        throw new TaskError(
          'INTERNAL',
          `Failed to parse workflow JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const res = this.validate(data);
    if (!res.ok || !res.workflow) {
      throw new TaskError(
        'INTERNAL',
        `Workflow validation failed:\n${res.errors.join('\n')}`,
        { errors: res.errors },
      );
    }

    return res.workflow;
  }

  /**
   * Resolves Spintax formatted patterns like `{Awesome|Incredible|Great}` into a single random choice.
   */
  static resolveSpintax(text: string): string {
    if (!text || typeof text !== 'string') return text;
    const spintaxRegex = /\{([^{}]+)\}/g;
    let result = text;
    let iterations = 0;
    while (spintaxRegex.test(result) && iterations < 10) {
      result = result.replace(spintaxRegex, (_, choices: string) => {
        const parts = choices.split('|');
        return parts[Math.floor(Math.random() * parts.length)] || '';
      });
      iterations++;
    }
    return result;
  }

  /**
   * Interpolates template string replacing `{{variableName}}` with runtime values,
   * supporting variable pools (arrays of strings) and Spintax syntax.
   */
  static interpolate(template: string, variables: Record<string, unknown>): string {
    if (!template || typeof template !== 'string') return template;
    const replaced = template.replace(this.VARIABLE_REGEX, (match, varName: string) => {
      if (!(varName in variables)) return match;
      const rawVal = variables[varName];
      if (Array.isArray(rawVal) && rawVal.length > 0) {
        // Random selection from keyword or item pool
        return String(rawVal[Math.floor(Math.random() * rawVal.length)] ?? '');
      }
      return String(rawVal ?? '');
    });

    // Automatically resolve any Spintax in the interpolated text
    return this.resolveSpintax(replaced);
  }

  /**
   * Interpolates all string variables within a Step object at execution time.
   */
  static interpolateStep(step: Step, variables: Record<string, unknown>): Step {
    switch (step.type) {
      case 'navigate':
        return {
          ...step,
          url: this.interpolate(step.url, variables),
        };
      case 'waitForUrl':
        return {
          ...step,
          url: this.interpolate(step.url, variables),
        };
      case 'waitFor':
      case 'click':
      case 'hover':
        return {
          ...step,
          selector: this.interpolate(step.selector, variables),
        };
      case 'mouseMove':
        return {
          ...step,
          ...(step.selector ? { selector: this.interpolate(step.selector, variables) } : {}),
        };
      case 'type':
        return {
          ...step,
          selector: this.interpolate(step.selector, variables),
          text: this.interpolate(step.text, variables),
        };
      case 'extract':
        return {
          ...step,
          selector: this.interpolate(step.selector, variables),
          ...(step.attribute !== undefined
            ? { attribute: this.interpolate(step.attribute, variables) }
            : {}),
        };
      case 'screenshot':
        return {
          ...step,
          name: this.interpolate(step.name, variables),
        };
      case 'llm':
        return {
          ...step,
          goal: this.interpolate(step.goal, variables),
        };
      case 'repeat': {
        // A repeat body is re-interpolated on every iteration by the runner, so
        // any pool referenced inside it is drawn again each round.
        return {
          ...step,
          ...(typeof step.times === 'string'
            ? { times: this.interpolate(step.times, variables) }
            : {}),
          ...(step.label ? { label: this.interpolate(step.label, variables) } : {}),
          steps: step.steps.map((inner) =>
            this.interpolateStep(inner as unknown as Step, variables),
          ) as typeof step.steps,
        };
      }
      case 'engage':
        return {
          ...step,
          ...(step.commentText ? { commentText: this.interpolate(step.commentText, variables) } : {}),
        };
      case 'scroll':
      case 'sleep':
      case 'goBack':
        return { ...step };
    }
  }

  private static checkStepVariables(
    step: Step,
    stepNum: number | string,
    availableVariables: Set<string>,
    errors: string[],
  ): void {
    const stringValues: string[] = [];

    switch (step.type) {
      case 'navigate':
      case 'waitForUrl':
        stringValues.push(step.url);
        break;
      case 'waitFor':
      case 'click':
      case 'hover':
        stringValues.push(step.selector);
        break;
      case 'mouseMove':
        if (step.selector) stringValues.push(step.selector);
        break;
      case 'type':
        stringValues.push(step.selector, step.text);
        break;
      case 'extract':
        stringValues.push(step.selector);
        if (step.attribute) stringValues.push(step.attribute);
        break;
      case 'screenshot':
        stringValues.push(step.name);
        break;
      case 'llm':
        stringValues.push(step.goal);
        break;
      case 'engage':
        if (step.commentText) stringValues.push(step.commentText);
        break;
      case 'repeat': {
        if (step.label) stringValues.push(step.label);
        // Variables inside the body are resolved against the same scope, so
        // they must be declared at workflow level (or extracted beforehand).
        step.steps.forEach((inner, innerIdx) => {
          this.checkStepVariables(
            inner as unknown as Step,
            `${stepNum}.${innerIdx + 1}`,
            availableVariables,
            errors,
          );
        });
        break;
      }
    }

    for (const val of stringValues) {
      this.checkVariableRefs(val, stepNum, availableVariables, errors);
    }
  }

  /** Ensures every `{{var}}` reference in a string is resolvable at run time. */
  private static checkVariableRefs(
    val: string,
    stepNum: number | string,
    availableVariables: Set<string>,
    errors: string[],
  ): void {
    if (typeof val !== 'string') return;
    const matches = val.matchAll(this.VARIABLE_REGEX);
    for (const m of matches) {
      const varName = m[1]!;
      if (!availableVariables.has(varName)) {
        errors.push(
          `Step ${stepNum}: Referenced variable '{{${varName}}}' is not defined in workflow variables or preceding extract steps`,
        );
      }
    }
  }
}
