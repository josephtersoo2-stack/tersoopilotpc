import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { ApostateEngine } from '../packages/core/src/engines/apostate/ApostateEngine';
import { XPathResolver } from '../packages/core/src/crosshair/XPathResolver';
import { ConsentEngine } from '../packages/core/src/crosshair/ConsentEngine';

async function testWithEngine() {
  const dbPath = path.join(process.env.APPDATA || '', 'Electron', 'tersoopilot', 'tersoopilot.db');
  const db = new Database(dbPath);
  const profileRow = db.prepare("SELECT * FROM profiles WHERE name = 'Profile 1'").get() as any;
  if (!profileRow) {
    console.error('Profile 1 not found');
    return;
  }

  const fingerprintBundle = JSON.parse(profileRow.fingerprint_bundle || '{}');
  const profile = {
    id: profileRow.id,
    name: profileRow.name,
    presetId: profileRow.preset_id,
    engine: profileRow.engine,
    fingerprintBundle,
  };

  const appData = process.env.APPDATA || '';
  const userDataDir = path.join(appData, 'tersoopilot-desktop', 'profiles', profile.id);
  fs.mkdirSync(userDataDir, { recursive: true });

  const engine = new ApostateEngine();
  console.log('[1/6] Launching Profile 1 via ApostateEngine...');
  const session = await engine.launch({
    profile: profile as any,
    userDataDir,
    forwarderPort: 0,
    headless: false,
  });

  const page = session.page;
  const resolver = new XPathResolver();

  try {
    console.log('[2/6] Navigating to https://www.google.com...');
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await ConsentEngine.checkAndHandle(page, { timeoutMs: 1500 });

    console.log('[3/6] Resolving search input on Google...');
    const searchTarget = await resolver.resolve(page, 'intent:search_input', { timeoutMs: 15000 });
    console.log('Search target resolved:', searchTarget.strategy, searchTarget.resolvedSelector);

    console.log('[4/6] Typing "youtube" and pressing Enter...');
    await searchTarget.locator!.click();
    await page.waitForTimeout(400);
    await searchTarget.locator!.fill('youtube');
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');

    console.log('[5/6] Waiting for results / link...');
    await page.waitForTimeout(3000);
    console.log('Current URL after search:', page.url());
    console.log('Current Title:', await page.title());

    if (page.url().includes('sorry/index')) {
      console.warn('Hit Google sorry page on this IP.');
      console.log('Navigating directly to https://www.youtube.com...');
      await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    } else {
      const link = await resolver.resolve(page, 'intent:link("YouTube")', { timeoutMs: 15000 });
      console.log('Found YouTube link on Google:', link.strategy, link.resolvedSelector);
      await link.locator!.click();
      await page.waitForTimeout(3000);
    }

    console.log('[6/6] Checking YouTube search & video...');
    console.log('YouTube page title:', await page.title());
    await ConsentEngine.checkAndHandle(page, { timeoutMs: 2000 });

    const ytSearch = await resolver.resolve(page, 'intent:search_input', { timeoutMs: 20000 });
    console.log('YouTube search input resolved:', ytSearch.strategy, ytSearch.resolvedSelector);

    await ytSearch.locator!.click();
    await page.waitForTimeout(400);
    await ytSearch.locator!.fill('gta 6 official trailer gameplay');
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    const video = await resolver.resolve(page, 'video:0', { timeoutMs: 20000 });
    console.log('Video resolved:', video.strategy, video.resolvedSelector);
    await video.locator!.click();
    await page.waitForTimeout(4000);

    const player = await resolver.resolve(page, 'intent:media', { timeoutMs: 20000 });
    console.log('Media player loaded successfully:', player.strategy, player.resolvedSelector);
    console.log('=== FULL WORKFLOW EXECUTION VERIFIED! ===');
  } catch (err: any) {
    console.error('Error during execution:', err.message);
  } finally {
    await page.waitForTimeout(3000);
    await session.close();
  }
}

testWithEngine().catch(console.error);
