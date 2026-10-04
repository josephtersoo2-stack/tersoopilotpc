import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acquireProfileLock,
  checkProfileLock,
  clearActiveLocalLocks,
  forceUnlockProfile,
  isProcessAlive,
  isProfileLocked,
  ProfileLock,
} from '../src/persistence/profileLock';
import { ProfileError } from '../src/util/errors';

describe('Ticket 1.5: ProfileLock (File Lock)', () => {
  let tempDir: string;
  let lockPath: string;
  const profileId = 'test-profile-1';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-profile-lock-test-'));
    lockPath = path.join(tempDir, 'profile.lock');
    clearActiveLocalLocks();
  });

  afterEach(async () => {
    clearActiveLocalLocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('isProcessAlive helper', () => {
    it('detects current process as alive', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('detects invalid or non-existent PID as dead', () => {
      expect(isProcessAlive(-1)).toBe(false);
      expect(isProcessAlive(0)).toBe(false);
      expect(isProcessAlive(9999999)).toBe(false);
    });
  });

  describe('acquire and release lifecycle', () => {
    it('acquires lock and writes valid metadata', async () => {
      const handle = await acquireProfileLock(lockPath, profileId);
      try {
        expect(handle.profileId).toBe(profileId);
        expect(handle.lockPath).toBe(lockPath);
        expect(handle.isHeld()).toBe(true);
        expect(handle.metadata.pid).toBe(process.pid);
        expect(handle.metadata.profileId).toBe(profileId);
        expect(handle.metadata.lockId).toBeDefined();

        expect(fs.existsSync(lockPath)).toBe(true);
        const fileContent = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        expect(fileContent.pid).toBe(process.pid);
        expect(fileContent.profileId).toBe(profileId);

        expect(await isProfileLocked(lockPath)).toBe(true);
        const check = await checkProfileLock(lockPath);
        expect(check?.lockId).toBe(handle.metadata.lockId);
      } finally {
        await handle.release();
      }

      expect(handle.isHeld()).toBe(false);
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(await isProfileLocked(lockPath)).toBe(false);
      expect(await checkProfileLock(lockPath)).toBeNull();
    });

    it('release is idempotent', async () => {
      const handle = await acquireProfileLock(lockPath, profileId);
      await handle.release();
      expect(handle.isHeld()).toBe(false);

      // Calling release a second time should not throw
      await expect(handle.release()).resolves.toBeUndefined();
      expect(handle.isHeld()).toBe(false);
    });

    it('rejects concurrent acquisition within the same process', async () => {
      const handle1 = await acquireProfileLock(lockPath, profileId);
      try {
        await expect(acquireProfileLock(lockPath, profileId)).rejects.toThrowError(
          ProfileError,
        );
        await expect(acquireProfileLock(lockPath, profileId)).rejects.toMatchObject({
          code: 'ALREADY_RUNNING',
        });
      } finally {
        await handle1.release();
      }

      // After release, acquiring succeeds again
      const handle2 = await acquireProfileLock(lockPath, profileId);
      expect(handle2.isHeld()).toBe(true);
      await handle2.release();
    });
  });

  describe('stale lock recovery', () => {
    it('recovers from stale lock with dead PID', async () => {
      // Create a stale lock file pointing to a dead PID
      const deadPid = 9999999;
      const staleMeta = {
        pid: deadPid,
        profileId,
        createdAt: Date.now() - 60_000,
        lockId: 'stale-lock-uuid',
      };
      fs.writeFileSync(lockPath, JSON.stringify(staleMeta, null, 2), 'utf8');

      expect(await isProfileLocked(lockPath)).toBe(false);

      // Acquisition should detect dead PID, remove stale lock, and acquire cleanly
      const handle = await acquireProfileLock(lockPath, profileId);
      expect(handle.isHeld()).toBe(true);
      expect(handle.metadata.pid).toBe(process.pid);

      await handle.release();
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('recovers from empty or corrupted lock file older than staleTimeout', async () => {
      fs.writeFileSync(lockPath, 'not-valid-json', 'utf8');
      const oldTime = (Date.now() - 40_000) / 1000;
      fs.utimesSync(lockPath, oldTime, oldTime);

      const handle = await acquireProfileLock(lockPath, profileId, { staleTimeoutMs: 10_000 });
      expect(handle.isHeld()).toBe(true);
      await handle.release();
    });
  });

  describe('timeout and waiting for lock handover', () => {
    it('successfully waits for lock release within timeoutMs', async () => {
      const handle1 = await acquireProfileLock(lockPath, profileId);

      // Release handle1 after 80ms
      setTimeout(() => {
        void handle1.release();
      }, 80);

      // Caller 2 waits with timeoutMs = 400ms
      const handle2 = await acquireProfileLock(lockPath, profileId, {
        timeoutMs: 400,
        retryIntervalMs: 20,
      });

      expect(handle2.isHeld()).toBe(true);
      await handle2.release();
    });

    it('fails with ALREADY_RUNNING if timeoutMs expires while still locked', async () => {
      const handle1 = await acquireProfileLock(lockPath, profileId);
      try {
        await expect(
          acquireProfileLock(lockPath, profileId, {
            timeoutMs: 60,
            retryIntervalMs: 20,
          }),
        ).rejects.toMatchObject({
          code: 'ALREADY_RUNNING',
        });
      } finally {
        await handle1.release();
      }
    });
  });

  describe('forceUnlockProfile', () => {
    it('forcefully unlinks lock file and clears active lock', async () => {
      const handle = await acquireProfileLock(lockPath, profileId);
      expect(await isProfileLocked(lockPath)).toBe(true);

      await forceUnlockProfile(lockPath);
      expect(await isProfileLocked(lockPath)).toBe(false);
      expect(fs.existsSync(lockPath)).toBe(false);

      // Re-acquiring should now work immediately
      const handle2 = await acquireProfileLock(lockPath, profileId);
      expect(handle2.isHeld()).toBe(true);
      await handle2.release();
    });
  });

  describe('ProfileLock class wrapper', () => {
    it('wraps lock operations on a specific profile', async () => {
      const lock = new ProfileLock(lockPath, profileId);
      expect(await lock.isLocked()).toBe(false);

      const handle = await lock.acquire();
      expect(await lock.isLocked()).toBe(true);
      expect((await lock.checkLock())?.pid).toBe(process.pid);

      await handle.release();
      expect(await lock.isLocked()).toBe(false);
    });
  });
});
