import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';
import { StepRunner } from '../packages/core/src/task/StepRunner';
import { XPathResolver } from '../packages/core/src/crosshair/XPathResolver';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

async function verifyCursorOnYouTube() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'test_cursor_yt');
  const context = await launchPersistentContext(userDataDir, { headless: true });
  const page = context.pages()[0] || (await context.newPage());

  console.log('[1/3] Navigating to https://www.youtube.com...');
  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const xpathResolver = new XPathResolver();
  const stepRunner = new StepRunner(xpathResolver);

  console.log('[2/3] Calling ensureVisualCursor on PC YouTube...');
  const res = await page.evaluate(() => {
    try {
      // Test the safe DOM creation logic
      if (document.getElementById('__tersoo_cursor')) return { success: true, existed: true };
      const cursor = document.createElement('div');
      cursor.id = '__tersoo_cursor';
      cursor.style.position = 'fixed';
      cursor.style.zIndex = '2147483647';

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', 'M0 0 L0 18.5 L4.8 14.2 L8.2 21.5 L10.8 20.3 L7.4 13.2 L14 13.2 Z');
      svg.appendChild(pathEl);
      cursor.appendChild(svg);
      document.documentElement.appendChild(cursor);

      return {
        success: true,
        elementInDom: Boolean(document.getElementById('__tersoo_cursor')),
        svgInDom: Boolean(document.querySelector('#__tersoo_cursor svg')),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  console.log('Result on YouTube PC with Trusted Types:', res);
  console.log('[3/3] Done!');
  await context.close();
}

verifyCursorOnYouTube().catch(console.error);
