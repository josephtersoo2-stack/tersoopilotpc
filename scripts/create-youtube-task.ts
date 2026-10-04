import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { Workflow as WorkflowSchema, type Workflow } from '../packages/contracts/src';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dbPath = path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found at:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

const workflowDefinition: Workflow = {
  schemaVersion: 1,
  name: 'YouTube Search, Watch & Exit',
  variables: {
    searchQuery: 'lofi hip hop radio beats to relax/study to',
    watchDurationMs: '20000',
  },
  steps: [
    {
      type: 'navigate',
      url: 'https://www.youtube.com',
      waitUntil: 'domcontentloaded',
    },
    {
      type: 'waitFor',
      selector: "input#search, input[name='search_query']",
      timeoutMs: 15000,
    },
    {
      type: 'click',
      selector: "input#search, input[name='search_query']",
      humanized: true,
    },
    {
      type: 'type',
      selector: "input#search, input[name='search_query']",
      text: '{{searchQuery}}',
      humanized: true,
    },
    {
      type: 'click',
      selector: "button#search-icon-legacy, button[aria-label='Search']",
      humanized: true,
    },
    {
      type: 'waitFor',
      selector: 'ytd-video-renderer a#video-title',
      timeoutMs: 15000,
    },
    {
      type: 'scroll',
      direction: 'down',
      amount: 350,
      kinetic: true,
    },
    {
      type: 'sleep',
      minMs: 1200,
      maxMs: 2200,
    },
    {
      type: 'click',
      selector: 'ytd-video-renderer a#video-title',
      humanized: true,
    },
    {
      type: 'waitFor',
      selector: '.html5-video-player, video',
      timeoutMs: 20000,
    },
    {
      type: 'sleep',
      minMs: 15000,
      maxMs: 25000,
    },
    {
      type: 'screenshot',
      name: 'youtube-watch-verification',
    },
  ],
};

// Validate schema
WorkflowSchema.parse(workflowDefinition);

const now = Date.now();
const taskId = crypto.randomUUID();
const taskName = 'YouTube Search, Watch & Exit';
const tags = JSON.stringify(['youtube', 'chromium', 'media']);

db.prepare(`
  INSERT INTO tasks (id, name, schema_version, definition, tags, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  taskId,
  taskName,
  1,
  JSON.stringify(workflowDefinition),
  tags,
  now,
  now
);

console.log('Successfully created YouTube task in database!');
console.log(`Task ID: ${taskId}`);
console.log(`Task Name: "${taskName}"`);
console.log(`Steps (${workflowDefinition.steps.length}):`);
workflowDefinition.steps.forEach((s, idx) => {
  console.log(`  ${idx + 1}. [${s.type}] ${JSON.stringify(s)}`);
});

// Find Chromium profiles in DB
const chromiumProfiles = db.prepare(`
  SELECT id, name, engine, state FROM profiles WHERE engine = 'apostate' LIMIT 5
`).all() as Array<{ id: string; name: string; engine: string; state: string }>;

console.log('\nAvailable Chromium Profiles:');
for (const p of chromiumProfiles) {
  console.log(`- Profile: [${p.id}] "${p.name}" (engine: ${p.engine}, state: ${p.state})`);
}
