import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';
import { XPathResolver } from '../packages/core/src/crosshair/XPathResolver';
import { ConsentEngine } from '../packages/core/src/crosshair/ConsentEngine';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

async function testWorkflowSteps() {
  console.log('--- Starting Step-by-Step Test ---');
  const userDataDir = path.join(process.cwd(), 'scratch', 'test_workflow_profile');
  const context = await launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });
  const page = context.pages()[0] || (await context.newPage());
  const resolver = new XPathResolver();

  try {
    // Step 1: Navigate to Google
    console.log('[Step 1] Navigating to https://www.google.com...');
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await ConsentEngine.checkAndHandle(page, { timeoutMs: 1500 });

    // Step 2: Resolve search input
    console.log('[Step 2] Resolving intent:search_input...');
    const searchTarget = await resolver.resolve(page, 'intent:search_input', { timeoutMs: 10000 });
    console.log('Found search input:', searchTarget.strategy, searchTarget.resolvedSelector);

    // Step 3 & 4: Type 'youtube' and press Enter
    console.log('[Step 3/4] Clicking search and typing "youtube"...');
    await searchTarget.locator!.click();
    await page.waitForTimeout(300);
    await searchTarget.locator!.fill('youtube');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    // Step 5: Wait for YouTube link
    console.log('[Step 5] Waiting for intent:link("YouTube")...');
    await page.waitForTimeout(2000);
    console.log('Current URL after Enter:', page.url());

    if (page.url().includes('sorry/index')) {
      console.warn('WARNING: Hit Google sorry page!');
    } else {
      const linkTarget = await resolver.resolve(page, 'intent:link("YouTube")', { timeoutMs: 15000 });
      console.log('Found YouTube link:', linkTarget.strategy, linkTarget.resolvedSelector);

      // Step 6: Click YouTube link
      console.log('[Step 6] Clicking YouTube link...');
      await linkTarget.locator!.click();
      await page.waitForTimeout(3000);
    }

    // Check if we reached YouTube
    console.log('Current Page Title:', await page.title());
    console.log('Current URL:', page.url());

    if (page.url().includes('youtube.com')) {
      await ConsentEngine.checkAndHandle(page, { timeoutMs: 2000 });

      // Step 7: Resolve search input on YouTube
      console.log('[Step 7] Resolving search input on YouTube...');
      const ytSearch = await resolver.resolve(page, 'intent:search_input', { timeoutMs: 15000 });
      console.log('Found YouTube search input:', ytSearch.strategy, ytSearch.resolvedSelector);

      // Step 8: Search gaming keyword
      console.log('[Step 8] Searching for gaming keyword...');
      await ytSearch.locator!.click();
      await page.waitForTimeout(300);
      await ytSearch.locator!.fill('gta 6 official trailer gameplay');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);

      // Step 9: Resolve video
      console.log('[Step 9] Resolving video:0...');
      const videoTarget = await resolver.resolve(page, 'video:0', { timeoutMs: 15000 });
      console.log('Found video:0:', videoTarget.strategy, videoTarget.resolvedSelector);

      // Step 10: Click video
      console.log('[Step 10] Clicking video...');
      await videoTarget.locator!.click();
      await page.waitForTimeout(5000);

      // Step 11: Check player
      console.log('[Step 11] Checking intent:media...');
      const playerTarget = await resolver.resolve(page, 'intent:media', { timeoutMs: 15000 });
      console.log('Found media player:', playerTarget.strategy, playerTarget.resolvedSelector);
      console.log('=== TEST COMPLETED SUCCESSFULLY! ===');
    }
  } catch (err: any) {
    console.error('Test error at step:', err.message);
  } finally {
    await page.waitForTimeout(3000);
    await context.close();
  }
}

testWorkflowSteps().catch(console.error);
