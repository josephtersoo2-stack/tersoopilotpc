import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';

import { XPathResolver } from '../src/crosshair/XPathResolver';
import { extractPageTree, formatPageTree, organicResultNodes } from '../src/crosshair/pageTree';
import {
  buildOrganicListScript,
  buildPickOrganicScript,
  isEngineInternalUrl,
  ORGANIC_LINK_PREDICATE_SRC,
} from '../src/crosshair/serpResults';
import { pickPreferredResult } from '../src/task/steps/llmStep';

/**
 * A SERP with everything that makes result selection ambiguous: a sponsored
 * block, nav tabs, results wrapped in `aria-expanded` containers, a "People
 * also ask" accordion, related searches, pagination and a footer.
 *
 * The organic results, in order, are runnersworld, rei, gearlab, healthline.
 */
const SERP = `<!doctype html>
<html><head><title>best running shoes - Google Search</title><style>
  body { font-family: Arial, sans-serif; margin: 0; }
  .nav { background:#f1f3f4; padding:10px; }
  .nav a { margin-right:14px; color:#1967d2; }
  .res { padding:14px 20px; border-bottom:1px solid #eee; }
  .res h3 { margin:0 0 4px; font-size:17px; }
  .ad { background:#fffbe6; padding:10px; }
  .pala { border:1px solid #ddd; padding:10px; margin:12px 20px; }
  .foot a { color:#5f6368; margin-right:10px; }
</style></head>
<body>
  <div class="nav">
    <a href="https://www.google.com/search?q=web&amp;tbm=isch">Images</a>
    <a href="https://news.google.com/search?q=shoes">News</a>
    <a href="https://maps.google.com/?q=shoes">Maps</a>
  </div>
  <div id="tads">
    <div class="ad" data-text-ad="1">
      <a href="https://www.shoeads.example/buy">Sponsored - Buy Running Shoes</a>
    </div>
  </div>
  <div class="res" data-hveid="CAEQAA" jsname="UWckNb" aria-expanded="false">
    <a href="https://www.runnersworld.com/gear/best-shoes" jsname="UWckNb">
      <h3>Best Running Shoes, Tested by Runners</h3>
    </a>
  </div>
  <div class="res" data-hveid="CAEQAB" aria-expanded="false">
    <a href="https://www.rei.com/search?q=running+shoes" aria-expanded="false">
      <h3>Running Shoes - REI</h3>
    </a>
  </div>
  <div class="pala" role="region" aria-label="People also ask">
    <div class="related-question-pair">
      <h3>Are running shoes good for walking?</h3>
      <a href="https://www.google.com/search?q=are+running+shoes+good">People also ask</a>
    </div>
  </div>
  <div class="res" data-hveid="CAEQAC" aria-expanded="true">
    <a href="https://www.gearlab.com/running/shoes">
      <h3>The 12 Best Running Shoes of 2025</h3>
    </a>
  </div>
  <div class="res" data-hveid="CAEQAD">
    <a href="https://www.healthline.com/foot-care">
      <h3>How to Pick the Right Running Shoe</h3>
    </a>
  </div>
  <div>
    <h2>Related searches</h2>
    <a href="https://www.google.com/search?q=best+trail+shoes">best trail shoes</a>
  </div>
  <div class="nav">
    <a href="https://www.google.com/search?q=shoes&amp;start=10">Next</a>
  </div>
  <div class="foot">
    <a href="https://support.google.com/websearch">Help</a>
  </div>
</body></html>`;

/** The four links a correct resolver may return, in order. */
const ORGANIC = [
  'https://www.runnersworld.com/gear/best-shoes',
  'https://www.rei.com/search?q=running+shoes',
  'https://www.gearlab.com/running/shoes',
  'https://www.healthline.com/foot-care',
];

const FORBIDDEN = [
  'shoeads.example',
  'google.com',
  'support.google.com',
];

async function hrefOf(resolved: { locator?: { first(): { getAttribute(s: string): Promise<string | null> } } }): Promise<string> {
  const el = resolved.locator?.first();
  return (await el?.getAttribute('href')) ?? '';
}

/* ----------------------------------------------------------------- units */

describe('serpResults: shared script shape', () => {
  it('is built as source text, not a function', () => {
    // A named function handed to page.evaluate is rewritten by esbuild's
    // keepNames (enabled by tsx and vitest) into a call to a `__name` helper
    // that does not exist in the page, so the callback throws and the code
    // path silently no-ops. Strings are immune.
    expect(typeof ORGANIC_LINK_PREDICATE_SRC).toBe('string');
    expect(ORGANIC_LINK_PREDICATE_SRC).not.toContain('__name');
    expect(buildOrganicListScript()).not.toContain('__name');
    expect(buildPickOrganicScript(0, 'a', 'b')).not.toContain('__name');
  });

  it('embeds the requested index and marker names', () => {
    const script = buildPickOrganicScript(2, 'data-x', 'y');
    expect(script).toContain('var TARGET_INDEX = 2;');
    expect(script).toContain('"data-x"');
    expect(script).toContain('"y"');
  });

  it('clamps a negative index rather than indexing from the end', () => {
    expect(buildPickOrganicScript(-5, 'a', 'b')).toContain('var TARGET_INDEX = 0;');
  });

  it('does not reject results merely because a container sets aria-expanded', () => {
    // The regression: a blanket `[aria-expanded]` ancestor test discarded most
    // real Google results, so "the Nth result" fell through to raw CSS order.
    expect(ORGANIC_LINK_PREDICATE_SRC).not.toContain("closest('[aria-expanded=");
  });

  it('still rejects ads, widgets and chrome', () => {
    expect(ORGANIC_LINK_PREDICATE_SRC).toContain('TERSOO_AD_MARKERS');
    expect(ORGANIC_LINK_PREDICATE_SRC).toContain('TERSOO_WIDGET_MARKERS');
    expect(ORGANIC_LINK_PREDICATE_SRC).toContain('TERSOO_CHROME_MARKERS');
  });
});

describe('serpResults: isEngineInternalUrl', () => {
  it('treats links back to the engine as internal', () => {
    expect(isEngineInternalUrl('https://www.google.com/search?q=x', 'www.google.com')).toBe(true);
    expect(isEngineInternalUrl('https://news.google.com/search?q=x', 'www.google.com')).toBe(true);
    expect(isEngineInternalUrl('https://www.bing.com/search?q=x', 'www.bing.com')).toBe(true);
  });

  it('unwraps the /url?q= redirect Google uses', () => {
    expect(isEngineInternalUrl('/url?q=https://example.com/page&sa=U', 'www.google.com')).toBe(false);
  });

  it('treats an ordinary outbound result as external', () => {
    expect(isEngineInternalUrl('https://www.runnersworld.com/gear', 'www.google.com')).toBe(false);
  });

  it('rejects anchors and javascript: hrefs', () => {
    expect(isEngineInternalUrl('#top', 'www.google.com')).toBe(true);
    expect(isEngineInternalUrl('javascript:void(0)', 'www.google.com')).toBe(true);
    expect(isEngineInternalUrl('', 'www.google.com')).toBe(true);
  });
});

/* --------------------------------------------------------- real browser */

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
 * Both selection paths are checked against a real browser, because the failure
 * was a disagreement between a page-side DOM walk and a CSS selector engine.
 * A mock cannot express "this container has aria-expanded".
 */
describe.skipIf(!executablePath)('serpResults: on a real SERP', () => {
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

  async function withSerp<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    if (!browser) throw new Error('real browser was not launched');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-serp-'));
    const file = path.join(dir, 'serp.html');
    fs.writeFileSync(file, SERP, 'utf8');
    const page = await (await browser.newContext()).newPage();
    await page.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'domcontentloaded' });
    try {
      return await fn(page);
    } finally {
      await page.context().close();
    }
  }

  it('resolves the first organic result, not the last one it used to return', async () => {
    await withSerp(async (page) => {
      const href = await hrefOf(await new XPathResolver().resolve(page, 'intent:search_result:0', { timeoutMs: 2000 }));
      expect(href).toBe(ORGANIC[0]);
    });
  }, 60000);

  it('results 0, 1 and 2 are three consecutive results of one ordered list', async () => {
    await withSerp(async (page) => {
      const resolver = new XPathResolver();
      const hrefs: string[] = [];
      for (const n of [0, 1, 2]) {
        hrefs.push(await hrefOf(await resolver.resolve(page, `intent:search_result:${n}`, { timeoutMs: 2000 })));
      }
      // Consistency is the point: previously 0 came from the DOM walk while 1
      // and 2 fell through to raw CSS ordering, so the three disagreed.
      expect(hrefs).toEqual([ORGANIC[0], ORGANIC[1], ORGANIC[2]]);
    });
  }, 60000);

  it('never resolves a result to an ad, an engine link or the footer', async () => {
    await withSerp(async (page) => {
      const resolver = new XPathResolver();
      for (const n of [0, 1, 2, 3]) {
        const href = await hrefOf(await resolver.resolve(page, `intent:search_result:${n}`, { timeoutMs: 2000 }));
        if (!href) continue;
        for (const bad of FORBIDDEN) {
          expect(href).not.toContain(bad);
        }
      }
    });
  }, 60000);

  it('marks exactly the organic results in the page tree', async () => {
    await withSerp(async (page) => {
      const tree = await extractPageTree(page);
      expect(tree.source).toBe('dom');

      const marked = tree.nodes.filter((n) => n.result);
      expect(marked.map((n) => n.href)).toEqual(ORGANIC);

      // The things that used to be clickable candidates are not results.
      const names = tree.nodes.map((n) => n.name);
      for (const junk of ['Images', 'News', 'Maps', 'People also ask', 'best trail shoes', 'Next', 'Help']) {
        expect(names).toContain(junk);
      }
      const junkNodes = tree.nodes.filter((n) => n.name && ['Images', 'People also ask', 'Next', 'Help'].includes(n.name));
      for (const node of junkNodes) expect(node.result).not.toBe(true);
    });
  }, 60000);

  it('shows the result marker to the model in the rendered tree', async () => {
    await withSerp(async (page) => {
      const text = formatPageTree(await extractPageTree(page));
      expect(text).toContain('(result)');

      // The first organic result is marked; its ref is whatever it is, so this
      // does not depend on how many nav links precede it.
      expect(text).toMatch(
        /\[\d+\] link "Best Running Shoes, Tested by Runners" href="https:\/\/www\.runnersworld\.com\/gear\/best-shoes" \(result\)/,
      );

      // A nav link is listed but not marked.
      expect(text).toMatch(/\[\d+\] link "Images" href="[^"]*"/);
      expect(text).not.toMatch(/\[\d+\] link "Images"[^\n]*\(result\)/);
    });
  }, 60000);

  it('only ever prefers a genuine result, across many runs', async () => {
    await withSerp(async (page) => {
      const tree = await extractPageTree(page);
      const picked = new Set<number>();

      for (let i = 0; i < 40; i++) {
        const ref = pickPreferredResult(tree, `run-${i}`);
        expect(ref).not.toBeNull();
        const node = tree.nodes.find((n) => n.ref === ref);
        expect(node?.result).toBe(true);
        expect(ORGANIC).toContain(node?.href);
        picked.add(ref as number);
      }

      // Still varied: this is what stops every run opening the same video.
      expect(picked.size).toBeGreaterThan(1);
    });
  }, 60000);

  it('is deterministic for the same run so a retry reproduces the choice', async () => {
    await withSerp(async (page) => {
      const tree = await extractPageTree(page);
      expect(pickPreferredResult(tree, 'same-run')).toBe(pickPreferredResult(tree, 'same-run'));
    });
  }, 60000);

  it('agrees between the two paths: result N is what the picker may choose', async () => {
    await withSerp(async (page) => {
      const tree = await extractPageTree(page);
      const results = organicResultNodes(tree);
      const resolver = new XPathResolver();
      const viaIntent = await hrefOf(await resolver.resolve(page, 'intent:search_result:1', { timeoutMs: 2000 }));
      // The LLM hint and the intent selector index the same ordered list.
      expect(viaIntent).toBe(results[1]?.href);
    });
  }, 60000);
});
