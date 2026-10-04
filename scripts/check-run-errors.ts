import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.join(process.env.APPDATA || '', 'Electron', 'tersoopilot', 'tersoopilot.db');
const db = new Database(dbPath);

const runs = db.prepare('SELECT id, task_id, profile_id, state, error_class, error_message, started_at, finished_at FROM runs ORDER BY created_at DESC').all() as any[];
for (const r of runs) {
  console.log('---');
  console.log('Run:', r.id);
  console.log('Started:', r.started_at ? new Date(r.started_at).toISOString() : 'none', 'Finished:', r.finished_at ? new Date(r.finished_at).toISOString() : 'none');
  console.log('Error:', r.error_class, '-', r.error_message);
  
  const stepRuns = db.prepare('SELECT step_index, step_type, state, last_error, started_at, finished_at FROM step_runs WHERE run_id = ? ORDER BY step_index ASC').all(r.id) as any[];
  for (const sr of stepRuns) {
    const dur = sr.finished_at && sr.started_at ? sr.finished_at - sr.started_at : 0;
    console.log(`  Step ${sr.step_index} [${sr.step_type}]: ${sr.state} (${dur}ms) ${sr.last_error ? 'ERR: ' + sr.last_error : ''}`);
  }
}

// Also check the profiles to see the engine
const profiles = db.prepare('SELECT id, name, engine FROM profiles WHERE id IN (SELECT DISTINCT profile_id FROM runs)').all() as any[];
console.log('\n=== Profiles used by runs ===');
for (const p of profiles) {
  console.log('Profile:', p.id, p.name, 'engine:', p.engine);
}
