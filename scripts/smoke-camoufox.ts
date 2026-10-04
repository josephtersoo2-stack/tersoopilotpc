import fs from 'node:fs';
import path from 'node:path';

// Auto-discover installed official Camoufox directory if not set
if (!process.env.CAMOUFOX_INSTALL_DIR) {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
  const officialRoot = path.join(localAppData, 'camoufox', 'camoufox', 'Cache', 'browsers', 'official');
  if (fs.existsSync(officialRoot)) {
    const entries = fs.readdirSync(officialRoot).filter((e) => fs.existsSync(path.join(officialRoot, e, 'camoufox.exe')));
    if (entries.length > 0) {
      process.env.CAMOUFOX_INSTALL_DIR = path.join(officialRoot, entries[0]);
    }
  }
}

async function main() {
  console.log('[smoke-camoufox] CAMOUFOX_INSTALL_DIR:', process.env.CAMOUFOX_INSTALL_DIR);
  const { Camoufox } = await import('camoufox-js');

  console.log('[smoke-camoufox] Launching Camoufox (Gecko engine)...');
  const browser = await Camoufox({
    headless: false,
    geoip: false,
    os: 'windows',
    locale: 'en-US',
    humanize: true,
  });

  const context = 'newContext' in browser ? await browser.newContext() : browser;
  const page = context.pages()[0] ?? (await context.newPage());

  console.log('[smoke-camoufox] Navigating to https://pixelscan.net/fingerprint-check...');
  try {
    await page.goto('https://pixelscan.net/fingerprint-check', { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('[smoke-camoufox] Page loaded. Waiting for scan...');
    await page.waitForTimeout(15000);

    const content = await page.content();
    for (const kw of [
      'No fingerprint masking detected',
      'Masking detected',
      'No automated behavior detected',
      'automated behavior detected',
    ]) {
      if (content.includes(kw)) {
        console.log(`[smoke-camoufox] [PIXELSCAN VERDICT]: ${kw}`);
      }
    }
  } catch (navErr) {
    console.warn('[smoke-camoufox] Navigation error (network/timeout):', navErr);
  }

  await browser.close();
  console.log('[smoke-camoufox] Smoke test finished and browser closed cleanly.');
}

main().catch((err) => {
  console.error('[smoke-camoufox] FAILED:', err);
  process.exit(1);
});
