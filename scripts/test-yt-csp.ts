import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

async function testYouTubeInnerHTML() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'test_yt_csp');
  const context = await launchPersistentContext(userDataDir, { headless: true });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const res = await page.evaluate(() => {
    try {
      const el = document.createElement('div');
      el.innerHTML = '<span>test</span>';
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message, stack: err.stack };
    }
  });

  console.log('Result on YouTube:', res);
  await context.close();
}

testYouTubeInnerHTML().catch(console.error);
