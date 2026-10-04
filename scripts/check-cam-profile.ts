import path from 'node:path';
import fs from 'node:fs';

const appData = process.env.APPDATA || '';
const profilesDir = path.join(appData, 'Electron', 'tersoopilot', 'profiles');
console.log('Profiles dir exists:', fs.existsSync(profilesDir));
if (fs.existsSync(profilesDir)) {
  const dirs = fs.readdirSync(profilesDir);
  for (const d of dirs) {
    const camDir = path.join(profilesDir, d, 'camoufox');
    if (fs.existsSync(camDir)) {
      console.log('Found camoufox dir:', camDir);
      const files = fs.readdirSync(camDir);
      console.log('  Files:', files.filter(f => f.includes('search') || f.includes('pref') || f.includes('policy')));
    }
  }
}
