import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { AnchorRegistry } from '../src/crosshair/AnchorRegistry';
import { openDb } from '../src/persistence/db';
import { Repos } from '../src/persistence/repos';

describe('Ticket 4.2: AnchorRegistry In-Memory LRU & SQLite Persistence', () => {
  let tempDir: string;
  let repos: Repos;
  let db: ReturnType<typeof openDb>;
  let registry: AnchorRegistry;
  const rootMigrationsDir = path.resolve(__dirname, '../../../migrations');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tersoo-anchor-test-'));
    const config = loadConfig(tempDir, 'dummy-chrome');
    db = openDb(config, rootMigrationsDir);
    repos = new Repos(db);
    registry = new AnchorRegistry(repos.anchors, { maxCacheSize: 3 });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates deterministic SHA-1 keys for selector hints', () => {
    const key1 = registry.generateKey({
      taskId: 'task-101',
      stepIndex: 2,
      selectorHint: '//button[@id="submit"]',
      semanticSignature: 'primary-submit-btn',
    });

    const key2 = registry.generateKey({
      taskId: 'task-101',
      stepIndex: 2,
      selectorHint: '//button[@id="submit"]',
      semanticSignature: 'primary-submit-btn',
    });

    const key3 = registry.generateKey({
      taskId: 'task-101',
      stepIndex: 3,
      selectorHint: '//button[@id="submit"]',
    });

    expect(key1).toMatch(/^[0-9a-f]{40}$/);
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('remembers and recalls an anchor from in-memory cache and SQLite', async () => {
    const key = registry.generateKey({
      taskId: 'task-1',
      stepIndex: 0,
      selectorHint: '#login-btn',
    });

    const remembered = await registry.remember({
      taskId: 'task-1',
      profileId: 'profile-a',
      key,
      selector: '#login-btn-resolved',
      type: 'css',
      confidence: 1.0,
    });

    expect(remembered.selector).toBe('#login-btn-resolved');
    expect(remembered.confidence).toBe(1.0);
    expect(registry.getCacheSize()).toBe(1);

    // Recall from in-memory cache
    const cached = await registry.recall('task-1', 'profile-a', key);
    expect(cached).not.toBeNull();
    expect(cached?.selector).toBe('#login-btn-resolved');

    // Clear memory cache to force SQLite DB read
    registry.clearCache();
    expect(registry.getCacheSize()).toBe(0);

    const fromDb = await registry.recall('task-1', 'profile-a', key);
    expect(fromDb).not.toBeNull();
    expect(fromDb?.selector).toBe('#login-btn-resolved');
    expect(registry.getCacheSize()).toBe(1);
  });

  it('falls back to global anchor (profileId = null) when profile-specific anchor is missing', async () => {
    const key = registry.generateKey({
      taskId: 'task-global',
      stepIndex: 1,
      selectorHint: '//input[@name="search"]',
    });

    await registry.remember({
      taskId: 'task-global',
      profileId: null, // global anchor
      key,
      selector: '//input[@name="search-v2"]',
      type: 'xpath',
    });

    // Querying with profile-xyz should fall back to the global anchor
    const recalled = await registry.recall('task-global', 'profile-xyz', key);
    expect(recalled).not.toBeNull();
    expect(recalled?.selector).toBe('//input[@name="search-v2"]');
    expect(recalled?.profileId).toBeNull();
  });

  it('reinforces confidence (+0.05 capped at 1.0) and records hits', async () => {
    const entry = await registry.remember({
      taskId: 'task-reinforce',
      key: 'key-1',
      selector: '#btn',
      type: 'css',
      confidence: 0.9,
    });

    const hit1 = await registry.reinforce(entry.id);
    expect(hit1?.hitCount).toBe(1);
    expect(hit1?.confidence).toBe(0.95);
    expect(hit1?.lastHitAt).not.toBeNull();

    const hit2 = await registry.reinforce(entry.id);
    expect(hit2?.hitCount).toBe(2);
    expect(hit2?.confidence).toBe(1.0); // capped at 1.0

    const hit3 = await registry.reinforce(entry.id);
    expect(hit3?.confidence).toBe(1.0); // remains 1.0
  });

  it('decays confidence (-0.1 floored at 0.0) on misses', async () => {
    const entry = await registry.remember({
      taskId: 'task-decay',
      key: 'key-2',
      selector: '#broken',
      type: 'css',
      confidence: 0.25,
    });

    const miss1 = await registry.decay(entry.id);
    expect(miss1?.missCount).toBe(1);
    expect(miss1?.confidence).toBe(0.15);

    const miss2 = await registry.decay(entry.id);
    expect(miss2?.missCount).toBe(2);
    expect(miss2?.confidence).toBe(0.05);

    const miss3 = await registry.decay(entry.id);
    expect(miss3?.missCount).toBe(3);
    expect(miss3?.confidence).toBe(0.0); // floored at 0.0
  });

  it('enforces TTL expiration on recall', async () => {
    const key = 'expiring-key';
    await registry.remember({
      taskId: 'task-ttl',
      key,
      selector: '#temp-elem',
      type: 'css',
      ttlMs: 50, // 50ms
    });

    // Immediate recall works
    const immediate = await registry.recall('task-ttl', null, key);
    expect(immediate).not.toBeNull();

    // Wait for TTL expiration
    await new Promise((r) => setTimeout(r, 70));

    const expired = await registry.recall('task-ttl', null, key);
    expect(expired).toBeNull();
  });

  it('evicts stale anchors (confidence < 0.3 older than 7d or expired TTL)', async () => {
    const now = Date.now();
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

    // 1. Stale entry with low confidence and backdated last_hit_at
    await repos.anchors.upsert({
      id: 'stale-id-1',
      task_id: 'task-stale',
      profile_id: null,
      anchor_key: 'stale-1',
      selector: '#stale',
      selector_type: 'css',
      confidence: 0.2,
      hit_count: 0,
      miss_count: 5,
      last_hit_at: eightDaysAgo,
      ttl_at: null,
    });
    // Load into memory cache with backdated timestamp
    await registry.recall('task-stale', null, 'stale-1');

    // 2. Active entry with high confidence
    await registry.remember({
      taskId: 'task-stale',
      key: 'active-1',
      selector: '#active',
      type: 'css',
      confidence: 0.9,
    });

    const deletedCount = await registry.evictStale();
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    const recalledStale = await registry.recall('task-stale', null, 'stale-1');
    expect(recalledStale).toBeNull();

    const recalledActive = await registry.recall('task-stale', null, 'active-1');
    expect(recalledActive).not.toBeNull();
  });

  it('evicts oldest items from memory cache when maxCacheSize is exceeded (LRU behavior)', async () => {
    // maxCacheSize = 3
    await registry.remember({ taskId: 't', key: 'k1', selector: 's1', type: 'css' });
    await registry.remember({ taskId: 't', key: 'k2', selector: 's2', type: 'css' });
    await registry.remember({ taskId: 't', key: 'k3', selector: 's3', type: 'css' });
    expect(registry.getCacheSize()).toBe(3);

    // Access k1 to make k2 the oldest
    await registry.recall('t', null, 'k1');

    // Insert 4th entry
    await registry.remember({ taskId: 't', key: 'k4', selector: 's4', type: 'css' });
    expect(registry.getCacheSize()).toBe(3);

    // k2 was the oldest and should be evicted from memory (still exists in DB)
    // We can verify memory cache eviction by checking if k2 was deleted from memory cache
    const cacheMap = (registry as any).cache;
    expect(cacheMap.has('t:global:k2')).toBe(false);
    expect(cacheMap.has('t:global:k1')).toBe(true);
    expect(cacheMap.has('t:global:k3')).toBe(true);
    expect(cacheMap.has('t:global:k4')).toBe(true);
  });
});
