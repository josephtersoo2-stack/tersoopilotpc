import Database from '../packages/core/node_modules/better-sqlite3/lib/index.js';
import path from 'path';

const db = new Database(path.join(process.env.APPDATA, 'Electron', 'tersoopilot', 'tersoopilot.db'));
const now = Date.now();
const defaults = [
  {
    id: 'niche-sim-games',
    name: 'Simulation Games',
    description: 'Euro Truck, Bus Simulator, and Flight Sim gameplay enthusiasts',
    keywords: JSON.stringify([
      'This 249 KM Bus Journey Was INSANE! 🔥 | Bus Simulator Coach Master Gameplay',
      'Euro Truck Simulator 2 realistic rain driving',
      'Microsoft Flight Simulator 2024 stormy landing',
      'BeamNG drive realistic car crash test',
    ]),
    seed_urls: JSON.stringify(['https://youtube.com', 'https://steamcommunity.com']),
    tags: JSON.stringify(['gaming', 'simulators', 'youtube']),
  },
  {
    id: 'niche-tech-reviews',
    name: 'Tech & Gadget Reviews',
    description: 'Hardware benchmarking, flagship phone unboxings, and consumer tech',
    keywords: JSON.stringify([
      'RTX 5090 benchmark test ultra settings',
      'iPhone 16 Pro Max full day battery test',
      'M3 Max MacBook Pro programmer review',
    ]),
    seed_urls: JSON.stringify(['https://youtube.com', 'https://theverge.com', 'https://tomshardware.com']),
    tags: JSON.stringify(['tech', 'gadgets', 'reviews']),
  },
  {
    id: 'niche-smart-shopping',
    name: 'Smart Shopping & Deals',
    description: 'E-commerce discount hunting, coupon codes, and price comparison',
    keywords: JSON.stringify([
      'best mechanical keyboard under 100',
      'noise cancelling headphones comparison',
      'cheapest 4k 144hz gaming monitor deal',
    ]),
    seed_urls: JSON.stringify(['https://amazon.com', 'https://bestbuy.com']),
    tags: JSON.stringify(['shopping', 'ecommerce', 'deals']),
  },
];

for (const d of defaults) {
  db.prepare('INSERT OR IGNORE INTO niches (id, name, description, keywords, seed_urls, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    d.id, d.name, d.description, d.keywords, d.seed_urls, d.tags, now, now
  );
}
console.log('Seeded defaults, total niches now:', db.prepare('SELECT count(*) as c FROM niches').get().c);
db.close();
