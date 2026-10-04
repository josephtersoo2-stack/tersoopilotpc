import type { Kysely } from 'kysely';

import type { DB, StepRunRow } from '../schema';

export class StepRunRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<StepRunRow | undefined> {
    return this.db.selectFrom('step_runs').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async listForRun(runId: string): Promise<StepRunRow[]> {
    return this.db
      .selectFrom('step_runs')
      .selectAll()
      .where('run_id', '=', runId)
      .orderBy('step_index', 'asc')
      .execute();
  }

  async create(row: StepRunRow): Promise<StepRunRow> {
    await this.db.insertInto('step_runs').values(row).execute();
    return row;
  }

  async updateState(id: string, state: string, patch: Partial<StepRunRow> = {}): Promise<void> {
    await this.db
      .updateTable('step_runs')
      .set({
        ...patch,
        state,
      })
      .where('id', '=', id)
      .execute();
  }

  async update(id: string, patch: Partial<StepRunRow>): Promise<void> {
    await this.db
      .updateTable('step_runs')
      .set(patch)
      .where('id', '=', id)
      .execute();
  }
}
