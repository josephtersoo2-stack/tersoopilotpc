import type { Kysely } from 'kysely';

import type { DB, EngineRow } from '../schema';

export class EngineConfigRepo {
  constructor(private db: Kysely<DB>) {}

  async get(engine: 'apostate' | 'camoufox'): Promise<EngineRow | undefined> {
    return this.db.selectFrom('engine_config').selectAll().where('engine', '=', engine).executeTakeFirst();
  }

  async list(): Promise<EngineRow[]> {
    return this.db.selectFrom('engine_config').selectAll().execute();
  }

  async update(engine: 'apostate' | 'camoufox', patch: Partial<EngineRow>): Promise<void> {
    await this.db
      .updateTable('engine_config')
      .set({
        ...patch,
        updated_at: Date.now(),
      })
      .where('engine', '=', engine)
      .execute();
  }
}
