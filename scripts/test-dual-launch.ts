import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Akende Micheal\\AppData\\Local';
const cfCache = path.join(localAppData, 'camoufox', 'camoufox', 'Cache');
process.env.CAMOUFOX_INSTALL_DIR = cfCache;

const apostateBin = path.join(
  localAppData,
  'apostate',
  'cache',
  '155.0.8059.31',
  'windows-x64',
  'install',
  'chrome.exe',
);
process.env.APOSTATE_BINARY = apostateBin;

async function run() {
  const { createContainer } = await import('../packages/core/src/container/index');
  const { loadConfig } = await import('../packages/core/src/config');

  console.log('Testing dual-engine launch in container...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-dual-test-'));
  const config = loadConfig(tempDir, apostateBin, { headless: true });
  const container = await createContainer(config);

  try {
    console.log('--- 1. Testing Apostate Profile Launch ---');
    const defaultPreset = (await container.repos.presets.list())[0];
    const pApostate = await container.services.profiles.create({
      name: 'Apostate Test Profile',
      presetId: defaultPreset.id,
      engine: 'apostate',
    });
    console.log('Created Apostate profile:', pApostate.id, 'Engine:', pApostate.engine);
    const launchA = await container.services.profiles.launch(pApostate.id);
    console.log('Apostate launched successfully! State:', launchA.instance.state);
    await container.services.profiles.stop(pApostate.id);
    console.log('Apostate stopped cleanly!');

    console.log('--- 2. Testing Camoufox Profile Launch ---');
    const presets = await container.repos.presets.list();
    const winPreset = presets.find((p) => p.platform === 'windows') || defaultPreset;
    const pCamoufox = await container.services.profiles.create({
      name: 'Camoufox Test Profile',
      presetId: winPreset.id,
      engine: 'camoufox',
    });
    console.log('Created Camoufox profile:', pCamoufox.id, 'Engine:', pCamoufox.engine);
    const launchC = await container.services.profiles.launch(pCamoufox.id);
    console.log('Camoufox launched successfully! State:', launchC.instance.state);
    await container.services.profiles.stop(pCamoufox.id);
    console.log('Camoufox stopped cleanly!');

    console.log('\n=== ALL DUAL-ENGINE LAUNCH TESTS PASSED! ===');
  } finally {
    await container.dispose();
  }
}

run().catch((err) => {
  console.error('Dual-engine launch test failed:', err);
  process.exit(1);
});
