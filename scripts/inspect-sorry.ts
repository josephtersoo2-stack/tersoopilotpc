import path from 'node:path';
import { launchPersistentContext } from '@heretic-tech/apostate';

async function checkSorry() {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
  const binPath = path.join(localAppData, 'apostate', 'cache', '155.0.8059.31', 'windows-x64', 'install', 'chrome.exe');
  process.env.APOSTATE_BINARY = binPath;

  const userDataDir = path.join(process.cwd(), 'scratch', 'test_workflow_profile');
  const context = await launchPersistentContext(userDataDir, { headless: true });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.google.com/search?q=news', { waitUntil: 'domcontentloaded' });
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  const text = await page.innerText('body');
  console.log('Body Text:', text.slice(0, 600));
  await context.close();
}

checkSorry().catch(console.error);
