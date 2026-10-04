import path from 'node:path';
import Database from 'better-sqlite3';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dbPath = path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db');
const db = new Database(dbPath);

// Find all tasks referenced by runs
const usedTaskIds = new Set(db.prepare('SELECT DISTINCT task_id FROM runs').all().map((r: any) => r.task_id));
// Also preserve YouTube task
const youtubeTasks = db.prepare('SELECT id FROM tasks WHERE name LIKE ?').all('%YouTube%').map((r: any) => r.id);
youtubeTasks.forEach((id: string) => usedTaskIds.add(id));

console.log('Preserving task IDs:', Array.from(usedTaskIds));

// Delete unreferenced tasks named 'New Automation Workflow'
const toDelete = db.prepare('SELECT id, name FROM tasks WHERE name = ?').all('New Automation Workflow').filter((r: any) => !usedTaskIds.has(r.id));
console.log('Deleting duplicate unreferenced tasks count:', toDelete.length);

const delStmt = db.prepare('DELETE FROM tasks WHERE id = ?');
for (const t of toDelete) {
  delStmt.run((t as any).id);
}

const remaining = db.prepare('SELECT id, name FROM tasks').all();
console.log('Remaining tasks count:', remaining.length);
for (const r of remaining as any[]) {
  console.log(`- [${r.id}] ${r.name}`);
}
