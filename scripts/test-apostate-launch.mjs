import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

console.log('Testing Apostate launch using binary at:', binPath);

try {
  const context = await launchPersistentContext(
    path.join(process.cwd(), 'scratch', 'test_apostate_profile'),
    {
      headless: true,
      fingerprint: 42,
      fingerprintPlatform: 'windows',
    }
  );

  console.log('Apostate persistent context launched successfully!');
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://example.com');
  const title = await page.title();
  const platform = await page.evaluate(() => navigator.platform);
  const userAgent = await page.evaluate(() => navigator.userAgent);
  console.log('Page Title:', title);
  console.log('Navigator Platform:', platform);
  console.log('Navigator UserAgent:', userAgent);
  await context.close();
  console.log('Apostate context closed cleanly. Test passed!');
} catch (err) {
  console.error('Apostate launch failed:', err);
  process.exit(1);
}
