import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dbPath = path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db');

if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  const tasks = db.prepare('SELECT id, name, tags, schema_version, definition, created_at FROM tasks').all();
  console.log('Tasks in DB count:', tasks.length);
  for (const t of tasks as any[]) {
    console.log(`- Task: [${t.id}] "${t.name}" (tags: ${t.tags})`);
    console.log('  Definition:', t.definition);
  }
  const runs = db.prepare('SELECT id, task_id, profile_id, state, created_at FROM runs ORDER BY created_at DESC LIMIT 10').all();
  console.log('Recent Runs count:', runs.length);
  for (const r of runs) {
    console.log(`- Run: [${r.id}] task=${r.task_id} profile=${r.profile_id} state=${r.state}`);
  }
} else {
  console.log('No DB found');
}
