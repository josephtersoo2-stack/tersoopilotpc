import type { Kysely } from 'kysely';

import type { DB, TaskTemplateRow } from '../schema';

export class TemplateRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<TaskTemplateRow | undefined> {
    return this.db.selectFrom('task_templates').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async list(category?: string): Promise<TaskTemplateRow[]> {
    let query = this.db.selectFrom('task_templates').selectAll();
    if (category && category !== 'all') {
      query = query.where('category', '=', category);
    }
    return query.orderBy('is_builtin', 'desc').orderBy('created_at', 'desc').execute();
  }

  async create(row: TaskTemplateRow): Promise<TaskTemplateRow> {
    await this.db.insertInto('task_templates').values(row).execute();
    return row;
  }

  async update(id: string, patch: Partial<TaskTemplateRow>): Promise<void> {
    await this.db
      .updateTable('task_templates')
      .set(patch)
      .where('id', '=', id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('task_templates').where('id', '=', id).execute();
  }

  async count(): Promise<number> {
    const res = await this.db.selectFrom('task_templates').select((eb) => eb.fn.countAll().as('total')).executeTakeFirst();
    return Number(res?.total ?? 0);
  }
}
