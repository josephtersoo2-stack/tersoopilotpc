import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { ApostateEngine } from '../packages/core/src/engines/apostate/ApostateEngine';
import { ConsentEngine } from '../packages/core/src/crosshair/ConsentEngine';
import { XPathResolver } from '../packages/core/src/crosshair/XPathResolver';

async function testMobileYouTube() {
  const dbPath = path.join(process.env.APPDATA || '', 'Electron', 'tersoopilot', 'tersoopilot.db');
  const db = new Database(dbPath);
  const profileRow = db.prepare("SELECT * FROM profiles WHERE name = 'Profile 2'").get() as any;
  if (!profileRow) {
    console.error('Profile 2 not found');
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

  const engine = new ApostateEngine();
  console.log('[1/4] Launching Profile 2 (Mobile)...');
  const session = await engine.launch({
    profile: profile as any,
    userDataDir,
    forwarderPort: 0,
    headless: false,
  });

  const page = session.page;
  console.log('[2/4] Navigating to https://m.youtube.com...');
  await page.goto('https://m.youtube.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('Current URL:', page.url());
  console.log('Page Title:', await page.title());

  // Check frames
  console.log('Frame count:', page.frames().length);
  for (const f of page.frames()) {
    console.log('  Frame:', f.name(), f.url());
  }

  // Check visible buttons
  const buttons = await page.$$eval('button, [role="button"], a.btn', els =>
    els.filter(e => e.offsetWidth > 0 && e.offsetHeight > 0).map(e => ({
      text: e.innerText?.slice(0, 50),
      ariaLabel: e.getAttribute('aria-label'),
      id: e.id,
      className: e.className,
    }))
  );
  console.log('Visible buttons on mobile:', buttons);

  // Check if consent was detected
  const handled = await ConsentEngine.checkAndHandle(page, { isMobile: true, timeoutMs: 2000 });
  console.log('Consent handled by current ConsentEngine:', handled);

  // Take screenshot
  const screenshotPath = path.join(process.cwd(), 'scratch', 'mobile-youtube-consent.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  await page.waitForTimeout(4000);
  await session.close();
}

testMobileYouTube().catch(console.error);
