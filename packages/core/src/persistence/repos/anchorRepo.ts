import type { Kysely } from 'kysely';

import type { AnchorRow, DB } from '../schema';

export class AnchorRepo {
  constructor(private db: Kysely<DB>) {}

  async get(
    taskId: string,
    profileId: string | null,
    anchorKey: string,
  ): Promise<AnchorRow | undefined> {
    let query = this.db
      .selectFrom('anchors')
      .selectAll()
      .where('task_id', '=', taskId)
      .where('anchor_key', '=', anchorKey);

    if (profileId === null) {
      query = query.where('profile_id', 'is', null);
    } else {
      query = query.where('profile_id', '=', profileId);
    }

    return query.executeTakeFirst();
  }

  async upsert(row: Omit<AnchorRow, 'created_at' | 'updated_at'>): Promise<void> {
    const now = Date.now();
    const existing = await this.get(row.task_id, row.profile_id, row.anchor_key);
    if (existing) {
      await this.db
        .updateTable('anchors')
        .set({
          selector: row.selector,
          selector_type: row.selector_type,
          confidence: row.confidence,
          hit_count: row.hit_count,
          miss_count: row.miss_count,
          last_hit_at: row.last_hit_at,
          ttl_at: row.ttl_at,
          updated_at: now,
        })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await this.db
        .insertInto('anchors')
        .values({
          ...row,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            selector: row.selector,
            selector_type: row.selector_type,
            confidence: row.confidence,
            hit_count: row.hit_count,
            miss_count: row.miss_count,
            last_hit_at: row.last_hit_at,
            ttl_at: row.ttl_at,
            updated_at: now,
          }),
        )
        .execute();
    }
  }

  async getById(id: string): Promise<AnchorRow | undefined> {
    return this.db
      .selectFrom('anchors')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async recordHit(id: string): Promise<AnchorRow | undefined> {
    const now = Date.now();
    const existing = await this.db
      .selectFrom('anchors')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) return undefined;

    const nextConfidence = Math.min(1.0, Math.round((existing.confidence + 0.05) * 100) / 100);

    await this.db
      .updateTable('anchors')
      .set({
        hit_count: existing.hit_count + 1,
        confidence: nextConfidence,
        last_hit_at: now,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();

    return {
      ...existing,
      hit_count: existing.hit_count + 1,
      confidence: nextConfidence,
      last_hit_at: now,
      updated_at: now,
    };
  }

  async recordMiss(id: string): Promise<AnchorRow | undefined> {
    const now = Date.now();
    const existing = await this.db
      .selectFrom('anchors')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) return undefined;

    const nextConfidence = Math.max(0.0, Math.round((existing.confidence - 0.1) * 100) / 100);

    await this.db
      .updateTable('anchors')
      .set({
        miss_count: existing.miss_count + 1,
        confidence: nextConfidence,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();

    return {
      ...existing,
      miss_count: existing.miss_count + 1,
      confidence: nextConfidence,
      updated_at: now,
    };
  }

  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom('anchors')
      .where('id', '=', id)
      .execute();
  }

  async deleteStale(now: number = Date.now(), maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = now - maxAgeMs;

    const res = await this.db
      .deleteFrom('anchors')
      .where((eb) =>
        eb.or([
          eb.and([
            eb('confidence', '<', 0.3),
            eb.or([
              eb('last_hit_at', '<', cutoff),
              eb.and([eb('last_hit_at', 'is', null), eb('created_at', '<', cutoff)]),
            ]),
          ]),
          eb.and([
            eb('ttl_at', 'is not', null),
            eb('ttl_at', '<', now),
          ]),
        ]),
      )
      .executeTakeFirst();

    return Number(res.numDeletedRows);
  }
}
