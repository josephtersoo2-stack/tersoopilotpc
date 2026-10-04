import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import Database from '../packages/core/node_modules/better-sqlite3';

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
  const primary = potentialDbPaths[0]!;
  fs.mkdirSync(path.dirname(primary), { recursive: true });
  foundDbs.push(primary);
}

const taskName = 'YouTube Engagement Test: Like, Subscribe & Comment';

const workflowDefinition: Workflow = {
  schemaVersion: 1,
  name: taskName,
  variables: {
    videoTopic: 'minecraft gameplay walkthrough',
    customComment: 'Awesome gameplay video and walkthrough, keep up the great content!',
    secondVideoTopic: 'gta 5 gameplay walkthrough',
    secondComment: 'Really impressive gameplay, looking forward to the next episode!',
    skipAds: 'true',
    autoDismissPopups: 'true',
  },
  steps: [
    // ==========================================
    // VIDEO 1
    // ==========================================
    // 1. Safe navigation to YouTube
    {
      type: 'navigate',
      url: 'https://www.youtube.com',
      allowedHosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'google.com', 'consent.youtube.com'],
      waitUntil: 'domcontentloaded',
      timeoutMs: 35000,
      maxRetries: 2,
      aiRecovery: true,
      goal: 'Safely load YouTube homepage and dismiss cookie/consent popups',
    },

    // 2. Search for the first topic
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
      text: '{{videoTopic}}',
      humanized: true,
      pressEnter: true,
    },

    // 3. Wait for video results and click the first standard video (skipping live & shorts)
    {
      type: 'waitFor',
      selector: 'video:0',
      timeoutMs: 25000,
    },
    {
      type: 'sleep',
      minMs: 1200,
      maxMs: 2200,
    },
    {
      type: 'click',
      selector: 'video:0',
      humanized: true,
    },

    // 4. Verify player is loaded and watch video (active background ad-skipping enabled)
    {
      type: 'waitFor',
      selector: 'intent:media',
      timeoutMs: 30000,
    },
    {
      type: 'sleep',
      minMs: 18000,
      maxMs: 24000,
    },

    // 5. Read video description (smooth expand with "...more", gentle downward reading scroll, collapse with "Show less")
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

    // 6. Like the first video
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

    // 7. Subscribe to the channel
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

    // 8. Type comment according to profile persona (realistic keystrokes and timing)
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

    // ==========================================
    // VIDEO 2
    // ==========================================
    // 9. Search for the second topic
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
      text: '{{secondVideoTopic}}',
      humanized: true,
      pressEnter: true,
    },

    // 10. Wait for results and click the first standard video for topic 2
    {
      type: 'waitFor',
      selector: 'video:0',
      timeoutMs: 25000,
    },
    {
      type: 'sleep',
      minMs: 1200,
      maxMs: 2200,
    },
    {
      type: 'click',
      selector: 'video:0',
      humanized: true,
    },

    // 11. Watch video 2
    {
      type: 'waitFor',
      selector: 'intent:media',
      timeoutMs: 30000,
    },
    {
      type: 'sleep',
      minMs: 18000,
      maxMs: 24000,
    },

    // 12. Read description for video 2 (smooth expand with "...more", gentle downward reading scroll, collapse with "Show less")
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

    // 13. Like video 2
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

    // 14. Subscribe to channel 2
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

    // 15. Type comment on video 2 according to profile persona
    {
      type: 'engage',
      action: 'comment',
      commentText: '{{secondComment}}',
      optional: true,
      timeoutMs: 15000,
    },
    {
      type: 'sleep',
      minMs: 2500,
      maxMs: 4000,
    },

    // 16. Capture verification screenshot
    {
      type: 'screenshot',
      name: 'youtube-2videos-engagement-verified',
    },
  ],
};

// Validate schema with Zod contract
WorkflowSchema.parse(workflowDefinition);

const taskId = crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`;
const tags = JSON.stringify(['youtube', 'engagement', 'like', 'subscribe', 'comment', 'ad-skip']);
const now = Date.now();

for (const dbPath of foundDbs) {
  const db = new Database(dbPath);
  
  const existing = db.prepare('SELECT id FROM tasks WHERE name = ?').get(taskName) as { id: `${string}-${string}-${string}-${string}-${string}` } | undefined;
  
  let finalId = taskId;
  if (existing) {
    finalId = existing.id;
    db.prepare(`
      UPDATE tasks 
      SET definition = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(workflowDefinition), tags, now, existing.id);
    console.log(`Updated existing task "${taskName}" with ID: ${existing.id} in ${dbPath}`);
  } else {
    db.prepare(`
      INSERT INTO tasks (id, name, schema_version, definition, tags, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run(taskId, taskName, JSON.stringify(workflowDefinition), tags, now, now);
    console.log(`Created new task "${taskName}" with ID: ${taskId} in ${dbPath}`);
  }
  
  db.close();
}
