import Database from '../packages/core/node_modules/better-sqlite3/lib/index.js';
import path from 'path';

const dbPath = path.join(process.env.APPDATA, 'Electron', 'tersoopilot', 'tersoopilot.db');
const db = new Database(dbPath);

const updatedDefinition = {
  schemaVersion: 1,
  name: 'Realistic YouTube Bus Journey Search & Watch (via Google)',
  variables: {
    videoKeyword: ' This 249 KM Bus Journey Was INSANE! 🔥 | Bus Simulator Coach Master Gameplay'
  },
  steps: [
    {
      type: 'navigate',
      url: 'https://www.google.com',
      waitUntil: 'domcontentloaded'
    },
    {
      type: 'waitFor',
      selector: "textarea[name='q'], input[name='q']",
      timeoutMs: 15000
    },
    {
      type: 'sleep',
      minMs: 1000,
      maxMs: 2000
    },
    {
      type: 'click',
      selector: "textarea[name='q'], input[name='q']",
      humanized: true
    },
    {
      type: 'type',
      selector: "textarea[name='q'], input[name='q']",
      text: 'youtube',
      humanized: true,
      pressEnter: true
    },
    {
      type: 'waitFor',
      selector: "#search a[href='https://www.youtube.com/'], a:has(h3:has-text('YouTube')), //h3[contains(., 'YouTube')]/ancestor::a",
      timeoutMs: 20000
    },
    {
      type: 'sleep',
      minMs: 1200,
      maxMs: 2200
    },
    {
      type: 'click',
      selector: "#search a[href='https://www.youtube.com/'], a:has(h3:has-text('YouTube')), //h3[contains(., 'YouTube')]/ancestor::a",
      humanized: true
    },
    {
      type: 'waitFor',
      selector: "input#search, input[name='search_query']",
      timeoutMs: 25000
    },
    {
      type: 'sleep',
      minMs: 2000,
      maxMs: 3500
    },
    {
      type: 'click',
      selector: "input#search, input[name='search_query']",
      humanized: true
    },
    {
      type: 'type',
      selector: "input#search, input[name='search_query']",
      text: '{{videoKeyword}}',
      humanized: true,
      pressEnter: true
    },
    {
      type: 'waitFor',
      selector: 'ytd-search, ytd-two-column-search-results-renderer',
      timeoutMs: 20000
    },
    {
      type: 'sleep',
      minMs: 1500,
      maxMs: 2500
    },
    {
      type: 'waitFor',
      selector: 'video:{{videoKeyword}}',
      timeoutMs: 45000
    },
    {
      type: 'click',
      selector: 'video:{{videoKeyword}}',
      humanized: true
    },
    {
      type: 'waitFor',
      selector: '.html5-video-player, video, ytd-watch-flexy',
      timeoutMs: 25000
    },
    {
      type: 'sleep',
      minMs: 60000,
      maxMs: 65000
    },
    {
      type: 'screenshot',
      name: 'bus-simulator-1min-watch'
    }
  ]
};

const stmt = db.prepare('UPDATE tasks SET definition = ?, updated_at = ? WHERE id = ?');
const res = stmt.run(JSON.stringify(updatedDefinition), Date.now(), 'e33710b4-4871-4ded-940e-72a1f7bb0792');
console.log('Update result:', res);

const check = db.prepare('SELECT id, name, definition FROM tasks WHERE id = ?').get('e33710b4-4871-4ded-940e-72a1f7bb0792');
console.log('Verified updated task:', check.name);
const parsed = JSON.parse(check.definition);
console.log('Total steps:', parsed.steps.length);
console.log('Steps preview:');
parsed.steps.forEach((s, idx) => console.log(`Step ${idx + 1}: [${s.type}] ${s.selector || s.url || s.name || s.minMs + 'ms'}`));
