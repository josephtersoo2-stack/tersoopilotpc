import fs from 'node:fs';
import path from 'node:path';

export function ensureProfileDirs(userDataDir: string): {
  userDataDir: string;
  chromiumDir: string;
  cacheDir: string;
  crashDir: string;
} {
  const chromiumDir = path.join(userDataDir, 'chromium');
  const cacheDir = path.join(userDataDir, 'cache');
  const crashDir = path.join(userDataDir, 'crash');

  fs.mkdirSync(chromiumDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(crashDir, { recursive: true });

  // The profile directory is a security boundary, not just a cache. Chromium
  // writes the chosen `--remote-debugging-port` into DevToolsActivePort here,
  // and whoever can read that file and connect to the port controls every page
  // in the profile, including the sessions of the accounts logged into it.
  // Restrict it to the owner on platforms that have POSIX modes.
  restrictToOwner(userDataDir);
  restrictToOwner(chromiumDir);
  restrictToOwner(cacheDir);
  restrictToOwner(crashDir);

  return { userDataDir, chromiumDir, cacheDir, crashDir };
}

/**
 * Best-effort chmod to owner-only.
 *
 * Skipped entirely on Windows: POSIX mode bits are not implemented there, and
 * Node emulates them by denying access, which can leave a directory that the
 * owning process can no longer clean up. On Windows the profile is instead
 * protected by living under the per-user application data directory, which is
 * already ACL-restricted to that user.
 */
export function restrictToOwner(target: string): void {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(target, 0o700);
  } catch {
    // Not supported here; see above.
  }
}

/**
 * Ensures Chromium profile preferences are optimized for persistent web logins.
 *
 * Disables Chrome browser-level account sign-in (DICE / Gaia account reconcilor) so
 * that web logins (Gmail, YouTube, Google Accounts, etc.) rely purely on persistent
 * session cookies without Chromium attempting OAuth token synchronization with
 * non-existent or invalid API keys.
 * Also cleans up crash-exit states so session cookies and tabs are not invalidated on restart.
 */
export function prepareChromiumProfile(userDataDir: string): void {
  const defaultDir = path.join(userDataDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });
  const prefPath = path.join(defaultDir, 'Preferences');

  let prefs: Record<string, any> = {};
  if (fs.existsSync(prefPath)) {
    try {
      prefs = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
    } catch {
      prefs = {};
    }
  }

  // 1. Disable Chrome browser-level account sign-in (DICE).
  // This allows full, permanent web sign-in to Gmail, YouTube, Google accounts
  // without Chrome trying to link the browser installation via OAuth tokens.
  if (!prefs.signin) prefs.signin = {};
  prefs.signin.allowed = false;

  // 2. Ensure exit status is clean so Chromium does not trigger crash recovery
  if (!prefs.profile) prefs.profile = {};
  prefs.profile.exit_type = 'Normal';
  prefs.profile.exited_cleanly = true;

  // 3. Remove any stale DICE OAuth outage error records
  if (prefs.google?.services?.signin) {
    delete prefs.google.services.signin;
  }

  // 4. Ensure session restore does not discard session cookies
  if (!prefs.session) prefs.session = {};
  if (!prefs.session.restore_on_startup) {
    prefs.session.restore_on_startup = 1;
  }

  // 5. Clean up stale GPUPersistentCache to avoid DawnGraphiteCache lock conflicts from prior crashes
  const gpuCacheDir = path.join(userDataDir, 'GPUPersistentCache');
  if (fs.existsSync(gpuCacheDir)) {
    try {
      fs.rmSync(gpuCacheDir, { recursive: true, force: true });
    } catch {
      // Best-effort
    }
  }

  try {
    fs.writeFileSync(prefPath, JSON.stringify(prefs, null, 2), 'utf8');
  } catch (err) {
    console.warn('[prepareChromiumProfile] Could not write Preferences:', err);
  }
}
