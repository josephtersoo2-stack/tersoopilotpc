import Database from '../packages/core/node_modules/better-sqlite3/lib/index.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const dbPath = path.join(process.env.APPDATA, 'Electron', 'tersoopilot', 'tersoopilot.db');
if (!fs.existsSync(dbPath)) {
  console.log('Database not found at', dbPath);
  process.exit(0);
}
const db = new Database(dbPath);

const sql = fs.readFileSync('migrations/0004_persona_trust_and_multi_niche.sql', 'utf8');
const checksum = crypto.createHash('sha256').update(sql).digest('hex');

try {
  const existing = db.prepare('SELECT version FROM migrations WHERE version = 4').get();
  if (!existing) {
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (version, applied_at, checksum) VALUES (?, ?, ?)').run(4, Date.now(), checksum);
      db.pragma('user_version = 4');
    })();
    console.log('Migration 0004 applied successfully to tersoopilot.db!');
  } else {
    console.log('Migration 0004 already applied.');
  }
  const cols = db.prepare('PRAGMA table_info(profiles)').all();
  console.log('Profiles columns now:', cols.map(c => c.name));
} catch (err) {
  console.error('Migration error:', err);
}
