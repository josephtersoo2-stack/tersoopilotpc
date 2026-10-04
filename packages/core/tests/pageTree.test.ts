import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ElementHandle, Page } from 'playwright-core';

import {
  buildCollectScript,
  extractPageTree,
  formatPageTree,
  MAX_PAGE_TREE_NODES,
  resolveTreeNode,
  type PageTree,
} from '../src/crosshair/pageTree';
import { Humanizer } from '../src/crosshair/Humanizer';
import { normalizeAbsoluteUrl, renderTreeForModel } from '../src/llm/LlmService';
import { TREE_SYSTEM_PROMPT } from '../src/llm/prompts';
import type { LlmService } from '../src/llm/LlmService';
import type { LlmDecision, LlmStepContext } from '../src/llm/types';
import { runLlmStep, validateDecision } from '../src/task/steps/llmStep';

/* ------------------------------------------------------------------ helpers */

function domTree(overrides: Partial<PageTree> = {}): PageTree {
  return {
    url: 'https://example.com/search?q=widgets',
    title: 'Example results',
    source: 'dom',
    nodes: [
      { ref: 1, role: 'textbox', name: 'Search', depth: 0 },
      { ref: 2, role: 'link', name: 'Read more', depth: 1, href: 'https://example.com/a' },
      { ref: 3, role: 'link', name: 'Read more', depth: 1, href: 'https://example.com/b' },
      { ref: 4, role: 'button', name: 'Disabled thing', depth: 1, disabled: true },
    ],
    accessibility: null,
    candidates: 4,
    truncated: false,
    ...overrides,
  };
}

/** A page double that only exposes the accessibility snapshot. */
function axPage(snapshot: unknown, extra: Record<string, unknown> = {}): Page {
  return {
    accessibility: { snapshot: vi.fn().mockResolvedValue(snapshot) },
    ...extra,
  } as unknown as Page;
}

function scriptedLlm(script: LlmDecision[], turns: LlmStepContext[] = []) {
  let i = 0;
  return {
    decideFromTree: vi.fn(async (_tree: unknown, _goal: string, ctx: LlmStepContext = {}) => {
      turns.push(ctx);
      const next = script[Math.min(i, script.length - 1)];
      i += 1;
      if (!next) throw new Error('script exhausted');
      return next;
    }),
  } as unknown as LlmService;
}

function quietHumanizer(): Humanizer {
  const humanizer = new Humanizer(11);
  vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);
  vi.spyOn(humanizer, 'scroll').mockResolvedValue(undefined);
  return humanizer;
}

/* ------------------------------------------------------------- page script */

describe('pageTree: the page-side collector', () => {
  it('is a plain string so a bundler cannot rewrite it into an undefined helper', () => {
    // A named function passed to page.evaluate is rewritten by esbuild into
    // `__name(...)`, which does not exist in the page. The walk must be immune.
    const script = buildCollectScript();
    expect(typeof script).toBe('string');
    expect(script).not.toContain('__name');
    expect(script).toContain('return out;');
  });

  it('returns the collected list by default and a single element when indexed', () => {
    expect(buildCollectScript()).toContain('return out;');
    expect(buildCollectScript(MAX_PAGE_TREE_NODES, 0)).toContain('return els[0] || null;');
    expect(buildCollectScript(MAX_PAGE_TREE_NODES, 7)).toContain('return els[7] || null;');
  });

  it('bakes the configured caps into the script', () => {
    const script = buildCollectScript(42);
    expect(script).toContain('nodes.length >= 42');
    expect(script).not.toContain('__MAX_NODES__');
    expect(script).not.toContain('__MAX_NAME__');
  });

  it('clamps a negative element index to the first element', () => {
    expect(buildCollectScript(MAX_PAGE_TREE_NODES, -3)).toContain('return els[0] || null;');
  });
});

/* ------------------------------------------------------------- extraction */

describe('pageTree: extractPageTree', () => {
  it('reports url, title and node count from the DOM walk', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue({
        url: 'https://example.com/',
        title: 'Example',
        nodes: [{ ref: 1, role: 'link', name: 'Home', depth: 0, href: '/' }],
        candidates: 12,
        capped: false,
      }),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const tree = await extractPageTree(page);

    expect(tree.source).toBe('dom');
    expect(tree.url).toBe('https://example.com/');
    expect(tree.title).toBe('Example');
    expect(tree.nodes).toHaveLength(1);
  });

  it('marks a page as truncated only when the cap was actually hit', async () => {
    const make = (capped: boolean) =>
      ({
        evaluate: vi.fn().mockResolvedValue({
          url: 'https://example.com/',
          title: 'Example',
          nodes: [{ ref: 1, role: 'link', name: 'Home', depth: 0 }],
          // Many elements matched the selector but most were invisible, so
          // nothing was withheld from the model.
          candidates: 900,
          capped,
        }),
      }) as unknown as Page;

    expect((await extractPageTree(make(false))).truncated).toBe(false);
    expect((await extractPageTree(make(true))).truncated).toBe(true);
  });

  it('falls back to the accessibility snapshot when evaluate is unavailable', async () => {
    const page = axPage({
      role: 'WebArea',
      name: 'Root',
      children: [{ role: 'button', name: 'Login' }],
    });

    const tree = await extractPageTree(page);

    expect(tree.source).toBe('accessibility');
    // The document root is not listed as an actionable ref; the URL and title
    // already describe it.
    expect(tree.nodes.map((n) => n.role)).toEqual(['button']);
    expect(tree.nodes[0]?.ref).toBe(2);
  });

  it('records why the DOM walk failed instead of hiding it', async () => {
    const page = {
      evaluate: vi.fn().mockRejectedValue(new Error('Execution context destroyed')),
      accessibility: {
        snapshot: vi
          .fn()
          .mockResolvedValue({ role: 'WebArea', name: 'Still here', children: [{ role: 'button', name: 'Retry' }] }),
      },
    } as unknown as Page;

    const tree = await extractPageTree(page);

    expect(tree.source).toBe('accessibility');
    expect(tree.domError).toContain('Execution context destroyed');
  });

  it('reports an empty page rather than throwing', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue({
        url: 'about:blank',
        title: '',
        nodes: [],
        candidates: 0,
        capped: false,
      }),
    } as unknown as Page;

    const tree = await extractPageTree(page);

    expect(tree.nodes).toEqual([]);
    expect(tree.url).toBe('about:blank');
  });

  it('reports source "empty" when neither walk produced anything', async () => {
    const tree = await extractPageTree(axPage(null));
    expect(tree.source).toBe('empty');
    expect(tree.nodes).toEqual([]);
  });
});

/* --------------------------------------------------------------- rendering */

describe('pageTree: formatPageTree', () => {
  it('leads with the url and title so the model knows where it is', () => {
    const text = formatPageTree(domTree());
    expect(text).toContain('Page URL: https://example.com/search?q=widgets');
    expect(text).toContain('Page title: Example results');
  });

  it('gives elements a ref, a role and an accessible name', () => {
    const text = formatPageTree(domTree());
    expect(text).toContain('[1] textbox "Search"');
    expect(text).toContain('[2] link "Read more" href="https://example.com/a"');
  });

  it('distinguishes elements that share an accessible name by their href', () => {
    const text = formatPageTree(domTree());
    expect(text).toContain('https://example.com/a');
    expect(text).toContain('https://example.com/b');
  });

  it('marks disabled controls', () => {
    expect(formatPageTree(domTree())).toContain('[4] button "Disabled thing" (disabled)');
  });

  it('explains a blank page instead of showing an empty list', () => {
    const text = formatPageTree(domTree({ url: 'about:blank', nodes: [], candidates: 0 }));
    expect(text).toContain('The page is blank');
  });

  it('tells the model to scroll when the page had more elements than fit', () => {
    expect(formatPageTree(domTree({ truncated: true }))).toContain('Scroll down to reveal');
  });

  it('renders a raw accessibility node when given one', () => {
    expect(renderTreeForModel({ ref: 1, role: 'WebArea', name: 'Root' })).toContain('WebArea');
  });
});

/* -------------------------------------------------------------- resolution */

describe('pageTree: resolveTreeNode', () => {
  it('resolves a ref through a fresh page evaluation, not a role+name guess', async () => {
    const handle = { asElement: () => ({ dispose: vi.fn() }), dispose: vi.fn() };
    const page = {
      evaluateHandle: vi.fn().mockResolvedValue(handle),
    } as unknown as Page;

    const target = await resolveTreeNode(page, domTree(), 3);

    expect(target).not.toBeNull();
    // ref 3 is index 2 in the walk.
    const script = (page.evaluateHandle as unknown as { mock: { calls: string[][] } }).mock.calls[0]?.[0];
    expect(String(script)).toContain('return els[2] || null;');
  });

  it('rejects a ref that is not in the tree before touching the page', async () => {
    const page = { evaluateHandle: vi.fn() } as unknown as Page;

    expect(await resolveTreeNode(page, domTree(), 99)).toBeNull();
    expect(page.evaluateHandle).not.toHaveBeenCalled();
  });

  it('rejects a non-positive or non-integer ref', async () => {
    const page = { evaluateHandle: vi.fn() } as unknown as Page;
    expect(await resolveTreeNode(page, domTree(), 0)).toBeNull();
    expect(await resolveTreeNode(page, domTree(), -1)).toBeNull();
    expect(await resolveTreeNode(page, domTree(), Number.NaN)).toBeNull();
  });

  it('falls back to a first-scoped role+name locator when the walk is unavailable', async () => {
    const firsted = { id: 'first' };
    const scoped = { first: () => firsted };
    const page = {
      getByRole: vi.fn().mockReturnValue(scoped),
      evaluateHandle: vi.fn().mockRejectedValue(new Error('Execution context was destroyed')),
    } as unknown as Page;

    const target = await resolveTreeNode(page, domTree(), 2);

    // Unscoped role+name matches are ambiguous on any real page; the fallback
    // must at least be narrowed to one element.
    expect(target).toBe(firsted);
  });

  it('falls back to a text locator when the role is unknown to Playwright', async () => {
    const firsted = { id: 'text' };
    const page = {
      locator: vi.fn().mockReturnValue({ first: () => firsted }),
    } as unknown as Page;

    const tree = domTree({ source: 'accessibility' });
    const target = await resolveTreeNode(page, tree, 2);

    expect(target).toBe(firsted);
    expect(page.locator).toHaveBeenCalledWith('text="Read more"');
  });
});

/* ------------------------------------------------------------- validation */

describe('llmStep: validateDecision', () => {
  it('accepts a click on a ref that exists', () => {
    expect(validateDecision({ action: 'click', ref: 2 }, domTree())).toEqual({ ok: true });
  });

  it('rejects a hallucinated ref and says which refs are available', () => {
    const result = validateDecision({ action: 'click', ref: 999 }, domTree());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no element with ref 999');
      expect(result.error).toContain('1..4');
    }
  });

  it('rejects clicking a disabled control', () => {
    const result = validateDecision({ action: 'click', ref: 4 }, domTree());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('disabled');
  });

  it('rejects typing into something that is not a field', () => {
    const result = validateDecision({ action: 'type', ref: 2, text: 'hi' }, domTree());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not a text field');
  });

  it('accepts typing into a textbox', () => {
    expect(validateDecision({ action: 'type', ref: 1, text: 'hi' }, domTree())).toEqual({ ok: true });
  });

  it('does not apply ref rules to navigate, wait or press', () => {
    expect(validateDecision({ action: 'navigate', url: 'https://example.com' }, domTree())).toEqual({
      ok: true,
    });
    expect(validateDecision({ action: 'wait', ms: 500 }, domTree())).toEqual({ ok: true });
    expect(validateDecision({ action: 'press', key: 'Enter' }, domTree())).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------- url parsing */

describe('llm: navigate URL handling', () => {
  it('accepts an absolute http(s) url unchanged', () => {
    expect(normalizeAbsoluteUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeAbsoluteUrl('http://example.com')).toBe('http://example.com');
  });

  it('upgrades a bare host to https, which models often emit', () => {
    expect(normalizeAbsoluteUrl('example.com/search')).toBe('https://example.com/search');
  });

  it('refuses a non-web scheme', () => {
    expect(normalizeAbsoluteUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAbsoluteUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeAbsoluteUrl('data:text/html,<h1>x')).toBeNull();
  });

  it('refuses a relative path, which page.goto cannot use', () => {
    expect(normalizeAbsoluteUrl('/search?q=x')).toBeNull();
    expect(normalizeAbsoluteUrl('./next')).toBeNull();
  });

  it('refuses empty and non-string values', () => {
    expect(normalizeAbsoluteUrl('')).toBeNull();
    expect(normalizeAbsoluteUrl(undefined)).toBeNull();
    expect(normalizeAbsoluteUrl(42)).toBeNull();
  });

  it('refuses a host with no dot', () => {
    expect(normalizeAbsoluteUrl('https://localhost/page')).toBeNull();
  });
});

/* ------------------------------------------------------------------ prompt */

describe('llm: tree system prompt', () => {
  it('tells the model to read the url before deciding', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('Read "page.url" first');
  });

  it('tells the model the previous actions are its memory', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('previousActions');
    expect(TREE_SYSTEM_PROMPT).toContain('Never repeat an action that already succeeded');
  });

  it('warns that refs are only valid for the current turn', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('only valid for the tree in this turn');
  });

  it('keeps the video and consent rules the search templates rely on', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('STRICTLY AVOID live streams');
    expect(TREE_SYSTEM_PROMPT).toContain('Skip Ad');
  });

  it('asks for one bare json object, with no markdown fences', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('Return ONLY the JSON object, no prose, no markdown fences.');
  });
});

/* ------------------------------------------------------------- the loop */

describe('llmStep: the model loop', () => {
  it('shows the model the url, the iteration and its own history', async () => {
    const turns: LlmStepContext[] = [];
    const page = axPage({ role: 'WebArea', name: 'Root', children: [{ role: 'button', name: 'Next' }] });

    const result = await runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'done' }], turns), {
      goal: 'finish onboarding',
      maxIterations: 4,
    });

    expect(result.iterations).toBe(1);
    expect(turns[0]?.iteration).toBe(1);
    expect(turns[0]?.maxIterations).toBe(4);
    expect(turns[0]?.history).toEqual([]);
    expect(turns[0]?.lastError).toBeNull();
    expect(result.finalUrl).toBe('Root');
  });

  it('records a successful action and replays it on the next turn', async () => {
    const turns: LlmStepContext[] = [];
    const page = {
      url: vi.fn().mockReturnValue('https://example.com/one'),
      evaluate: vi.fn().mockResolvedValue({
        url: 'https://example.com/one',
        title: 'One',
        nodes: [{ ref: 1, role: 'button', name: 'Next', depth: 0 }],
        candidates: 1,
        capped: false,
      }),
      evaluateHandle: vi.fn().mockResolvedValue({
        asElement: () => ({ boundingBox: async () => ({ x: 1, y: 1, width: 10, height: 10 }), dispose: vi.fn() }),
        dispose: vi.fn(),
      }),
      mouse: { move: vi.fn(), down: vi.fn(), up: vi.fn() },
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'click', ref: 1 }, { action: 'done' }], turns), {
      goal: 'advance',
      maxIterations: 4,
    });

    expect(turns[1]?.history).toHaveLength(1);
    expect(turns[1]?.history?.[0]).toMatchObject({ action: 'click', result: 'ok', target: 'button "Next"' });
    expect(turns[1]?.lastError).toBeNull();
  });

  it('feeds a rejected ref back to the model instead of crashing the run', async () => {
    const turns: LlmStepContext[] = [];
    const page = axPage({ role: 'WebArea', name: 'Root' });

    const result = await runLlmStep(
      page,
      quietHumanizer(),
      scriptedLlm([{ action: 'click', ref: 999 }, { action: 'done' }], turns),
      { goal: 'click something', maxIterations: 4 },
    );

    expect(result.iterations).toBe(2);
    expect(result.history[0]).toMatchObject({ result: 'rejected' });
    expect(turns[1]?.lastError).toContain('no element with ref 999');
  });

  it('feeds an action failure back to the model instead of swallowing it', async () => {
    const turns: LlmStepContext[] = [];
    const page = {
      url: vi.fn().mockReturnValue('https://example.com/'),
      evaluate: vi.fn().mockResolvedValue({
        url: 'https://example.com/',
        title: 'Example',
        nodes: [{ ref: 1, role: 'button', name: 'Go', depth: 0 }],
        candidates: 1,
        capped: false,
      }),
      // The element vanished between describing and acting.
      evaluateHandle: vi.fn().mockResolvedValue({
        asElement: () => null,
        dispose: vi.fn(),
      }),
    } as unknown as Page;

    const result = await runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'click', ref: 1 }, { action: 'done' }], turns), {
      goal: 'click go',
      maxIterations: 4,
    });

    expect(result.history[0]).toMatchObject({ result: 'failed' });
    expect(turns[1]?.lastError).toContain('no longer on the page');
  });

  it('gives up with a clear reason when the model repeats one action', async () => {
    const page = axPage({
      role: 'WebArea',
      name: 'Root',
      children: [{ role: 'button', name: 'Next' }],
    });

    await expect(
      runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'click', ref: 2 }]), {
        goal: 'advance forever',
        maxIterations: 10,
      }),
    ).rejects.toThrow(/LLM_MAX_ITERATIONS.*repeated/s);
  });

  it('still reports the iteration cap when the model keeps changing its mind', async () => {
    let n = 0;
    const page = axPage({ role: 'WebArea', name: 'Root', children: [{ role: 'button', name: 'Next' }] });
    const llm = {
      // Alternating directions, so no single action is ever repeated: this is
      // dithering, not a stuck loop, and must run to the iteration cap.
      decideFromTree: vi.fn(async (): Promise<LlmDecision> => {
        n += 1;
        return { action: 'scroll', direction: n % 2 === 0 ? 'down' : 'up', amount: 200 };
      }),
    } as unknown as LlmService;

    await expect(
      runLlmStep(page, quietHumanizer(), llm, { goal: 'dither', maxIterations: 5 }),
    ).rejects.toThrow(/LLM_MAX_ITERATIONS/);
    expect(llm.decideFromTree).toHaveBeenCalledTimes(5);
  });

  it('returns the url the browser ended on', async () => {
    const page = axPage({ role: 'WebArea', name: 'Root' });
    const result = await runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'done' }]), {
      goal: 'nothing',
      maxIterations: 2,
    });
    expect(result.finalUrl).toBe('Root');
    expect(result.history).toEqual([]);
  });

  it('types through the humanizer rather than one bulk keyboard.type', async () => {
    const page = {
      url: vi.fn().mockReturnValue('https://example.com/'),
      evaluate: vi.fn().mockResolvedValue({
        url: 'https://example.com/',
        title: 'Example',
        nodes: [{ ref: 1, role: 'textbox', name: 'Search', depth: 0 }],
        candidates: 1,
        capped: false,
      }),
      evaluateHandle: vi.fn().mockResolvedValue({
        asElement: () => ({
          boundingBox: async () => ({ x: 1, y: 1, width: 10, height: 10 }),
          focus: vi.fn(),
          inputValue: async () => 'abc',
          dispose: vi.fn(),
        }),
        dispose: vi.fn(),
      }),
      mouse: { move: vi.fn(), down: vi.fn(), up: vi.fn() },
      keyboard: { type: vi.fn(), press: vi.fn() },
    } as unknown as Page;

    await runLlmStep(
      page,
      quietHumanizer(),
      scriptedLlm([{ action: 'type', ref: 1, text: 'hi' }, { action: 'done' }]),
      { goal: 'search', maxIterations: 3 },
    );

    const calls = (page.keyboard.type as unknown as { mock: { calls: string[][] } }).mock.calls;
    expect(calls.map((c) => c[0]).join('')).toContain('hi');
    expect(calls.every((c) => typeof c[0] === 'string' && c[0].length === 1)).toBe(true);
  });

  it('refuses to press a key on a page that cannot receive keys', async () => {
    const page = axPage({ role: 'WebArea', name: 'Root' });

    const result = await runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'press', key: 'Enter' }, { action: 'done' }]), {
      goal: 'press',
      maxIterations: 3,
    });

    expect(result.history[0]).toMatchObject({ result: 'failed' });
    expect(result.history[0]?.detail).toContain('LLM_PRESS_UNSUPPORTED');
  });
});

/* --------------------------------------------- real browser integration */

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => Boolean(p));

const executablePath = CHROME_CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

/**
 * These run against a real browser on purpose.
 *
 * The bug this suite covers is a Playwright strict-mode violation: two
 * elements with the same accessible name make `getByRole(role, { name })`
 * ambiguous, so a ref-derived click can only work if it is anchored to the
 * element itself. A mock cannot reproduce that.
 */
describe.skipIf(!executablePath)('pageTree: real browser', () => {
  const SERP = `<!doctype html><html><head><title>Real SERP</title></head><body>
    <input type="text" name="q" aria-label="Search">
    <main><h1>Results</h1>
      <a href="one.html">Read more</a>
      <a href="two.html">Read more</a>
      <a href="three.html">Read more</a>
    </main></body></html>`;

  /** The SERP links to sibling files, so a real click lands on a real page. */
  function writeSerp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-pagetree-'));
    for (const slug of ['one', 'two', 'three']) {
      fs.writeFileSync(
        path.join(dir, `${slug}.html`),
        `<!doctype html><title>Result ${slug}</title><body><h1>Result ${slug}</h1>` +
          `<p>Body copy the model is asked to read.</p></body>`,
        'utf8',
      );
    }
    const serp = path.join(dir, 'serp.html');
    fs.writeFileSync(serp, SERP, 'utf8');
    return `file:///${serp.replace(/\\/g, '/')}`;
  }

  // One browser for the whole block. Launching per test costs seconds and, in a
  // full parallel suite, starves the supervisor tests that also spawn real
  // processes.
  let browser: import('playwright-core').Browser | undefined;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({
      executablePath: executablePath as string,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    browser = undefined;
  });

  async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    if (!browser) throw new Error('real browser was not launched');
    const page = await (await browser.newContext()).newPage();
    await page.goto(writeSerp(), { waitUntil: 'domcontentloaded' });
    try {
      return await fn(page);
    } finally {
      await page.context().close();
    }
  }

  it('resolves each identically named link to a different element', async () => {
    await withPage(async (page) => {
      const tree = await extractPageTree(page);
      const links = tree.nodes.filter((n) => n.role === 'link');

      expect(tree.source).toBe('dom');
      expect(tree.url).toContain('serp.html');
      expect(tree.title).toBe('Real SERP');
      expect(links).toHaveLength(3);

      const boxes: string[] = [];
      const hrefs: string[] = [];
      for (const node of links) {
        const target = (await resolveTreeNode(page, tree, node.ref)) as ElementHandle;
        expect(target).toBeTruthy();
        const box = await target.boundingBox();
        boxes.push(`${Math.round(box?.x ?? -1)},${Math.round(box?.y ?? -1)}`);
        hrefs.push((await target.getAttribute('href')) ?? '');
        await target.dispose();
      }

      // This is the regression: the old code derived one ambiguous
      // getByRole('link', { name: 'Read more' }) for all three and could click
      // none of them.
      expect(new Set(boxes).size).toBe(3);
      expect(hrefs).toEqual(['one.html', 'two.html', 'three.html']);
    });
  }, 60000);

  it('leaves no automation fingerprint in the page', async () => {
    await withPage(async (page) => {
      const tree = await extractPageTree(page);
      const target = (await resolveTreeNode(page, tree, 1)) as ElementHandle | null;
      await target?.dispose();

      const attributes = await page.evaluate(
        `Array.from(document.querySelectorAll('*')).filter(e => Array.from(e.attributes).some(a => /tersoo|playwright|puppeteer|selenium|cdp|data-ai/i.test(a.name))).length`,
      );
      const globals = await page.evaluate(
        `Object.keys(window).filter(k => /tersoo|playwright|puppeteer|selenium|cdp/i.test(k)).length`,
      );

      expect(attributes).toBe(0);
      expect(globals).toBe(0);
    });
  }, 60000);

  it('drives a real click through the loop and lands on the chosen result', async () => {
    await withPage(async (page) => {
      const tree = await extractPageTree(page);
      const links = tree.nodes.filter((n) => n.role === 'link');
      const turns: LlmStepContext[] = [];

      // The model picks the second of three identical-looking results. Only an
      // exact ref anchor can make that land on the right one.
      const result = await runLlmStep(
        page,
        quietHumanizer(),
        scriptedLlm(
          [
            { action: 'click', ref: links[1]?.ref ?? 0 },
            { action: 'done' },
          ],
          turns,
        ),
        { goal: 'open the second result', maxIterations: 4 },
      );

      expect(result.iterations).toBe(2);
      expect(result.history[0]).toMatchObject({ action: 'click', result: 'ok' });
      // The click really navigated, to the page the chosen ref stood for.
      expect(result.finalUrl).toContain('two.html');
      // The next turn is told where the browser ended up and what it did.
      expect(turns[1]?.history).toHaveLength(1);
      expect(turns[1]?.history?.[0]?.urlAfter).toContain('two.html');
    });
  }, 60000);
});
