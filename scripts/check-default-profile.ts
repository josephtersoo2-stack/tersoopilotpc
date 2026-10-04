import fs from 'node:fs';
import path from 'node:path';

const dir = "C:\\Users\\Akende Micheal\\AppData\\Roaming\\Electron\\tersoopilot\\profiles\\63da1690-5e17-42f7-a910-80c962260f26\\apostate";

if (fs.existsSync(dir)) {
  const allFiles = fs.readdirSync(dir);
  console.log('Files in apostate dir:', allFiles);
  const defaultDir = path.join(dir, 'Default');
  if (fs.existsSync(defaultDir)) {
    console.log('Default dir exists! Files in Default:', fs.readdirSync(defaultDir).slice(0, 30));
    const networkDir = path.join(defaultDir, 'Network');
    if (fs.existsSync(networkDir)) {
      console.log('Network dir exists! Files in Network:', fs.readdirSync(networkDir));
    }
  } else {
    console.log('NO Default dir in apostate dir!');
  }
}
