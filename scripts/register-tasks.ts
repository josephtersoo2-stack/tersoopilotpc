import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import Database from 'better-sqlite3';

import { Workflow as WorkflowSchema, type Workflow } from '../packages/contracts/src';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');

const potentialDbPaths = [
  path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db'),
  path.join(appData, 'tersoopilot-desktop', 'tersoopilot', 'tersoopilot.db'),
  path.join(appData, 'tersoopilot', 'tersoopilot.db'),
  path.join(process.cwd(), 'apps', 'desktop', 'tersoo.db'),
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

// ---------------------------------------------------------------------------
// Task 1: Safe Navigation & Autonomous YouTube Watch (Flagship Universal)
// ---------------------------------------------------------------------------
const task1: { name: string; tags: string[]; workflow: Workflow } = {
  name: 'YouTube Search & Watch (Safe Navigation)',
  tags: ['youtube', 'safe-navigation', 'stealth', 'universal', 'recommended'],
  workflow: {
    schemaVersion: 1,
    name: 'YouTube Search & Watch (Safe Navigation)',
    variables: {
      searchQuery: 'relaxing lofi chill beats',
    },
    steps: [
      // 1. Safe Navigation Engine to YouTube with CMP auto-dismissal & anti-bot guards
      {
        type: 'navigate',
        url: 'https://www.youtube.com',
        allowedHosts: [
          'youtube.com',
          'www.youtube.com',
          'm.youtube.com',
          'google.com',
          'consent.youtube.com',
          'consent.google.com',
        ],
        waitUntil: 'domcontentloaded',
        timeoutMs: 35000,
        maxRetries: 2,
        aiRecovery: true,
        requiredSelectors: [
          '#search-input',
          'input#search',
          'input[name="search_query"]',
          'yt-icon-button#search-button',
          'button#search-icon-legacy',
          'ytd-searchbox',
          'body',
        ],
        goal: 'Safely navigate to YouTube and automatically clear any consent or cookie modals',
      },
      // 2. Natural dwell for scripts/styles to settle
      {
        type: 'sleep',
        minMs: 2000,
        maxMs: 3500,
      },
      // 3. Focus search input with humanized cursor
      {
        type: 'click',
        selector: 'intent:search_input',
        humanized: true,
      },
      // 4. Type search query with natural keystroke timing & press Enter
      {
        type: 'type',
        selector: 'intent:search_input',
        text: '{{searchQuery}}',
        humanized: true,
        pressEnter: true,
      },
      // 5. Wait for video results to appear
      {
        type: 'waitFor',
        selector: 'video:0',
        timeoutMs: 20000,
      },
      // 6. Kinetic human scroll through results
      {
        type: 'scroll',
        direction: 'down',
        amount: 500,
        kinetic: true,
      },
      // 7. Natural pause to browse results
      {
        type: 'sleep',
        minMs: 1500,
        maxMs: 3000,
      },
      // 8. Kinetic scroll back slightly
      {
        type: 'scroll',
        direction: 'up',
        amount: 250,
        kinetic: true,
      },
      // 9. Click the top video result
      {
        type: 'click',
        selector: 'video:0',
        humanized: true,
      },
      // 10. Wait for the HTML5 media player
      {
        type: 'waitFor',
        selector: 'intent:media',
        timeoutMs: 25000,
      },
      // 11. Watch video (viewer dwell)
      {
        type: 'sleep',
        minMs: 15000,
        maxMs: 25000,
      },
      // 12. Natural scroll down to view comments/description
      {
        type: 'scroll',
        direction: 'down',
        amount: 350,
        kinetic: true,
      },
      // 13. Continued viewing dwell
      {
        type: 'sleep',
        minMs: 8000,
        maxMs: 12000,
      },
      // 14. Verification screenshot
      {
        type: 'screenshot',
        name: 'youtube-playback-verified',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Task 2: Google to YouTube Search & Watch (From Search Engine)
// ---------------------------------------------------------------------------
const task2: { name: string; tags: string[]; workflow: Workflow } = {
  name: 'Google to YouTube Search & Watch',
  tags: ['google', 'youtube', 'search-engine', 'safe-navigation'],
  workflow: {
    schemaVersion: 1,
    name: 'Google to YouTube Search & Watch',
    variables: {
      googleQuery: 'youtube',
      videoKeyword: 'gta 6 official trailer gameplay',
    },
    steps: [
      // 1. Safe navigate to Google
      {
        type: 'navigate',
        url: 'https://www.google.com',
        allowedHosts: ['google.com', 'www.google.com', 'consent.google.com'],
        waitUntil: 'domcontentloaded',
        timeoutMs: 30000,
        maxRetries: 2,
        aiRecovery: true,
        goal: 'Navigate to Google and dismiss any cookie consent banners',
      },
      // 2. Wait for Google search box
      {
        type: 'waitFor',
        selector: 'intent:search_input',
        timeoutMs: 15000,
      },
      // 3. Click search box
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
      // 5. Wait for YouTube result link
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
      // 7. Wait for YouTube search input
      {
        type: 'waitFor',
        selector: 'intent:search_input',
        timeoutMs: 25000,
      },
      // 8. Click YouTube search box
      {
        type: 'click',
        selector: 'intent:search_input',
        humanized: true,
      },
      // 9. Type video keyword & search
      {
        type: 'type',
        selector: 'intent:search_input',
        text: '{{videoKeyword}}',
        humanized: true,
        pressEnter: true,
      },
      // 10. Wait for video results
      {
        type: 'waitFor',
        selector: 'video:0',
        timeoutMs: 20000,
      },
      // 11. Scroll through results
      {
        type: 'scroll',
        direction: 'down',
        amount: 500,
        kinetic: true,
      },
      // 12. Dwell
      {
        type: 'sleep',
        minMs: 1500,
        maxMs: 3000,
      },
      // 13. Click the video
      {
        type: 'click',
        selector: 'video:0',
        humanized: true,
      },
      // 14. Wait for player
      {
        type: 'waitFor',
        selector: 'intent:media',
        timeoutMs: 25000,
      },
      // 15. Watch the video
      {
        type: 'sleep',
        minMs: 15000,
        maxMs: 25000,
      },
      // 16. Verification screenshot
      {
        type: 'screenshot',
        name: 'google-youtube-gaming-verification',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Task 3: Autonomous AI-Only YouTube Watch from Google (Granular LLM Agent)
// ---------------------------------------------------------------------------
const task3: { name: string; tags: string[]; workflow: Workflow } = {
  name: 'AI-Only YouTube Watch from Google',
  tags: ['youtube', 'google', 'llm', 'ai-only', 'gaming', 'video', 'dual-video'],
  workflow: {
    schemaVersion: 1,
    name: 'AI-Only YouTube Watch from Google',
    variables: {
      videoTopic: 'elden ring boss fight gameplay',
      customComment: 'The combat mechanics and dodges here are truly masterclass, great gameplay!',
      secondVideoTopic: 'cyberpunk 2077 phantom liberty gameplay',
      secondComment: 'The visual atmosphere and build in this playthrough are unreal, awesome work!',
      skipAds: 'true',
      autoDismissPopups: 'true',
    },
    steps: [
      {
        type: 'llm',
        goal: "Navigate to https://www.google.com. On Google, locate the search bar, type 'youtube', and press Enter to search. When search results load, locate the official YouTube link (youtube.com) and click it. Confirm YouTube has loaded.",
        maxIterations: 15,
      },
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
  },
};

// ---------------------------------------------------------------------------
// Task 4: AI-Only YouTube eFootball Watch Task (Refined & Partitioned)
// ---------------------------------------------------------------------------
const task4: { name: string; tags: string[]; workflow: Workflow } = {
  name: 'AI-Only YouTube eFootball Watch Task',
  tags: ['youtube', 'google', 'efootball', 'llm', 'ai-only'],
  workflow: {
    schemaVersion: 1,
    name: 'AI-Only YouTube eFootball Watch Task',
    variables: {
      gameTopic: 'efootball',
    },
    steps: [
      {
        type: 'llm',
        goal: 'Navigate to https://www.google.com. If a cookie consent banner appears, accept it. In the Google search box, type "youtube" and press Enter to search. Return done once search results appear.',
        maxIterations: 20,
      },
      {
        type: 'llm',
        goal: 'In Google search results, locate and click the official YouTube link (youtube.com). Return done once YouTube homepage has loaded.',
        maxIterations: 15,
      },
      {
        type: 'llm',
        goal: 'On the YouTube homepage, scroll down smoothly to browse, pause briefly, then scroll back up. Return done.',
        maxIterations: 10,
      },
      {
        type: 'llm',
        goal: 'Use the YouTube search bar at the top to search for "{{gameTopic}}". Wait for video results to appear, locate a standard video thumbnail or title (STRICTLY AVOIDING any live streams, "LIVE NOW" badges, or shorts) and click it, then watch playback for approximately 45-60 seconds. Return done.',
        maxIterations: 25,
      },
      {
        type: 'llm',
        goal: 'Search YouTube for "{{gameTopic}}" again, pick a DIFFERENT standard video result (strictly avoiding live streams and shorts), click it, and watch playback for approximately 45-60 seconds. Return done.',
        maxIterations: 25,
      },
      {
        type: 'llm',
        goal: 'Exit cleanly and end the session. Return done.',
        maxIterations: 10,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Task 5: YouTube Truckers & eFootball Watch (Dual-Topic Precision Workflow)
// ---------------------------------------------------------------------------
const task5: { id?: string; name: string; tags: string[]; workflow: Workflow } = {
  id: '957cb72c-1d29-49f7-93d7-e74e110c359c',
  name: 'YouTube Truckers & eFootball Watch',
  tags: ['youtube', 'google', 'gaming', 'truckers', 'efootball', 'precision', 'safe-navigation'],
  workflow: {
    schemaVersion: 1,
    name: 'YouTube Truckers & eFootball Watch',
    variables: {
      searchQuery: 'youtube',
      truckersTopic: 'truckers trucking games',
      efootballTopic: 'efootball highlights',
    },
    steps: [
      // 1. Safe Navigation to Google with consent auto-dismissal
      {
        type: 'navigate',
        url: 'https://www.google.com',
        allowedHosts: ['google.com', 'www.google.com', 'consent.google.com'],
        waitUntil: 'domcontentloaded',
        timeoutMs: 35000,
        maxRetries: 2,
        aiRecovery: true,
        goal: 'Navigate to Google and dismiss any cookie consent banners',
      },
      // 2. Focus search input on Google
      {
        type: 'waitFor',
        selector: 'intent:search_input',
        timeoutMs: 15000,
      },
      {
        type: 'click',
        selector: 'intent:search_input',
        humanized: true,
      },
      // 3. Search for YouTube
      {
        type: 'type',
        selector: 'intent:search_input',
        text: '{{searchQuery}}',
        humanized: true,
        pressEnter: true,
      },
      // 4. Click the official YouTube link
      {
        type: 'waitFor',
        selector: 'intent:link("YouTube")',
        timeoutMs: 15000,
      },
      {
        type: 'click',
        selector: 'intent:link("YouTube")',
        humanized: true,
      },
      // 5. Settle on YouTube
      {
        type: 'waitFor',
        selector: 'intent:search_input',
        timeoutMs: 25000,
      },
      {
        type: 'sleep',
        minMs: 1500,
        maxMs: 3000,
      },
      // --- PHASE 1: TRUCKERS VIDEO ---
      {
        type: 'click',
        selector: 'intent:search_input',
        humanized: true,
      },
      {
        type: 'type',
        selector: 'intent:search_input',
        text: '{{truckersTopic}}',
        humanized: true,
        pressEnter: true,
      },
      {
        type: 'waitFor',
        selector: 'video:0',
        timeoutMs: 20000,
      },
      {
        type: 'scroll',
        direction: 'down',
        amount: 400,
        kinetic: true,
      },
      {
        type: 'sleep',
        minMs: 1500,
        maxMs: 2500,
      },
      {
        type: 'click',
        selector: 'video:0',
        humanized: true,
      },
      {
        type: 'waitFor',
        selector: 'intent:media',
        timeoutMs: 25000,
      },
      // Watch Truckers video for ~45s
      {
        type: 'sleep',
        minMs: 40000,
        maxMs: 50000,
      },
      // --- PHASE 2: EFOOTBALL VIDEO ---
      // Return to search bar smoothly
      {
        type: 'scroll',
        direction: 'up',
        amount: 600,
        kinetic: true,
      },
      {
        type: 'click',
        selector: 'intent:search_input',
        humanized: true,
      },
      {
        type: 'type',
        selector: 'intent:search_input',
        text: '{{efootballTopic}}',
        humanized: true,
        pressEnter: true,
      },
      {
        type: 'waitFor',
        selector: 'video:0',
        timeoutMs: 20000,
      },
      {
        type: 'scroll',
        direction: 'down',
        amount: 350,
        kinetic: true,
      },
      {
        type: 'sleep',
        minMs: 1500,
        maxMs: 2500,
      },
      {
        type: 'click',
        selector: 'video:0',
        humanized: true,
      },
      {
        type: 'waitFor',
        selector: 'intent:media',
        timeoutMs: 25000,
      },
      // Watch eFootball video for ~45s
      {
        type: 'sleep',
        minMs: 40000,
        maxMs: 50000,
      },
      // Verification screenshot
      {
        type: 'screenshot',
        name: 'truckers-efootball-playback-verified',
      },
    ],
  },
};

const allTasks: Array<{ id?: string; name: string; tags: string[]; workflow: Workflow }> = [
  task1,
  task2,
  task3,
  task4,
  task5,
];

// Validate all schemas with Zod
for (const t of allTasks) {
  WorkflowSchema.parse(t.workflow);
}

const now = Date.now();

for (const dbPath of foundDbs) {
  try {
    const db = new Database(dbPath);
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
    if (!hasTable) {
      db.close();
      continue;
    }

    console.log(`\nRegistering tasks into: ${dbPath}`);
    for (const t of allTasks) {
      const tagsStr = JSON.stringify(t.tags);
      const defStr = JSON.stringify(t.workflow);
      const existingByName = db.prepare('SELECT id FROM tasks WHERE name = ?').get(t.name) as { id: string } | undefined;
      const existingById = t.id ? (db.prepare('SELECT id FROM tasks WHERE id = ?').get(t.id) as { id: string } | undefined) : undefined;
      const existing = existingByName || existingById;
      const taskId = existing?.id || t.id || crypto.randomUUID();

      if (existing) {
        db.prepare(`
          UPDATE tasks 
          SET name = ?, definition = ?, tags = ?, updated_at = ?
          WHERE id = ?
        `).run(t.name, defStr, tagsStr, now, taskId);
        console.log(`  [UPDATED] "${t.name}" (${taskId})`);
      } else {
        db.prepare(`
          INSERT INTO tasks (id, name, schema_version, definition, tags, created_at, updated_at)
          VALUES (?, ?, 1, ?, ?, ?, ?)
        `).run(taskId, t.name, defStr, tagsStr, now, now);
        console.log(`  [CREATED] "${t.name}" (${taskId})`);
      }
    }
    db.close();
  } catch (err: any) {
    console.warn(`Could not update DB at ${dbPath}:`, err.message);
  }
}

console.log('\n[SUCCESS] All tasks registered and ready for execution!');
