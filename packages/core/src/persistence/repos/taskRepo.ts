import type { Kysely } from 'kysely';

import type { DB, TaskRow } from '../schema';

export class TaskRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<TaskRow | undefined> {
    return this.db.selectFrom('tasks').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async list(): Promise<TaskRow[]> {
    return this.db.selectFrom('tasks').selectAll().orderBy('created_at', 'desc').execute();
  }

  async create(row: TaskRow): Promise<TaskRow> {
    await this.db.insertInto('tasks').values(row).execute();
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('tasks').where('id', '=', id).execute();
  }

  async update(id: string, patch: Partial<TaskRow>): Promise<void> {
    await this.db
      .updateTable('tasks')
      .set(patch)
      .where('id', '=', id)
      .execute();
  }
}
