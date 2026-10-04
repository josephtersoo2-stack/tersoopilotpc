import path from 'node:path';
import { Camoufox } from 'camoufox-js';

const bin = 'C:\\Users\\Akende Micheal\\AppData\\Local\\camoufox\\camoufox\\Cache\\browsers\\official\\152.0.4-beta.31-ed63ea51\\camoufox.exe';
console.log('Testing Camoufox about:policies with binary:', bin);

async function main() {
  const browser = await Camoufox({
    headless: true,
    executable_path: bin,
    os: 'windows',
  });

  let context;
  if (browser.newContext) {
    context = await browser.newContext();
  } else {
    context = browser;
  }
  const page = context.pages ? (context.pages()[0] || await context.newPage()) : await context.newPage();
  
  try {
    await page.goto('about:policies', { waitUntil: 'domcontentloaded' });
    const text = await page.evaluate(() => document.body.innerText);
    console.log('--- ABOUT:POLICIES OUTPUT ---');
    console.log(text.slice(0, 1000));
  } catch (e) {
    console.log('Error loading about:policies:', e.message);
  }

  try {
    await page.goto('about:preferences#search', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const searchEngines = await page.evaluate(() => {
      const select = document.getElementById('defaultEngine');
      const opts = select ? Array.from(select.options).map(o => o.text) : [];
      return opts;
    });
    console.log('--- DEFAULT SEARCH OPTIONS ---', searchEngines);
  } catch (e) {
    console.log('Error loading about:preferences#search:', e.message);
  }

  await (browser.close ? browser.close() : context.close());
}

main().catch(console.error);
