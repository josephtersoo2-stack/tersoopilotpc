import type { Kysely } from 'kysely';

import type { DB, RunRow } from '../schema';

export class RunRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<RunRow | undefined> {
    return this.db.selectFrom('runs').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async list(filter?: { taskId?: string; profileId?: string; state?: string }): Promise<RunRow[]> {
    let query = this.db.selectFrom('runs').selectAll();
    if (filter?.taskId) {
      query = query.where('task_id', '=', filter.taskId);
    }
    if (filter?.profileId) {
      query = query.where('profile_id', '=', filter.profileId);
    }
    if (filter?.state) {
      query = query.where('state', '=', filter.state);
    }
    return query.orderBy('created_at', 'desc').execute();
  }

  async count(filter?: { taskId?: string; profileId?: string; state?: string }): Promise<number> {
    let query = this.db.selectFrom('runs').select(this.db.fn.count<number>('id').as('count'));
    if (filter?.taskId) {
      query = query.where('task_id', '=', filter.taskId);
    }
    if (filter?.profileId) {
      query = query.where('profile_id', '=', filter.profileId);
    }
    if (filter?.state) {
      query = query.where('state', '=', filter.state);
    }
    const res = await query.executeTakeFirst();
    return Number(res?.count ?? 0);
  }

  async create(row: RunRow): Promise<RunRow> {
    await this.db.insertInto('runs').values(row).execute();
    return row;
  }

  async updateState(id: string, state: string, patch: Partial<RunRow> = {}): Promise<void> {
    await this.db
      .updateTable('runs')
      .set({
        ...patch,
        state,
      })
      .where('id', '=', id)
      .execute();
  }

  async update(id: string, patch: Partial<RunRow>): Promise<void> {
    await this.db
      .updateTable('runs')
      .set(patch)
      .where('id', '=', id)
      .execute();
  }

  async listStaleRuns(): Promise<RunRow[]> {
    return this.db
      .selectFrom('runs')
      .selectAll()
      .where('state', 'in', ['running', 'starting'])
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('step_runs').where('run_id', '=', id).execute();
    await this.db.deleteFrom('runs').where('id', '=', id).execute();
  }

  async clearTerminal(): Promise<number> {
    const terminal = await this.db
      .selectFrom('runs')
      .select('id')
      .where('state', 'in', ['succeeded', 'failed', 'cancelled'])
      .execute();
    for (const r of terminal) {
      await this.db.deleteFrom('step_runs').where('run_id', '=', r.id).execute();
      await this.db.deleteFrom('runs').where('id', '=', r.id).execute();
    }
    return terminal.length;
  }
}
