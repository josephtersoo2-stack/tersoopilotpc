import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { extractAccessibilityTree } from '../../crosshair/accessibility';

export class NavigationRecovery {
  static async captureNavigationArtifacts(
    page: Page,
    artifactsDir?: string,
  ): Promise<string[]> {
    const paths: string[] = [];
    if (!page) return paths;
    if (typeof page.isClosed === 'function' && page.isClosed()) return paths;

    const baseDir = artifactsDir || path.join(process.cwd(), 'artifacts');
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch {}

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 1. Screenshot
    if (typeof page.screenshot === 'function') {
      try {
        const screenshotPath = path.join(baseDir, `nav-failure-${timestamp}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 5000 });
        paths.push(screenshotPath);
      } catch {}
    }

    // 2. ARIA / Accessibility snapshot
    try {
      let snapshotContent: string | null = null;
      let extension = 'json';

      if (typeof (page as any).ariaSnapshot === 'function') {
        try {
          snapshotContent = await (page as any).ariaSnapshot({ mode: 'ai', depth: 8 });
          extension = 'yml';
        } catch {
          try {
            snapshotContent = await (page as any).ariaSnapshot();
            extension = 'yml';
          } catch {}
        }
      }

      if (!snapshotContent) {
        const tree = await extractAccessibilityTree(page).catch(() => null);
        if (tree) {
          snapshotContent = JSON.stringify(tree, null, 2);
          extension = 'json';
        }
      }

      if (snapshotContent) {
        // Redaction of sensitive strings / tokens
        const redacted = snapshotContent
          .replace(/(?:password|token|secret|apiKey|bearer)\s*[:=]\s*["']?([^"'\s,]+)/gi, 'REDACTED')
          .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED_TOKEN]');

        const ariaPath = path.join(baseDir, `nav-failure-${timestamp}-aria.${extension}`);
        fs.writeFileSync(ariaPath, redacted, 'utf8');
        paths.push(ariaPath);
      }
    } catch {}

    return paths;
  }
}
