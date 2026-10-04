// scripts/verify-fix5-cdp-leak.ts
// Live automated verification script for Fix 5 (Runtime.enable CDP Leak Suppression)
import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_PRESET_IDS } from '../packages/contracts/src';
import { createContainer, loadConfig } from '../packages/core/src';

async function main() {
  console.log('================================================================');
  console.log('  TersooPilot: Fix 5 CDP Leak Suppression Live Verifier          ');
  console.log('  Verifying: Runtime.enable console serialization leak           ');
  console.log('================================================================\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const testUserDataDir = path.resolve('scratch/fix5-verification-test-data');

  if (!fs.existsSync(testUserDataDir)) {
    fs.mkdirSync(testUserDataDir, { recursive: true });
  }

  const config = loadConfig(testUserDataDir, chromePath, {
    headless: false,
    cdpDiscoveryTimeoutMs: 20000,
  });
  const container = await createContainer(config);

  const presetId = DEFAULT_PRESET_IDS.windows11;

  console.log('[1/3] Creating Windows 11 Profile...');
  const profile = await container.services.profiles.create({
    name: 'Fix 5 Runtime.enable Verification Profile',
    presetId,
  });

  console.log('[2/3] Spawning Chromium via Supervisor and connecting via Crosshair (rebrowser-playwright-core)...');
  const launchResult = await container.services.profiles.launch(profile.id, {
    headless: false,
  });

  const page = container.crosshair.getPage(profile.id);
  console.log(`       Chromium PID: ${launchResult.instance.pid}`);
  console.log(`       CDP Port: ${launchResult.instance.cdpPort}`);

  console.log('[3/3] Running runtimeEnableLeak test in page context...');
  await page.goto('about:blank', { waitUntil: 'load' });

  // 1. Direct in-page test matching Rebrowser / CreepJS / Pixelscan detector
  const directProbe = await page.evaluate(async () => {
    let stackLookupCount = 0;
    const e = new Error();
    Object.defineProperty(e, 'stack', {
      configurable: false,
      enumerable: false,
      get() {
        stackLookupCount += 1;
        return 'trap';
      },
    });

    console.debug(e);
    console.log(e);
    console.warn(e);

    // Wait 300ms for any CDP console serialization queue
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      stackLookupCount,
      leakDetected: stackLookupCount > 0,
    };
  });

  console.log('\n--- Direct In-Page Console Getter Leak Results ---');
  console.log(`  Stack Lookup Count: ${directProbe.stackLookupCount}`);
  console.log(`  Leak Detected:      ${directProbe.leakDetected}`);
  console.log(`  Status:             ${!directProbe.leakDetected ? '✅ PASS (No CDP console serialization)' : '❌ FAIL (Runtime.enable leak active)'}\n`);

  // 2. Live remote test against bot-detector.rebrowser.net (if reachable)
  console.log('Testing against https://bot-detector.rebrowser.net/ ...');
  try {
    await page.goto('https://bot-detector.rebrowser.net/', {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    const rebrowserDetections = await page.evaluate(() => {
      const results: Record<string, unknown> = {};
      const rows = document.querySelectorAll('.detections-table tr, table tr');
      rows.forEach((row) => {
        const text = row.textContent || '';
        if (text.includes('runtimeEnableLeak')) {
          results.runtimeEnableLeak = text.includes('PASS') || text.includes('No leak') || !text.includes('FAIL');
          results.runtimeEnableLeakRaw = text.trim();
        }
        if (text.includes('dummyFn')) {
          results.dummyFn = text.trim();
        }
      });
      return results;
    });

    console.log('--- bot-detector.rebrowser.net Results ---');
    console.log(JSON.stringify(rebrowserDetections, null, 2));
  } catch (err) {
    console.log(`(Remote detector check skipped: ${err instanceof Error ? err.message : String(err)})`);
  }

  // Graceful shutdown
  console.log('\nCleaning up verification session...');
  await container.services.profiles.stop(profile.id);
  await container.services.profiles.delete(profile.id);

  if (directProbe.leakDetected) {
    console.error('\n❌ FIX 5 VERIFICATION FAILED: Runtime.enable console getter was triggered!');
    process.exit(1);
  } else {
    console.log('\n🎉 FIX 5 VERIFIED: Runtime.enable console serialization leak is completely suppressed!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
