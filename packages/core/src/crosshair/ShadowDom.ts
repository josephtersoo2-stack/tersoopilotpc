import type { CDPSession, ElementHandle, Page } from 'playwright-core';

import { CrosshairError } from '../util/errors';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShadowQueryOptions {
  timeoutMs?: number;
  visibleOnly?: boolean;
}

export class ShadowDom {
  /**
   * Deeply queries an element across all open shadow DOM boundaries using a CSS selector.
   * Traverses document, all custom elements, and nested shadow roots.
   */
  static async findElement(
    page: Page,
    selector: string,
    options?: ShadowQueryOptions,
  ): Promise<ElementHandle<Element> | null> {
    const visibleOnly = options?.visibleOnly ?? false;

    try {
      const handle = await page.evaluateHandle(
        ({ sel, visOnly }: { sel: string; visOnly: boolean }) => {
          function isVisible(el: Element): boolean {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              style.opacity !== '0'
            );
          }

          function search(root: Document | ShadowRoot | Element): Element | null {
            // 1. Direct query in current scope
            try {
              if (
                root instanceof Document ||
                root instanceof DocumentFragment ||
                root instanceof Element
              ) {
                const candidates = Array.from(root.querySelectorAll(sel));
                for (const candidate of candidates) {
                  if (!visOnly || isVisible(candidate)) {
                    return candidate;
                  }
                }
              }
            } catch {
              // Ignore invalid selector in scope
            }

            // 2. Traverse children and pierce shadow roots
            const children: Element[] =
              root instanceof Document
                ? root.body
                  ? Array.from(root.body.children)
                  : []
                : Array.from(root.children);

            for (const child of children) {
              if (child.shadowRoot) {
                const foundInShadow = search(child.shadowRoot);
                if (foundInShadow) {
                  return foundInShadow;
                }
              }

              const deeper = search(child);
              if (deeper) {
                return deeper;
              }
            }

            return null;
          }

          return search(document);
        },
        { sel: selector, visOnly: visibleOnly },
      );

      const element = handle.asElement();
      if (!element) {
        await handle.dispose().catch(() => {});
        return null;
      }

      return element;
    } catch (err) {
      throw new CrosshairError(
        'STEP_SELECTOR_MISSING',
        `Failed to execute shadow DOM search for '${selector}': ${err instanceof Error ? err.message : String(err)}`,
        { details: err },
      );
    }
  }

  /**
   * Deeply queries all matching elements across all open shadow DOM boundaries.
   */
  static async findAllElements(
    page: Page,
    selector: string,
    options?: ShadowQueryOptions,
  ): Promise<ElementHandle<Element>[]> {
    const visibleOnly = options?.visibleOnly ?? false;

    try {
      const handle = await page.evaluateHandle(
        ({ sel, visOnly }: { sel: string; visOnly: boolean }) => {
          function isVisible(el: Element): boolean {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              style.opacity !== '0'
            );
          }

          const results: Element[] = [];

          function search(root: Document | ShadowRoot | Element): void {
            try {
              if (
                root instanceof Document ||
                root instanceof DocumentFragment ||
                root instanceof Element
              ) {
                const candidates = Array.from(root.querySelectorAll(sel));
                for (const candidate of candidates) {
                  if (!visOnly || isVisible(candidate)) {
                    results.push(candidate);
                  }
                }
              }
            } catch {
              // Ignore invalid selector in scope
            }

            const children: Element[] =
              root instanceof Document
                ? root.body
                  ? Array.from(root.body.children)
                  : []
                : Array.from(root.children);

            for (const child of children) {
              if (child.shadowRoot) {
                search(child.shadowRoot);
              }
              search(child);
            }
          }

          search(document);
          return results;
        },
        { sel: selector, visOnly: visibleOnly },
      );

      const count = await handle.evaluate((els: Element[]) => els.length);
      const elements: ElementHandle<Element>[] = [];

      for (let i = 0; i < count; i++) {
        const itemHandle = await handle.evaluateHandle(
          (els: Element[], index: number) => els[index] ?? null,
          i,
        );

        const el = itemHandle.asElement();
        if (el) {
          elements.push(el);
        } else {
          await itemHandle.dispose().catch(() => {});
        }
      }

      await handle.dispose().catch(() => {});
      return elements;
    } catch (err) {
      throw new CrosshairError(
        'STEP_SELECTOR_MISSING',
        `Failed to query all shadow DOM elements for '${selector}': ${err instanceof Error ? err.message : String(err)}`,
        { details: err },
      );
    }
  }

  /**
   * Deeply queries an XPath expression across shadow boundaries.
   * Evaluates relative XPath expressions inside every encountered document fragment and shadow tree.
   */
  static async findXPath(
    page: Page,
    xpath: string,
    options?: ShadowQueryOptions,
  ): Promise<ElementHandle<Element> | null> {
    const visibleOnly = options?.visibleOnly ?? false;

    try {
      const handle = await page.evaluateHandle(
        ({ xp, visOnly }: { xp: string; visOnly: boolean }) => {
          function isVisible(el: Element): boolean {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              style.opacity !== '0'
            );
          }

          // Format relative xpath if starts with //
          const queryXp = xp.startsWith('//') ? `.${xp}` : xp;

          function evaluateXpath(root: Node): Element | null {
            try {
              const result = document.evaluate(
                queryXp,
                root,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
              );
              const node = result.singleNodeValue;
              if (node instanceof Element) {
                if (!visOnly || isVisible(node)) {
                  return node;
                }
              }
            } catch {
              // Ignore unsupported xpath on node
            }
            return null;
          }

          function search(root: Document | ShadowRoot | Element): Element | null {
            const foundDirect = evaluateXpath(root);
            if (foundDirect) {
              return foundDirect;
            }

            const children: Element[] =
              root instanceof Document
                ? root.body
                  ? Array.from(root.body.children)
                  : []
                : Array.from(root.children);

            for (const child of children) {
              if (child.shadowRoot) {
                const foundInShadow = search(child.shadowRoot);
                if (foundInShadow) {
                  return foundInShadow;
                }
              }

              const deeper = search(child);
              if (deeper) {
                return deeper;
              }
            }

            return null;
          }

          return search(document);
        },
        { xp: xpath, visOnly: visibleOnly },
      );

      const el = handle.asElement();
      if (!el) {
        await handle.dispose().catch(() => {});
        return null;
      }

      return el;
    } catch (err) {
      throw new CrosshairError(
        'STEP_SELECTOR_MISSING',
        `Failed to evaluate shadow XPath '${xpath}': ${err instanceof Error ? err.message : String(err)}`,
        { details: err },
      );
    }
  }

  /**
   * Pierces sequentially through a specified hierarchy of selectors.
   * Example: pierce(page, ['custom-dialog', 'auth-card', 'button.submit'])
   */
  static async pierce(
    page: Page,
    path: string[],
  ): Promise<ElementHandle<Element> | null> {
    if (path.length === 0) {
      return null;
    }

    try {
      const handle = await page.evaluateHandle((selectors: string[]) => {
        let currentRoot: Document | ShadowRoot | Element = document;

        for (let i = 0; i < selectors.length; i++) {
          const sel = selectors[i];
          if (!sel) return null;

          let match: Element | null = null;
          if (
            currentRoot instanceof Document ||
            currentRoot instanceof DocumentFragment ||
            currentRoot instanceof Element
          ) {
            match = currentRoot.querySelector(sel);
          }

          if (!match) {
            return null;
          }

          if (i === selectors.length - 1) {
            return match;
          }

          if (match.shadowRoot) {
            currentRoot = match.shadowRoot;
          } else {
            currentRoot = match;
          }
        }

        return null;
      }, path);

      const el = handle.asElement();
      if (!el) {
        await handle.dispose().catch(() => {});
        return null;
      }

      return el;
    } catch (err) {
      throw new CrosshairError(
        'STEP_SELECTOR_MISSING',
        `Failed to pierce shadow path [${path.join(' >> ')}]: ${err instanceof Error ? err.message : String(err)}`,
        { details: err },
      );
    }
  }

  /**
   * Resolves the viewport BoundingBox (x, y, width, height) of an ElementHandle.
   */
  static async resolveBoundingBox(
    element: ElementHandle<Element>,
  ): Promise<BoundingBox | null> {
    const box = await element.boundingBox();
    if (!box) {
      return null;
    }
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  }

  /**
   * Uses low-level CDP DOM.getDocument + DOM.describeNode with pierce: true
   * to resolve a node by backendNodeId into a CDP remote object.
   */
  static async resolveNodeViaCdp(
    cdp: CDPSession,
    backendNodeId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const res = (await cdp.send('DOM.resolveNode', {
        backendNodeId,
      })) as unknown as { object?: Record<string, unknown> };

      return res.object ?? null;
    } catch (err) {
      throw new CrosshairError(
        'INTERNAL',
        `Failed to resolve CDP node for backendNodeId ${backendNodeId}: ${err instanceof Error ? err.message : String(err)}`,
        { details: err },
      );
    }
  }

  /**
   * Checks whether an ElementHandle is currently visible in the DOM.
   */
  static async isElementVisible(element: ElementHandle<Element>): Promise<boolean> {
    return element.isVisible();
  }
}
