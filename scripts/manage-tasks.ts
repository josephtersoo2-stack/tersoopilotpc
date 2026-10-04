import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Workflow as WorkflowSchema, type Workflow } from '../packages/contracts/src';

let Database: any;
const candidateSqlitePaths = [
  'better-sqlite3',
  '../apps/desktop/node_modules/better-sqlite3',
  '../packages/core/node_modules/better-sqlite3',
  './apps/desktop/node_modules/better-sqlite3',
  './packages/core/node_modules/better-sqlite3',
];
for (const p of candidateSqlitePaths) {
  try {
    Database = require(p);
    if (Database) break;
  } catch {}
}
if (!Database) {
  throw new Error('Could not locate better-sqlite3 in any module path.');
}

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const potentialDbPaths = [
  path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db'),
  path.join(appData, 'tersoopilot-desktop', 'tersoopilot', 'tersoopilot.db'),
  path.join(appData, 'tersoopilot', 'tersoopilot.db'),
];

const foundDbs: string[] = [];
for (const p of potentialDbPaths) {
  if (fs.existsSync(p)) {
    foundDbs.push(p);
  }
}

console.log('Found databases:', foundDbs);

for (const dbPath of foundDbs) {
  const db = new Database(dbPath);
  const rows = db.prepare("SELECT id, name, updated_at FROM tasks WHERE name LIKE '%Organic%' OR name LIKE '%Google%'").all();
  console.log(`Tasks in ${dbPath}:`);
  console.table(rows);
  db.close();
}
