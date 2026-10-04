// Test Camoufox launch directly to capture crash error
import path from 'node:path';
import fs from 'node:fs';

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');

// Find camoufox binary
const officialRoot = path.join(localAppData, 'camoufox', 'camoufox', 'Cache', 'browsers', 'official');
let binaryPath = null;
if (fs.existsSync(officialRoot)) {
  const entries = fs.readdirSync(officialRoot);
  for (const entry of entries) {
    const exe = path.join(officialRoot, entry, 'camoufox.exe');
    if (fs.existsSync(exe)) {
      binaryPath = exe;
      process.env.CAMOUFOX_INSTALL_DIR = path.dirname(exe);
      break;
    }
  }
}

console.log('Binary path:', binaryPath);
console.log('CAMOUFOX_INSTALL_DIR:', process.env.CAMOUFOX_INSTALL_DIR);
console.log('Binary exists:', binaryPath ? fs.existsSync(binaryPath) : false);

if (!binaryPath) {
  console.error('ERROR: No camoufox binary found!');
  process.exit(1);
}

try {
  const { Camoufox } = await import('camoufox-js');
  console.log('camoufox-js imported successfully');
  
  const options = {
    headless: false,
    executable_path: binaryPath,
    os: 'windows',
    locale: 'en-US',
    humanize: true,
  };
  
  console.log('Launching with options:', JSON.stringify(options, null, 2));
  
  const browser = await Camoufox(options);
  console.log('Camoufox launched successfully!');
  
  const context = browser.contexts?.() ? browser.contexts()[0] : browser;
  const page = context.pages?.()[0] || await (context.newPage ? context.newPage() : browser.newPage());
  
  await page.goto('https://example.com');
  console.log('Page loaded!');
  
  const title = await page.title();
  console.log('Page title:', title);
  
  await (browser.close ? browser.close() : context.close());
  console.log('Browser closed cleanly');
} catch (err) {
  console.error('CAMOUFOX LAUNCH ERROR:');
  console.error('Name:', err.name);
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  if (err.cause) console.error('Cause:', err.cause);
  process.exit(1);
}
