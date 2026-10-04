import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.join(process.env.APPDATA || '', 'Electron', 'tersoopilot', 'tersoopilot.db');
const db = new Database(dbPath);

const runs = db.prepare('SELECT id, profile_id, task_id, state, error_class, error_message, created_at FROM runs ORDER BY created_at DESC LIMIT 6').all() as any[];
console.log('=== Recent Runs ===');
for (const r of runs) {
  const profile = db.prepare('SELECT id, name, preset_id, engine, fingerprint_bundle FROM profiles WHERE id = ?').get(r.profile_id) as any;
  let bundle: any = {};
  try { bundle = JSON.parse(profile?.fingerprint_bundle || '{}'); } catch {}
  console.log(`Run ${r.id} (${r.state}) on profile "${profile?.name}":`);
  console.log(`  Engine: ${profile?.engine}, Preset: ${profile?.preset_id}`);
  console.log(`  Bundle Platform: ${bundle?.platform}, UA Mobile: ${bundle?.uaMetadata?.mobile}, Screen: ${bundle?.screen?.width}x${bundle?.screen?.height}`);
  console.log(`  Error: ${r.error_class} - ${r.error_message}`);

  const stepRuns = db.prepare('SELECT step_index, step_type, state, last_error FROM step_runs WHERE run_id = ? ORDER BY step_index ASC').all(r.id) as any[];
  for (const sr of stepRuns) {
    console.log(`    Step ${sr.step_index} [${sr.step_type}]: ${sr.state} ${sr.last_error ? 'ERR: ' + sr.last_error : ''}`);
  }
}
