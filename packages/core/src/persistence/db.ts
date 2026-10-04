import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

import { type Config, paths } from '../config';

import { runMigrations } from './migrate';
import type { DB } from './schema';

export type AppDatabase<T = DB> = Kysely<T> & {
  sqlite: BetterSqliteDatabase;
  close: () => void;
};

export function resolveMigrationsDir(): string {
  const cwdMigrations = path.resolve(process.cwd(), 'migrations');
  if (fs.existsSync(cwdMigrations)) {
    return cwdMigrations;
  }
  try {
    const currentDir = fileURLToPath(new URL('.', import.meta.url));
    const srcRelative = path.resolve(currentDir, '../../../../migrations');
    if (fs.existsSync(srcRelative)) {
      return srcRelative;
    }
    const distRelative = path.resolve(currentDir, '../../../migrations');
    if (fs.existsSync(distRelative)) {
      return distRelative;
    }
  } catch {
    // fallback
  }
  return cwdMigrations;
}

function resolveElectronBinding(): string | undefined {
  if (process.versions && 'electron' in process.versions) {
    try {
      const pnpmDir = path.resolve(process.cwd(), 'node_modules/.pnpm');
      if (fs.existsSync(pnpmDir)) {
        const entries = fs.readdirSync(pnpmDir).filter((e) => e.startsWith('better-sqlite3@'));
        for (const entry of entries) {
          const electronPath = path.join(pnpmDir, entry, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.electron.node');
          if (fs.existsSync(electronPath)) {
            return electronPath;
          }
        }
      }
    } catch {
      // fallback
    }
  }
  return undefined;
}

export function openDb<T = DB>(config: Config, migrationsDir?: string): AppDatabase<T> {
  const dbPath = paths(config).db;
  const parentDir = path.dirname(dbPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const electronBinding = resolveElectronBinding();
  const sqlite = electronBinding ? new Database(dbPath, { nativeBinding: electronBinding }) : new Database(dbPath);
  const resolvedMigrations = migrationsDir ?? resolveMigrationsDir();
  runMigrations(sqlite, resolvedMigrations);

  const kysely = new Kysely<T>({
    dialect: new SqliteDialect({ database: sqlite }),
  }) as AppDatabase<T>;

  kysely.sqlite = sqlite;
  kysely.close = () => {
    sqlite.close();
  };

  return kysely;
}
