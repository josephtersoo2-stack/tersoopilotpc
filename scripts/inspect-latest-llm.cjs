const Database = require('better-sqlite3');
const path = require('node:path');

const dbPath = path.join(process.env.APPDATA || '', 'Electron', 'tersoopilot', 'tersoopilot.db');
const db = new Database(dbPath);

console.log('=== LATEST 5 TASKS ===');
const tasks = db.prepare('SELECT id, name, workflow, created_at FROM tasks ORDER BY created_at DESC LIMIT 5').all();
for (const t of tasks) {
  console.log('Task ID:', t.id);
  console.log('Name:', t.name);
  console.log('Created:', new Date(t.created_at).toISOString());
  console.log('Workflow:', t.workflow);
  console.log('---');
}

console.log('\n=== LATEST 5 RUNS ===');
const runs = db.prepare('SELECT id, task_id, profile_id, state, error_class, error_message, started_at, finished_at FROM runs ORDER BY created_at DESC LIMIT 5').all();
for (const r of runs) {
  console.log('Run ID:', r.id);
  console.log('Task ID:', r.task_id);
  console.log('State:', r.state);
  console.log('Error Class:', r.error_class);
  console.log('Error Message:', r.error_message);
  console.log('Started:', r.started_at ? new Date(r.started_at).toISOString() : 'none');
  console.log('Finished:', r.finished_at ? new Date(r.finished_at).toISOString() : 'none');
  
  const stepRuns = db.prepare('SELECT step_index, step_type, state, last_error FROM step_runs WHERE run_id = ? ORDER BY step_index ASC').all(r.id);
  for (const sr of stepRuns) {
    console.log(`  Step ${sr.step_index} [${sr.step_type}]: ${sr.state} ${sr.last_error ? 'ERR: ' + sr.last_error : ''}`);
  }
  console.log('---');
}
