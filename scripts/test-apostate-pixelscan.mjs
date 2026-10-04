import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

console.log('Testing Apostate on Pixelscan...');

try {
  const context = await launchPersistentContext(
    path.join(process.cwd(), 'scratch', 'apostate_pixelscan_profile'),
    {
      headless: true,
      fingerprint: 42,
      fingerprintPlatform: 'windows',
    }
  );

  const page = context.pages()[0] || (await context.newPage());
  console.log('Navigating to https://pixelscan.net/fingerprint-check ...');
  await page.goto('https://pixelscan.net/fingerprint-check', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  console.log('Waiting for fingerprint scan to finish...');
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes('consistent') && !text.includes('scanning');
  }, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const screenshotPath = path.join(process.cwd(), 'scratch', 'apostate_pixelscan_result.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved screenshot to:', screenshotPath);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const inconsistent = bodyText.includes('inconsistent');
  const consistent = bodyText.includes('consistent');
  const masking = bodyText.includes('Masking detected');
  const noAutomated = bodyText.includes('No automated behavior detected');

  console.log('--- PIXELSCAN SCAN ANALYSIS ---');
  console.log('Consistent:', consistent);
  console.log('Inconsistent:', inconsistent);
  console.log('Masking detected:', masking);
  console.log('No automated behavior detected:', noAutomated);

  await context.close();
  console.log('Done!');
} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
}
