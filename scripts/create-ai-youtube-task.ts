import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { Workflow as WorkflowSchema, type Workflow } from '../packages/contracts/src';

// Robust loader for better-sqlite3 across monorepo packages
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

if (foundDbs.length === 0) {
  const primary = potentialDbPaths[0]!;
  fs.mkdirSync(path.dirname(primary), { recursive: true });
  foundDbs.push(primary);
}

const taskName = 'AI-Only YouTube Watch from Google';

const workflowDefinition: Workflow = {
  schemaVersion: 1,
  name: taskName,
  variables: {
    videoTopic: 'elden ring boss fight gameplay',
    customComment: 'The combat mechanics and dodges here are truly masterclass, great gameplay!',
    secondVideoTopic: 'cyberpunk 2077 phantom liberty gameplay',
    secondComment: 'The visual atmosphere and build in this playthrough are unreal, awesome work!',
    skipAds: 'true',
    autoDismissPopups: 'true',
  },
  steps: [
    // --- Step 1: Navigate to Google and reach YouTube ---
    {
      type: 'llm',
      goal: "Navigate to https://www.google.com. On Google, locate the search bar, type 'youtube', and press Enter to search. When search results load, locate the official YouTube link (youtube.com) and click it. Confirm YouTube has loaded.",
      maxIterations: 15,
    },
    // --- Video 1: Search, select standard video (strictly avoiding live streams and shorts), and watch ---
    {
      type: 'llm',
      goal: "On YouTube, locate the search box at the top, type '{{videoTopic}}', and press Enter to search. When video results appear, locate a standard video thumbnail or title (STRICTLY AVOIDING any live streams, 'LIVE NOW' badges, or shorts) and click it to start playback.",
      maxIterations: 15,
    },
    {
      type: 'llm',
      goal: "On the YouTube video watch page, verify the video is playing. If an advertisement or 'Skip Ad' button appears, click it to skip. Watch playback for about 20-30 seconds, and return done.",
      maxIterations: 20,
    },
    // --- Video 1: Engagement Actions ---
    {
      type: 'engage',
      action: 'read_description',
      optional: true,
      timeoutMs: 20000,
    },
    {
      type: 'sleep',
      minMs: 1200,
      maxMs: 2000,
    },
    {
      type: 'engage',
      action: 'like',
      optional: true,
      timeoutMs: 10000,
    },
    {
      type: 'sleep',
      minMs: 1500,
      maxMs: 2500,
    },
    {
      type: 'engage',
      action: 'subscribe',
      optional: true,
      timeoutMs: 10000,
    },
    {
      type: 'sleep',
      minMs: 1500,
      maxMs: 2500,
    },
    {
      type: 'engage',
      action: 'comment',
      commentText: '{{customComment}}',
      optional: true,
      timeoutMs: 15000,
    },
    {
      type: 'sleep',
      minMs: 2500,
      maxMs: 4000,
    },
    // --- Video 2: Search second gaming topic, select standard video, and watch ---
    {
      type: 'llm',
      goal: "On YouTube, locate the search box at the top, type '{{secondVideoTopic}}', and press Enter to search. When video results appear, locate a standard video thumbnail or title (STRICTLY AVOIDING any live streams, 'LIVE NOW' badges, or shorts) and click it to start playback.",
      maxIterations: 15,
    },
    {
      type: 'llm',
      goal: "On the YouTube video watch page, verify the video is playing. If an advertisement or 'Skip Ad' button appears, click it to skip. Watch playback for about 20-30 seconds, and return done.",
      maxIterations: 20,
    },
    // --- Video 2: Engagement Actions ---
    {
      type: 'engage',
      action: 'read_description',
      optional: true,
      timeoutMs: 20000,
    },
    {
      type: 'sleep',
      minMs: 1200,
      maxMs: 2000,
    },
    {
      type: 'engage',
      action: 'like',
      optional: true,
      timeoutMs: 10000,
    },
    {
      type: 'sleep',
      minMs: 1500,
      maxMs: 2500,
    },
    {
      type: 'engage',
      action: 'subscribe',
      optional: true,
      timeoutMs: 10000,
    },
    {
      type: 'sleep',
      minMs: 1500,
      maxMs: 2500,
    },
    {
      type: 'engage',
      action: 'comment',
      commentText: '{{secondComment}}',
      optional: true,
      timeoutMs: 15000,
    },
    {
      type: 'sleep',
      minMs: 2000,
      maxMs: 3500,
    },
    {
      type: 'screenshot',
      name: 'youtube-ai-2videos-engagement-verified',
    },
  ],
};

// Validate schema with Zod contract
WorkflowSchema.parse(workflowDefinition);

const taskId = crypto.randomUUID();
const tags = JSON.stringify(['youtube', 'google', 'llm', 'ai-only', 'gaming', 'video', 'dual-video']);
const now = Date.now();

for (const dbPath of foundDbs) {
  const db = new Database(dbPath);
  
  // Upsert or insert task
  const existing = db.prepare('SELECT id FROM tasks WHERE name = ?').get(taskName) as { id: string } | undefined;
  
  if (existing) {
    db.prepare(`
      UPDATE tasks 
      SET definition = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(workflowDefinition), tags, now, existing.id);
    console.log(`Updated existing task "${taskName}" (${existing.id}) in ${dbPath}`);
  } else {
    db.prepare(`
      INSERT INTO tasks (id, name, schema_version, definition, tags, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run(taskId, taskName, JSON.stringify(workflowDefinition), tags, now, now);
    console.log(`Created new task "${taskName}" (${taskId}) in ${dbPath}`);
  }
  
  db.close();
}
