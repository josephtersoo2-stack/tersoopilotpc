import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const src = path.resolve(pkgRoot, 'src/stealth_shim.js');
const destDir = path.resolve(pkgRoot, 'dist');
const dest = path.resolve(destDir, 'stealth_shim.js');

if (fs.existsSync(src)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} to ${dest}`);
}

const htmlSrc = path.resolve(pkgRoot, 'src/self-test.html');
const htmlDest = path.resolve(destDir, 'self-test.html');
if (fs.existsSync(htmlSrc)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(htmlSrc, htmlDest);
  console.log(`Copied ${htmlSrc} to ${htmlDest}`);
}
