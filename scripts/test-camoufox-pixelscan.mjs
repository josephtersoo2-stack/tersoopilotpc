import path from 'node:path';
import { Camoufox } from 'camoufox-js';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const cacheDir = path.join(localAppData, 'camoufox', 'camoufox', 'Cache');
process.env.CAMOUFOX_INSTALL_DIR = cacheDir;

console.log('Testing Camoufox on Pixelscan...');

try {
  const browser = await Camoufox({
    headless: true,
    geoip: true,
  });

  const page = await browser.newPage();
  console.log('Navigating to https://pixelscan.net/fingerprint-check ...');
  await page.goto('https://pixelscan.net/fingerprint-check', { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('Waiting for scan to complete...');
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes('consistent') && !text.includes('scanning');
  }, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const screenshotPath = path.join(process.cwd(), 'scratch', 'camoufox_pixelscan_result.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved screenshot to:', screenshotPath);

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Consistent:', bodyText.includes('consistent'));
  console.log('Inconsistent:', bodyText.includes('inconsistent'));
  console.log('Masking detected:', bodyText.includes('Masking detected'));
  console.log('No masking detected:', bodyText.includes('No masking detected'));
  console.log('No automated behavior:', bodyText.includes('No automated behavior detected'));

  await browser.close();
  console.log('Camoufox test complete!');
} catch (err) {
  console.error('Camoufox test failed:', err);
  process.exit(1);
}
