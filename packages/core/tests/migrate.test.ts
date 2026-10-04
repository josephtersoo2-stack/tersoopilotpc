import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb } from '../src/persistence/db';
import { runMigrations } from '../src/persistence/migrate';
import type { MigrationRow } from '../src/persistence/schema';
import { DbError } from '../src/util/errors';

describe('Core: Persistence & Migration Runner', () => {
  let tempDir: string;
  let migrationsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-test-'));
    migrationsDir = path.join(tempDir, 'migrations');
    fs.mkdirSync(migrationsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('applies migrations in sequential order and records checksums', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '0001_test_a.sql'),
      'CREATE TABLE a (id TEXT PRIMARY KEY);',
    );
    fs.writeFileSync(
      path.join(migrationsDir, '0002_test_b.sql'),
      'CREATE TABLE b (id TEXT PRIMARY KEY);',
    );

    const dbFile = path.join(tempDir, 'test.db');
    const sqlite = new Database(dbFile);

    runMigrations(sqlite, migrationsDir);

    const rows = sqlite
      .prepare('SELECT version, checksum FROM migrations ORDER BY version')
      .all() as MigrationRow[];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.version).toBe(1);
    expect(rows[1]?.version).toBe(2);

    // Verify tables actually exist
    expect(() => sqlite.prepare('SELECT * FROM a').all()).not.toThrow();
    expect(() => sqlite.prepare('SELECT * FROM b').all()).not.toThrow();

    // Idempotent re-run
    expect(() => runMigrations(sqlite, migrationsDir)).not.toThrow();

    sqlite.close();
  });

  it('throws DbError with MIGRATION_FAILED on checksum mismatch', () => {
    const file1 = path.join(migrationsDir, '0001_test.sql');
    fs.writeFileSync(file1, 'CREATE TABLE t1 (id TEXT);');

    const dbFile = path.join(tempDir, 'test.db');
    const sqlite = new Database(dbFile);

    runMigrations(sqlite, migrationsDir);

    // Tamper with migration file content
    fs.writeFileSync(file1, 'CREATE TABLE t1 (id TEXT, name TEXT);');

    expect(() => runMigrations(sqlite, migrationsDir)).toThrowError(DbError);
    expect(() => runMigrations(sqlite, migrationsDir)).toThrowError(
      /checksum mismatch for 0001_test\.sql/,
    );

    sqlite.close();
  });

  it('openDb creates database file, parent directories, and initializes Kysely', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '0001_users.sql'),
      'CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);',
    );

    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb<{ users: { id: string; name: string } }>(config, migrationsDir);

    expect(fs.existsSync(path.join(tempDir, 'tersoopilot.db'))).toBe(true);

    db.sqlite.prepare("INSERT INTO users (id, name) VALUES ('u1', 'Alice')").run();
    const user = db.sqlite.prepare("SELECT * FROM users WHERE id = 'u1'").get() as {
      id: string;
      name: string;
    };
    expect(user.name).toBe('Alice');

    db.close();
  });
});
