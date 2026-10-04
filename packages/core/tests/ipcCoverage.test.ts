import { describe, expect, it } from 'vitest';
import { Commands, type CommandName } from '@tersoo/contracts';

describe('IPC Coverage (Phase 6 Hardening)', () => {
  const channelNames = Object.keys(Commands) as CommandName[];

  it('verifies all expected channels are defined with input and output schemas', () => {
    expect(channelNames.length).toBeGreaterThanOrEqual(25);

    const essentialChannels = [
      'profile.list',
      'profile.get',
      'profile.create',
      'profile.update',
      'profile.delete',
      'profile.launch',
      'profile.stop',
      'profile.export',
      'profile.import',
      'proxy.list',
      'proxy.create',
      'proxy.check',
      'proxy.assign',
      'proxy.release',
      'task.list',
      'task.get',
      'task.create',
      'task.dispatch',
      'run.list',
      'run.cancel',
      'run.resume',
      'fleet.status',
      'logs.query',
      'backup.create',
      'backup.list',
      'backup.restore',
    ];

    for (const channel of essentialChannels) {
      expect(channelNames).toContain(channel);
      const def = Commands[channel as CommandName];
      expect(def).toBeDefined();
      expect(def.input).toBeDefined();
      expect(def.output).toBeDefined();
    }
  });

  it('rejects invalid inputs on strict channels', () => {
    // 1. profile.get requires valid uuid
    const getRes = Commands['profile.get'].input.safeParse({ id: 'not-a-uuid' });
    expect(getRes.success).toBe(false);

    // 2. profile.create requires name and presetId
    const createRes = Commands['profile.create'].input.safeParse({ name: '' });
    expect(createRes.success).toBe(false);

    // 3. backup.restore requires non-empty backupId
    const restoreRes = Commands['backup.restore'].input.safeParse({ backupId: '' });
    expect(restoreRes.success).toBe(false);

    // 4. task.dispatch requires valid taskId and profileIds array
    const dispatchRes = Commands['task.dispatch'].input.safeParse({ taskId: 'invalid' });
    expect(dispatchRes.success).toBe(false);
  });

  it('accepts valid inputs on newly added Phase 6 channels', () => {
    // backup.create
    const backupCreate = Commands['backup.create'].input.safeParse({ name: 'snapshot_1' });
    expect(backupCreate.success).toBe(true);

    // backup.restore
    const backupRestore = Commands['backup.restore'].input.safeParse({ backupId: 'backup_123.db' });
    expect(backupRestore.success).toBe(true);

    // profile.export
    const profileExport = Commands['profile.export'].input.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
    });
    expect(profileExport.success).toBe(true);
  });
});
