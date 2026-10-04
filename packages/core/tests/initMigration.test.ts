import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { openDb } from '../src/persistence/db';
import type { MigrationRow } from '../src/persistence/schema';

describe('Ticket 0.7: Initial Migration & Schema Migrations', () => {
  let tempDir: string;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-init-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows handle release grace
    }
  });

  it('verifies 0001_init.sql file exists in repo root migrations directory', () => {
    const initMigrationPath = path.join(rootMigrationsDir, '0001_init.sql');
    expect(fs.existsSync(initMigrationPath)).toBe(true);
  });

  it('applies 0001_init.sql on boot and creates all schema tables and indexes', () => {
    const singleMigrationDir = path.join(tempDir, 'migration_0001');
    fs.mkdirSync(singleMigrationDir, { recursive: true });
    fs.copyFileSync(
      path.join(rootMigrationsDir, '0001_init.sql'),
      path.join(singleMigrationDir, '0001_init.sql'),
    );

    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, singleMigrationDir);

    try {
      // Verify migration record
      const migrations = db.sqlite
        .prepare('SELECT version, checksum FROM migrations')
        .all() as MigrationRow[];
      expect(migrations).toHaveLength(1);
      expect(migrations[0]?.version).toBe(1);
      expect(migrations[0]?.checksum).toHaveLength(64);

      // Verify all tables from ARCHITECTURE §7 exist
      const tables = db.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      const expectedTables = [
        'anchors',
        'audit',
        'events',
        'migrations',
        'presets',
        'profiles',
        'proxies',
        'proxy_leases',
        'runs',
        'step_runs',
        'tasks',
      ];

      expect(tableNames).toEqual(expectedTables);

      // Verify specific critical indexes
      const indexes = db.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_proxies_status');
      expect(indexNames).toContain('idx_profiles_state');
      expect(indexNames).toContain('uq_lease_active_proxy');
      expect(indexNames).toContain('uq_lease_active_profile');
      expect(indexNames).toContain('idx_runs_state');
      expect(indexNames).toContain('idx_step_runs_run');
      expect(indexNames).toContain('idx_anchors_lookup');
      expect(indexNames).toContain('idx_events_ts');
      expect(indexNames).toContain('idx_audit_ts');

      // Verify CHECK constraint enforcement
      expect(() => {
        db.sqlite
          .prepare(
            "INSERT INTO proxies (id, protocol, host, port, status, created_at, updated_at) VALUES ('p1', 'ftp', '127.0.0.1', 8080, 'unknown', 0, 0)",
          )
          .run();
      }).toThrow(/CHECK constraint failed/);
    } finally {
      db.close();
    }
  });

  it('is completely idempotent on second boot', () => {
    const singleMigrationDir = path.join(tempDir, 'migration_0001_idempotent');
    fs.mkdirSync(singleMigrationDir, { recursive: true });
    fs.copyFileSync(
      path.join(rootMigrationsDir, '0001_init.sql'),
      path.join(singleMigrationDir, '0001_init.sql'),
    );

    const config = loadConfig(tempDir, 'dummy-chrome');

    const db1 = openDb(config, singleMigrationDir);
    db1.close();

    const db2 = openDb(config, singleMigrationDir);
    try {
      const count = db2.sqlite.prepare('SELECT COUNT(*) as count FROM migrations').get() as {
        count: number;
      };
      expect(count.count).toBe(1);
    } finally {
      db2.close();
    }
  });

  it('applies every migration in the migrations directory cleanly', () => {
    // Derived from the directory rather than hardcoded, so adding a migration
    // does not require editing this assertion.
    const migrationFiles = fs
      .readdirSync(rootMigrationsDir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    const expectedVersions = migrationFiles.map((f) => Number(f.slice(0, 4)));
    expect(expectedVersions.length).toBeGreaterThanOrEqual(4);

    const config = loadConfig(tempDir, 'dummy-chrome');
    const db = openDb(config, rootMigrationsDir);
    try {
      const migrations = db.sqlite
        .prepare('SELECT version FROM migrations ORDER BY version')
        .all() as Array<{ version: number }>;
      expect(migrations).toHaveLength(migrationFiles.length);
      expect(migrations.map((m) => m.version)).toEqual(expectedVersions);

      const version = db.sqlite.prepare('PRAGMA user_version;').get() as { user_version: number };
      expect(version.user_version).toBe(expectedVersions[expectedVersions.length - 1]);

      const engineRows = db.sqlite.prepare('SELECT * FROM engine_config;').all();
      expect(engineRows).toHaveLength(2);

      const llmRows = db.sqlite.prepare('SELECT * FROM llm_config;').all();
      expect(llmRows).toHaveLength(1);

      const settingsRows = db.sqlite.prepare('SELECT * FROM settings;').all();
      expect(settingsRows.length).toBeGreaterThanOrEqual(3);

      const nicheRows = db.sqlite.prepare('SELECT * FROM niches;').all();
      expect(nicheRows).toBeDefined();

      // 0004_persona_trust_and_multi_niche.sql columns must exist.
      const profileColumns = (
        db.sqlite.prepare('PRAGMA table_info(profiles);').all() as Array<{ name: string }>
      ).map((c) => c.name);
      for (const col of [
        'trust_score',
        'maturation_stage',
        'typing_wpm',
        'typo_rate',
        'patience_index',
        'engagement_rate',
        'niche_ids',
        'weighted_niches',
      ]) {
        expect(profileColumns).toContain(col);
      }
    } finally {
      db.close();
    }
  });
});
