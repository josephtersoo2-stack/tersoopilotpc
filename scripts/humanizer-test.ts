import { chromium } from 'playwright-core';
import { Humanizer } from '../packages/core/src/crosshair/Humanizer';

async function main() {
  const isHeadless = process.argv.includes('--headless');
  console.log(`Starting Humanizer test (headless=${isHeadless})...`);
  const browser = await chromium.launch({ headless: isHeadless });
  try {
    const page = await browser.newPage();
    await page.goto('https://example.com');
    const h = new Humanizer(12345);
    console.log('Testing moveMouse to (500, 300)...');
    await h.moveMouse(page, { x: 500, y: 300 });
    console.log('Testing moveMouse to (100, 500)...');
    await h.moveMouse(page, { x: 100, y: 500 });
    console.log('Testing scroll down 800...');
    await h.scroll(page, 'down', 800);
    console.log('Testing idle (1000, 2000)...');
    await h.idle(page, 1000, 2000);
    console.log('Humanizer test completed successfully.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Humanizer test failed:', err);
  process.exit(1);
});
