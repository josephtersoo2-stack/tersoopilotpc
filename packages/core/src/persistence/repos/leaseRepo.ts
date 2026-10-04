import crypto from 'node:crypto';

import type { LeaseSummary } from '@tersoo/contracts';
import type { Kysely } from 'kysely';

import type { DB, ProxyLeaseRow } from '../schema';

export class LeaseRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<ProxyLeaseRow | undefined> {
    return this.db.selectFrom('proxy_leases').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async getActiveForProfile(profileId: string): Promise<ProxyLeaseRow | undefined> {
    return this.db
      .selectFrom('proxy_leases')
      .selectAll()
      .where('profile_id', '=', profileId)
      .where('state', '=', 'active')
      .executeTakeFirst();
  }

  async getActiveForProxy(proxyId: string): Promise<ProxyLeaseRow | undefined> {
    return this.db
      .selectFrom('proxy_leases')
      .selectAll()
      .where('proxy_id', '=', proxyId)
      .where('state', '=', 'active')
      .executeTakeFirst();
  }

  async listActive(): Promise<ProxyLeaseRow[]> {
    return this.db
      .selectFrom('proxy_leases')
      .selectAll()
      .where('state', '=', 'active')
      .orderBy('acquired_at', 'desc')
      .execute();
  }

  /**
   * Atomic acquisition. Enforced by partial unique index in SQLite.
   * Returns null if proxy is already leased or profile already has a lease.
   */
  async acquire(profileId: string, proxyId: string, ttlMs: number): Promise<LeaseSummary | null> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ttlMs;

    try {
      await this.db
        .insertInto('proxy_leases')
        .values({
          id,
          proxy_id: proxyId,
          profile_id: profileId,
          state: 'active',
          acquired_at: now,
          expires_at: expiresAt,
          heartbeat_at: now,
          released_at: null,
        })
        .execute();
      return {
        id,
        proxyId,
        profileId,
        state: 'active',
        acquiredAt: now,
        expiresAt,
        heartbeatAt: now,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        return null;
      }
      throw err;
    }
  }

  async heartbeat(leaseId: string, ttlMs: number): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('proxy_leases')
      .set({ heartbeat_at: now, expires_at: now + ttlMs })
      .where('id', '=', leaseId)
      .where('state', '=', 'active')
      .execute();
  }

  async release(leaseId: string, reason: 'released' | 'expired' = 'released'): Promise<void> {
    await this.db
      .updateTable('proxy_leases')
      .set({ state: reason, released_at: Date.now() })
      .where('id', '=', leaseId)
      .where('state', '=', 'active')
      .execute();
  }

  async releaseForProfile(
    profileId: string,
    reason: 'released' | 'expired' = 'released',
  ): Promise<number> {
    const res = await this.db
      .updateTable('proxy_leases')
      .set({ state: reason, released_at: Date.now() })
      .where('profile_id', '=', profileId)
      .where('state', '=', 'active')
      .executeTakeFirst();
    return Number(res.numUpdatedRows ?? 0);
  }

  async sweepExpired(): Promise<number> {
    const now = Date.now();
    const res = await this.db
      .updateTable('proxy_leases')
      .set({ state: 'expired', released_at: now })
      .where('state', '=', 'active')
      .where('expires_at', '<', now)
      .executeTakeFirst();
    return Number(res.numUpdatedRows ?? 0);
  }
}
