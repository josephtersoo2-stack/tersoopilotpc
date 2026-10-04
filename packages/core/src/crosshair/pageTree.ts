import type { ElementHandle, Locator, Page } from 'playwright-core';

import { extractAccessibilityTree, type AccessibilityNode } from './accessibility';
import { buildPredicatePrelude, isEngineInternalUrl } from './serpResults';

/**
 * Page understanding for LLM-driven navigation.
 *
 * The `llm` workflow step shows a model a description of the page and the model
 * answers with a `ref` into that description. Two properties make that work:
 *
 *  1. The description must contain the page **URL and title**. Without them the
 *     model cannot tell whether it is already on the requested site, so it
 *     cannot navigate anywhere - the single most common reason an `llm` step
 *     looks like it "does nothing".
 *  2. A `ref` must resolve back to **exactly one** element. Deriving a locator
 *     from an element's role and accessible name (`getByRole('link', { name })`)
 *     is ambiguous the moment a page has two links with the same label, which
 *     is the normal case on a search results page. Playwright then refuses with
 *     a strict-mode violation, the click never happens, and - because the
 *     failure was swallowed - the model is never told, so it asks for the same
 *     thing again until the step runs out of iterations.
 *
 * This module fixes both: it walks the DOM, assigns each visible interactive
 * element a stable `ref`, and resolves a `ref` back to that exact element
 * through a fresh evaluation, without writing a single attribute or global into
 * the page (this is an anti-detection product; the page must not be able to see
 * that it is being inspected).
 */

/** Upper bound on elements described to the model, so the prompt stays small. */
export const MAX_PAGE_TREE_NODES = 300;

/** Longest accessible name kept per node. */
export const MAX_PAGE_TREE_NAME = 120;

export interface PageTreeNode {
  ref: number;
  role: string;
  name: string;
  /** Indentation depth, so the description reads as a tree. */
  depth: number;
  /**
   * True when this element is a genuine search result rather than an ad, an
   * "People also ask" entry, a nav tab, a related search or a footer link.
   *
   * Set by the DOM walk using the same definition `intent:search_result` uses,
   * so "the Nth result" and "the result this run prefers" cannot disagree.
   */
  result?: boolean;
  value?: string;
  href?: string;
  type?: string;
  disabled?: boolean;
  checked?: boolean | 'mixed';
  expanded?: boolean;
  focused?: boolean;
}

/**
 * Where the description came from.
 *
 * `dom` is the real, ref-anchored walk. `accessibility` is Playwright's
 * `page.accessibility` snapshot, used when `page.evaluate` is unavailable
 * (test doubles, drivers that do not expose it); refs there can only be
 * approximated by role + name.
 */
export type PageTreeSource = 'dom' | 'accessibility' | 'empty';

export interface PageTree {
  url: string;
  title: string;
  source: PageTreeSource;
  nodes: PageTreeNode[];
  /** The raw accessibility snapshot, kept for the fallback source. */
  accessibility: AccessibilityNode | null;
  /** How many elements matched before the cap was applied. */
  candidates: number;
  truncated: boolean;
  /** Why the DOM walk could not be used, when it was not. */
  domError?: string;
}

/** A resolved `ref`: either a live element handle or a Playwright locator. */
export type TreeTarget = ElementHandle | Locator;

const READY_STATES = ['domcontentloaded', 'load'] as const;

/**
 * The page-side walker.
 *
 * This is a string, not a function, on purpose. Bundlers rewrite named
 * functions passed to `page.evaluate` into a `__name(...)` helper call, and
 * that helper does not exist inside the page, so the walk would die with
 * `ReferenceError: __name is not defined` the first time the desktop bundle is
 * built. A plain string is serialized verbatim and is immune to that.
 */
const COLLECT_BODY = `
  var SEL =
    'a[href],area[href],button,input,textarea,select,summary,label,' +
    'h1,h2,h3,h4,h5,h6,img,iframe,video,' +
    '[role],[contenteditable="true"],[onclick],[tabindex]:not([tabindex="-1"])';
  var IMPLICIT = {
    A: 'link', AREA: 'link', BUTTON: 'button', INPUT: 'textbox', TEXTAREA: 'textbox',
    SELECT: 'combobox', OPTION: 'option', SUMMARY: 'button', IMG: 'img', IFRAME: 'iframe',
    VIDEO: 'video', LABEL: 'text'
  };
  var CONTAINER = 'main,nav,section,article,aside,header,footer,form,details,fieldset,li,table,ul,ol,dl,div';
  var INTERACTIVE = {
    link: 1, button: 1, textbox: 1, searchbox: 1, combobox: 1, checkbox: 1, radio: 1,
    switch: 1, tab: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1, option: 1,
    slider: 1, spinbutton: 1
  };

  function isVisible(el) {
    if (!el.getClientRects || el.getClientRects().length === 0) return false;
    var cs = window.getComputedStyle(el);
    if (!cs) return false;
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (cs.display === 'none') return false;
    if (Number(cs.opacity) === 0) return false;
    var hidden = el.closest('[aria-hidden="true"],[hidden]');
    if (hidden) return false;
    return true;
  }

  function roleOf(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit.trim().split(/\\s+/)[0];
    var tag = el.tagName;
    if (tag === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      if (t === 'range') return 'slider';
      if (t === 'number') return 'spinbutton';
      if (t === 'search') return 'searchbox';
      if (t === 'hidden') return null;
      return 'textbox';
    }
    if (/^H[1-6]$/.test(tag)) return 'heading';
    if (tag === 'A' || tag === 'AREA') return el.hasAttribute('href') ? 'link' : 'generic';
    return IMPLICIT[tag] || 'generic';
  }

  function nameOf(el) {
    var aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    var labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      var parts = labelledby
        .split(/\\s+/)
        .map(function (id) {
          var n = document.getElementById(id);
          return n ? (n.innerText || n.textContent || '') : '';
        })
        .join(' ');
      if (parts.trim()) return parts.trim();
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      var ph = el.getAttribute('placeholder');
      if (ph && ph.trim()) return ph.trim();
      if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button')) return el.value || '';
      var nm = el.getAttribute('name');
      if (nm) return nm;
      return '';
    }
    if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
    var title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    var text = el.innerText || el.textContent || '';
    return text.trim();
  }

  function depthOf(el) {
    var d = 0;
    var p = el.parentElement;
    while (p && d < 6) {
      if (p.matches && p.matches(CONTAINER)) d++;
      p = p.parentElement;
    }
    return d;
  }

  var all = Array.prototype.slice.call(document.querySelectorAll(SEL));
  var nodes = [];
  var els = [];
  var capped = false;

  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var role = roleOf(el);
    if (!role) continue;
    if (!isVisible(el)) continue;

    var name = nameOf(el).replace(/\\s+/g, ' ').slice(0, __MAX_NAME__);
    // A node with neither a name nor an interactive role teaches the model
    // nothing; an unnamed link still matters, an unnamed div does not.
    if (!name && !INTERACTIVE[role]) continue;

    if (nodes.length >= __MAX_NODES__) {
      capped = true;
      break;
    }

    var node = {
      ref: nodes.length + 1,
      role: role,
      name: name,
      depth: depthOf(el)
    };
    var type = el.getAttribute('type');
    if (type) node.type = type;
    var href = el.getAttribute('href');
    if (href && role === 'link') node.href = href.slice(0, 200);
    // The same organic-result test the non-LLM selectors use, so a model and an
    // intent: selector agree on what "the results" are.
    if (role === 'link' && href && tersooIsOrganicLink(el)) node.result = true;
    var value = el.getAttribute('value');
    if (value && (role === 'textbox' || role === 'searchbox' || role === 'combobox')) {
      node.value = value.slice(0, __MAX_NAME__);
    }
    if (el.disabled) node.disabled = true;
    var ariaChecked = el.getAttribute('aria-checked');
    if (ariaChecked === 'true') node.checked = true;
    else if (ariaChecked === 'false') node.checked = false;
    else if (ariaChecked === 'mixed') node.checked = 'mixed';
    var ariaExpanded = el.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') node.expanded = true;
    else if (ariaExpanded === 'false') node.expanded = false;

    nodes.push(node);
    els.push(el);
  }

  var out = {
    url: location.href,
    title: document.title,
    nodes: nodes,
    candidates: all.length,
    capped: capped
  };
`;

/**
 * Builds the page-side script.
 *
 * With `elementIndex` set the script resolves to that single element (used to
 * turn a `ref` back into an element); otherwise it resolves to the collected
 * description.
 */
export function buildCollectScript(maxNodes = MAX_PAGE_TREE_NODES, elementIndex: number | null = null): string {
  const head = COLLECT_BODY.replace(/__MAX_NODES__/g, String(maxNodes)).replace(
    /__MAX_NAME__/g,
    String(MAX_PAGE_TREE_NAME),
  );
  // The organic-result predicate is shared source text, so it stays in step
  // with what `intent:search_result` resolves to.
  const prelude = buildPredicatePrelude();
  const tail = elementIndex === null ? 'return out;' : `return els[${Math.max(0, elementIndex)}] || null;`;
  return `(() => {\n${prelude}\n${head}\n${tail}\n})()`;
}

function readUrl(page: Page): string {
  try {
    if (typeof page.url === 'function') return page.url();
  } catch {
    // A page being torn down can throw here; an unknown URL is still usable.
  }
  return '';
}

async function readTitle(page: Page): Promise<string> {
  try {
    if (typeof page.title === 'function') return (await page.title()) ?? '';
  } catch {
    // Ignore: the title is context, not a requirement.
  }
  return '';
}

/** Lets a page that is still loading finish its DOM before it is described. */
async function waitForDom(page: Page): Promise<void> {
  if (typeof page.waitForLoadState !== 'function') return;
  for (const state of READY_STATES) {
    try {
      await page.waitForLoadState(state, { timeout: 2500 });
      return;
    } catch {
      // Try the next readiness state; a page may never reach `load`.
    }
  }
}

interface CollectedDom {
  url: string;
  title: string;
  nodes: PageTreeNode[];
  candidates: number;
  capped: boolean;
}

/**
 * Describes the page as a ref-anchored tree the model can act on.
 *
 * Falls back to Playwright's accessibility snapshot when the DOM walk is not
 * available, so drivers and test doubles that do not implement `evaluate` keep
 * working; the returned `source` says which path was taken and callers can
 * adjust how a `ref` is resolved.
 */
export async function extractPageTree(page: Page): Promise<PageTree> {
  await waitForDom(page);

  if (typeof page.evaluate === 'function') {
    try {
      const collected = (await page.evaluate(
        buildCollectScript(),
      )) as unknown as CollectedDom | null;

      if (collected && Array.isArray(collected.nodes)) {
        return {
          url: collected.url || readUrl(page),
          title: collected.title || (await readTitle(page)),
          source: 'dom',
          nodes: collected.nodes,
          accessibility: null,
          candidates: collected.candidates ?? collected.nodes.length,
          // Only a page that genuinely ran out of room is "truncated". A page
          // that merely had hidden elements is fully described.
          truncated: collected.capped === true,
        };
      }
    } catch (err) {
      const domError = err instanceof Error ? err.message : String(err);

      // Fall through to the accessibility snapshot, carrying the reason so a
      // genuinely broken page is visible in the run log instead of looking
      // like a model failure.
      const tree = await extractAccessibilityTree(page).catch(() => null);
      return accessibilityPageTree(page, tree, domError);
    }
  }

  const tree = await extractAccessibilityTree(page).catch(() => null);
  return accessibilityPageTree(page, tree);
}

async function accessibilityPageTree(
  page: Page,
  tree: AccessibilityNode | null,
  domError?: string,
): Promise<PageTree> {
  const nodes: PageTreeNode[] = [];

  if (tree) {
    // The root node is the document itself. The page URL and title already
    // describe it, and listing it as an actionable ref would waste one and
    // tempt the model into clicking the page.
    const walk = (node: AccessibilityNode, depth: number): void => {
      if (nodes.length >= MAX_PAGE_TREE_NODES) return;
      const firstLine = (node.name ?? '').split('\n')[0] ?? '';
      nodes.push({
        ref: node.ref,
        role: node.role ?? 'generic',
        name: firstLine.slice(0, MAX_PAGE_TREE_NAME),
        depth,
        ...(node.value !== undefined ? { value: node.value } : {}),
        ...(node.disabled !== undefined ? { disabled: node.disabled } : {}),
        ...(node.checked !== undefined ? { checked: node.checked } : {}),
        ...(node.expanded !== undefined ? { expanded: node.expanded } : {}),
        ...(node.focused !== undefined ? { focused: node.focused } : {}),
      });
      for (const child of node.children ?? []) walk(child, depth + 1);
    };
    for (const child of tree.children ?? []) walk(child, 0);
  }

  return {
    url: readUrl(page) || tree?.name || '',
    title: await readTitle(page),
    source: nodes.length > 0 ? 'accessibility' : 'empty',
    nodes,
    accessibility: tree,
    candidates: nodes.length,
    truncated: false,
    ...(domError ? { domError } : {}),
  };
}

/** Renders a tree as the indented, line-oriented description sent to the model. */
export function formatPageTree(tree: PageTree): string {
  const lines: string[] = [];
  lines.push(`Page URL: ${tree.url || '(unknown)'}`);
  lines.push(`Page title: ${tree.title || '(none)'}`);

  if (tree.nodes.length === 0) {
    lines.push('');
    lines.push(
      tree.url === 'about:blank' || tree.url === ''
        ? 'The page is blank. No elements are available.'
        : 'No interactive elements are currently visible. Scroll down or wait, then try again.',
    );
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Elements (ref, role, accessible name). "(result)" marks a genuine search result:');
  for (const node of tree.nodes) {
    const indent = '  '.repeat(Math.min(node.depth, 6));
    let line = `${indent}[${node.ref}] ${node.role}`;
    if (node.name) line += ` "${node.name}"`;
    if (node.value) line += ` value="${node.value}"`;
    if (node.href) line += ` href="${node.href}"`;
    if (node.result) line += ' (result)';
    if (node.disabled) line += ' (disabled)';
    if (node.checked === true) line += ' (checked)';
    if (node.checked === 'mixed') line += ' (partially checked)';
    lines.push(line);
  }

  if (tree.truncated) {
    lines.push('');
    lines.push(
      `… this page has more elements than can be shown at once. Scroll down to reveal the ones below the fold, then look again.`,
    );
  }

  return lines.join('\n');
}

const PLAYWRIGHT_ARIA_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button',
  'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'complementary',
  'contentinfo', 'definition', 'dialog', 'directory', 'document', 'emphasis', 'feed',
  'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img',
  'insertion', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee',
  'math', 'meter', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar',
  'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar',
  'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'strong',
  'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel',
  'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid',
  'treeitem',
]);

/**
 * Resolves a `ref` from a description back to the element it stands for.
 *
 * For a DOM-sourced tree this is exact: the same walk is re-run and indexed
 * into, so two elements that share a label still resolve to the one the model
 * was shown. For an accessibility-sourced tree it degrades to role + name,
 * scoped to the first match so at least the click can happen.
 */
export async function resolveTreeNode(
  page: Page,
  tree: PageTree,
  ref: number,
): Promise<TreeTarget | null> {
  if (!Number.isFinite(ref) || ref < 1) return null;

  const node = tree.nodes.find((n) => n.ref === ref);
  if (!node) return null;

  if (tree.source === 'dom' && typeof page.evaluateHandle === 'function') {
    try {
      const handle = await page.evaluateHandle(buildCollectScript(MAX_PAGE_TREE_NODES, ref - 1));
      const element = handle.asElement();
      if (element) return element;
      await handle.dispose().catch(() => {});
    } catch {
      // The page may have navigated between describing and acting; fall back
      // to a locator so the action still has a chance.
    }
  }

  return roleNameLocator(page, node);
}

/**
 * Best-effort locator from a node's role and accessible name.
 *
 * Always scoped with `.first()`: an unscoped role + name match is ambiguous on
 * any real page, and Playwright refuses to act on it.
 */
export function roleNameLocator(page: Page, node: PageTreeNode): TreeTarget | null {
  const role = node.role?.toLowerCase();
  const firstLine = node.name?.split('\n')[0]?.trim();

  if (typeof page.getByRole === 'function' && role && PLAYWRIGHT_ARIA_ROLES.has(role)) {
    try {
      const locator = firstLine
        ? page.getByRole(role as any, { name: firstLine, exact: false })
        : page.getByRole(role as any);
      return typeof (locator as any).first === 'function' ? locator.first() : locator;
    } catch {
      // An unknown role for this build; try the generic paths below.
    }
  }

  if (typeof page.locator === 'function') {
    if (firstLine) {
      return page.locator(`text="${firstLine.replace(/"/g, '\\"')}"`).first();
    }
    return page.locator('a[href], button, input:not([type="hidden"]), textarea, [contenteditable="true"]').first();
  }

  return null;
}

/** Nodes whose names are empty but whose role can still be acted on. */
export function canReceiveText(role: string | undefined): boolean {
  if (!role) return false;
  return ['textbox', 'searchbox', 'combobox'].includes(role.toLowerCase());
}

/**
 * The links on a page that are genuine search results.
 *
 * Prefers the flag set by the DOM walk, which used the same predicate as the
 * `intent:search_result` selectors. When the tree came from the accessibility
 * fallback there is no flag, so the destination host is checked here instead -
 * a result goes somewhere other than the search engine, while nav tabs,
 * "People also ask" and pagination all link back to it.
 */
export function organicResultNodes(tree: PageTree): PageTreeNode[] {
  const marked = tree.nodes.filter((n) => n.result === true);
  if (marked.length > 0) return marked;

  const pageHost = (() => {
    try {
      return new URL(tree.url).hostname;
    } catch {
      return '';
    }
  })();

  return tree.nodes
    .filter((n) => n.role === 'link' && n.href && !isEngineInternalUrl(n.href, pageHost))
    .slice(0, MAX_PAGE_TREE_NODES);
}
