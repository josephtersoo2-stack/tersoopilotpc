import type { Page } from 'playwright-core';
import { extractPageTree, formatPageTree, type PageTree } from '../../crosshair/pageTree';

export interface BrowserObservation {
  url: string;
  title: string;
  /** The ref-anchored page description an autonomous agent acts on. */
  pageTree?: PageTree | undefined;
  /** The same description rendered as the text a model reads. */
  accessibilitySnapshot?: string | undefined;
  visibleText?: string | undefined;
  screenshotPath?: string | undefined;
  navigationState: string;
  recentErrors?: string[] | undefined;
}

export async function observeBrowser(page: Page): Promise<BrowserObservation> {
  const url = typeof page.url === 'function' ? page.url() : '';
  let title = '';
  try {
    if (typeof page.title === 'function') {
      title = await page.title();
    }
  } catch {}

  // One description, one source of truth: the LLM step and the autonomous
  // navigator must see the same elements under the same refs, or a ref planned
  // in one place cannot be executed in the other.
  const pageTree = await extractPageTree(page).catch(() => undefined);
  if (pageTree && !title) title = pageTree.title;

  let visibleText: string | undefined;
  try {
    if (typeof page.locator === 'function') {
      const raw = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
      visibleText = raw.slice(0, 2000);
    }
  } catch {}

  return {
    url: pageTree?.url || url,
    title,
    pageTree,
    accessibilitySnapshot: pageTree ? formatPageTree(pageTree) : undefined,
    visibleText,
    navigationState: 'COMMITTED',
  };
}
