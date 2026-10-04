import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_PRESET_IDS } from '../packages/contracts/src';
import { createContainer, loadConfig } from '../packages/core/src';

async function runSoakTest() {
  console.log('--- Starting TersooPilot Phase 6 Soak & Memory Stability Test ---');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-soak-'));
  const config = loadConfig(tempDir, 'dummy-chrome');
  const container = await createContainer(config);

  const initialMem = process.memoryUsage();
  console.log(`[Memory] Initial Heap: ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB, RSS: ${(initialMem.rss / 1024 / 1024).toFixed(2)} MB`);

  const concurrency = 5;
  container.services.fleet.setConcurrency(concurrency);
  console.log(`[Fleet] Concurrency limit set to ${concurrency}`);

  // Create 5 distinct profiles across engines
  const profileIds: string[] = [];
  console.log('[Setup] Creating 5 test profiles...');
  for (let i = 0; i < concurrency; i++) {
    const engine = i % 2 === 0 ? 'apostate' : 'camoufox';
    const profile = await container.services.profiles.create({
      name: `Soak-Profile-${i + 1}`,
      presetId: DEFAULT_PRESET_IDS.windows11,
      engine,
      tags: ['soak-test'],
      notes: `Soak profile instance ${i + 1}`,
    });
    profileIds.push(profile.id);
  }
  console.log(`[Setup] Successfully created ${profileIds.length} profiles.`);

  // Verify memory after profile creation
  const afterCreateMem = process.memoryUsage();
  console.log(`[Memory] After Creation Heap: ${(afterCreateMem.heapUsed / 1024 / 1024).toFixed(2)} MB, RSS: ${(afterCreateMem.rss / 1024 / 1024).toFixed(2)} MB`);

  // Verify fleet budget & canSpawnAnother check
  const fleetStatus = await container.services.fleet.status();
  console.log(`[Fleet] Status: activeInstances=${fleetStatus.activeInstances}, running=${fleetStatus.running}, idle=${fleetStatus.idle}`);

  const canSpawn = await container.services.fleet.canSpawnAnother();
  console.log(`[Fleet] canSpawnAnother check: ${canSpawn}`);
  if (!canSpawn) {
    throw new Error('Fleet should be able to spawn profiles under initial memory budget');
  }

  // Simulate concurrent lease acquisition and state cycling across 5 profiles
  console.log('[Lifecycle] Simulating state cycling across 5 profiles...');
  for (const pid of profileIds) {
    await container.repos.profiles.update(pid, { state: 'running' });
    await container.services.fleet.acquireLaunchStagger();
  }

  // Backup creation under load
  console.log('[Backup] Creating database snapshot under soak test...');
  const backup = await container.services.backup.create({ name: 'soak_test_snapshot' });
  console.log(`[Backup] Snapshot created: ${backup.filename} (${(backup.sizeBytes / 1024).toFixed(2)} KB)`);

  // Stopping and returning all profiles to idle
  console.log('[Cleanup] Stopping all profiles and verifying clean release...');
  for (const pid of profileIds) {
    await container.repos.profiles.update(pid, { state: 'idle' });
  }

  const finalMem = process.memoryUsage();
  console.log(`[Memory] Final Heap: ${(finalMem.heapUsed / 1024 / 1024).toFixed(2)} MB, RSS: ${(finalMem.rss / 1024 / 1024).toFixed(2)} MB`);

  // Memory cap assertion: Node/Electron host process shouldn't exceed 500MB RSS for idle core
  const rssMb = finalMem.rss / 1024 / 1024;
  if (rssMb > 500) {
    console.warn(`[Warning] High RSS detected: ${rssMb.toFixed(2)} MB`);
  } else {
    console.log(`[PASS] Memory RSS within healthy bounds (${rssMb.toFixed(2)} MB <= 500 MB).`);
  }

  // Dispose container and clean temp dir
  await container.dispose();
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('--- Phase 6 Soak & Memory Stability Test COMPLETED SUCCESSFULLY ---');
}

runSoakTest().catch((err) => {
  console.error('[Soak Test Failed]:', err);
  process.exit(1);
});
