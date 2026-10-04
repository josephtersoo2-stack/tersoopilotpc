import Database from 'better-sqlite3';
import path from 'node:path';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dbPath = path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db');

const db = new Database(dbPath, { readonly: true });
const runs = db.prepare('SELECT id, task_id, profile_id, state, error_message, started_at, finished_at FROM runs ORDER BY started_at DESC LIMIT 5').all() as any[];
console.log('=== Recent runs ===');
for (const r of runs) {
  console.log(`Run ${r.id} | Task: ${r.task_id} | State: ${r.state} | Started: ${new Date(r.started_at).toISOString()} | Error: ${r.error_message}`);
  const task = db.prepare('SELECT name, definition FROM tasks WHERE id = ?').get(r.task_id) as any;
  if (task) console.log(`  Task Name: ${task.name}`);
  const steps = db.prepare('SELECT id, step_index, step_type, state, last_error, artifacts, started_at, finished_at FROM step_runs WHERE run_id = ? ORDER BY step_index ASC').all(r.id) as any[];
  console.log(`  Steps (${steps.length}):`);
  for (const s of steps) {
    console.log(`    - [${s.state}] Step ${s.step_index}: ${s.step_type}`);
    if (s.last_error) console.log(`      Error: ${s.last_error}`);
    if (s.artifacts && s.artifacts !== '{}') console.log(`      Artifacts: ${s.artifacts}`);
  }
}
db.close();
