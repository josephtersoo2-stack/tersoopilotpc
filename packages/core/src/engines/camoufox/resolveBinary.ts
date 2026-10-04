import fs from 'node:fs';
import path from 'node:path';

export function resolveCamoufoxBinary(): string {
  // 1. Explicit binary path env var
  if (process.env.CAMOUFOX_BIN_PATH && fs.existsSync(process.env.CAMOUFOX_BIN_PATH)) {
    const bin = process.env.CAMOUFOX_BIN_PATH;
    if (!process.env.CAMOUFOX_INSTALL_DIR) {
      process.env.CAMOUFOX_INSTALL_DIR = path.dirname(bin);
    }
    return bin;
  }

  // 2. Explicit install dir env var
  if (process.env.CAMOUFOX_INSTALL_DIR) {
    const candidate = path.join(process.env.CAMOUFOX_INSTALL_DIR, 'camoufox.exe');
    if (fs.existsSync(candidate)) return candidate;
  }

  // 3. Scan local app data official cache (the standard install path)
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local');

  const officialRoot = path.join(localAppData, 'camoufox', 'camoufox', 'Cache', 'browsers', 'official');
  if (fs.existsSync(officialRoot)) {
    try {
      const entries = fs.readdirSync(officialRoot);
      for (const entry of entries) {
        const dir = path.join(officialRoot, entry);
        const exe = path.join(dir, 'camoufox.exe');
        if (fs.existsSync(exe)) {
          process.env.CAMOUFOX_INSTALL_DIR = dir;
          return exe;
        }
      }
    } catch {
      // ignore scan error
    }
  }

  // 4. Fallback to direct cache root
  const cacheRoot = path.join(localAppData, 'camoufox', 'camoufox', 'Cache');
  const cacheExe = path.join(cacheRoot, 'camoufox.exe');
  if (fs.existsSync(cacheExe)) {
    process.env.CAMOUFOX_INSTALL_DIR = cacheRoot;
    return cacheExe;
  }

  return 'camoufox.exe';
}
