import Database from 'better-sqlite3';
const dbPath = (process.env.APPDATA || '') + '/tersoo-pilot/tersoo.db';
console.log('DB path:', dbPath);
try {
  const db = new Database(dbPath);
  const secrets = db.prepare('SELECT id, key_name, created_at FROM secrets').all();
  console.log('Secrets:', secrets);
  const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'voice%' OR key LIKE 'llm%'").all();
  console.log('Settings:', settings);
} catch (e) {
  console.error('Error reading db:', e);
}
