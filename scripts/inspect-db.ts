import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dbPath = path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db');
console.log('DB Path exists:', fs.existsSync(dbPath), dbPath);

if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  console.log('Presets:');
  console.log(db.prepare('SELECT id, name, platform FROM presets').all());
  const profiles = db.prepare('SELECT id, name, engine, preset_id, state, user_data_dir, fingerprint_bundle FROM profiles').all();
  console.log('Profiles in DB:');
  for (const p of profiles) {
    console.log(p.id, p.name, p.engine, p.state, p.user_data_dir);
    try {
      const bundle = JSON.parse(p.fingerprint_bundle);
      console.log('  platform:', bundle.platform, 'userAgent:', bundle.userAgent?.slice(0, 40));
    } catch {}
  }
} else {
  console.log('No DB found at:', dbPath);
}
