import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_PRESET_IDS } from '../packages/contracts/src';
import { createContainer, loadConfig } from '../packages/core/src';
import { Humanizer } from '../packages/core/src/crosshair/Humanizer';

async function main() {
  console.log('================================================================');
  console.log('  TersooPilot: Live Anti-Bot Detection Platform Test Runner     ');
  console.log('  Testing against: https://bot.sannysoft.com                   ');
  console.log('================================================================\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const testUserDataDir = path.resolve('scratch/antibot-test-data');
  const screenshotsDir = path.resolve('scratch');

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('[1/6] Initializing container & anti-detect configuration...');
  const config = loadConfig(testUserDataDir, chromePath, {
    headless: false,
    cdpDiscoveryTimeoutMs: 20000,
  });
  const container = await createContainer(config);

  const presetId = DEFAULT_PRESET_IDS.windows11;

  console.log('[2/6] Creating stealth profile with Windows 11 preset...');
  const profile = await container.services.profiles.create({
    name: 'Anti-Bot Platform Verification Profile',
    presetId,
  });

  console.log(`       Profile ID: ${profile.id}`);
  console.log(`       Fingerprint Seed: ${profile.fingerprintSeed}`);

  console.log('[3/6] Launching Chrome with CDP stealth hook injection...');
  const launchResult = await container.services.profiles.launch(profile.id, {
    headless: false,
  });

  const cdpPort = launchResult.instance.cdpPort;
  console.log(`       Chrome PID: ${launchResult.instance.pid}`);
  console.log(`       CDP Port: ${cdpPort}`);

  console.log('[4/6] Retrieving CrosshairWorker Playwright page & CDP session...');
  const page = container.crosshair.getPage(profile.id);
  const cdp = container.crosshair.getCdpSession(profile.id);
  console.log('       Playwright CDP attached successfully!');
  console.log('       Stealth context initialized & verified.');

  const targetUrl = 'https://bot.sannysoft.com';
  console.log(`\n[5/6] Navigating to anti-bot verification platform: ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('       Page loaded. Waiting 3 seconds for tests to run...');
  await new Promise((r) => setTimeout(r, 3000));

  console.log('\n[6/6] Executing humanized interactions (Bézier mouse curves & kinetic scroll)...');

  // Humanized mouse move across the page
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  await Humanizer.move(
    cdp,
    { x: Math.round(viewport.width / 2), y: 300 },
    {
      microJitter: true,
      overshoot: true,
      seed: profile.fingerprintSeed,
    },
  );

  // Humanized kinetic scroll down the results table
  await Humanizer.scroll(cdp, {
    direction: 'down',
    amount: 500,
    burstCount: 3,
    seed: profile.fingerprintSeed,
  });

  await new Promise((r) => setTimeout(r, 1500));

  // Extract results table from bot.sannysoft.com
  const testResults = (await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    const results: Record<string, string> = {};
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td, th'));
      if (cells.length >= 2) {
        const key = cells[0]?.textContent?.trim() || '';
        const val = cells[1]?.textContent?.trim() || '';
        if (key && val) {
          results[key] = val;
        }
      }
    }
    return results;
  })) as Record<string, string>;

  console.log('\n================ LIVE BOT.SANNYSOFT.COM RESULTS ================');
  for (const [name, outcome] of Object.entries(testResults)) {
    const isPassed =
      !outcome.toLowerCase().includes('failed') &&
      !outcome.toLowerCase().includes('inconsistent');
    const symbol = isPassed ? '✓ [PASS]' : '✗ [FAIL]';
    console.log(`  ${symbol} ${name.padEnd(35)} : ${outcome}`);
  }
  console.log('================================================================\n');

  // Capture screenshot of results
  const screenshotPath = path.resolve(screenshotsDir, 'antibot-sannysoft-results.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved to: ${screenshotPath}`);

  const keepOpen = process.argv.includes('--keep-open');
  if (keepOpen) {
    console.log('\n>>> The browser window is open for visual inspection. <<<');
    console.log('Press Ctrl+C to close the browser and clean up.\n');
    await new Promise<void>((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\nDisconnecting Crosshair & closing browser...');
        await container.crosshair.close(profile.id);
        await container.supervisor.stop(profile.id);
        await container.dispose();
        console.log('Cleaned up. Exiting.');
        resolve();
        process.exit(0);
      });
    });
  } else {
    console.log('\nWrapping up test execution and closing browser...');
    await container.crosshair.close(profile.id);
    await container.supervisor.stop(profile.id);
    await container.dispose();
    console.log('Container stopped and disposed cleanly.');
  }
}

main().catch((err) => {
  console.error('Anti-bot test failed:', err);
  process.exit(1);
});
