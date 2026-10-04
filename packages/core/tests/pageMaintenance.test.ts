import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright-core';

import { trySkipAd } from '../src/crosshair/AdSkipper';
import { ConsentEngine } from '../src/crosshair/ConsentEngine';
import { Humanizer } from '../src/crosshair/Humanizer';
import { detectCaptcha } from '../src/task/captchaDetector';
import { maintainPage, waitWhileMaintaining } from '../src/task/steps/pageMaintenance';
import { pickPreferredResult, runLlmStep } from '../src/task/steps/llmStep';
import { readPersonaContext, type StepExecutionContext } from '../src/task/StepRunner';
import type { PageTree } from '../src/crosshair/pageTree';
import type { LlmService } from '../src/llm/LlmService';
import type { LlmDecision, LlmStepContext } from '../src/llm/types';
import { TREE_SYSTEM_PROMPT } from '../src/llm/prompts';

/* ------------------------------------------------------------------ helpers */

/** A page double with no DOM at all, so only the fallbacks are exercised. */
function barePage(): Page {
  return {
    isClosed: () => false,
    frames: () => [],
  } as unknown as Page;
}

function resultTree(): PageTree {
  return {
    url: 'https://www.youtube.com/results?search_query=x',
    title: 'x - YouTube',
    source: 'dom',
    nodes: [
      // Nav / chrome links: present in the tree, never result candidates.
      { ref: 1, role: 'link', name: 'Home', depth: 0, href: '/' },
      { ref: 2, role: 'link', name: 'Filter', depth: 0, href: '/results?filter=x' },
      // Genuine results, flagged by the DOM walk's organic-result test.
      { ref: 3, role: 'link', name: 'Result A', depth: 1, href: 'https://www.youtube.com/watch?v=a', result: true },
      { ref: 4, role: 'link', name: 'Result B', depth: 1, href: 'https://www.youtube.com/watch?v=b', result: true },
      { ref: 5, role: 'link', name: 'Result C', depth: 1, href: 'https://www.youtube.com/watch?v=c', result: true },
      { ref: 6, role: 'link', name: 'Result D', depth: 1, href: 'https://www.youtube.com/watch?v=d', result: true },
    ],
    accessibility: null,
    candidates: 6,
    truncated: false,
  };
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
  const humanizer = new Humanizer(5);
  vi.spyOn(humanizer, 'idle').mockResolvedValue(undefined);
  return humanizer;
}

/* ------------------------------------------------------------- ad skipping */

describe('AdSkipper', () => {
  it('does nothing on a page with no player', async () => {
    const page = {
      isClosed: () => false,
      locator: vi.fn().mockReturnValue({
        first: () => ({ boundingBox: async () => null }),
      }),
      mouse: { move: vi.fn() },
    } as unknown as Page;

    expect(await trySkipAd(page)).toEqual({ skipped: false });
  });

  it('reports nothing on a closed page', async () => {
    expect(await trySkipAd({ isClosed: () => true } as unknown as Page)).toEqual({ skipped: false });
  });
});

/* -------------------------------------------------------- captcha detection */

describe('detectCaptcha', () => {
  it('finds nothing on a clean page', async () => {
    const page = {
      isClosed: () => false,
      frames: () => [],
      locator: () => ({ count: async () => 0 }),
    } as unknown as Page;

    expect(await detectCaptcha(page)).toBeNull();
  });

  it('reports the vendor and the frame it was found in', async () => {
    const frame = {
      url: () => 'https://challenges.cloudflare.com/turnstile/v0/api.js',
      locator: (selector: string) => ({
        count: async () => (selector.includes('cloudflare') ? 1 : 0),
      }),
    };
    const page = {
      isClosed: () => false,
      frames: () => [frame],
    } as unknown as Page;

    const found = await detectCaptcha(page);

    expect(found?.type).toBe('turnstile');
    expect(found?.frameUrl).toContain('cloudflare');
  });

  it('looks inside subframes, not only the top document', async () => {
    const mainFrame = { url: () => 'https://site.test', locator: () => ({ count: async () => 0 }) };
    const childFrame = {
      url: () => 'https://site.test/frame',
      locator: (selector: string) => ({
        count: async () => (selector.includes('recaptcha') ? 1 : 0),
      }),
    };
    const page = {
      isClosed: () => false,
      frames: () => [mainFrame, childFrame],
    } as unknown as Page;

    expect((await detectCaptcha(page))?.type).toBe('recaptcha');
  });

  it('returns null on a closed page', async () => {
    expect(await detectCaptcha({ isClosed: () => true } as unknown as Page)).toBeNull();
  });
});

/* ------------------------------------------------------------- maintenance */

describe('maintainPage', () => {
  it('returns a clean result for a page with nothing on it', async () => {
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      locator: () => ({
        first: () => ({ isVisible: async () => false, boundingBox: async () => null }),
        count: async () => 0,
        nth: () => ({ isVisible: async () => false }),
      }),
      evaluate: async () => -1,
    } as unknown as Page;

    expect(await maintainPage(page)).toEqual({
      consentHandled: false,
      adSkipped: false,
      captcha: null,
    });
  });

  it('surfaces a challenge so the caller can act on it', async () => {
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      locator: (selector: string) => ({
        first: () => ({ isVisible: async () => false, boundingBox: async () => null }),
        count: async () => (selector.includes('hcaptcha') ? 1 : 0),
        nth: () => ({ isVisible: async () => false }),
      }),
      evaluate: async () => -1,
    } as unknown as Page;

    const result = await maintainPage(page);
    expect(result.captcha?.type).toBe('hcaptcha');
  });

  it('does nothing at all on a closed page', async () => {
    const page = { isClosed: () => true } as unknown as Page;
    expect(await maintainPage(page)).toEqual({ consentHandled: false, adSkipped: false, captcha: null });
  });
});

describe('waitWhileMaintaining', () => {
  it('waits the full duration when the page stays quiet', async () => {
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      locator: () => ({
        first: () => ({ isVisible: async () => false, boundingBox: async () => null }),
        count: async () => 0,
        nth: () => ({ isVisible: async () => false }),
      }),
      evaluate: async () => -1,
    } as unknown as Page;

    const started = Date.now();
    const outcome = await waitWhileMaintaining(page, 600);

    expect(Date.now() - started).toBeGreaterThanOrEqual(500);
    expect(outcome.challenges).toEqual([]);
  });

  it('caps an absurd wait instead of hanging the run', async () => {
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      locator: () => ({
        first: () => ({ isVisible: async () => false, boundingBox: async () => null }),
        count: async () => 0,
        nth: () => ({ isVisible: async () => false }),
      }),
      evaluate: async () => -1,
    } as unknown as Page;

    // 0 is falsy and must not be read as "no cap at all".
    const outcome = await waitWhileMaintaining(page, 0);
    expect(outcome.elapsedMs).toBe(0);
  });

  it('stops early and reports a challenge that appears mid-wait', async () => {
    let polls = 0;
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      locator: (selector: string) => ({
        first: () => ({ isVisible: async () => false, boundingBox: async () => null }),
        count: async () => {
          polls += 1;
          return selector.includes('turnstile') ? 1 : 0;
        },
        nth: () => ({ isVisible: async () => false }),
      }),
      evaluate: async () => -1,
    } as unknown as Page;

    const onChallenge = vi.fn();
    const outcome = await waitWhileMaintaining(page, 4000, { onChallenge });

    expect(polls).toBeGreaterThan(0);
    expect(outcome.challenges).toHaveLength(1);
    expect(onChallenge).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------- result variety picking */

describe('pickPreferredResult', () => {
  it('returns null when the page has no link candidates yet', () => {
    const empty: PageTree = {
      url: 'https://www.youtube.com/',
      title: 'YouTube',
      source: 'dom',
      nodes: [{ ref: 1, role: 'textbox', name: 'Search', depth: 0 }],
      accessibility: null,
      candidates: 1,
      truncated: false,
    };
    expect(pickPreferredResult(empty, 'run-1')).toBeNull();
  });

  it('ignores navigation and chrome links, considering only flagged results', () => {
    const picks = new Set<number>();
    for (let i = 0; i < 40; i++) picks.add(pickPreferredResult(resultTree(), `run-${i}`) as number);
    // refs 1 and 2 are nav/chrome and must never be chosen.
    expect(picks.has(1)).toBe(false);
    expect(picks.has(2)).toBe(false);
    for (const ref of picks) expect([3, 4, 5, 6]).toContain(ref);
  });

  it('varies the choice between runs instead of always taking the first result', () => {
    const picks = new Set<number>();
    for (let i = 0; i < 60; i++) picks.add(pickPreferredResult(resultTree(), `run-${i}`) as number);
    // The whole point: repeated runs must not all open the same video.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('is deterministic for the same run, so a retry reproduces the same choice', () => {
    const a = pickPreferredResult(resultTree(), 'same-run');
    const b = pickPreferredResult(resultTree(), 'same-run');
    expect(a).toBe(b);
  });
});

/* ------------------------------------------------------- the watch scenario */

describe('llmStep: watching a video', () => {
  /**
   * This is the regression that killed a real run.
   *
   * The goal was "watch playback for 20-30 seconds, then return done", so the
   * model's only correct move is to wait, repeatedly. Treating the second wait
   * as a stuck loop aborted the step after seventeen minutes of budget.
   */
  it('does not treat repeated waits as a stuck loop', async () => {
    const page = {
      isClosed: () => false,
      url: () => 'https://www.youtube.com/watch?v=abc',
      frames: () => [],
      mainFrame: () => null,
      accessibility: { snapshot: async () => ({ role: 'WebArea', name: 'abc - YouTube' }) },
      locator: () => ({
        first: () => ({ isVisible: async () => false, boundingBox: async () => null }),
        count: async () => 0,
        nth: () => ({ isVisible: async () => false }),
      }),
      evaluate: async () => -1,
    } as unknown as Page;

    const humanizer = quietHumanizer();
    vi.spyOn(humanizer, 'clickLocator').mockResolvedValue(undefined);

    // Five waits in a row, then done: more than the stuck threshold.
    const result = await runLlmStep(
      page,
      humanizer,
      scriptedLlm([
        { action: 'wait', ms: 300 },
        { action: 'wait', ms: 300 },
        { action: 'wait', ms: 300 },
        { action: 'wait', ms: 300 },
        { action: 'wait', ms: 300 },
        { action: 'done', reason: 'watched long enough' },
      ]),
      { goal: 'Verify video is playing. Watch playback for 20-30 seconds, then return done.', maxIterations: 12 },
    );

    expect(result.iterations).toBe(6);
    expect(result.finalDecision.action).toBe('done');
    expect(result.history.filter((h) => h.action === 'wait')).toHaveLength(5);
  });

  it('still gives up when a click is repeated with no progress', async () => {
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      accessibility: {
        snapshot: async () => ({ role: 'WebArea', name: 'R', children: [{ role: 'button', name: 'Next' }] }),
      },
    } as unknown as Page;

    await expect(
      runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'click', ref: 2 }]), {
        goal: 'advance',
        maxIterations: 10,
      }),
    ).rejects.toThrow(/LLM_MAX_ITERATIONS.*repeated/s);
  });

  it('fails the step when a challenge is on screen', async () => {
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      locator: (selector: string) => ({
        first: () => ({ isVisible: async () => false, boundingBox: async () => null }),
        count: async () => (selector.includes('recaptcha') ? 1 : 0),
        nth: () => ({ isVisible: async () => false }),
      }),
      evaluate: async () => -1,
    } as unknown as Page;

    const onCaptcha = vi.fn();
    await expect(
      runLlmStep(page, quietHumanizer(), scriptedLlm([{ action: 'done' }]), {
        goal: 'watch',
        maxIterations: 3,
        onCaptcha,
      }),
    ).rejects.toThrow(/CAPTCHA_DETECTED/);
    expect(onCaptcha).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------- persona */

describe('persona reaches the model', () => {
  const ctx = (variables: Record<string, unknown>): StepExecutionContext =>
    ({
      profileId: 'p',
      taskId: 't',
      runId: 'r',
      stepIndex: 0,
      page: {} as Page,
      variables,
    }) as StepExecutionContext;

  it('builds a persona from the variables the run already publishes', () => {
    const persona = readPersonaContext(
      ctx({
        'persona.name': 'casual',
        'persona.trustScore': '40',
        'persona.maturationStage': 'seeding',
        'persona.engagementRate': '28',
        'persona.typingWpm': '78',
      }),
    );

    expect(persona).toMatchObject({
      name: 'casual',
      trustScore: 40,
      maturationStage: 'seeding',
      engagementRate: 28,
      typingWpm: 78,
    });
  });

  it('falls back to the context persona key when variables are absent', () => {
    const withKey = { ...ctx({}), persona: 'analyst' } as StepExecutionContext;
    expect(readPersonaContext(withKey)).toEqual({ name: 'analyst' });
  });

  it('returns null when there is no persona at all', () => {
    expect(readPersonaContext(ctx({}))).toBeNull();
  });

  it('ignores non-numeric scores rather than passing NaN to the model', () => {
    const persona = readPersonaContext(ctx({ 'persona.trustScore': 'unknown' }));
    expect(persona).toBeNull();
  });

  it('is handed to the model on every turn', async () => {
    const turns: LlmStepContext[] = [];
    const page = {
      isClosed: () => false,
      frames: () => [],
      mainFrame: () => null,
      accessibility: { snapshot: async () => ({ role: 'WebArea', name: 'R' }) },
    } as unknown as Page;

    await runLlmStep(
      page,
      quietHumanizer(),
      scriptedLlm([{ action: 'done' }], turns),
      { goal: 'g', maxIterations: 2, persona: { name: 'casual', trustScore: 40 } },
    );

    expect(turns[0]?.persona).toEqual({ name: 'casual', trustScore: 40 });
  });
});

describe('the prompt tells the model how to behave', () => {
  it('explains that repeating a wait is normal', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('Repeating it is normal and expected');
  });

  it('explains that the preferred result exists so runs are not identical', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('preferredResultRef');
    expect(TREE_SYSTEM_PROMPT).toContain('always opening the first result is a strong automation signal');
  });

  it('explains how trust and maturation shape behaviour', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('trustScore');
    expect(TREE_SYSTEM_PROMPT).toContain('maturationStage');
  });

  it('tells the model to keep handling ads, consent and popups while waiting', () => {
    expect(TREE_SYSTEM_PROMPT).toContain('Skip Ad');
    expect(TREE_SYSTEM_PROMPT).toContain('consent banner');
  });
});

/* --------------------------------------------- real browser: ad + consent */

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
 * These reproduce the two failures from the real run against a real browser:
 * a skip button that is only clickable after the player is hovered, and a
 * consent banner in a language the selector list does not cover.
 */
describe.skipIf(!executablePath)('page maintenance: real browser', () => {
  const PLAYER = `<!doctype html><html><head><title>Player</title><style>
    body { margin: 0; }
    .html5-video-player { position: relative; width: 640px; height: 360px; background: #111; }
    .ytp-ad-skip-button-modern {
      position: absolute; right: 12px; bottom: 60px; padding: 8px 14px;
      opacity: 0; transition: opacity .1s; pointer-events: none;
    }
    .html5-video-player:hover .ytp-ad-skip-button-modern { opacity: 1; pointer-events: auto; }
  </style></head><body>
    <div class="html5-video-player" id="player">
      <video width="640" height="360"></video>
      <button class="ytp-ad-skip-button-modern" id="skip">Skip Ad</button>
    </div>
    <div id="log"></div>
    <script>
      document.getElementById('skip').addEventListener('click', function () {
        document.getElementById('log').textContent = 'ad-skipped';
      });
    </script>
  </body></html>`;

  /** A consent banner whose only accept control is text, as many sites do. */
  const CONSENT = `<!doctype html><html><head><title>Shop</title></head><body>
    <div role="dialog" aria-label="Cookie notice" id="banner">
      <p>We use cookies.</p>
      <button type="button" id="accept">Tout accepter</button>
    </div>
    <main><a href="/next">Continue shopping</a></main>
    <div id="log"></div>
    <script>
      document.getElementById('accept').addEventListener('click', function () {
        document.getElementById('banner').remove();
        document.getElementById('log').textContent = 'accepted';
      });
    </script>
  </body></html>`;

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

  async function withPage<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
    if (!browser) throw new Error('real browser was not launched');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-maint-'));
    const file = path.join(dir, 'page.html');
    fs.writeFileSync(file, html, 'utf8');
    const page = await (await browser.newContext()).newPage();
    await page.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'domcontentloaded' });
    try {
      return await fn(page);
    } finally {
      await page.context().close();
    }
  }

  it('clicks a skip button that only becomes clickable after hovering the player', async () => {
    await withPage(PLAYER, async (page) => {
      // The button is in the DOM the whole time; only :hover makes it usable.
      // This is why a plain visibility check found nothing in the real run.
      expect(await page.locator('#skip').isVisible()).toBe(true);
      expect(await page.evaluate(`getComputedStyle(document.getElementById('skip')).pointerEvents`)).toBe('none');

      const result = await trySkipAd(page);

      expect(result.skipped).toBe(true);
      expect(await page.locator('#log').textContent()).toBe('ad-skipped');
    });
  }, 60000);

  it('skips an ad that appears in the middle of a long wait', async () => {
    await withPage(PLAYER, async (page) => {
      // The wait is sliced, so maintenance runs while the engine is "watching".
      const outcome = await waitWhileMaintaining(page, 3000);

      expect(outcome.adSkipped).toBe(true);
      expect(await page.locator('#log').textContent()).toBe('ad-skipped');
    });
  }, 60000);

  it('accepts a consent banner whose button is only recognisable by its text', async () => {
    await withPage(CONSENT, async (page) => {
      // "Tout accepter" is matched by the semantic pattern list; no CMP
      // selector covers this button, so this path is the only one that can work.
      expect(await ConsentEngine.checkAndHandle(page)).toBe(true);
      expect(await page.locator('#log').textContent()).toBe('accepted');
      expect(await page.locator('#banner').count()).toBe(0);
    });
  }, 60000);

  it('accepts a consent banner using a humanized click when one is supplied', async () => {
    await withPage(CONSENT, async (page) => {
      const humanizer = new Humanizer(9);
      const clicked: Array<{ x: number; y: number }> = [];
      vi.spyOn(humanizer, 'clickAt').mockImplementation(async (_page, x, y) => {
        clicked.push({ x, y });
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.up();
      });

      expect(await ConsentEngine.checkAndHandle(page, { humanizer })).toBe(true);
      expect(clicked).toHaveLength(1);
      expect(await page.locator('#log').textContent()).toBe('accepted');
    });
  }, 60000);

  it('reports no challenge on a normal page', async () => {
    await withPage(CONSENT, async (page) => {
      expect(await detectCaptcha(page)).toBeNull();
    });
  }, 60000);
});
