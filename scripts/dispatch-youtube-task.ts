import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dbPath = path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found');
  process.exit(1);
}

const db = new Database(dbPath);

const task = db.prepare("SELECT id, name FROM tasks WHERE name = 'YouTube Search, Watch & Exit' ORDER BY created_at DESC LIMIT 1").get() as { id: string; name: string } | undefined;

if (!task) {
  console.error('Task not found');
  process.exit(1);
}

const profile = db.prepare("SELECT id, name, engine FROM profiles WHERE engine = 'apostate' LIMIT 1").get() as { id: string; name: string; engine: string } | undefined;

if (!profile) {
  console.error('No Chromium profile found');
  process.exit(1);
}

console.log('--- Ready to Dispatch ---');
console.log(`Task: [${task.id}] "${task.name}"`);
console.log(`Target Profile: [${profile.id}] "${profile.name}" (Engine: ${profile.engine})`);
console.log('\nYou can dispatch this task directly in the TersooPilot Desktop UI:');
console.log('1. Navigate to Task Studio');
console.log('2. Open Saved Tasks Drawer and select "YouTube Search, Watch & Exit"');
console.log('3. Click "Dispatch Task", choose the target Chromium profile, and click "Dispatch Workflow"');
console.log('4. Watch the live execution and telemetry under Runs & Logs view!');
