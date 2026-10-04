import type { Page } from 'playwright-core';

export interface AccessibilityNode {
  ref: number;
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
  focused?: boolean;
  checked?: boolean | 'mixed';
  expanded?: boolean;
  children?: AccessibilityNode[];
}

let nextRef = 1;

export async function extractAccessibilityTree(page: Page): Promise<AccessibilityNode> {
  const pageWithAccessibility = page as unknown as {
    accessibility?: {
      snapshot: (options?: { interestingOnly?: boolean }) => Promise<unknown>;
    };
  };

  const getPageUrl = (): string => {
    try {
      return typeof page.url === 'function' ? page.url() : 'about:blank';
    } catch {
      return 'about:blank';
    }
  };

  // Wait for DOM content to settle if page is currently navigating
  try {
    if (typeof page.waitForLoadState === 'function') {
      await page.waitForLoadState('domcontentloaded', { timeout: 2500 }).catch(() => {});
    }
  } catch {}

  let snapshot: any = null;
  try {
    snapshot = await pageWithAccessibility.accessibility?.snapshot({ interestingOnly: true });
  } catch {}

  if (!snapshot) {
    const currentUrl = getPageUrl();
    if (currentUrl && currentUrl !== 'about:blank') {
      if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(600).catch(() => {});
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }
      try {
        snapshot = await pageWithAccessibility.accessibility?.snapshot({ interestingOnly: true });
      } catch {}
    }
  }

  nextRef = 1;

  if (!snapshot) {
    return {
      ref: nextRef++,
      role: 'WebArea',
      name: getPageUrl() || 'about:blank',
      children: [],
    };
  }

  return convertNode(snapshot);
}

function convertNode(node: any): AccessibilityNode {
  const ref = nextRef++;
  const result: AccessibilityNode = {
    ref,
    role: node.role ?? 'unknown',
    name: node.name ?? '',
    value: node.value,
    disabled: node.disabled,
    focused: node.focused,
    checked: node.checked,
    expanded: node.expanded,
  };

  if (node.children && Array.isArray(node.children) && node.children.length > 0) {
    result.children = node.children.map(convertNode);
  }

  return result;
}

export function findNodeByRef(root: AccessibilityNode, ref: number): AccessibilityNode | null {
  if (root.ref === ref) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeByRef(child, ref);
      if (found) return found;
    }
  }
  return null;
}
