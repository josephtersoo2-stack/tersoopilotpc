import Database from '../packages/core/node_modules/better-sqlite3/lib/index.js';
import path from 'path';

const dbPath = path.join(process.env.APPDATA, 'Electron', 'tersoopilot', 'tersoopilot.db');
try {
  const db = new Database(dbPath);
  console.log('User version:', db.pragma('user_version', { simple: true }));
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  console.log('Tables:', tables.join(', '));
  console.log('Settings:', db.prepare('SELECT * FROM settings').all());
  const nichesCount = db.prepare('SELECT count(*) as c FROM niches').get();
  console.log('Niches count:', nichesCount.c);
  console.log('Profiles sample:', db.prepare('SELECT id, name, persona, niche_id FROM profiles LIMIT 3').all());
  db.close();
} catch (e) {
  console.log('Err:', e.message);
}
