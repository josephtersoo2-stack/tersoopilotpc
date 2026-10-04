import type { Kysely } from 'kysely';

import type { DB, NicheRow } from '../schema';

export class NicheRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<NicheRow | undefined> {
    return this.db.selectFrom('niches').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async list(): Promise<NicheRow[]> {
    return this.db.selectFrom('niches').selectAll().orderBy('created_at', 'desc').execute();
  }

  async create(row: NicheRow): Promise<NicheRow> {
    await this.db.insertInto('niches').values(row).execute();
    return row;
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('niches').where('id', '=', id).execute();
  }

  async update(id: string, patch: Partial<NicheRow>): Promise<void> {
    await this.db
      .updateTable('niches')
      .set(patch)
      .where('id', '=', id)
      .execute();
  }
}
