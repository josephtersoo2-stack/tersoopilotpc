import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Database } from 'better-sqlite3';

import { DbError } from '../util/errors';

import type { MigrationRow } from './schema';

/**
 * Set this environment variable to re-record checksums for migrations that have
 * already been applied but whose SQL file has since been edited.
 *
 * Editing a migration that has already shipped changes the file's hash without
 * changing the schema of databases that already ran it, so a strict checksum
 * comparison bricks an otherwise healthy install. The repair only rewrites the
 * bookkeeping for versions that are already recorded; it never applies, skips,
 * or reorders SQL.
 */
export const MIGRATION_REPAIR_ENV = 'TERSOO_REPAIR_MIGRATION_CHECKSUMS';

function repairRequested(): boolean {
  const raw = process.env[MIGRATION_REPAIR_ENV];
  return raw === '1' || raw === 'true';
}

export function runMigrations(db: Database, migrationsDir: string) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, checksum TEXT NOT NULL
  );`);

  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();

  const applied = new Map<number, { checksum: string }>();
  const rows = db.prepare('SELECT version, checksum FROM migrations').all() as MigrationRow[];
  for (const row of rows) {
    applied.set(row.version, { checksum: row.checksum });
  }

  const repair = repairRequested();
  const repaired: number[] = [];

  for (const file of files) {
    const version = Number(file.slice(0, 4));
    const rawSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const rawChecksum = crypto.createHash('sha256').update(rawSql).digest('hex');
    const normalizedSql = rawSql.replace(/\r\n/g, '\n');
    const normalizedChecksum = crypto.createHash('sha256').update(normalizedSql).digest('hex');

    if (applied.has(version)) {
      const recorded = applied.get(version)!.checksum;
      if (recorded === normalizedChecksum || recorded === rawChecksum) {
        continue;
      }

      if (repair) {
        db.prepare('UPDATE migrations SET checksum = ? WHERE version = ?').run(normalizedChecksum, version);
        applied.set(version, { checksum: normalizedChecksum });
        repaired.push(version);
        continue;
      }

      throw new DbError(
        'MIGRATION_FAILED',
        `checksum mismatch for ${file} (version ${version}). The file has changed since it ` +
          `was applied to this database, so the recorded checksum is stale. If you are ` +
          `sure this edit was only cosmetic (formatting, comments) and the schema is ` +
          `already correct, re-run with ${MIGRATION_REPAIR_ENV}=1 to re-record the ` +
          `checksum. Otherwise restore the original file, or add a new numbered ` +
          `migration instead of editing an applied one.`,
        { version, file, expected: recorded, actual: normalizedChecksum },
      );
    }

    const tx = db.transaction(() => {
      db.exec(rawSql);
      db.prepare('INSERT INTO migrations (version, applied_at, checksum) VALUES (?, ?, ?)').run(
        version,
        Date.now(),
        normalizedChecksum,
      );
      db.pragma(`user_version = ${version}`);
    });
    tx();
  }

  if (repaired.length > 0) {
    // Loud, because it masks real drift: a migration file edited after release
    // means databases that already applied it may not have the intended schema.
    console.warn(
      `[migrate] Re-recorded stale checksums for already-applied migrations: ${repaired.join(', ')}. ` +
        `These files changed after being applied, so any schema change in them will NOT ` +
        `reach existing databases — write a new numbered migration for that.`,
    );
  }
}
