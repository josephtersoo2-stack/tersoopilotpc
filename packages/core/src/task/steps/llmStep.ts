import type { Page } from 'playwright-core';

import { canReceiveText, extractPageTree, organicResultNodes, resolveTreeNode, type PageTree, type TreeTarget } from '../../crosshair/pageTree';
import type { Humanizer } from '../../crosshair/Humanizer';
import type { LlmService } from '../../llm/LlmService';
import type { LlmActionRecord, LlmDecision, LlmPersonaContext } from '../../llm/types';
import { mulberry32 } from '../../crosshair/prng';
import type { CaptchaInfo } from '../captchaDetector';
import { maintainPage, waitWhileMaintaining } from './pageMaintenance';

export interface LlmStepInput {
  goal: string;
  maxIterations?: number;
  /**
   * Returns a currently-live page for this run.
   *
   * The LLM step waits on a network call between every action, so the handle
   * captured at launch can be closed or replaced in the meantime. Re-acquiring
   * per iteration is what keeps a long run from failing on a stale reference.
   */
  resolvePage?: PageResolver | undefined;
  /**
   * Stable per-run seed. Used to vary which result gets opened, so repeated
   * runs of the same task are not byte-identical.
   */
  selectionSeed?: string | number | undefined;
  /** The browsing profile this run belongs to, so the model can act in character. */
  persona?: LlmPersonaContext | null | undefined;
  /** Invoked when a challenge is seen while the page is being maintained. */
  onCaptcha?: ((info: CaptchaInfo) => Promise<void> | void) | undefined;
}

export interface LlmStepResult {
  iterations: number;
  finalDecision: LlmDecision;
  /** Everything the model was told it had already done. */
  history: LlmActionRecord[];
  /** Where the browser ended up. */
  finalUrl: string;
}

/** Returns a live page, or null/undefined when none is available. */
export type PageResolver = () => Page | null | undefined | Promise<Page | null | undefined>;

/**
 * How many times the model may ask for the exact same action in a row before
 * the step gives up.
 *
 * Without this, a model that cannot find a working ref asks again until the
 * iteration cap, spending the whole budget on one failed idea.
 */
const MAX_IDENTICAL_ACTIONS = 3;

/** Upper bound on how many result links are considered for the variety pick. */
const MAX_RESULT_CANDIDATES = 12;

/**
 * Whether repeating this action is a sign of a stuck model.
 *
 * `wait` is exempt, and deliberately so. A goal like "watch playback for 20-30
 * seconds, then return done" is *satisfied* by waiting repeatedly; treating the
 * second wait as a no-progress loop kills the step mid-watch. A real run died
 * exactly this way after burning seventeen minutes of budget.
 */
function countsAsStuck(decision: LlmDecision): boolean {
  return decision.action !== 'wait';
}

/**
 * Picks the result this run should open.
 *
 * A model asked to "locate a video thumbnail" with no further constraint will
 * pick the first one, every single time, and a profile that always opens the
 * same video is trivially detectable. The choice is seeded per run so it
 * varies between runs while staying reproducible for one.
 *
 * Returns null when the page offers no obvious candidates, which is the normal
 * state before a search has returned anything.
 */
export function pickPreferredResult(tree: PageTree, seed: string | number | undefined): number | null {
  // Only genuine results are candidates. Depth was tried here and is useless on
  // a SERP: nav links, results and pagination all sit at the same depth, so the
  // picker was choosing among "Images", "People also ask" and related searches
  // as often as real results.
  const candidates = organicResultNodes(tree).slice(0, MAX_RESULT_CANDIDATES);

  if (candidates.length === 0) return null;

  const rng = mulberry32(hashSeed(seed ?? tree.url));
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index]?.ref ?? null;
}

function hashSeed(seed: string | number): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isLivePage(page: Page | null | undefined): page is Page {
  if (!page) return false;
  // A real Playwright page always exposes isClosed(). A page-like object that
  // does not cannot have reported itself closed, so treat it as usable.
  if (typeof page.isClosed !== 'function') return true;
  try {
    return !page.isClosed();
  } catch {
    // Throwing here means the underlying context is gone.
    return false;
  }
}

/**
 * Returns a usable page, preferring the resolver (the authoritative source) and
 * falling back to the handle the run was started with.
 *
 * Throws a clear, tagged error when no live page remains, instead of letting
 * Playwright fail later with "Target page, context or browser has been closed".
 */
export async function resolveLivePage(
  fallback: Page,
  resolver?: PageResolver,
): Promise<Page> {
  if (resolver) {
    let candidate: Page | null | undefined;
    try {
      candidate = await resolver();
    } catch {
      candidate = undefined;
    }
    if (isLivePage(candidate)) return candidate;
  }
  if (isLivePage(fallback)) return fallback;

  throw new Error(
    'LLM_PAGE_CLOSED: the browser page for this run is no longer open. The browser was ' +
      'closed, crashed, or replaced its tab while the model was deciding. Relaunch the ' +
      'profile and retry the run.',
  );
}

function readUrl(page: Page): string {
  try {
    if (typeof page.url === 'function') return page.url();
  } catch {
    // Page is being torn down.
  }
  return '';
}

function describeTarget(tree: PageTree, decision: LlmDecision): string {
  const ref = 'ref' in decision ? decision.ref : undefined;
  if (ref === undefined) return '';
  const node = tree.nodes.find((n) => n.ref === ref);
  return node ? `${node.role} "${node.name}"` : `ref ${ref}`;
}

/** Identity of an action, used to spot a model stuck in a loop. */
function actionSignature(tree: PageTree, decision: LlmDecision): string {
  const ref = 'ref' in decision ? decision.ref : '';
  const extra =
    decision.action === 'type'
      ? decision.text
      : decision.action === 'navigate'
        ? decision.url
        : decision.action === 'scroll'
          ? decision.direction
          : decision.action === 'press'
            ? decision.key
            : '';
  return `${decision.action}|${ref}|${extra}|${describeTarget(tree, decision)}`;
}

/**
 * Rejects a decision that cannot be carried out against the current tree.
 *
 * Returning the reason instead of throwing is what lets the loop tell the model
 * "that ref does not exist" and try again rather than aborting the run on a
 * hallucinated element.
 */
export function validateDecision(
  decision: LlmDecision,
  tree: PageTree,
): { ok: true } | { ok: false; error: string } {
  if (decision.action === 'click' || decision.action === 'type') {
    const node = tree.nodes.find((n) => n.ref === decision.ref);
    if (!node) {
      const first = tree.nodes[0]?.ref;
      const last = tree.nodes[tree.nodes.length - 1]?.ref;
      const known = first === undefined ? 'none' : `${first}..${last}`;
      return {
        ok: false,
        error: `There is no element with ref ${decision.ref} in the current page tree (available refs: ${known}). Re-read the tree and pick a ref that is listed.`,
      };
    }
    if (node.disabled && decision.action === 'click') {
      return { ok: false, error: `Element ${decision.ref} (${node.role} "${node.name}") is disabled and cannot be clicked.` };
    }
    if (decision.action === 'type' && !canReceiveText(node.role)) {
      return {
        ok: false,
        error: `Element ${decision.ref} is a ${node.role}, not a text field, so it cannot receive typed text. Pick a textbox, searchbox or combobox.`,
      };
    }
  }

  return { ok: true };
}

export async function runLlmStep(
  page: Page,
  humanizer: Humanizer,
  llm: LlmService,
  input: LlmStepInput,
): Promise<LlmStepResult> {
  const max = input.maxIterations ?? 10;
  const history: LlmActionRecord[] = [];

  let lastError: string | null = null;
  let lastSignature: string | null = null;
  let identicalCount = 0;
  let finalUrl = readUrl(page);

  for (let i = 0; i < max; i++) {
    // Re-acquire every iteration: the page may have been replaced since the
    // previous step, and the model call in between takes tens of seconds.
    const livePage = await resolveLivePage(page, input.resolvePage);

    // Keep the page usable before the model ever sees it: dismiss a consent
    // banner, skip an ad that started on its own, and notice a challenge.
    // This runs before the tree is taken so the model is never shown a page
    // that is half-covered by an overlay it cannot click through.
    const maintenance = await maintainPage(livePage, { humanizer }).catch(() => null);

    if (maintenance?.adSkipped) {
      console.log(`[LLM Step] Iteration ${i + 1}/${max} -> skipped a video advertisement`);
    }
    if (maintenance?.captcha) {
      await input.onCaptcha?.(maintenance.captcha);
      throw new Error(
        `CAPTCHA_DETECTED:${maintenance.captcha.type} challenge is on screen and was not solved`,
      );
    }

    const tree = await extractPageTree(livePage);
    if (tree.domError) {
      // Not fatal - the accessibility fallback is in use - but the run log has
      // to say so, or an unusable page looks like a model failure.
      console.warn(`[LLM Step] DOM walk unavailable, using accessibility snapshot: ${tree.domError}`);
    }

    const decision = await llm.decideFromTree(tree, input.goal, {
      iteration: i + 1,
      maxIterations: max,
      history,
      lastError,
      preferredResultRef: pickPreferredResult(tree, input.selectionSeed),
      persona: input.persona ?? null,
    });

    console.log(
      `[LLM Step] Iteration ${i + 1}/${max} on ${tree.url || 'unknown url'} -> Action: ${decision.action}` +
        (decision.action === 'type' ? ` text="${decision.text}" pressEnter=${decision.pressEnter}` : '') +
        (decision.action === 'click' ? ` ref=${decision.ref}` : '') +
        (decision.action === 'navigate' ? ` url="${decision.url}"` : '') +
        ` (${tree.nodes.length} elements, ${tree.source} tree)`,
    );

    if (decision.action === 'done') {
      return { iterations: i + 1, finalDecision: decision, history, finalUrl: tree.url || finalUrl };
    }
    if (decision.action === 'unsolvable') {
      throw new Error(`LLM_UNSOLVABLE:${decision.reason}`);
    }

    const validity = validateDecision(decision, tree);
    if (!validity.ok) {
      console.warn(`[LLM Step] Rejected decision: ${validity.error}`);
      history.push({
        iteration: i + 1,
        action: decision.action,
        target: describeTarget(tree, decision),
        result: 'rejected',
        detail: validity.error,
        urlAfter: tree.url,
      });
      lastError = validity.error;
      continue;
    }

    const signature = actionSignature(tree, decision);
    identicalCount = signature === lastSignature ? identicalCount + 1 : 0;
    lastSignature = signature;
    if (countsAsStuck(decision) && identicalCount + 1 >= MAX_IDENTICAL_ACTIONS) {
      history.push({
        iteration: i + 1,
        action: decision.action,
        target: describeTarget(tree, decision),
        result: 'rejected',
        detail: 'The model repeated the same action without progress.',
        urlAfter: tree.url,
      });
      throw new Error(
        `LLM_MAX_ITERATIONS:the model repeated "${signature.split('|').slice(0, 3).join(' ')}" ` +
          `${MAX_IDENTICAL_ACTIONS} times with no page change. It could not find a working way to ` +
          `satisfy the goal "${input.goal}".`,
      );
    }

    try {
      await executeDecision(livePage, humanizer, tree, decision, input.resolvePage, input.onCaptcha);
      finalUrl = readUrl(livePage) || tree.url;
      history.push({
        iteration: i + 1,
        action: decision.action,
        target: describeTarget(tree, decision),
        result: 'ok',
        urlAfter: finalUrl,
      });
      lastError = null;
    } catch (err) {
      // Recorded, not swallowed: the next turn tells the model exactly what
      // failed so it can pick a different route instead of retrying blindly.
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[LLM Step] Action failed: ${detail}`);
      history.push({
        iteration: i + 1,
        action: decision.action,
        target: describeTarget(tree, decision),
        result: 'failed',
        detail,
        urlAfter: readUrl(livePage) || tree.url,
      });
      lastError = `The previous ${decision.action} on ${describeTarget(tree, decision) || 'the page'} failed: ${detail}`;
    }

    // The action may have closed or replaced the tab, so resolve again before
    // spending the idle delay on a dead handle.
    const afterAction = await resolveLivePage(livePage, input.resolvePage).catch(() => livePage);
    await humanizer.idle(afterAction, 1000, 3000);
  }

  const lastAction = history[history.length - 1];
  throw new Error(
    `LLM_MAX_ITERATIONS:the model used all ${max} iterations without reporting the goal ` +
      `as done. Last action: ${
        lastAction ? `${lastAction.action} (${lastAction.result})` : 'none'
      }.`,
  );
}

async function disposeTarget(target: TreeTarget): Promise<void> {
  const dispose = (target as { dispose?: () => unknown }).dispose;
  if (typeof dispose !== 'function') return;
  // `dispose` is not contractually a promise, so it is normalised here rather
  // than awaited blindly.
  try {
    await Promise.resolve(dispose.call(target));
  } catch {
    // Releasing a handle is best effort.
  }
}

async function settleAfterNavigation(
  page: Page,
  node: { role: string; name: string } | null,
  humanizer?: Humanizer,
): Promise<void> {
  const isNavigational =
    node?.role === 'link' ||
    node?.name.toLowerCase().includes('youtube') ||
    node?.name.toLowerCase().includes('http');
  if (!isNavigational) return;
  if (typeof page.waitForLoadState === 'function') {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  }
  // A fresh page is the most likely place for a consent banner to appear.
  await maintainPage(page, { humanizer, checkAds: false, checkCaptcha: false }).catch(() => null);
}

async function executeDecision(
  page: Page,
  humanizer: Humanizer,
  tree: PageTree,
  decision: LlmDecision,
  resolver?: PageResolver,
  onCaptcha?: (info: CaptchaInfo) => Promise<void> | void,
): Promise<void> {
  // Clicking a link or a button that opens a new tab leaves the current handle
  // pointing at a page the step no longer controls, so every action starts from
  // a freshly resolved, open page.
  const target = await resolveLivePage(page, resolver);

  switch (decision.action) {
    case 'click': {
      const element = await resolveTreeNode(target, tree, decision.ref);
      if (!element) {
        throw new Error(`LLM_REF_NOT_FOUND:${decision.ref} (the element is no longer on the page)`);
      }
      try {
        await humanizer.clickTarget(target, element);
      } finally {
        await disposeTarget(element);
      }
      await settleAfterNavigation(target, tree.nodes.find((n) => n.ref === decision.ref) ?? null, humanizer);
      break;
    }
    case 'type': {
      const element = await resolveTreeNode(target, tree, decision.ref);
      if (!element) {
        throw new Error(`LLM_REF_NOT_FOUND:${decision.ref} (the field is no longer on the page)`);
      }
      try {
        const text = decision.text;
        const shouldPressEnter = decision.pressEnter || text.endsWith('\n') || text.endsWith('\r');
        const cleanText = text.replace(/[\r\n]+$/, '');

        if (cleanText) {
          await humanizer.typeIntoTarget(target, element, cleanText);
        }

        if (shouldPressEnter) {
          if (typeof target.keyboard?.press === 'function') {
            await target.keyboard.press('Enter');
          }
          if (typeof target.waitForLoadState === 'function') {
            await target.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
          }
        }
      } finally {
        await disposeTarget(element);
      }
      break;
    }
    case 'press': {
      if (typeof target.keyboard?.press !== 'function') {
        throw new Error('LLM_PRESS_UNSUPPORTED: this page cannot receive key presses');
      }
      await target.keyboard.press(decision.key);
      break;
    }
    case 'scroll':
      await humanizer.scroll(target, decision.direction, decision.amount);
      break;
    case 'navigate':
      await target.goto(decision.url, { waitUntil: 'domcontentloaded' });
      // Consent is a must-accept on any site, and a fresh navigation is exactly
      // when a banner is served.
      await maintainPage(target, { humanizer, checkAds: false, checkCaptcha: false }).catch(() => null);
      break;
    case 'wait': {
      // A wait is not a pause, it is time spent on the page. It is sliced so a
      // consent banner, a pre-roll or a challenge that appears mid-wait is
      // handled now rather than after the step ends. This is what makes
      // "skip the ad, then watch 30 seconds" work.
      const outcome = await waitWhileMaintaining(target, decision.ms, {
        humanizer,
        ...(onCaptcha ? { onChallenge: onCaptcha } : {}),
      });

      if (outcome.adSkipped) {
        console.log(`[LLM Step] Skipped an advertisement while waiting (${Math.round(outcome.elapsedMs / 1000)}s watched)`);
      }
      if (outcome.challenges.length > 0) {
        throw new Error(
          `CAPTCHA_DETECTED:${outcome.challenges[0]?.type ?? 'generic'} challenge appeared while waiting`,
        );
      }
      break;
    }
  }
}
