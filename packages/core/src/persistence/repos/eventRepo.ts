import type { Kysely } from 'kysely';

import type { IEventAppender, LoggerScope } from '../../util/logger';
import type { DB, EventRow } from '../schema';

export class EventRepo implements IEventAppender {
  constructor(private db: Kysely<DB>) {}

  async append(
    level: string,
    scope: LoggerScope,
    event: string,
    data?: unknown,
    ctx: Record<string, unknown> = {},
  ): Promise<void> {
    const profileId = typeof ctx.profileId === 'string' ? ctx.profileId : null;
    const runId = typeof ctx.runId === 'string' ? ctx.runId : null;
    const stepRunId = typeof ctx.stepRunId === 'string' ? ctx.stepRunId : null;

    await this.db
      .insertInto('events')
      .values({
        ts: Date.now(),
        level,
        scope,
        event,
        profile_id: profileId,
        run_id: runId,
        step_run_id: stepRunId,
        data: JSON.stringify(data ?? {}),
      })
      .execute();
  }

  async query(filter?: {
    scope?: string;
    profileId?: string;
    runId?: string;
    event?: string;
    fromMs?: number;
    toMs?: number;
    limit?: number;
  }): Promise<EventRow[]> {
    let q = this.db.selectFrom('events').selectAll();

    if (filter?.scope) {
      q = q.where('scope', '=', filter.scope);
    }
    if (filter?.profileId) {
      q = q.where('profile_id', '=', filter.profileId);
    }
    if (filter?.runId) {
      q = q.where('run_id', '=', filter.runId);
    }
    if (filter?.event) {
      q = q.where('event', '=', filter.event);
    }
    if (filter?.fromMs !== undefined) {
      q = q.where('ts', '>=', filter.fromMs);
    }
    if (filter?.toMs !== undefined) {
      q = q.where('ts', '<=', filter.toMs);
    }

    return q
      .orderBy('ts', 'desc')
      .limit(filter?.limit ?? 500)
      .execute();
  }
}
