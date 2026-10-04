import path from 'node:path';
import fs from 'node:fs';
import { resolveCamoufoxBinary } from '../packages/core/src/engines/camoufox/resolveBinary';

const bin = resolveCamoufoxBinary();
console.log('Binary path:', bin);
if (bin && fs.existsSync(bin)) {
  const dir = path.dirname(bin);
  console.log('Directory:', dir);
  const dist = path.join(dir, 'distribution');
  if (fs.existsSync(dist)) {
    console.log('Distribution files:', fs.readdirSync(dist));
    const pol = path.join(dist, 'policies.json');
    if (fs.existsSync(pol)) {
      console.log('policies.json content:\n', fs.readFileSync(pol, 'utf8'));
    }
  } else {
    console.log('No distribution folder found');
  }
} else {
  console.log('Binary does not exist');
}
