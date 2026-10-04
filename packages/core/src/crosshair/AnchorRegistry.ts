import { createHash, randomUUID } from 'node:crypto';

import type { AnchorRow } from '../persistence/schema';
import type { AnchorRepo } from '../persistence/repos/anchorRepo';

export type SelectorType = 'xpath' | 'css' | 'role' | 'text';

export interface AnchorKeyInput {
  taskId: string;
  stepIndex: number;
  selectorHint: string;
  semanticSignature?: string | null;
}

export interface AnchorRememberInput {
  taskId: string;
  profileId?: string | null;
  key?: string;
  stepIndex?: number;
  selectorHint?: string;
  semanticSignature?: string | null;
  selector: string;
  type: SelectorType;
  confidence?: number;
  ttlMs?: number;
}

export interface AnchorEntry {
  id: string;
  taskId: string;
  profileId: string | null;
  anchorKey: string;
  selector: string;
  selectorType: SelectorType;
  confidence: number;
  hitCount: number;
  missCount: number;
  lastHitAt: number | null;
  ttlAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AnchorRegistryOptions {
  maxCacheSize?: number;
  defaultTtlMs?: number;
}

export class AnchorRegistry {
  private readonly cache = new Map<string, AnchorEntry>();
  private readonly maxCacheSize: number;

  constructor(
    private readonly anchorRepo: AnchorRepo,
    options?: AnchorRegistryOptions,
  ) {
    this.maxCacheSize = options?.maxCacheSize ?? 1000;
  }

  /**
   * Generates a deterministic SHA-1 anchor key from task context and selector semantics.
   */
  generateKey(input: AnchorKeyInput): string {
    const raw = `${input.taskId}:${input.stepIndex}:${input.selectorHint}:${input.semanticSignature ?? ''}`;
    return createHash('sha1').update(raw).digest('hex');
  }

  /**
   * Remembers a selector target, persisting to SQLite and updating in-memory LRU cache.
   */
  async remember(input: AnchorRememberInput): Promise<AnchorEntry> {
    const now = Date.now();
    const anchorKey =
      input.key ??
      this.generateKey({
        taskId: input.taskId,
        stepIndex: input.stepIndex ?? 0,
        selectorHint: input.selectorHint ?? input.selector,
        semanticSignature: input.semanticSignature ?? null,
      });

    const ttlAt =
      input.ttlMs != null && input.ttlMs > 0 ? now + input.ttlMs : null;
    const profileId = input.profileId ?? null;
    const confidence = input.confidence != null ? Math.min(1.0, Math.max(0.0, input.confidence)) : 1.0;

    // Check if record already exists to preserve id, hitCount, missCount
    const existing = await this.anchorRepo.get(input.taskId, profileId, anchorKey);
    const id = existing?.id ?? randomUUID();

    await this.anchorRepo.upsert({
      id,
      task_id: input.taskId,
      profile_id: profileId,
      anchor_key: anchorKey,
      selector: input.selector,
      selector_type: input.type,
      confidence,
      hit_count: existing?.hit_count ?? 0,
      miss_count: existing?.miss_count ?? 0,
      last_hit_at: existing?.last_hit_at ?? null,
      ttl_at: ttlAt,
    });

    const entry: AnchorEntry = {
      id,
      taskId: input.taskId,
      profileId,
      anchorKey,
      selector: input.selector,
      selectorType: input.type,
      confidence,
      hitCount: existing?.hit_count ?? 0,
      missCount: existing?.miss_count ?? 0,
      lastHitAt: existing?.last_hit_at ?? null,
      ttlAt,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    };

    this.putCache(entry);
    return entry;
  }

  /**
   * Recalls an anchor by task ID, profile ID, and anchor key.
   * Checks in-memory LRU cache first, then SQLite. Falls back to global (profileId = null) anchor.
   */
  async recall(
    taskId: string,
    profileId: string | null | undefined,
    key: string,
  ): Promise<AnchorEntry | null> {
    const now = Date.now();
    const pid = profileId ?? null;

    // 1. In-memory cache check (profile-specific)
    const exactCacheKey = this.getCacheKey(taskId, pid, key);
    let entry = this.cache.get(exactCacheKey);

    // 2. In-memory cache check (global fallback)
    if (!entry && pid !== null) {
      const globalCacheKey = this.getCacheKey(taskId, null, key);
      entry = this.cache.get(globalCacheKey);
    }

    if (entry) {
      // Check TTL expiration
      if (entry.ttlAt !== null && entry.ttlAt < now) {
        await this.evict(entry.id);
        return null;
      }
      // Re-insert to mark recency in LRU
      this.putCache(entry);
      return entry;
    }

    // 3. SQLite lookup (profile-specific)
    let row = await this.anchorRepo.get(taskId, pid, key);

    // 4. SQLite lookup (global fallback)
    if (!row && pid !== null) {
      row = await this.anchorRepo.get(taskId, null, key);
    }

    if (!row) {
      return null;
    }

    // Check TTL expiration
    if (row.ttl_at !== null && row.ttl_at < now) {
      await this.anchorRepo.delete(row.id);
      return null;
    }

    const loadedEntry = this.rowToEntry(row);
    this.putCache(loadedEntry);
    return loadedEntry;
  }

  /**
   * Reinforces an anchor on successful resolution:
   * hit_count++, confidence = min(1.0, confidence + 0.05), last_hit_at = now.
   */
  async reinforce(id: string): Promise<AnchorEntry | null> {
    const updated = await this.anchorRepo.recordHit(id);
    if (!updated) {
      return null;
    }
    const entry = this.rowToEntry(updated);
    this.putCache(entry);
    return entry;
  }

  /**
   * Decays an anchor on resolution failure:
   * miss_count++, confidence = max(0.0, confidence - 0.1).
   */
  async decay(id: string): Promise<AnchorEntry | null> {
    const updated = await this.anchorRepo.recordMiss(id);
    if (!updated) {
      return null;
    }
    const entry = this.rowToEntry(updated);
    this.putCache(entry);
    return entry;
  }

  /**
   * Evicts an anchor from both DB and in-memory cache.
   */
  async evict(id: string): Promise<void> {
    // Remove from in-memory cache
    for (const [key, entry] of this.cache.entries()) {
      if (entry.id === id) {
        this.cache.delete(key);
      }
    }
    await this.anchorRepo.delete(id);
  }

  /**
   * Sweeps and evicts stale anchors:
   * - Anchors with confidence < 0.3 and older than maxAgeMs (default: 7 days)
   * - Anchors where ttl_at is past now
   */
  async evictStale(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    const cutoff = now - maxAgeMs;

    // Purge in-memory cache
    for (const [key, entry] of this.cache.entries()) {
      const isLowConfidenceStale =
        entry.confidence < 0.3 &&
        (entry.lastHitAt !== null ? entry.lastHitAt < cutoff : entry.createdAt < cutoff);
      const isExpiredTtl = entry.ttlAt !== null && entry.ttlAt < now;

      if (isLowConfidenceStale || isExpiredTtl) {
        this.cache.delete(key);
      }
    }

    return this.anchorRepo.deleteStale(now, maxAgeMs);
  }

  /**
   * Clears the in-memory LRU cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Returns current count of entries in the in-memory cache.
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  private putCache(entry: AnchorEntry): void {
    const key = this.getCacheKey(entry.taskId, entry.profileId, entry.anchorKey);

    // If key already exists, delete so it gets re-inserted at the end (newest)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxCacheSize) {
      // Evict oldest (first item in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, entry);
  }

  private getCacheKey(taskId: string, profileId: string | null, anchorKey: string): string {
    return `${taskId}:${profileId ?? 'global'}:${anchorKey}`;
  }

  private rowToEntry(row: AnchorRow): AnchorEntry {
    return {
      id: row.id,
      taskId: row.task_id,
      profileId: row.profile_id,
      anchorKey: row.anchor_key,
      selector: row.selector,
      selectorType: row.selector_type as SelectorType,
      confidence: row.confidence,
      hitCount: row.hit_count,
      missCount: row.miss_count,
      lastHitAt: row.last_hit_at,
      ttlAt: row.ttl_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
