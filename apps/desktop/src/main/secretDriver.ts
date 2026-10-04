import fs from 'node:fs';
import path from 'node:path';

import { safeStorage } from 'electron';

import type { ISecretDriver } from '@tersoo/core';

const KEY_SEPARATOR = ':';

/**
 * Best-effort chmod to owner-only.
 *
 * Skipped on Windows, where POSIX mode bits are not implemented and Node's
 * emulation can deny the owning process access to its own file. The ciphertext
 * is only decryptable through the OS keystore there regardless.
 */
function restrictToOwner(target: string): void {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Best effort on platforms without POSIX modes.
  }
}

/**
 * Secret driver backed by the operating system keystore.
 *
 * `safeStorage` resolves to DPAPI on Windows (bound to the logged-in user
 * account), the Keychain on macOS, and libsecret/kwallet on Linux. Ciphertext is
 * therefore only decryptable by this user on this machine, which is what makes
 * an encrypted file acceptable to store at all.
 *
 * The vault file holds one safeStorage ciphertext per secret, base64 encoded.
 * No key material is derived from machine attributes or written in the clear.
 */
export class SafeStorageSecretDriver implements ISecretDriver {
  private readonly filePath: string;
  private cache = new Map<string, string>();
  private loaded = false;

  constructor(storageDir: string) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'OS encryption is unavailable (safeStorage.isEncryptionAvailable() === false). ' +
          'Refusing to store proxy credentials or API keys without OS-backed protection. ' +
          'On Linux this usually means no keyring daemon is running.',
      );
    }

    fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
    this.filePath = path.join(storageDir, 'secrets.vault.json');
    this.load();
  }

  private makeKey(service: string, account: string): string {
    return service + KEY_SEPARATOR + account;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!fs.existsSync(this.filePath)) return;

    const raw = fs.readFileSync(this.filePath, 'utf8');
    let payload: { v?: number; entries?: Record<string, string> };
    try {
      payload = JSON.parse(raw) as { v?: number; entries?: Record<string, string> };
    } catch {
      throw new Error(
        `Secrets vault at ${this.filePath} is not valid JSON. Delete it to re-enter secrets.`,
      );
    }

    for (const [k, v] of Object.entries(payload.entries ?? {})) {
      try {
        this.cache.set(k, safeStorage.decryptString(Buffer.from(v, 'base64')));
      } catch (err) {
        // A ciphertext that will not decrypt means the keystore entry is gone or
        // the file was tampered with. Never report this as "no secret present".
        throw new Error(
          `Secrets vault at ${this.filePath} could not be decrypted by the OS keystore ` +
            `(${String((err as Error).message)}). Secrets are NOT loaded.`,
        );
      }
    }
  }

  private persist(): void {
    const entries: Record<string, string> = {};
    for (const [k, v] of this.cache.entries()) {
      entries[k] = safeStorage.encryptString(v).toString('base64');
    }

    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    const fd = fs.openSync(tmpPath, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({ v: 2, entries }), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, this.filePath);
    restrictToOwner(this.filePath);
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    this.load();
    return this.cache.get(this.makeKey(service, account)) ?? null;
  }

  async setPassword(service: string, account: string, secret: string): Promise<void> {
    this.load();
    this.cache.set(this.makeKey(service, account), secret);
    this.persist();
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    this.load();
    const deleted = this.cache.delete(this.makeKey(service, account));
    if (deleted) this.persist();
    return deleted;
  }
}

/**
 * Detects a vault written by the pre-hardening build, which encrypted with a
 * key derived from `hostname:username:platform` and a hardcoded salt.
 *
 * That key is public knowledge, so the old file cannot be trusted and its
 * contents must be re-entered. This reports presence only; it never recovers or
 * logs a secret value.
 */
export function detectLegacyOsKeyedVault(storageDir: string): { found: boolean; path: string } {
  const filePath = path.join(storageDir, 'secrets.vault.json');
  if (!fs.existsSync(filePath)) return { found: false, path: filePath };

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      v?: number;
      entries?: unknown;
    };
    // v2 with an `entries` map is the current safeStorage layout.
    if (typeof parsed.v === 'number' && parsed.entries) {
      return { found: false, path: filePath };
    }
    return { found: true, path: filePath };
  } catch {
    return { found: true, path: filePath };
  }
}

/**
 * Slot names found in a legacy vault, so the user knows what to re-enter.
 * Values are never returned.
 */
export function legacyVaultSlotNames(storageDir: string): string[] {
  const filePath = path.join(storageDir, 'secrets.vault.json');
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      entries?: Record<string, string>;
      data?: string;
    };
    if (parsed.entries) {
      return Object.keys(parsed.entries).map((k) => k.split(KEY_SEPARATOR)[1] ?? k);
    }
    if (parsed.data) return ['<encrypted blob with unknown contents>'];
  } catch {
    // fall through
  }
  return [];
}
