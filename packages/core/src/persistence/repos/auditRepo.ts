import type { Kysely } from 'kysely';

import type { AuditRow, DB } from '../schema';

export class AuditRepo {
  constructor(private db: Kysely<DB>) {}

  async append(
    actor: string,
    action: string,
    target: string | null = null,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db
      .insertInto('audit')
      .values({
        ts: Date.now(),
        actor,
        action,
        target,
        meta: JSON.stringify(meta),
      })
      .execute();
  }

  async record(params: {
    actor: string;
    action: string;
    target?: string | null | undefined;
    meta?: Record<string, unknown> | undefined;
  }): Promise<void> {
    return this.append(
      params.actor,
      params.action,
      params.target ?? null,
      params.meta ?? {},
    );
  }

  async query(limit = 100): Promise<AuditRow[]> {
    return this.db.selectFrom('audit').selectAll().orderBy('ts', 'desc').limit(limit).execute();
  }
}
