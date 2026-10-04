import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const pnpmDir = path.resolve('node_modules/.pnpm');
const entries = fs.readdirSync(pnpmDir).filter((e) => e.startsWith('better-sqlite3@'));
for (const entry of entries) {
  const pkgDir = path.join(pnpmDir, entry, 'node_modules', 'better-sqlite3');
  const releaseDir = path.join(pkgDir, 'build', 'Release');
  const version = entry.split('@')[1];
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/better-sqlite3-v${version}-node-v137-win32-x64.tar.gz`;
  console.log(`Downloading ${url}...`);
  const resp = await fetch(url);
  if (resp.ok) {
    const buf = Buffer.from(await resp.arrayBuffer());
    const tarPath = path.join(pkgDir, 'node-v137.tar.gz');
    fs.writeFileSync(tarPath, buf);
    const tmpDir = path.join(pkgDir, 'tmp_node137');
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`tar -xzf "${tarPath}" -C "${tmpDir}"`, { cwd: pkgDir });
    const found1 = path.join(tmpDir, 'build', 'Release', 'better_sqlite3.node');
    const found2 = path.join(tmpDir, 'Release', 'better_sqlite3.node');
    const found = fs.existsSync(found1) ? found1 : found2;
    if (fs.existsSync(found)) {
      fs.copyFileSync(found, path.join(releaseDir, 'better_sqlite3.node'));
      console.log(`Successfully installed Node ABI 137 binary for ${entry}`);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(tarPath);
  } else {
    console.log(`Failed to fetch for ${entry}: ${resp.status}`);
  }
}
