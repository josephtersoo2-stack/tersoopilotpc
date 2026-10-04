import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

async function ensureBetterSqliteBinary() {
  const pnpmDir = path.resolve('node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) return;

  const entries = fs.readdirSync(pnpmDir).filter((e) => e.startsWith('better-sqlite3@'));
  for (const entry of entries) {
    const pkgDir = path.join(pnpmDir, entry, 'node_modules', 'better-sqlite3');
    const releaseDir = path.join(pkgDir, 'build', 'Release');
    fs.mkdirSync(releaseDir, { recursive: true });

    const binaryPath = path.join(releaseDir, 'better_sqlite3.node');
    const electronBinaryPath = path.join(releaseDir, 'better_sqlite3.electron.node');
    const version = entry.split('@')[1];
    const platform = process.platform;
    const arch = process.arch;

    // 1. Ensure Node.js binary
    if (!fs.existsSync(binaryPath)) {
      console.log(`Installing prebuilt Node.js binary for ${entry}...`);
      const abi = process.versions.modules;
      const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/better-sqlite3-v${version}-node-v${abi}-${platform}-${arch}.tar.gz`;
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const tarPath = path.join(pkgDir, 'prebuilt.tar.gz');
          fs.writeFileSync(tarPath, buf);
          execSync('tar -xzf prebuilt.tar.gz', { cwd: pkgDir });
          fs.unlinkSync(tarPath);
          console.log(`Prebuilt Node.js binary installed successfully for ${entry}`);
        }
      } catch (err) {
        console.warn(`Could not auto-download Node binary:`, err.message);
      }
    }

    // 2. Ensure Electron binary (Electron 32 uses ABI 128)
    if (!fs.existsSync(electronBinaryPath)) {
      console.log(`Installing prebuilt Electron binary for ${entry}...`);
      const electronAbi = '128';
      const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/better-sqlite3-v${version}-electron-v${electronAbi}-${platform}-${arch}.tar.gz`;
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const tarPath = path.join(pkgDir, 'electron-prebuilt.tar.gz');
          fs.writeFileSync(tarPath, buf);
          const tmpExtract = path.join(pkgDir, 'tmp_electron');
          fs.mkdirSync(tmpExtract, { recursive: true });
          execSync(`tar -xzf "${tarPath}" -C "${tmpExtract}"`, { cwd: pkgDir });
          const extractedNode = path.join(tmpExtract, 'build', 'Release', 'better_sqlite3.node');
          const altNode = path.join(tmpExtract, 'Release', 'better_sqlite3.node');
          const source = fs.existsSync(extractedNode) ? extractedNode : altNode;
          if (fs.existsSync(source)) {
            fs.copyFileSync(source, electronBinaryPath);
            console.log(`Prebuilt Electron binary installed successfully as better_sqlite3.electron.node`);
          }
          fs.rmSync(tmpExtract, { recursive: true, force: true });
          fs.unlinkSync(tarPath);
        }
      } catch (err) {
        console.warn(`Could not auto-download Electron binary:`, err.message);
      }
    }
  }
}

function patchRebrowserPlaywright() {
  const pnpmDir = path.resolve('node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) return;
  const entries = fs.readdirSync(pnpmDir).filter((e) => e.startsWith('rebrowser-playwright-core@'));
  for (const entry of entries) {
    const framesFile = path.join(
      pnpmDir,
      entry,
      'node_modules',
      'rebrowser-playwright-core',
      'lib',
      'server',
      'frames.js',
    );
    if (fs.existsSync(framesFile)) {
      let content = fs.readFileSync(framesFile, 'utf8');
      const target = "if (process.env['REBROWSER_PATCHES_RUNTIME_FIX_MODE'] !== '0') {";
      const replacement =
        "if (this._page._delegate._mainFrameSession && process.env['REBROWSER_PATCHES_RUNTIME_FIX_MODE'] !== '0') {";
      if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(framesFile, content, 'utf8');
        console.log('[postinstall] Patched rebrowser-playwright-core for Firefox compatibility');
      }
    }
  }
}

function ensureCamoufoxVersion() {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
  const officialRoot = path.join(localAppData, 'camoufox', 'camoufox', 'Cache', 'browsers', 'official');
  if (fs.existsSync(officialRoot)) {
    for (const dir of fs.readdirSync(officialRoot)) {
      const vFile = path.join(officialRoot, dir, 'version.json');
      if (fs.existsSync(vFile)) {
        try {
          const d = JSON.parse(fs.readFileSync(vFile, 'utf8'));
          if (!d.release && (d.build || d.version)) {
            d.release = d.build || 'beta.31';
            fs.writeFileSync(vFile, JSON.stringify(d, null, 2), 'utf8');
          }
        } catch {}
      }
    }
  }
}

await ensureBetterSqliteBinary();
patchRebrowserPlaywright();
ensureCamoufoxVersion();

