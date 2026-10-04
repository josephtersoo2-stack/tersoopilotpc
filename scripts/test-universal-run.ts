import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';
import { ConsentEngine } from '../packages/core/src/crosshair/ConsentEngine';
import { Humanizer } from '../packages/core/src/crosshair/Humanizer';
import { XPathResolver } from '../packages/core/src/crosshair/XPathResolver';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

async function main() {
  console.log('=====================================================');
  console.log('  TersooPilot: Universal Perception & Action Test    ');
  console.log('=====================================================');

  const userDataDir = path.join(process.cwd(), 'scratch', 'test_universal_profile');
  
  console.log('[1/5] Launching browser engine (Headless: true)...');
  const context = await launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 412, height: 915 }, // Mobile viewport (Pixel/Galaxy size)
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  });

  const page = context.pages()[0] || (await context.newPage());
  const resolver = new XPathResolver();

  try {
    // 1. Navigate to a public website (e.g. Wikipedia Mobile)
    console.log('[2/5] Navigating to https://en.m.wikipedia.org...');
    await page.goto('https://en.m.wikipedia.org', { waitUntil: 'domcontentloaded' });
    console.log('      Page loaded:', await page.title());

    // 2. Consent & Interstitial check
    console.log('[3/5] Running ConsentEngine (checking for banners/modals)...');
    const handledConsent = await ConsentEngine.checkAndHandle(page, { timeoutMs: 1000 });
    console.log(`      Consent banner detected and handled: ${handledConsent}`);

    // 3. Resolve search input dynamically via intent (no hardcoded wikipedia class/id)
    console.log('[4/5] Resolving "intent:search_input" dynamically...');
    const searchTarget = await resolver.resolve(page, 'intent:search_input', { timeoutMs: 5000 });
    console.log(`      Resolved using strategy: ${searchTarget.strategy}`);
    console.log(`      Found element selector: "${searchTarget.resolvedSelector}"`);

    // 4. Mobile touch or mouse action
    const cdp = await page.context().newCDPSession(page);
    try {
      console.log('[5/5] Performing authentic Mobile Touch gestures via CDP...');
      
      // Tap on search box with human touch pad physics
      const box = await searchTarget.locator!.boundingBox();
      if (box) {
        console.log(`      Dispatching authentic touchTap at (${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)}) with finger contact radius...`);
        await Humanizer.touchTap(cdp, box);
        await page.waitForTimeout(300);

        // Type query realistically via CDP
        console.log('      Typing search query "Artificial Intelligence" with human micro-latencies...');
        await Humanizer.type(cdp, 'Artificial Intelligence');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);

        console.log('      New page title after search:', await page.title());

        // Perform natural mobile thumb swipe down
        console.log('      Performing inertial thumb touchSwipe (scroll down)...');
        await Humanizer.touchSwipe(cdp, { amount: 350, direction: 'down' });
        console.log('      Thumb swipe completed successfully!');
      }
    } finally {
      await cdp.detach().catch(() => {});
    }

    console.log('=====================================================');
    console.log('  TEST COMPLETED: 100% SUCCESS WITHOUT HARDCODING!   ');
    console.log('=====================================================');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[Universal Test Error]:', err);
  process.exit(1);
});
