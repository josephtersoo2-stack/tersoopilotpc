import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface ISecretDriver {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, secret: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/**
 * Raised when the vault cannot provide a secure storage backend, or when a
 * persisted vault fails to authenticate. Callers MUST surface this rather than
 * silently degrading to a weaker store.
 */
export class SecretVaultError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SecretVaultError';
    this.code = code;
    // Required so `instanceof` works when this file is downleveled to ES5.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MemorySecretDriver implements ISecretDriver {
  private storage = new Map<string, string>();

  private makeKey(service: string, account: string): string {
    return `${service}:${account}`;
  }

  getPassword(service: string, account: string): Promise<string | null> {
    return Promise.resolve(this.storage.get(this.makeKey(service, account)) ?? null);
  }

  setPassword(service: string, account: string, secret: string): Promise<void> {
    this.storage.set(this.makeKey(service, account), secret);
    return Promise.resolve();
  }

  deletePassword(service: string, account: string): Promise<boolean> {
    return Promise.resolve(this.storage.delete(this.makeKey(service, account)));
  }
}

/**
 * Generates a random 256-bit vault master key.
 *
 * The key MUST come from a source the operating system protects (OS keychain /
 * DPAPI / libsecret) — never from machine or user constants, and never derived
 * from guessable inputs. `apps/desktop/src/main/secretDriver.ts` obtains one
 * from Electron `safeStorage` and injects it here.
 */
export function createMasterKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Best-effort chmod to owner-only.
 *
 * Skipped on Windows, where POSIX mode bits are not implemented and Node's
 * emulation can deny the owning process access to its own file. There the
 * ciphertext is only decryptable through the OS keystore anyway.
 */
function restrictToOwner(target: string): void {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Best effort on filesystems without POSIX modes.
  }
}

const VAULT_FILE_NAME = 'secrets.vault.json';
const VAULT_IV_BYTES = 12;
const VAULT_VERSION = 2;

interface VaultPayload {
  v: number;
  iv: string;
  authTag: string;
  data: string;
}

/**
 * AES-256-GCM encrypted-at-rest file driver.
 *
 * The master key is supplied by the caller. This class never derives a key from
 * hostname, username, platform, or any other non-secret input: a key derived
 * from public machine attributes is not a secret, so anything encrypted with
 * one is effectively plaintext to anyone who can read the file.
 */
export class EncryptedFileSecretDriver implements ISecretDriver {
  private readonly filePath: string;
  private readonly masterKey: Buffer;
  private cache = new Map<string, string>();
  private loaded = false;

  constructor(masterKey: Buffer, storageDir?: string) {
    if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
      throw new SecretVaultError(
        'VAULT_KEY_INVALID',
        'EncryptedFileSecretDriver requires a 32-byte master key from a secure source',
      );
    }
    this.masterKey = masterKey;

    const dir = storageDir ?? path.join(process.cwd(), '.tersoopilot');
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      // Directory may already exist with inherited permissions; the file mode
      // below is the control that matters.
    }
    this.filePath = path.join(dir, VAULT_FILE_NAME);

    this.load();
  }
  getFilePath(): string {
    return this.filePath;
  }

  private makeKey(service: string, account: string): string {
    return `${service}:${account}`;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!fs.existsSync(this.filePath)) return;

    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      throw new SecretVaultError(
        'VAULT_UNREADABLE',
        `Cannot read secrets vault at ${this.filePath}: ${(err as Error).message}`,
      );
    }

    let payload: VaultPayload;
    try {
      payload = JSON.parse(raw) as VaultPayload;
    } catch {
      throw new SecretVaultError(
        'VAULT_CORRUPT',
        `Secrets vault at ${this.filePath} is not valid JSON. Restore from a known-good state or delete the file to re-enter secrets.`,
      );
    }

    if (!payload?.iv || !payload?.authTag || !payload?.data) {
      throw new SecretVaultError(
        'VAULT_CORRUPT',
        `Secrets vault at ${this.filePath} is missing required fields. Delete the file to re-enter secrets.`,
      );
    }

    let decrypted: string;
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.masterKey,
        Buffer.from(payload.iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
      decrypted = decipher.update(payload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    } catch {
      // GCM auth failure means either the wrong key or a tampered file. Both
      // are security events; neither may be reported as "no secrets".
      throw new SecretVaultError(
        'VAULT_AUTH_FAILED',
        `Secrets vault at ${this.filePath} failed authentication (wrong master key or the file was modified). ` +
          'Secrets are NOT loaded. Restore the OS keychain entry or delete the file to re-enter secrets.',
      );
    }

    try {
      const map = JSON.parse(decrypted) as Record<string, string>;
      for (const [k, v] of Object.entries(map)) {
        this.cache.set(k, String(v));
      }
    } catch {
      throw new SecretVaultError(
        'VAULT_CORRUPT',
        `Secrets vault at ${this.filePath} decrypted but its contents are not valid JSON.`,
      );
    }
  }

  private persist(): void {
    const plainObj: Record<string, string> = {};
    for (const [k, v] of this.cache.entries()) {
      plainObj[k] = v;
    }

    const json = JSON.stringify(plainObj);
    const iv = crypto.randomBytes(VAULT_IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    let encrypted = cipher.update(json, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const payload: VaultPayload = {
      v: VAULT_VERSION,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      data: encrypted,
    };

    // Write to a temp file then rename so a crash mid-write cannot truncate a
    // previously valid vault.
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    const fd = fs.openSync(tmpPath, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(payload), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, this.filePath);
    restrictToOwner(this.filePath);
  }

  getPassword(service: string, account: string): Promise<string | null> {
    this.load();
    return Promise.resolve(this.cache.get(this.makeKey(service, account)) ?? null);
  }

  setPassword(service: string, account: string, secret: string): Promise<void> {
    this.load();
    this.cache.set(this.makeKey(service, account), secret);
    try {
      this.persist();
    } catch (err) {
      throw new SecretVaultError(
        'VAULT_WRITE_FAILED',
        `Failed to persist encrypted secrets vault: ${(err as Error).message}`,
      );
    }
    return Promise.resolve();
  }

  deletePassword(service: string, account: string): Promise<boolean> {
    this.load();
    const deleted = this.cache.delete(this.makeKey(service, account));
    if (deleted) {
      try {
        this.persist();
      } catch (err) {
        throw new SecretVaultError(
          'VAULT_WRITE_FAILED',
          `Failed to persist encrypted secrets vault: ${(err as Error).message}`,
        );
      }
    }
    return Promise.resolve(deleted);
  }
}

export interface SecretVaultOptions {
  /** Explicit driver. Takes precedence over everything else. */
  driver?: ISecretDriver | undefined;
  /**
   * Directory for the encrypted-at-rest file driver. Only used together with
   * `masterKey`.
   */
  storageDir?: string | undefined;
  /**
   * 32-byte key sourced from the OS-protected keystore. Required to enable
   * persistent encrypted storage.
   */
  masterKey?: Buffer | undefined;
}

export class SecretVault {
  private static readonly SERVICE_NAME = 'tersoopilot';
  private driver: ISecretDriver;
  /** True when the driver keeps secrets only in memory for this process. */
  private volatile = false;

  constructor(options?: SecretVaultOptions | ISecretDriver, storageDir?: string) {
    // Backwards-compatible positional form: (driver?, storageDir?)
    if (options && typeof options === 'object' && 'getPassword' in options) {
      this.driver = options as ISecretDriver;
      return;
    }

    const opts: SecretVaultOptions = options ?? {};
    if (opts.driver) {
      this.driver = opts.driver;
      return;
    }

    this.driver = this.resolveDriver({ ...opts, storageDir: opts.storageDir ?? storageDir });
  }

  /**
   * Picks a storage backend.
   *
   * Order: explicit keytar → explicitly supplied master key → throw.
   *
   * There is deliberately NO fallback to a key derived from machine attributes
   * and NO fallback to a plaintext file. Callers that cannot supply an OS-backed
   * key should pass `new MemorySecretDriver()` explicitly, which makes the
   * lack of persistence a visible, intentional choice.
   */
  private resolveDriver(opts: SecretVaultOptions): ISecretDriver {
    const keytarDriver = this.tryKeytarDriver();
    if (keytarDriver) return keytarDriver;

    if (opts.masterKey) {
      return new EncryptedFileSecretDriver(opts.masterKey, opts.storageDir);
    }

    throw new SecretVaultError(
      'VAULT_NO_SECURE_BACKEND',
      'No secure secret backend is available. Inject a driver (Electron safeStorage is ' +
        'provided by the desktop app) or pass MemorySecretDriver explicitly for ' +
        'throwaway/test contexts. Refusing to fall back to an OS-keyed or ' +
        'plaintext store.',
    );
  }

  private tryKeytarDriver(): ISecretDriver | null {
    try {
      const req = createRequire(import.meta.url);
      const keytar = req('keytar') as {
        getPassword?: (s: string, a: string) => Promise<string | null>;
        setPassword?: (s: string, a: string, p: string) => Promise<void>;
        deletePassword?: (s: string, a: string) => Promise<boolean>;
      } | undefined;
      if (keytar && typeof keytar.getPassword === 'function' && typeof keytar.setPassword === 'function') {
        return {
          getPassword: (s, a) => keytar.getPassword!(s, a),
          setPassword: (s, a, p) => keytar.setPassword!(s, a, p),
          deletePassword: (s, a) => (keytar.deletePassword ? keytar.deletePassword(s, a) : Promise.resolve(false)),
        };
      }
    } catch {
      // keytar absent or failed to load
    }
    return null;
  }

  /**
   * Builds a vault for contexts with no OS keystore available (CLI scripts,
   * tests). Secrets live in memory for the lifetime of the process and are lost
   * on exit. Returns the driver too so the caller can warn.
   */
  static volatileForProcess(): { vault: SecretVault; volatile: true } {
    const vault = new SecretVault({ driver: new MemorySecretDriver() });
    return { vault, volatile: true };
  }

  isVolatile(): boolean {
    return this.volatile;
  }

  getDriver(): ISecretDriver {
    return this.driver;
  }

  async setProxyPassword(proxyId: string, password: string): Promise<string> {
    const account = `proxy/${proxyId}/password`;
    await this.driver.setPassword(SecretVault.SERVICE_NAME, account, password);
    return `${SecretVault.SERVICE_NAME}/${account}`;
  }

  async getProxyPassword(proxyId: string): Promise<string | null> {
    const account = `proxy/${proxyId}/password`;
    return this.driver.getPassword(SecretVault.SERVICE_NAME, account);
  }

  async getProxyCredentials(proxyId: string): Promise<string | null> {
    return this.getProxyPassword(proxyId);
  }

  async deleteProxyPassword(proxyId: string): Promise<boolean> {
    const account = `proxy/${proxyId}/password`;
    return this.driver.deletePassword(SecretVault.SERVICE_NAME, account);
  }

  async setSessionCookie(profileId: string, domain: string, cookieJson: string): Promise<string> {
    const account = `session/${profileId}/${domain}`;
    await this.driver.setPassword(SecretVault.SERVICE_NAME, account, cookieJson);
    return `${SecretVault.SERVICE_NAME}/${account}`;
  }

  async getSessionCookie(profileId: string, domain: string): Promise<string | null> {
    const account = `session/${profileId}/${domain}`;
    return this.driver.getPassword(SecretVault.SERVICE_NAME, account);
  }

  async deleteSessionCookie(profileId: string, domain: string): Promise<boolean> {
    const account = `session/${profileId}/${domain}`;
    return this.driver.deletePassword(SecretVault.SERVICE_NAME, account);
  }

  async setSigningKey(keyId: string, keySecret: string): Promise<string> {
    const account = `signing/${keyId}`;
    await this.driver.setPassword(SecretVault.SERVICE_NAME, account, keySecret);
    return `${SecretVault.SERVICE_NAME}/${account}`;
  }

  async getSigningKey(keyId: string): Promise<string | null> {
    const account = `signing/${keyId}`;
    return this.driver.getPassword(SecretVault.SERVICE_NAME, account);
  }

  async deleteSigningKey(keyId: string): Promise<boolean> {
    const account = `signing/${keyId}`;
    return this.driver.deletePassword(SecretVault.SERVICE_NAME, account);
  }

  async set(key: string, secret: string): Promise<void> {
    const parts = key.includes('/') ? key.split('/') : [SecretVault.SERVICE_NAME, key];
    const service = parts[0]!;
    const account = parts.slice(1).join('/');
    await this.driver.setPassword(service, account, secret);
  }

  async get(key: string): Promise<string | null> {
    const parts = key.includes('/') ? key.split('/') : [SecretVault.SERVICE_NAME, key];
    const service = parts[0]!;
    const account = parts.slice(1).join('/');
    return this.driver.getPassword(service, account);
  }

  async delete(key: string): Promise<boolean> {
    const parts = key.includes('/') ? key.split('/') : [SecretVault.SERVICE_NAME, key];
    const service = parts[0]!;
    const account = parts.slice(1).join('/');
    return this.driver.deletePassword(service, account);
  }

  async getSecret(key: string): Promise<string | null> {
    const [service, ...rest] = key.split('/');
    if (!service || rest.length === 0) return null;
    const account = rest.join('/');
    return this.driver.getPassword(service, account);
  }

  async setSecret(key: string, secret: string): Promise<void> {
    const [service, ...rest] = key.split('/');
    if (!service || rest.length === 0) {
      throw new Error(`Invalid secret key format: ${key}`);
    }
    const account = rest.join('/');
    await this.driver.setPassword(service, account, secret);
  }

  async deleteSecret(key: string): Promise<boolean> {
    const [service, ...rest] = key.split('/');
    if (!service || rest.length === 0) return false;
    const account = rest.join('/');
    return this.driver.deletePassword(service, account);
  }
}
