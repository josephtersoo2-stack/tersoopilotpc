import { describe, expect, it, vi } from 'vitest';

import { TemplateService } from '../src/services/TemplateService';
import { WorkflowValidator } from '../src/task/WorkflowValidator';
import { StepRunner, type StepExecutionContext } from '../src/task/StepRunner';
import type { Step, Workflow } from '@tersoo/contracts';
import type { Page } from 'playwright-core';

describe('Google Organic Search template (repeat cycle)', () => {
  /** Seeds the built-ins into a stub repo and returns the definition. */
  async function loadTemplate(): Promise<Workflow> {
    const captured: Record<string, Workflow> = {};
    const repos = {
      templates: {
        getById: vi.fn(async () => undefined),
        create: vi.fn(async (row: { id: string; definition: string }) => {
          captured[row.id] = JSON.parse(row.definition) as Workflow;
        }),
        update: vi.fn(async () => {}),
      },
    } as never;

    await new TemplateService({ repos }).ensureBuiltinTemplates();
    const wf = captured['tpl-google-organic-search-ctr'];
    expect(wf).toBeDefined();
    return wf!;
  }

  it('passes workflow validation', async () => {
    const wf = await loadTemplate();
    const result = WorkflowValidator.validate(wf);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('drives the search engine, keyword and round count from variables only', async () => {
    const wf = await loadTemplate();

    // No step may hardcode the engine or a keyword.
    const serialised = JSON.stringify(wf.steps);
    expect(serialised).not.toContain('google.com');
    expect(serialised).not.toContain('best mechanical keyboard');
    expect(serialised).not.toContain('search_result:0');
    expect(serialised).not.toContain('search_result:1');

    const navigate = wf.steps.find((s) => s.type === 'navigate');
    expect(navigate && 'url' in navigate ? navigate.url : '').toBe('{{searchEngineUrl}}');

    // The cycle length is variable-driven, not a fixed step count.
    const repeat = wf.steps.find((s) => s.type === 'repeat');
    expect(repeat).toBeDefined();
    expect(repeat && 'times' in repeat ? repeat.times : null).toBe('{{serpRounds}}');
  });

  it('contains the full search -> read -> back -> new-keyword cycle in the repeat body', async () => {
    const wf = await loadTemplate();
    const repeat = wf.steps.find((s) => s.type === 'repeat');
    if (!repeat || repeat.type !== 'repeat') throw new Error('repeat step missing');

    const types = repeat.steps.map((s) => s.type);
    // Natural reading on the SERP, then an organic click, then reading, then a
    // model judgement call, then back, then a new keyword in the search bar.
    expect(types).toContain('scroll');
    expect(types).toContain('click');
    expect(types).toContain('goBack');
    expect(types).toContain('llm');
    expect(types.indexOf('goBack')).toBeGreaterThan(types.indexOf('llm'));

    // The result click draws a fresh random slot each iteration.
    const resultClick = repeat.steps.find(
      (s) => s.type === 'click' && s.selector.includes('search_result'),
    );
    expect(resultClick && 'selector' in resultClick ? resultClick.selector : '').toBe(
      'intent:search_result:{{resultSlot.pool}}',
    );

    // The follow-up search types a new keyword.
    const typeSteps = repeat.steps.filter((s) => s.type === 'type');
    expect(typeSteps).toHaveLength(1);
    const typed = typeSteps[0]!;
    expect(typed.type === 'type' ? typed.text : '').toBe('{{searchQuery.pool}}');
    expect(typed.type === 'type' ? typed.pressEnter : false).toBe(true);
    expect(typed.type === 'type' ? typed.clearFirst : false).toBe(true);

    // The reading judgement call must not be able to fail the run.
    const llmStep = repeat.steps.find((s) => s.type === 'llm');
    expect(llmStep && llmStep.type === 'llm' ? llmStep.optional : null).toBe(true);
  });
});

describe('Repeat step semantics', () => {
  it('rejects a nested repeat', () => {
    const result = WorkflowValidator.validate({
      schemaVersion: 1,
      name: 'nested',
      variables: {},
      steps: [
        {
          type: 'repeat',
          times: 2,
          steps: [
            { type: 'repeat', times: 2, steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }] } as never,
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    // A repeat body may only contain plain steps; nesting gets an explanation
    // rather than a bare "invalid discriminator" list.
    expect(result.errors.join(' ')).toMatch(/Repeat steps cannot be nested/i);
  });

  it('rejects an unresolvable variable inside a repeat body', () => {
    const result = WorkflowValidator.validate({
      schemaVersion: 1,
      name: 'bad-ref',
      variables: {},
      steps: [
        {
          type: 'repeat',
          times: 2,
          steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }, { type: 'click', selector: 'intent:x{{nope}}' } as never],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/nope/);
  });

  it('accepts {{var}} in times and resolves it at run time', () => {
    const result = WorkflowValidator.validate({
      schemaVersion: 1,
      name: 'rounds-var',
      variables: { serpRounds: '3' },
      steps: [
        {
          type: 'repeat',
          times: '{{serpRounds}}',
          steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }],
        },
      ],
    });
    expect(result.errors).toEqual([]);

    const interpolated = WorkflowValidator.interpolateStep(
      {
        type: 'repeat',
        times: '{{serpRounds}}',
        steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }],
      } as Step,
      { serpRounds: '4' },
    );
    expect(interpolated.type === 'repeat' ? interpolated.times : null).toBe('4');
  });

  it('makes pool variables addressable as .pool and .<n> during validation', () => {
    const result = WorkflowValidator.validate({
      schemaVersion: 1,
      name: 'pool-ref',
      variables: { kw: ['a', 'b', 'c'] },
      steps: [
        { type: 'type', selector: 'intent:search_input', text: '{{kw.pool}}' },
        { type: 'type', selector: 'intent:search_input', text: '{{kw.1}}' },
      ],
    });
    expect(result.errors).toEqual([]);
  });

  it('re-draws a pool variable on every interpolation', () => {
    // RunService expands an array variable into a flat map, so the runtime
    // shape is what the template's `{{name.pool}}` references resolve against.
    const variables = { kw: 'fixed', 'kw.pool': ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
    const draws = new Set<string>();
    for (let i = 0; i < 40; i++) {
      draws.add(WorkflowValidator.interpolate('{{kw.pool}}', variables));
    }
    // A pool reference must not collapse to the single per-run pick.
    expect(draws.size).toBeGreaterThan(1);
    expect(draws.has('fixed')).toBe(false);
  });

  it('keeps the single per-run pick distinct from the pool reference', () => {
    const variables = { kw: 'fixed', 'kw.pool': ['a', 'b', 'c'] };
    expect(WorkflowValidator.interpolate('{{kw}}', variables)).toBe('fixed');
  });
});

describe('StepRunner repeat execution', () => {
  function makeCtx(overrides: Partial<StepExecutionContext> = {}): StepExecutionContext {
    return {
      profileId: 'p1',
      taskId: 't1',
      runId: 'r1',
      stepIndex: 0,
      page: {} as Page,
      variables: {},
      ...overrides,
    };
  }

  it('runs the body the requested number of times', async () => {
    const runner = new StepRunner({} as never);
    const ctx = makeCtx();
    const sleepSpy = vi.spyOn(runner as never, 'run').mockResolvedValue({
      stepIndex: 0,
      stepType: 'sleep',
      durationMs: 0,
    } as never);

    const artifacts = await (
      runner as unknown as {
        handleRepeat: (s: unknown, c: StepExecutionContext) => Promise<Record<string, unknown>>;
      }
    ).handleRepeat(
      {
        type: 'repeat',
        times: 3,
        steps: [
          { type: 'sleep', minMs: 1, maxMs: 2 },
          { type: 'sleep', minMs: 1, maxMs: 2 },
        ],
      },
      ctx,
    );

    expect(sleepSpy).toHaveBeenCalledTimes(6); // 2 steps x 3 iterations
    expect(artifacts.repeatRequested).toBe(3);
    expect(artifacts.repeatCompleted).toBe(3);
    expect(artifacts.repeatFailed).toBe(0);
  });

  it('continues past a failing iteration when continueOnError is set', async () => {
    const runner = new StepRunner({} as never);
    const ctx = makeCtx();
    let calls = 0;
    vi.spyOn(runner as never, 'run').mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error('element detached');
      return { stepIndex: 0, stepType: 'sleep', durationMs: 0 } as never;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const artifacts = await (
      runner as unknown as {
        handleRepeat: (s: unknown, c: StepExecutionContext) => Promise<Record<string, unknown>>;
      }
    ).handleRepeat(
      {
        type: 'repeat',
        times: 2,
        continueOnError: true,
        steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }],
      },
      ctx,
    );

    expect(artifacts.repeatCompleted).toBe(1);
    expect(artifacts.repeatFailed).toBe(1);
  });

  it('aborts on the first failure by default', async () => {
    const runner = new StepRunner({} as never);
    const ctx = makeCtx();
    vi.spyOn(runner as never, 'run').mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      (
        runner as unknown as {
          handleRepeat: (s: unknown, c: StepExecutionContext) => Promise<Record<string, unknown>>;
        }
      ).handleRepeat(
        { type: 'repeat', times: 3, steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }] },
        ctx,
      ),
    ).rejects.toThrow(/iteration 1\/3/);
  });

  it('rejects a non-numeric round count with a clear message', async () => {
    const runner = new StepRunner({} as never);
    await expect(
      (
        runner as unknown as {
          handleRepeat: (s: unknown, c: StepExecutionContext) => Promise<Record<string, unknown>>;
        }
      ).handleRepeat(
        { type: 'repeat', times: 'not-a-number', steps: [{ type: 'sleep', minMs: 1, maxMs: 2 }] },
        makeCtx(),
      ),
    ).rejects.toThrow(/must resolve to a number of at least 1/);
  });
});
