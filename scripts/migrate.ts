import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from '../packages/core/src/config';
import { openDb, resolveMigrationsDir } from '../packages/core/src/persistence/db';

async function migrateDirectory(userDataDir: string, label: string) {
  console.log(`\n--- Migrating ${label} at: ${userDataDir} ---`);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const dummyChrome = process.env.TERSOO_CHROME_BINARY || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const config = loadConfig(userDataDir, dummyChrome);
  const migrationsDir = resolveMigrationsDir();

  const db = openDb(config, migrationsDir);

  const versionRow = db.sqlite.prepare('PRAGMA user_version;').get() as { user_version: number };
  console.log(`Database migrated successfully. PRAGMA user_version = ${versionRow.user_version}`);

  const engineCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM engine_config;').get() as { count: number };
  console.log(`engine_config rows: ${engineCount.count}`);

  const llmCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM llm_config;').get() as { count: number };
  console.log(`llm_config rows: ${llmCount.count}`);

  const settingsCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM settings;').get() as { count: number };
  console.log(`settings rows: ${settingsCount.count}`);

  const profileEngines = db.sqlite.prepare('SELECT engine, COUNT(*) as count FROM profiles GROUP BY engine;').all();
  console.log('Profile engine distribution:', JSON.stringify(profileEngines));

  db.close();
}

async function main() {
  console.log('TersooPilot: Database Migration Runner');

  // 1. Primary desktop application database
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : '/var/local');
  const desktopUserData = process.env.TERSOO_USER_DATA_DIR || path.join(appData, 'Electron', 'tersoopilot');
  await migrateDirectory(desktopUserData, 'Desktop App Database');

  // 2. Scratch/test database if it exists
  const testUserData = path.resolve('scratch/test-browser-data');
  if (fs.existsSync(testUserData)) {
    await migrateDirectory(testUserData, 'Test/Scratch Database');
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
