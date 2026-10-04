import path from 'node:path';
import Database from 'better-sqlite3';

const appData = process.env.APPDATA || '';
const db = new Database(path.join(appData, 'Electron', 'tersoopilot', 'tersoopilot.db'));

const profiles = db.prepare('SELECT id, name, fingerprint_bundle FROM profiles').all() as any[];
for (const p of profiles) {
  try {
    const b = JSON.parse(p.fingerprint_bundle);
    let changed = false;
    if (p.name === 'Profile 2' || (b.userAgent && b.userAgent.includes('Android'))) {
      if (b.webgl?.unmaskedVendor === 'Apple' || !b.webgl?.unmaskedVendor) {
        b.webgl = {
          vendor: 'Qualcomm',
          renderer: 'Qualcomm / Adreno (TM) 750',
          unmaskedVendor: 'Qualcomm',
          unmaskedRenderer: 'Adreno (TM) 750',
        };
        changed = true;
      }
    }
    if (changed) {
      db.prepare('UPDATE profiles SET fingerprint_bundle = ? WHERE id = ?').run(JSON.stringify(b), p.id);
      console.log(`Updated profile ${p.name} with clean WebGL:`, b.webgl);
    }
  } catch (err) {
    console.error(`Error on profile ${p.id}:`, err);
  }
}
console.log('Profile DB fix complete.');
