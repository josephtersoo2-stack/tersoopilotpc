import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ProfileError } from '../util/errors';

export interface ProfileLockMetadata {
  pid: number;
  profileId: string;
  createdAt: number;
  lockId: string;
}

export interface LockHandle {
  readonly profileId: string;
  readonly lockPath: string;
  readonly metadata: ProfileLockMetadata;
  release(): Promise<void>;
  isHeld(): boolean;
}

export interface AcquireLockOptions {
  timeoutMs?: number | undefined;
  retryIntervalMs?: number | undefined;
  staleTimeoutMs?: number | undefined;
}

export function isProcessAlive(pid: number): boolean {
  if (pid <= 0 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    return error.code === 'EPERM';
  }
}

interface ActiveLockEntry {
  handle: LockHandle;
  fileHandle?: fs.promises.FileHandle | undefined;
}

const activeLocks = new Map<string, ActiveLockEntry>();

export function getActiveLocalLocksCount(): number {
  return activeLocks.size;
}

export function clearActiveLocalLocks(): void {
  activeLocks.clear();
}

export async function acquireProfileLock(
  lockPath: string,
  profileId: string,
  options?: AcquireLockOptions,
): Promise<LockHandle> {
  const normalizedPath = path.resolve(lockPath);
  const staleTimeoutMs = options?.staleTimeoutMs ?? 30_000;
  const timeoutMs = options?.timeoutMs ?? 0;
  const retryIntervalMs = options?.retryIntervalMs ?? 50;
  const startTime = Date.now();
  let timeExceeded = false;

  while (!timeExceeded) {
    // 1. Fast in-process check
    if (activeLocks.has(normalizedPath)) {
      if (timeoutMs > 0 && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
        continue;
      }
      timeExceeded = true;
      throw new ProfileError(
        'ALREADY_RUNNING',
        `Profile '${profileId}' is already locked in current process`,
        { profileId, lockPath },
      );
    }

    // 2. Ensure parent directory exists
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });

    // 3. Try exclusive file creation
    let fileHandle: fs.promises.FileHandle | undefined;
    try {
      fileHandle = await fs.promises.open(lockPath, 'wx');
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    if (fileHandle) {
      const metadata: ProfileLockMetadata = {
        pid: process.pid,
        profileId,
        createdAt: Date.now(),
        lockId: crypto.randomUUID(),
      };

      try {
        await fileHandle.writeFile(JSON.stringify(metadata, null, 2), 'utf8');
        await fileHandle.sync();
      } catch (writeErr) {
        try {
          await fileHandle.close();
        } catch {
          // ignore
        }
        try {
          await fs.promises.unlink(lockPath);
        } catch {
          // ignore
        }
        throw writeErr;
      }

      let held = true;
      const handle: LockHandle = {
        profileId,
        lockPath,
        metadata,
        isHeld: () => held,
        release: async () => {
          if (!held) return;
          held = false;
          activeLocks.delete(normalizedPath);

          const entry = activeLocks.get(normalizedPath);
          if (entry?.fileHandle) {
            try {
              await entry.fileHandle.close();
            } catch {
              // ignore
            }
          }
          if (fileHandle) {
            try {
              await fileHandle.close();
            } catch {
              // ignore
            }
            fileHandle = undefined;
          }

          try {
            await fs.promises.unlink(lockPath);
          } catch {
            // ignore if deleted
          }
        },
      };

      activeLocks.set(normalizedPath, { handle, fileHandle });
      return handle;
    }

    // 4. File already exists (EEXIST) -> inspect if stale
    let isStale = false;
    let existingMeta: ProfileLockMetadata | null = null;

    try {
      const content = await fs.promises.readFile(lockPath, 'utf8');
      if (!content || content.trim().length === 0) {
        isStale = true;
      } else {
        existingMeta = JSON.parse(content) as ProfileLockMetadata;
        if (!existingMeta.pid || !isProcessAlive(existingMeta.pid)) {
          isStale = true;
        } else if (existingMeta.createdAt && Date.now() - existingMeta.createdAt > staleTimeoutMs) {
          isStale = true;
        }
      }
    } catch {
      // Unparseable or reading error: check mtime
      try {
        const stat = await fs.promises.stat(lockPath);
        if (Date.now() - stat.mtimeMs > staleTimeoutMs) {
          isStale = true;
        }
      } catch {
        isStale = true;
      }
    }

    if (isStale) {
      try {
        await fs.promises.unlink(lockPath);
      } catch {
        // ignore concurrent unlink
      }
      // Retry immediately
      continue;
    }

    // 5. Active external lock
    if (timeoutMs > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
      continue;
    }

    timeExceeded = true;
    const pidText = existingMeta ? ` (PID ${existingMeta.pid})` : '';
    throw new ProfileError(
      'ALREADY_RUNNING',
      `Profile '${profileId}' is locked by active process${pidText}`,
      { profileId, lockPath, holderPid: existingMeta?.pid },
    );
  }

  throw new ProfileError(
    'ALREADY_RUNNING',
    `Timed out waiting for lock on profile '${profileId}'`,
    { profileId, lockPath },
  );
}

export async function isProfileLocked(lockPath: string): Promise<boolean> {
  const normalized = path.resolve(lockPath);
  if (activeLocks.has(normalized)) return true;

  try {
    const content = await fs.promises.readFile(lockPath, 'utf8');
    const meta = JSON.parse(content) as ProfileLockMetadata;
    return isProcessAlive(meta.pid);
  } catch {
    return false;
  }
}

export async function checkProfileLock(
  lockPath: string,
): Promise<ProfileLockMetadata | null> {
  const normalized = path.resolve(lockPath);
  const active = activeLocks.get(normalized);
  if (active) return active.handle.metadata;

  try {
    const content = await fs.promises.readFile(lockPath, 'utf8');
    const meta = JSON.parse(content) as ProfileLockMetadata;
    if (isProcessAlive(meta.pid)) {
      return meta;
    }
    return null;
  } catch {
    return null;
  }
}

export async function forceUnlockProfile(lockPath: string): Promise<void> {
  const normalized = path.resolve(lockPath);
  const active = activeLocks.get(normalized);

  if (active) {
    await active.handle.release();
  } else {
    try {
      await fs.promises.unlink(lockPath);
    } catch {
      // ignore
    }
  }
}

export class ProfileLock {
  constructor(
    readonly lockPath: string,
    readonly profileId: string,
  ) {}

  acquire(options?: AcquireLockOptions): Promise<LockHandle> {
    return acquireProfileLock(this.lockPath, this.profileId, options);
  }

  isLocked(): Promise<boolean> {
    return isProfileLocked(this.lockPath);
  }

  checkLock(): Promise<ProfileLockMetadata | null> {
    return checkProfileLock(this.lockPath);
  }

  forceUnlock(): Promise<void> {
    return forceUnlockProfile(this.lockPath);
  }
}

export async function cleanupAllStaleLocks(
  profilesDir: string,
  maxAgeMs = 15_000,
): Promise<number> {
  let cleaned = 0;
  try {
    if (!fs.existsSync(profilesDir)) return 0;
    const entries = await fs.promises.readdir(profilesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lockPath = path.join(profilesDir, entry.name, 'profile.lock');
      try {
        const stat = await fs.promises.stat(lockPath).catch(() => null);
        if (!stat) continue;
        if (Date.now() - stat.mtimeMs > maxAgeMs) {
          await fs.promises.unlink(lockPath).catch(() => {});
          cleaned++;
        }
      } catch {}
    }
  } catch {}
  return cleaned;
}
