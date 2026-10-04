import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DEFAULT_PRESET_IDS } from '../packages/contracts/src';
import { createContainer, loadConfig } from '../packages/core/src';
import { getSelfTestHtmlPath } from '../packages/stealth/src';

async function main() {
  console.log('===========================================================');
  console.log('  TersooPilot: Live Anti-Detect Fingerprint Test Runner    ');
  console.log('===========================================================');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const testUserDataDir = path.resolve('scratch/test-browser-data');

  console.log('Initializing container...');
  const config = loadConfig(testUserDataDir, chromePath, {
    headless: false,
    cdpDiscoveryTimeoutMs: 15000,
  });
  const container = await createContainer(config);

  // Preset is automatically seeded by createContainer, let's use windows11
  const presetId = DEFAULT_PRESET_IDS.windows11;

  // Create or retrieve a test profile
  console.log('Setting up test profile...');
  const profile = await container.services.profiles.create({
    name: 'Live Fingerprint Test Profile',
    presetId,
  });

  console.log(`Profile created: ${profile.name} (ID: ${profile.id})`);
  console.log(`Fingerprint Seed: ${profile.fingerprintSeed}`);
  console.log('Launching browser with anti-detect stealth engine...');

  const launchResult = await container.services.profiles.launch(profile.id, {
    headless: false,
  });

  const cdpPort = launchResult.instance.cdpPort;
  console.log(`Browser launched! (PID: ${launchResult.instance.pid}, CDP Port: ${cdpPort})`);
  console.log(`Stealth Injected via CDP: ${launchResult.instance.stealthInjected ? 'YES' : 'NO'}`);

  // Navigate to target URL via Crosshair page or CDP
  const targetUrl = process.argv[2] || 'https://pixelscan.net';
  console.log(`Navigating to: ${targetUrl}`);

  try {
    const page = container.crosshair.getPage(profile.id);
    if (page) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch((err: any) => {
        console.warn(`Navigation warning: ${err.message}`);
      });
    }
  } catch {
    // If crosshair page not directly accessible, fallback to CDP Page.navigate
    const cdpClient = launchResult.instance.cdpClient as {
      send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
    } | undefined;
    if (cdpClient) {
      await cdpClient.send('Page.navigate', { url: targetUrl });
    }
  }

  console.log('\n========================================================');
  console.log('>>> BROWSER IS NOW OPEN ON YOUR SCREEN! <<<');
  console.log(`Current URL: ${targetUrl}`);
  console.log('You can now interact with the page, run bot tests, or browse.');
  console.log('Popular test sites:');
  console.log('  - https://pixelscan.net');
  console.log('  - https://bot.sannysoft.com');
  console.log('  - https://browserscan.net');
  console.log('  - https://abrahamjuliot.github.io/creepjs/');
  console.log('Press Ctrl+C in this terminal when you wish to close the browser.');
  console.log('========================================================\n');

  // Keep script process alive until user presses Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\nStopping profile and closing browser...');
    await container.services.profiles.stop(profile.id);
    await container.dispose();
    console.log('Closed successfully. Goodbye!');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
