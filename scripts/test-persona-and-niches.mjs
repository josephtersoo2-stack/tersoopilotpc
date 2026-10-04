import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Electron', 'tersoopilot', 'tersoopilot.db');
console.log('Connecting to database:', dbPath);

const db = new DatabaseSync(dbPath);

// Query a profile
const profile = db.prepare('SELECT id, name, trust_score, maturation_stage, typing_wpm, typo_rate, patience_index, engagement_rate, niche_id, niche_ids, weighted_niches FROM profiles LIMIT 1').get();

console.log('Sample profile record:', profile);

// Test update with persona and multi-niches
if (profile) {
  const testNiches = ['niche-1', 'niche-2'];
  const testWeighted = [{ nicheId: 'niche-1', weight: 85, isPrimary: true }, { nicheId: 'niche-2', weight: 50, isPrimary: false }];
  
  db.prepare(`
    UPDATE profiles 
    SET trust_score = 65,
        maturation_stage = 'maturing',
        typing_wpm = 82,
        typo_rate = 3.8,
        patience_index = 7.2,
        engagement_rate = 28,
        niche_ids = ?,
        weighted_niches = ?
    WHERE id = ?
  `).run(JSON.stringify(testNiches), JSON.stringify(testWeighted), profile.id);

  const updated = db.prepare('SELECT id, name, trust_score, maturation_stage, typing_wpm, typo_rate, patience_index, engagement_rate, niche_ids, weighted_niches FROM profiles WHERE id = ?').get(profile.id);
  console.log('Successfully updated profile persona & niches:');
  console.log(updated);
}

db.close();
