import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadConfig, paths } from '../src/config';

describe('Core: Config & Paths', () => {
  const dummyUserData = 'C:/test-user-data';
  const dummyChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

  it('loads configuration with defaults', () => {
    const config = loadConfig(dummyUserData, dummyChrome);
    expect(config.userDataDir).toBe(path.resolve(dummyUserData));
    expect(config.chromeBinary).toBe(dummyChrome);
    expect(config.headless).toBe(true);
    expect(config.strictCoherence).toBe(true);
    expect(config.leaseTtlMs).toBe(6 * 60 * 60 * 1000);
    expect(config.leaseHeartbeatMs).toBe(60 * 1000);
    expect(config.leaseSweepMs).toBe(5 * 60 * 1000);
    expect(config.forwarderHealthTimeoutMs).toBe(8000);
    expect(config.cdpDiscoveryTimeoutMs).toBe(15000);
    expect(config.stealthMinScore).toBe(0.9);
    expect(config.defaultConcurrency).toBe(5);
  });

  it('allows overriding default settings', () => {
    const config = loadConfig(dummyUserData, dummyChrome, {
      headless: false,
      defaultConcurrency: 10,
      stealthMinScore: 0.85,
    });
    expect(config.headless).toBe(false);
    expect(config.defaultConcurrency).toBe(10);
    expect(config.stealthMinScore).toBe(0.85);
  });

  it('computes correct paths structure', () => {
    const config = loadConfig(dummyUserData, dummyChrome);
    const p = paths(config);

    expect(p.db).toBe(path.join(config.userDataDir, 'tersoopilot.db'));
    expect(p.logs).toBe(path.join(config.userDataDir, 'logs'));
    expect(p.profiles).toBe(path.join(config.userDataDir, 'profiles'));
    expect(p.profileDir('p1')).toBe(path.join(config.userDataDir, 'profiles', 'p1'));
    expect(p.profileChrome('p1')).toBe(path.join(config.userDataDir, 'profiles', 'p1', 'chromium'));
    expect(p.profileCache('p1')).toBe(path.join(config.userDataDir, 'profiles', 'p1', 'cache'));
    expect(p.profileCrash('p1')).toBe(path.join(config.userDataDir, 'profiles', 'p1', 'crash'));
    expect(p.profileLock('p1')).toBe(
      path.join(config.userDataDir, 'profiles', 'p1', 'profile.lock'),
    );
    expect(p.artifacts('p1', 'run-1')).toBe(
      path.join(config.userDataDir, 'profiles', 'p1', 'artifacts', 'run-1'),
    );
  });
});
