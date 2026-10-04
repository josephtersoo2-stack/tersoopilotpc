import fs from 'node:fs';
import path from 'node:path';

import type { BackupCreateInput, BackupInfo, BackupRestoreInput, BackupRestoreResult } from '@tersoo/contracts';
import Database from 'better-sqlite3';

import { paths, type Config } from '../config';
import type { EventBus } from '../events/EventBus';
import { runMigrations } from '../persistence/migrate';
import { resolveMigrationsDir, type AppDatabase } from '../persistence/db';
import type { DB } from '../persistence/schema';
import { BackupError } from '../util/errors';
import type { createLogger } from '../util/logger';

export interface BackupServiceDeps {
  config: Config;
  db: AppDatabase<DB>;
  events?: EventBus | undefined;
  logger?: ReturnType<typeof createLogger> | undefined;
  migrationsDir?: string | undefined;
}

export class BackupService {
  private readonly config: Config;
  private readonly db: AppDatabase<DB>;
  private readonly events?: EventBus | undefined;
  private readonly logger?: ReturnType<typeof createLogger> | undefined;
  private readonly migrationsDir?: string | undefined;

  constructor(deps: BackupServiceDeps) {
    this.config = deps.config;
    this.db = deps.db;
    this.events = deps.events;
    this.logger = deps.logger;
    this.migrationsDir = deps.migrationsDir;
  }

  private getBackupsDir(): string {
    const dir = path.join(this.config.userDataDir, 'backups');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Resolves a caller-supplied backup id to a path inside the backups
   * directory, or throws.
   *
   * `backupId` arrives over IPC. Without this check a value such as
   * `..\..\..\Users\someone\other` makes the app read a file from anywhere on
   * disk and install it as the live database. The id must be a bare filename
   * matching the pattern this service creates, and the resolved path must stay
   * inside the backups directory.
   */
  private resolveBackupPath(backupId: string): string {
    const backupsDir = this.getBackupsDir();
    const base = path.basename(backupId);

    if (base !== backupId || !/^backup_[A-Za-z0-9_-]+(_[A-Za-z0-9_-]+)?$/.test(base.replace(/\.db$/, ''))) {
      throw new BackupError(
        'BACKUP_NOT_FOUND',
        `Invalid backup id '${backupId}'. Expected an id produced by this app.`,
      );
    }

    const filename = base.endsWith('.db') ? base : `${base}.db`;
    const candidate = path.resolve(backupsDir, filename);
    const root = path.resolve(backupsDir);

    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      throw new BackupError(
        'BACKUP_NOT_FOUND',
        `Backup '${backupId}' resolves outside the backups directory.`,
      );
    }

    return candidate;
  }

  async create(input?: BackupCreateInput): Promise<BackupInfo> {
    const backupsDir = this.getBackupsDir();
    const timestamp = Date.now();
    const cleanName = input?.name ? input.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'manual';
    const backupId = `backup_${timestamp}_${cleanName}`;
    const filename = `${backupId}.db`;
    const destPath = path.join(backupsDir, filename);
    const metaPath = path.join(backupsDir, `${filename}.meta.json`);

    try {
      // Execute non-blocking online SQLite backup
      await this.db.sqlite.backup(destPath);

      const stats = fs.statSync(destPath);

      // Query high-level stats for metadata
      let profilesCount = 0;
      let tasksCount = 0;
      let proxiesCount = 0;
      let runsCount = 0;

      try {
        const pCount = await this.db.selectFrom('profiles').select((eb) => eb.fn.count('id').as('cnt')).executeTakeFirst();
        profilesCount = Number(pCount?.cnt ?? 0);
        const tCount = await this.db.selectFrom('tasks').select((eb) => eb.fn.count('id').as('cnt')).executeTakeFirst();
        tasksCount = Number(tCount?.cnt ?? 0);
        const prCount = await this.db.selectFrom('proxies').select((eb) => eb.fn.count('id').as('cnt')).executeTakeFirst();
        proxiesCount = Number(prCount?.cnt ?? 0);
        const rCount = await this.db.selectFrom('runs').select((eb) => eb.fn.count('id').as('cnt')).executeTakeFirst();
        runsCount = Number(rCount?.cnt ?? 0);
      } catch {
        // non-fatal if table querying fails
      }

      const info: BackupInfo = {
        backupId,
        filename,
        path: destPath,
        sizeBytes: stats.size,
        createdAt: timestamp,
        name: input?.name,
        stats: {
          profilesCount,
          tasksCount,
          proxiesCount,
          runsCount,
        },
      };

      fs.writeFileSync(metaPath, JSON.stringify(info, null, 2), 'utf-8');

      if (this.events) {
        this.events.emit('backup.created', { backupId, filename, sizeBytes: stats.size });
      }

      return info;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BackupError('BACKUP_FAILED', `Failed to create backup: ${msg}`);
    }
  }

  async list(): Promise<BackupInfo[]> {
    const backupsDir = this.getBackupsDir();
    if (!fs.existsSync(backupsDir)) {
      return [];
    }

    const entries = fs.readdirSync(backupsDir);
    const metaFiles = entries.filter((e) => e.endsWith('.meta.json'));
    const results: BackupInfo[] = [];

    for (const metaFile of metaFiles) {
      try {
        const fullPath = path.join(backupsDir, metaFile);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(content) as BackupInfo;
        // Re-derive the path from this directory instead of trusting the
        // absolute path inside the metadata file, which is editable on disk.
        let derivedPath: string;
        try {
          derivedPath = this.resolveBackupPath(path.basename(parsed.filename ?? ''));
        } catch {
          continue;
        }
        if (fs.existsSync(derivedPath)) {
          results.push({ ...parsed, path: derivedPath });
        }
      } catch {
        // Skip corrupted metadata
      }
    }

    // Check for any orphaned .db files without .meta.json
    const dbFiles = entries.filter((e) => e.endsWith('.db'));
    for (const dbFile of dbFiles) {
      const dbPath = path.join(backupsDir, dbFile);
      const backupId = path.basename(dbFile, '.db');
      const alreadyListed = results.some((r) => r.path === dbPath);
      if (!alreadyListed && fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        results.push({
          backupId,
          filename: dbFile,
          path: dbPath,
          sizeBytes: stats.size,
          createdAt: stats.mtimeMs,
        });
      }
    }

    // Sort newest first
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  async restore(input: BackupRestoreInput): Promise<BackupRestoreResult> {
    const backupId = input.backupId;

    let backupPath = this.resolveBackupPath(backupId);

    if (!fs.existsSync(backupPath)) {
      // Check if backupId corresponds to a filename from meta
      const all = await this.list();
      const match = all.find((b) => b.backupId === backupId || b.filename === backupId);
      if (!match) {
        throw new BackupError('BACKUP_NOT_FOUND', `Backup '${backupId}' not found`);
      }
      // Re-derive the path from the directory rather than trusting the absolute
      // path stored in on-disk metadata, which could have been edited.
      backupPath = this.resolveBackupPath(path.basename(match.path));
      if (!fs.existsSync(backupPath)) {
        throw new BackupError('BACKUP_NOT_FOUND', `Backup '${backupId}' not found`);
      }
    }

    // Verify SQLite magic bytes
    try {
      const fd = fs.openSync(backupPath, 'r');
      const buf = new Uint8Array(16);
      fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      if (!Buffer.from(buf).toString('utf-8').startsWith('SQLite format 3')) {
        throw new BackupError('BACKUP_CORRUPT', `File '${backupPath}' is not a valid SQLite database`);
      }
    } catch (err: unknown) {
      if (err instanceof BackupError) throw err;
      throw new BackupError('BACKUP_CORRUPT', `Cannot read backup header: ${err}`);
    }

    const activeDbPath = paths(this.config).db;
    const backupPreRestore = `${activeDbPath}.pre-restore-${Date.now()}`;

    try {
      // Create safety snapshot of active database
      if (fs.existsSync(activeDbPath)) {
        fs.copyFileSync(activeDbPath, backupPreRestore);
      }

      // Checkpoint WAL and close active database connection
      try {
        this.db.sqlite.pragma('wal_checkpoint(TRUNCATE)');
      } catch {}

      // Overwrite database file with backup
      fs.copyFileSync(backupPath, activeDbPath);

      // Remove any lingering wal/shm files from previous state
      const walFile = `${activeDbPath}-wal`;
      const shmFile = `${activeDbPath}-shm`;
      if (fs.existsSync(walFile)) {
        try { fs.unlinkSync(walFile); } catch {}
      }
      if (fs.existsSync(shmFile)) {
        try { fs.unlinkSync(shmFile); } catch {}
      }

      // Verify integrity of the restored file
      const verifyDb = new Database(activeDbPath);
      const integrity = verifyDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
      const isOk = integrity.length > 0 && integrity[0]?.integrity_check === 'ok';
      if (!isOk) {
        verifyDb.close();
        throw new Error('Integrity check failed on restored database');
      }

      // Run any pending migrations to ensure forward compatibility
      const resolvedMigrations = this.migrationsDir ?? resolveMigrationsDir();
      runMigrations(verifyDb, resolvedMigrations);
      verifyDb.close();

      // Clean up safety snapshot on success
      if (fs.existsSync(backupPreRestore)) {
        try { fs.unlinkSync(backupPreRestore); } catch {}
      }

      const result: BackupRestoreResult = {
        success: true,
        message: `Successfully restored backup '${backupId}'. Restart the app if active connections are locked.`,
        restoredAt: Date.now(),
      };

      if (this.events) {
        this.events.emit('backup.restored', { backupId, restoredAt: result.restoredAt });
      }

      return result;
    } catch (err: unknown) {
      // Rollback to safety snapshot if restoration failed
      if (fs.existsSync(backupPreRestore) && fs.existsSync(activeDbPath)) {
        try {
          fs.copyFileSync(backupPreRestore, activeDbPath);
        } catch {}
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new BackupError('BACKUP_FAILED', `Restoration failed: ${msg}`);
    }
  }
}
