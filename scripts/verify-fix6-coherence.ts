// scripts/verify-fix6-coherence.ts
// Live automated verification script for Fix 6 (Deep Platform Coherence Vectors)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_PRESET_IDS } from '../packages/contracts/src';
import { createContainer, loadConfig } from '../packages/core/src';

const TEST_PAGE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Anti-Bot Telemetry Test</title>
</head>
<body>
  <h1>Anti-Bot Coherence Audit</h1>
  <div id="telemetry">WAITING</div>
  <script>
    (async () => {
      const results = {};

      // 1. Plugins & MimeTypes
      results.pluginsCount = navigator.plugins ? navigator.plugins.length : 0;
      results.mimeTypesCount = navigator.mimeTypes ? navigator.mimeTypes.length : 0;

      // 2. Connection
      const conn = navigator.connection;
      results.connectionEffectiveType = conn ? conn.effectiveType : null;
      results.connectionType = conn ? conn.type : null;

      // 3. CSS Media Queries (hover & pointer)
      results.matchHoverHover = window.matchMedia('(hover: hover)').matches;
      results.matchHoverNone = window.matchMedia('(hover: none)').matches;
      results.matchPointerFine = window.matchMedia('(pointer: fine)').matches;
      results.matchPointerCoarse = window.matchMedia('(pointer: coarse)').matches;

      // 4. Screen Orientation
      results.orientationType = screen.orientation ? screen.orientation.type : null;
      results.orientationAngle = screen.orientation ? screen.orientation.angle : null;

      // 5. Speech Synthesis Voices
      results.speechVoices = window.speechSynthesis
        ? window.speechSynthesis.getVoices().map(v => v.name)
        : [];

      // 6. Battery Status API
      if (typeof navigator.getBattery === 'function') {
        try {
          const b = await navigator.getBattery();
          results.batteryLevel = b.level;
          results.batteryCharging = b.charging;
        } catch {
          results.batteryLevel = null;
        }
      } else {
        results.batteryLevel = null;
      }

      // 7. Font Face Set checks
      if (document.fonts && typeof document.fonts.check === 'function') {
        results.hasSegoeUI = document.fonts.check("12px 'Segoe UI'");
        results.hasRoboto = document.fonts.check("12px 'Roboto'");
      }

      document.getElementById('telemetry').textContent = JSON.stringify(results);
    })();
  </script>
</body>
</html>`;

async function verifyProfile(container: any, testUrl: string, presetId: string, profileName: string, isMobile: boolean) {
  console.log(`\n================================================================`);
  console.log(`  Verifying Platform Coherence: ${profileName} (${isMobile ? 'Mobile' : 'Desktop'})`);
  console.log(`================================================================`);

  const profile = await container.services.profiles.create({
    name: profileName,
    presetId,
  });

  const launchResult = await container.services.profiles.launch(profile.id, {
    headless: false,
  });

  const page = container.crosshair.getPage(profile.id);
  await page.goto(testUrl, { waitUntil: 'load' });

  // Wait for the in-page JavaScript to populate telemetry into #telemetry
  await page.waitForFunction(() => {
    const el = document.getElementById('telemetry');
    return el && el.textContent !== 'WAITING';
  }, { timeout: 10000 });

  const rawTelemetry = await page.textContent('#telemetry');
  const telemetry = JSON.parse(rawTelemetry || '{}');

  console.log('Telemetry Results (Evaluated by in-page scripts in main world):');
  console.log(JSON.stringify(telemetry, null, 2));

  // Assertions
  const checks: { name: string; pass: boolean; expected: any; actual: any }[] = [];

  if (isMobile) {
    checks.push({
      name: 'Mobile Plugins Empty',
      pass: telemetry.pluginsCount === 0 && telemetry.mimeTypesCount === 0,
      expected: '0 plugins',
      actual: `${telemetry.pluginsCount} plugins`,
    });
    checks.push({
      name: 'Mobile Connection Type Cellular',
      pass: telemetry.connectionType === 'cellular',
      expected: 'cellular',
      actual: telemetry.connectionType,
    });
    checks.push({
      name: 'Mobile Media Hover None',
      pass: telemetry.matchHoverNone === true && telemetry.matchHoverHover === false,
      expected: 'hover: none',
      actual: `hover:none=${telemetry.matchHoverNone}, hover:hover=${telemetry.matchHoverHover}`,
    });
    checks.push({
      name: 'Mobile Media Pointer Coarse',
      pass: telemetry.matchPointerCoarse === true && telemetry.matchPointerFine === false,
      expected: 'pointer: coarse',
      actual: `coarse=${telemetry.matchPointerCoarse}, fine=${telemetry.matchPointerFine}`,
    });
    checks.push({
      name: 'Mobile Orientation Portrait',
      pass: telemetry.orientationType === 'portrait-primary',
      expected: 'portrait-primary',
      actual: telemetry.orientationType,
    });
    checks.push({
      name: 'Mobile Font Roboto Present & Segoe UI Absent',
      pass: telemetry.hasRoboto === true && telemetry.hasSegoeUI === false,
      expected: 'Roboto: true, Segoe UI: false',
      actual: `Roboto: ${telemetry.hasRoboto}, Segoe UI: ${telemetry.hasSegoeUI}`,
    });
    checks.push({
      name: 'Mobile Speech Voices Google Present',
      pass: telemetry.speechVoices.length > 0 && telemetry.speechVoices.some((v: string) => v.includes('Google')),
      expected: 'Google TTS voices',
      actual: telemetry.speechVoices.join(', '),
    });
    checks.push({
      name: 'Mobile Battery Manager Present',
      pass: telemetry.batteryLevel !== null && telemetry.batteryLevel < 1.0,
      expected: 'Battery level < 1.0',
      actual: `level=${telemetry.batteryLevel}, charging=${telemetry.batteryCharging}`,
    });
  } else {
    checks.push({
      name: 'Desktop Plugins Present (5 PDF Plugins)',
      pass: telemetry.pluginsCount === 5 && telemetry.mimeTypesCount === 2,
      expected: '5 plugins, 2 mimetypes',
      actual: `${telemetry.pluginsCount} plugins, ${telemetry.mimeTypesCount} mimetypes`,
    });
    checks.push({
      name: 'Desktop Connection EffectiveType 4g',
      pass: telemetry.connectionEffectiveType === '4g' && telemetry.connectionType === undefined,
      expected: '4g, no cellular',
      actual: `${telemetry.connectionEffectiveType}, type=${telemetry.connectionType}`,
    });
    checks.push({
      name: 'Desktop Media Hover Hover',
      pass: telemetry.matchHoverHover === true && telemetry.matchHoverNone === false,
      expected: 'hover: hover',
      actual: `hover:hover=${telemetry.matchHoverHover}, hover:none=${telemetry.matchHoverNone}`,
    });
    checks.push({
      name: 'Desktop Media Pointer Fine',
      pass: telemetry.matchPointerFine === true && telemetry.matchPointerCoarse === false,
      expected: 'pointer: fine',
      actual: `fine=${telemetry.matchPointerFine}, coarse=${telemetry.matchPointerCoarse}`,
    });
    checks.push({
      name: 'Desktop Orientation Landscape',
      pass: telemetry.orientationType === 'landscape-primary',
      expected: 'landscape-primary',
      actual: telemetry.orientationType,
    });
    checks.push({
      name: 'Desktop Font Segoe UI Present & Roboto Absent',
      pass: telemetry.hasSegoeUI === true && telemetry.hasRoboto === false,
      expected: 'Segoe UI: true, Roboto: false',
      actual: `Segoe UI: ${telemetry.hasSegoeUI}, Roboto: ${telemetry.hasRoboto}`,
    });
    checks.push({
      name: 'Desktop Speech Voices Microsoft Present',
      pass: telemetry.speechVoices.length > 0 && telemetry.speechVoices.some((v: string) => v.includes('Microsoft')),
      expected: 'Microsoft SAPI voices',
      actual: telemetry.speechVoices.join(', '),
    });
    checks.push({
      name: 'Desktop Battery Manager Present',
      pass: telemetry.batteryLevel === 1.0 && telemetry.batteryCharging === true,
      expected: 'level=1.0, charging=true',
      actual: `level=${telemetry.batteryLevel}, charging=${telemetry.batteryCharging}`,
    });
  }

  let allPassed = true;
  for (const c of checks) {
    const status = c.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | ${c.name} (Expected: ${c.expected}, Got: ${c.actual})`);
    if (!c.pass) allPassed = false;
  }

  await container.services.profiles.stop(profile.id);
  // Allow Windows process manager to fully reap Chromium worker processes
  await new Promise((r) => setTimeout(r, 2500));
  try {
    await container.services.profiles.delete(profile.id);
  } catch (err) {
    console.warn(`Profile directory cleanup warning:`, err);
  }

  return allPassed;
}

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const testUserDataDir = path.resolve('scratch/fix6-verification-test-data');

  if (!fs.existsSync(testUserDataDir)) {
    fs.mkdirSync(testUserDataDir, { recursive: true });
  }

  // Spin up local HTTP server to host the test page
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(TEST_PAGE_HTML);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  const testUrl = `http://127.0.0.1:${port}/`;
  console.log(`Local test server running at ${testUrl}`);

  const config = loadConfig(testUserDataDir, chromePath, {
    headless: false,
    cdpDiscoveryTimeoutMs: 20000,
  });
  const container = await createContainer(config);

  try {
    const desktopPass = await verifyProfile(
      container,
      testUrl,
      DEFAULT_PRESET_IDS.windows11,
      'Windows 11 Desktop Coherence Test',
      false,
    );

    const mobilePass = await verifyProfile(
      container,
      testUrl,
      DEFAULT_PRESET_IDS.android14,
      'Android 14 Mobile Coherence Test',
      true,
    );

    console.log('\n================================================================');
    console.log(`  Final Result: Desktop=${desktopPass ? 'PASS' : 'FAIL'}, Mobile=${mobilePass ? 'PASS' : 'FAIL'}`);
    console.log('================================================================');

    if (desktopPass && mobilePass) {
      console.log('\n🎉 FIX 6 VERIFIED: All platform coherence vectors align perfectly!');
      process.exit(0);
    } else {
      console.error('\n❌ FIX 6 FAILED: Incoherence detected!');
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
