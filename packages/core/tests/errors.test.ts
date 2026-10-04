import { describe, expect, it } from 'vitest';

import {
  DbError,
  IpcError,
  LaunchError,
  ProxyError,
  StealthError,
  TaskError,
  TersooError,
} from '../src/util/errors';

describe('Core: Errors Hierarchy', () => {
  it('instantiates base TersooError with code and meta', () => {
    const err = new TersooError('PROFILE_NOT_FOUND', 'Profile does not exist', {
      profileId: '123',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TersooError);
    expect(err.name).toBe('TersooError');
    expect(err.code).toBe('PROFILE_NOT_FOUND');
    expect(err.message).toBe('Profile does not exist');
    expect(err.meta).toEqual({ profileId: '123' });
  });

  it('correctly handles all specialized subclasses', () => {
    const launchErr = new LaunchError('SPAWN_FAILED', 'Chrome failed to spawn');
    expect(launchErr).toBeInstanceOf(TersooError);
    expect(launchErr).toBeInstanceOf(LaunchError);
    expect(launchErr.name).toBe('LaunchError');
    expect(launchErr.code).toBe('SPAWN_FAILED');

    const proxyErr = new ProxyError('NO_HEALTHY_PROXY', 'No proxy available');
    expect(proxyErr).toBeInstanceOf(ProxyError);
    expect(proxyErr.name).toBe('ProxyError');

    const taskErr = new TaskError('STEP_TIMEOUT', 'Step timed out');
    expect(taskErr).toBeInstanceOf(TaskError);
    expect(taskErr.name).toBe('TaskError');

    const dbErr = new DbError('DB_BUSY', 'Database locked');
    expect(dbErr).toBeInstanceOf(DbError);
    expect(dbErr.name).toBe('DbError');

    const stealthErr = new StealthError('STEALTH_FAILED', 'Score too low');
    expect(stealthErr).toBeInstanceOf(StealthError);
    expect(stealthErr.name).toBe('StealthError');

    const ipcErr = new IpcError('POLICY_VIOLATION', 'Invalid IPC payload');
    expect(ipcErr).toBeInstanceOf(TersooError);
    expect(ipcErr).toBeInstanceOf(IpcError);
    expect(ipcErr.name).toBe('IpcError');
  });
});
