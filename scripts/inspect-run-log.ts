import fs from 'node:fs';
import path from 'node:path';

let Database: any;
try {
  Database = require('./packages/core/node_modules/better-sqlite3');
} catch {
  Database = require('better-sqlite3');
}

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dbPath = path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db');
const db = new Database(dbPath, { readonly: true });

console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name));

const logsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='logs'").get();
if (logsTableExists) {
  const logs = db.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 50").all();
  console.log('Recent logs from DB:');
  console.log(logs);
}

// Check log files
const logDirs = [
  path.join(appData, 'Electron', 'tersoopilot', 'logs'),
  path.join(appData, 'tersoopilot', 'logs'),
  path.join(process.cwd(), 'logs'),
];

for (const d of logDirs) {
  if (fs.existsSync(d)) {
    console.log('Log dir exists:', d);
    const files = fs.readdirSync(d);
    console.log('Log files:', files);
    for (const f of files.slice(-3)) {
      console.log(`\n--- ${f} ---`);
      console.log(fs.readFileSync(path.join(d, f), 'utf-8').slice(-2000));
    }
  }
}
