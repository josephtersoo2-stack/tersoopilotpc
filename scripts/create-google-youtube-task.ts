import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { Workflow as WorkflowSchema, type Workflow } from '../packages/contracts/src';

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

if (foundDbs.length === 0) {
  // Ensure the directory exists for the primary Electron dev path
  const primary = potentialDbPaths[0]!;
  fs.mkdirSync(path.dirname(primary), { recursive: true });
  foundDbs.push(primary);
}

const taskName = 'Google to YouTube Gaming Search & Watch';

const workflowDefinition: Workflow = {
  schemaVersion: 1,
  name: taskName,
  variables: {
    searchEngineUrl: 'https://www.google.com',
    googleQuery: 'youtube',
    gamingKeyword: 'gta 6 official trailer gameplay',
  },
  steps: [
    // 1. Navigate to Google (ConsentEngine automatically handles cookie interstitial)
    {
      type: 'navigate',
      url: '{{searchEngineUrl}}',
      waitUntil: 'domcontentloaded',
    },
    // 2. Locate Google search box using universal intent
    {
      type: 'waitFor',
      selector: 'intent:search_input',
      timeoutMs: 15000,
    },
    // 3. Click search box with humanized curves / touch tap
    {
      type: 'click',
      selector: 'intent:search_input',
      humanized: true,
    },
    // 4. Type 'youtube' and press Enter
    {
      type: 'type',
      selector: 'intent:search_input',
      text: '{{googleQuery}}',
      humanized: true,
      pressEnter: true,
    },
    // 5. Wait for YouTube link in Google results
    {
      type: 'waitFor',
      selector: 'intent:link("YouTube")',
      timeoutMs: 15000,
    },
    // 6. Click the YouTube link
    {
      type: 'click',
      selector: 'intent:link("YouTube")',
      humanized: true,
    },
    // 7. Wait for YouTube's search box
    {
      type: 'waitFor',
      selector: 'intent:search_input',
      timeoutMs: 20000,
    },
    // 8. Click YouTube search box
    {
      type: 'click',
      selector: 'intent:search_input',
      humanized: true,
    },
    // 9. Type gaming keyword and press Enter
    {
      type: 'type',
      selector: 'intent:search_input',
      text: '{{gamingKeyword}}',
      humanized: true,
      pressEnter: true,
    },
    // 10. Wait for video results to appear
    {
      type: 'waitFor',
      selector: 'video:0',
      timeoutMs: 20000,
    },
    // 11. Scroll down through results (kinetic wheel on PC, thumb swipe on Android)
    {
      type: 'scroll',
      direction: 'down',
      amount: 600,
      kinetic: true,
    },
    // 12. Dwell / inspect results
    {
      type: 'sleep',
      minMs: 1500,
      maxMs: 3000,
    },
    // 13. Scroll back up
    {
      type: 'scroll',
      direction: 'up',
      amount: 400,
      kinetic: true,
    },
    // 14. Dwell momentarily
    {
      type: 'sleep',
      minMs: 1000,
      maxMs: 2000,
    },
    // 15. Click on the video
    {
      type: 'click',
      selector: 'video:0',
      humanized: true,
    },
    // 16. Wait for player to load
    {
      type: 'waitFor',
      selector: 'intent:media',
      timeoutMs: 20000,
    },
    // 17. Watch the video (automatic viewer micro-actions & dwell)
    {
      type: 'sleep',
      minMs: 10000,
      maxMs: 20000,
    },
    // 18. Verification screenshot
    {
      type: 'screenshot',
      name: 'google-youtube-gaming-verification',
    },
  ],
};

// Validate workflow schema
WorkflowSchema.parse(workflowDefinition);

const now = Date.now();
const tags = JSON.stringify(['google', 'youtube', 'gaming', 'universal-pipeline']);

for (const dbPath of foundDbs) {
  try {
    const db = new Database(dbPath);
    // Check if tasks table exists
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
    if (!hasTable) continue;

    // Check if task exists
    const existing = db.prepare('SELECT id FROM tasks WHERE name = ?').get(taskName) as { id: string } | undefined;
    const taskId = existing?.id || crypto.randomUUID();

    if (existing) {
      db.prepare(`
        UPDATE tasks 
        SET definition = ?, tags = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(workflowDefinition), tags, now, taskId);
      console.log(`[OK] Updated task "${taskName}" (${taskId}) in: ${dbPath}`);
    } else {
      db.prepare(`
        INSERT INTO tasks (id, name, schema_version, definition, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(taskId, taskName, 1, JSON.stringify(workflowDefinition), tags, now, now);
      console.log(`[OK] Created task "${taskName}" (${taskId}) in: ${dbPath}`);
    }
  } catch (err) {
    console.warn(`Could not update DB at ${dbPath}:`, err);
  }
}
