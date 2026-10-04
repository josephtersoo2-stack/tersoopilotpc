import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';
import { ConsentEngine } from '../packages/core/src/crosshair/ConsentEngine';
import { XPathResolver } from '../packages/core/src/crosshair/XPathResolver';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
process.env.APOSTATE_BINARY = binPath;

async function diagnoseGoogle() {
  const userDataDir = path.join(process.cwd(), 'scratch', 'test_google_diag');
  const context = await launchPersistentContext(userDataDir, {
    headless: true,
  });
  const page = context.pages()[0] || (await context.newPage());
  
  console.log('1. Navigating to https://www.google.com...');
  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  console.log('2. Page Title:', await page.title());
  console.log('3. Current URL:', page.url());

  // Check consent banner
  const handled = await ConsentEngine.checkAndHandle(page, { timeoutMs: 2000 });
  console.log('4. Consent handled:', handled);
  await page.waitForTimeout(1000);

  // Check what elements match search
  const textareas = await page.$$eval('textarea', els => els.map(e => ({ name: e.name, id: e.id, class: e.className, visible: e.offsetWidth > 0 })));
  console.log('5. Textareas on page:', textareas);

  const inputs = await page.$$eval('input', els => els.map(e => ({ name: e.name, type: e.type, id: e.id, visible: e.offsetWidth > 0 })));
  console.log('6. Inputs on page:', inputs.slice(0, 10));

  const buttons = await page.$$eval('button', els => els.map(e => ({ text: e.innerText, id: e.id, ariaLabel: e.getAttribute('aria-label') })));
  console.log('7. Buttons on page:', buttons.slice(0, 10));

  // Try resolver
  const resolver = new XPathResolver();
  try {
    const res = await resolver.resolve(page, 'intent:search_input', { timeoutMs: 3000 });
    console.log('8. Resolver succeeded with:', res.strategy, res.resolvedSelector);
  } catch (err: any) {
    console.log('8. Resolver failed with error:', err.message);
  }

  await context.close();
}

diagnoseGoogle().catch(console.error);
