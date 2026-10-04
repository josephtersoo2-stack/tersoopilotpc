import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { EventBus } from '../src/events/EventBus';
import { openDb, type AppDatabase } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';
import { BackupService } from '../src/services/BackupService';
import { BackupError } from '../src/util/errors';

describe('BackupService (Phase 6 Hardening)', () => {
  let tempDir: string;
  let db: AppDatabase;
  let repos: Repos;
  let events: EventBus;
  let backupService: BackupService;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-backup-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    await repos.presets.seedDefaults();
    events = new EventBus();

    backupService = new BackupService({
      config,
      db,
      events,
      migrationsDir: rootMigrationsDir,
    });
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates an online backup of the SQLite database and metadata', async () => {
    // Insert test profile to ensure data exists
    await repos.profiles.create({
      id: 'p-backup-1',
      name: 'Backup Target Profile',
      tags: '["test"]',
      preset_id: '00000000-0000-4000-8000-000000000001',
      fingerprint_seed: 'seed-12345678',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'profile1'),
      state: 'idle',
      notes: null,
      engine: 'apostate',
      action_mode: 'scripted',
      captcha_budget_used: 0,
    });

    const info = await backupService.create({ name: 'pre_upgrade' });
    expect(info.backupId).toContain('backup_');
    expect(info.backupId).toContain('pre_upgrade');
    expect(info.sizeBytes).toBeGreaterThan(0);
    expect(info.stats?.profilesCount).toBe(1);

    expect(fs.existsSync(info.path)).toBe(true);
    const metaPath = `${info.path}.meta.json`;
    expect(fs.existsSync(metaPath)).toBe(true);
  });

  it('lists created backups newest first', async () => {
    await backupService.create({ name: 'first' });
    await new Promise((r) => setTimeout(r, 10));
    await backupService.create({ name: 'second' });

    const backups = await backupService.list();
    expect(backups.length).toBe(2);
    expect(backups[0]!.backupId).toContain('second');
    expect(backups[1]!.backupId).toContain('first');
  });

  it('restores database successfully from a backup', async () => {
    await repos.profiles.create({
      id: 'p-original',
      name: 'Original Profile',
      tags: '[]',
      preset_id: '00000000-0000-4000-8000-000000000001',
      fingerprint_seed: 'seed-orig',
      fingerprint_bundle: '{}',
      user_data_dir: path.join(tempDir, 'profile-orig'),
      state: 'idle',
      notes: null,
      engine: 'apostate',
      action_mode: 'scripted',
      captcha_budget_used: 0,
    });

    const backup = await backupService.create({ name: 'before_change' });

    // Now delete the profile from active DB
    await repos.profiles.delete('p-original');
    const checked1 = await repos.profiles.getById('p-original');
    expect(checked1).toBeUndefined();

    // Restore backup
    const result = await backupService.restore({ backupId: backup.backupId });
    expect(result.success).toBe(true);

    // Verify profile exists after restoration by querying DB
    const freshDb = openDb(loadConfig(tempDir, 'dummy-chrome'), rootMigrationsDir);
    const freshRepos = new Repos(freshDb);
    const restored = await freshRepos.profiles.getById('p-original');
    expect(restored).toBeDefined();
    expect(restored?.name).toBe('Original Profile');
    freshDb.close();
  });

  it('throws BACKUP_NOT_FOUND when trying to restore missing backup', async () => {
    await expect(backupService.restore({ backupId: 'non_existent_backup' })).rejects.toThrow(
      BackupError,
    );
  });

  it('throws BACKUP_CORRUPT when attempting to restore non-SQLite file', async () => {
    const backupsDir = path.join(tempDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const corruptFile = path.join(backupsDir, 'corrupt.db');
    fs.writeFileSync(corruptFile, 'THIS_IS_NOT_A_SQLITE_DATABASE');

    await expect(backupService.restore({ backupId: 'corrupt.db' })).rejects.toThrow(
      BackupError,
    );
  });
});
