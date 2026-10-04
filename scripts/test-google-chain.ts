import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';
import { ConsentEngine } from '../packages/core/src/crosshair/ConsentEngine';
import { XPathResolver } from '../packages/core/src/crosshair/XPathResolver';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

async function testFullChain() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'test_google_chain');
  const context = await launchPersistentContext(userDataDir, {
    headless: true,
  });
  const page = context.pages()[0] || (await context.newPage());
  
  console.log('1. Navigating to https://www.google.com...');
  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  await ConsentEngine.checkAndHandle(page);

  // Type in search box
  const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
  console.log('2. Search box visible:', await searchBox.isVisible());
  await searchBox.click();
  await searchBox.fill('youtube');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  console.log('3. Results Page Title:', await page.title());
  console.log('4. Results Page URL:', page.url());

  // Check what links point to youtube
  const ytLinks = await page.$$eval('a', els => 
    els.filter(a => a.href.includes('youtube.com')).map(a => ({
      href: a.href,
      text: a.innerText.slice(0, 40),
      ariaLabel: a.getAttribute('aria-label'),
      role: a.getAttribute('role'),
    }))
  );
  console.log('5. YouTube links in Google results:', ytLinks.slice(0, 5));

  await context.close();
}

testFullChain().catch(console.error);
