import type { Kysely } from 'kysely';

import type { DB } from '../schema';

export class SettingsRepo {
  constructor(private db: Kysely<DB>) {}

  async get(key: string): Promise<string | undefined> {
    const row = await this.db.selectFrom('settings').select('value').where('key', '=', key).executeTakeFirst();
    return row?.value;
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.selectFrom('settings').selectAll().execute();
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db
      .insertInto('settings')
      .values({
        key,
        value,
        updated_at: Date.now(),
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value,
          updated_at: Date.now(),
        }),
      )
      .execute();
  }
}
