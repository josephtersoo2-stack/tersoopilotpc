import { DEFAULT_PRESET_IDS } from '@tersoo/contracts';
import type { Kysely } from 'kysely';

import { PRESET_DEFINITIONS } from '../../fingerprint/presets';
import type { DB, PresetRow } from '../schema';

export const DEFAULT_PRESET_SEEDS: PresetRow[] = [
  {
    id: DEFAULT_PRESET_IDS.windows11,
    name: 'Windows 11 Stealth (24H2)',
    platform: 'windows',
    bundle: JSON.stringify(PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows11]),
    version: 1,
    created_at: 1000,
    updated_at: 1000,
  },
  {
    id: DEFAULT_PRESET_IDS.windows10,
    name: 'Windows 10 Workstation (22H2)',
    platform: 'windows',
    bundle: JSON.stringify(PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.windows10]),
    version: 1,
    created_at: 1000,
    updated_at: 1000,
  },
  {
    id: DEFAULT_PRESET_IDS.macosSonoma,
    name: 'macOS Sonoma (Apple M2 Pro)',
    platform: 'macos',
    bundle: JSON.stringify(PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.macosSonoma]),
    version: 1,
    created_at: 1000,
    updated_at: 1000,
  },
  {
    id: DEFAULT_PRESET_IDS.macosSequoia,
    name: 'macOS Sequoia (Apple M3 Max)',
    platform: 'macos',
    bundle: JSON.stringify(PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.macosSequoia]),
    version: 1,
    created_at: 1000,
    updated_at: 1000,
  },
  {
    id: DEFAULT_PRESET_IDS.android14,
    name: 'Android 14 (Google Pixel 8 Pro)',
    platform: 'android',
    bundle: JSON.stringify(PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.android14]),
    version: 1,
    created_at: 1000,
    updated_at: 1000,
  },
  {
    id: DEFAULT_PRESET_IDS.galaxyS24,
    name: 'Android 14 (Samsung Galaxy S24 Ultra)',
    platform: 'android',
    bundle: JSON.stringify(PRESET_DEFINITIONS[DEFAULT_PRESET_IDS.galaxyS24]),
    version: 1,
    created_at: 1000,
    updated_at: 1000,
  },
];

export class PresetRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<PresetRow | undefined> {
    return this.db.selectFrom('presets').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async getByName(name: string): Promise<PresetRow | undefined> {
    return this.db.selectFrom('presets').selectAll().where('name', '=', name).executeTakeFirst();
  }

  async list(): Promise<PresetRow[]> {
    return this.db.selectFrom('presets').selectAll().orderBy('name', 'asc').execute();
  }

  async create(row: PresetRow): Promise<PresetRow> {
    await this.db.insertInto('presets').values(row).execute();
    return row;
  }

  async update(id: string, patch: Partial<Omit<PresetRow, 'id' | 'created_at'>>): Promise<void> {
    await this.db
      .updateTable('presets')
      .set({ ...patch, updated_at: Date.now() })
      .where('id', '=', id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('presets').where('id', '=', id).execute();
  }

  async seedDefaults(): Promise<void> {
    for (const preset of DEFAULT_PRESET_SEEDS) {
      const existing = await this.getById(preset.id);
      if (!existing) {
        await this.db.insertInto('presets').values(preset).execute();
      }
    }
  }
}
