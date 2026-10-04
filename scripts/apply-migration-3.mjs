import Database from '../packages/core/node_modules/better-sqlite3/lib/index.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const dbPath = path.join(process.env.APPDATA, 'Electron', 'tersoopilot', 'tersoopilot.db');
const db = new Database(dbPath);

const sql = fs.readFileSync('migrations/0003_personas_and_niches.sql', 'utf8');
const checksum = crypto.createHash('sha256').update(sql).digest('hex');

try {
  const existing = db.prepare('SELECT version FROM migrations WHERE version = 3').get();
  if (!existing) {
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (version, applied_at, checksum) VALUES (?, ?, ?)').run(3, Date.now(), checksum);
      db.pragma('user_version = 3');
    })();
    console.log('Migration 0003 applied successfully to tersoopilot.db!');
  } else {
    console.log('Migration 0003 already applied.');
  }
  const cols = db.prepare('PRAGMA table_info(profiles)').all();
  console.log('Profiles columns now:', cols.map(c => c.name));
  const nichesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='niches'").get();
  console.log('Niches table exists:', Boolean(nichesTable));
} catch (err) {
  console.error('Migration error:', err);
}
