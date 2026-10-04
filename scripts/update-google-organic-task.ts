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

const workflowDefinition: Workflow = {
  schemaVersion: 1,
  name: 'Google Organic Search & Multi-Result Explorer',
  variables: {
    searchQuery: [
      'best mechanical keyboard 2024',
      'top productivity tools for developers',
      'ergonomic office desk setup guide',
      'nextjs vs remix performance comparison',
    ] as any,
  },
  steps: [
    {
      type: 'navigate',
      url: 'https://www.google.com',
      allowedHosts: ['google.com', 'www.google.com', 'consent.google.com'],
      waitUntil: 'domcontentloaded',
      timeoutMs: 35000,
      aiRecovery: true,
      goal: 'Navigate to Google and clear consent dialogs',
    },
    {
      type: 'waitFor',
      selector: 'intent:search_input',
      timeoutMs: 20000,
    },
    {
      type: 'click',
      selector: 'intent:search_input',
      humanized: true,
    },
    {
      type: 'type',
      selector: 'intent:search_input',
      text: '{{searchQuery}}',
      humanized: true,
      pressEnter: true,
      clearFirst: true,
    },
    {
      type: 'waitFor',
      selector: 'intent:top_result',
      timeoutMs: 25000,
    },
    {
      type: 'scroll',
      direction: 'down',
      amount: 350,
      kinetic: true,
    },
    {
      type: 'sleep',
      minMs: 2000,
      maxMs: 3500,
    },
    {
      type: 'click',
      selector: 'intent:search_result:0',
      humanized: true,
    },
    {
      type: 'sleep',
      minMs: 14000,
      maxMs: 22000,
    },
    {
      type: 'scroll',
      direction: 'down',
      amount: 480,
      kinetic: true,
    },
    {
      type: 'sleep',
      minMs: 8000,
      maxMs: 14000,
    },
    {
      type: 'goBack',
      timeoutMs: 30000,
    },
    {
      type: 'waitFor',
      selector: 'intent:top_result',
      timeoutMs: 25000,
    },
    {
      type: 'sleep',
      minMs: 2500,
      maxMs: 4000,
    },
    {
      type: 'scroll',
      direction: 'down',
      amount: 380,
      kinetic: true,
    },
    {
      type: 'sleep',
      minMs: 1500,
      maxMs: 3000,
    },
    {
      type: 'click',
      selector: 'intent:search_result:1',
      humanized: true,
    },
    {
      type: 'sleep',
      minMs: 12000,
      maxMs: 18000,
    },
    {
      type: 'scroll',
      direction: 'down',
      amount: 420,
      kinetic: true,
    },
    {
      type: 'sleep',
      minMs: 6000,
      maxMs: 12000,
    },
    {
      type: 'goBack',
      timeoutMs: 30000,
    },
    {
      type: 'waitFor',
      selector: 'intent:top_result',
      timeoutMs: 25000,
    },
    {
      type: 'sleep',
      minMs: 2000,
      maxMs: 3500,
    },
    {
      type: 'screenshot',
      name: 'google-organic-multi-visit-verified',
    },
  ],
};

// Validate schema with Zod contract
WorkflowSchema.parse(workflowDefinition);

const tags = JSON.stringify(['google', 'seo', 'ctr', 'search', 'organic', 'multi-visit', 'goback']);
const now = Date.now();

for (const dbPath of foundDbs) {
  const db = new Database(dbPath);
  
  // 1. Update any existing Google Organic Search tasks so they all have the verified definition
  const existingTasks = db.prepare(`
    SELECT id, name FROM tasks 
    WHERE name LIKE '%Google Organic Search%' 
       OR name LIKE '%Google%CTR%'
  `).all() as Array<{ id: string; name: string }>;

  for (const t of existingTasks) {
    db.prepare(`
      UPDATE tasks 
      SET definition = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify({ ...workflowDefinition, name: t.name }), tags, now, t.id);
    console.log(`Updated task "${t.name}" (${t.id}) in ${dbPath}`);
  }

  // 2. Also ensure a primary named "Google Organic Search & Multi-Result Explorer" exists
  const primaryName = 'Google Organic Search & Multi-Result Explorer';
  const primaryTask = db.prepare('SELECT id FROM tasks WHERE name = ?').get(primaryName) as { id: string } | undefined;
  if (!primaryTask) {
    const newId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO tasks (id, name, schema_version, definition, tags, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run(newId, primaryName, JSON.stringify(workflowDefinition), tags, now, now);
    console.log(`Inserted clean primary task "${primaryName}" (${newId})`);
  }

  db.close();
}
