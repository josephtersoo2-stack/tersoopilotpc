import type { Kysely } from 'kysely';

import { assertNotRawProviderApiKey } from '../../llm/rawKeyGuard';

import type { DB, LlmConfigRow } from '../schema';

export class LlmConfigRepo {
  constructor(private db: Kysely<DB>) {}

  async get(): Promise<LlmConfigRow | undefined> {
    return this.db.selectFrom('llm_config').selectAll().where('id', '=', 1).executeTakeFirst();
  }

  async update(patch: Partial<Omit<LlmConfigRow, 'id'>> | Record<string, unknown>): Promise<void> {
    // `api_key_ref` is a *reference* into the OS-backed vault, never a key.
    // Reject literal keys here so no write path can reintroduce plaintext
    // credentials into the unencrypted database or its backups.
    if (patch.api_key_ref !== undefined) {
      assertNotRawProviderApiKey(patch.api_key_ref, 'llm_config.api_key_ref');
    }

    const updateObj: Record<string, unknown> = {
      updated_at: Date.now(),
    };

    if (patch.provider !== undefined) updateObj.provider = patch.provider;
    if (patch.text_model !== undefined) updateObj.text_model = patch.text_model;
    if (patch.vision_model !== undefined) updateObj.vision_model = patch.vision_model ?? null;
    if (patch.api_key_ref !== undefined) updateObj.api_key_ref = patch.api_key_ref;
    if (patch.max_attempts !== undefined) updateObj.max_attempts = patch.max_attempts;
    if (patch.backoff_ms !== undefined) {
      updateObj.backoff_ms = typeof patch.backoff_ms === 'string' ? patch.backoff_ms : JSON.stringify(patch.backoff_ms);
    }
    if (patch.vision_enabled !== undefined) {
      updateObj.vision_enabled = patch.vision_enabled ? 1 : 0;
    }

    await this.db
      .updateTable('llm_config')
      .set(updateObj as any)
      .where('id', '=', 1)
      .execute();
  }
}
