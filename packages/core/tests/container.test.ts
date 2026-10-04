import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { createContainer, type Container } from '../src/container';

describe('Core: DI Container (Ticket 0.12)', () => {
  let tempDir: string;
  let container: Container | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-container-test-'));
  });

  afterEach(async () => {
    if (container) {
      await container.dispose();
      container = null;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('boots container and wires all subsystems, repos, and services', async () => {
    const config = loadConfig(tempDir, process.execPath);
    container = await createContainer(config);

    expect(container).toBeDefined();
    expect(container.config).toEqual(config);

    // Database & repos
    expect(container.db).toBeDefined();
    expect(container.repos).toBeDefined();
    expect(container.repos.profiles).toBeDefined();
    expect(container.repos.proxies).toBeDefined();
    expect(container.repos.tasks).toBeDefined();
    expect(container.repos.runs).toBeDefined();
    expect(container.repos.leases).toBeDefined();
    expect(container.repos.events).toBeDefined();

    // Subsystems
    expect(container.logger).toBeDefined();
    expect(container.events).toBeDefined();
    expect(container.queue).toBeDefined();
    expect(container.secrets).toBeDefined();
    expect(container.forwarder).toBeDefined();
    expect(container.broker).toBeDefined();
    expect(container.health).toBeDefined();
    expect(container.fingerprint).toBeDefined();
    expect(container.supervisor).toBeDefined();
    expect(container.crosshair).toBeDefined();
    expect(container.anchors).toBeDefined();

    // Services
    expect(container.services).toBeDefined();
    expect(container.services.profiles).toBeDefined();
    expect(container.services.proxies).toBeDefined();
    expect(container.services.tasks).toBeDefined();
    expect(container.services.runs).toBeDefined();
    expect(container.services.fleet).toBeDefined();
  });

  it('allows functional interactions across wired subsystems on boot', async () => {
    const config = loadConfig(tempDir, process.execPath);
    container = await createContainer(config);

    // EventBus can emit and listen
    let eventReceived = false;
    container.events.on('profile.state_changed', () => {
      eventReceived = true;
    });
    container.events.emit('profile.state_changed', {
      profileId: '11111111-1111-4111-8111-111111111111',
      state: 'idle',
    });
    expect(eventReceived).toBe(true);

    // SecretVault is initialized and operative
    await container.secrets.set('test_key', 'test_val');
    const retrieved = await container.secrets.get('test_key');
    expect(retrieved).toBe('test_val');

    // Services return valid results
    const fleetStatus = await container.services.fleet.status();
    expect(fleetStatus).toBeDefined();
  });

  it('disposes resources cleanly upon container.dispose()', async () => {
    const config = loadConfig(tempDir, process.execPath);
    container = await createContainer(config);

    await expect(container.dispose()).resolves.toBeUndefined();
    // After disposal, attempting queries on closed db should fail or handle gracefully
    expect(() => container!.db.sqlite.prepare('SELECT 1').get()).toThrow();
    container = null;
  });
});
