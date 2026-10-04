import path from 'node:path';

import type { ProfileState } from '@tersoo/contracts';
import type { Kysely } from 'kysely';

import { ProfileError } from '../../util/errors';
import {
  acquireProfileLock,
  forceUnlockProfile,
  isProfileLocked,
  type AcquireLockOptions,
  type LockHandle,
} from '../profileLock';
import type { DB, ProfileRow } from '../schema';

export interface ProfileFilter {
  platform?: string | undefined;
  state?: ProfileState | ProfileState[] | undefined;
  presetId?: string | undefined;
  search?: string | undefined;
  tag?: string | undefined;
  tags?: string[] | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ProfileWithDetails extends ProfileRow {
  platform: string;
  activeProxyId: string | null;
  activeLeaseId: string | null;
}

export type NewProfileInput = Omit<
  ProfileRow,
  | 'created_at'
  | 'updated_at'
  | 'last_launched_at'
  | 'engine'
  | 'action_mode'
  | 'captcha_budget_used'
  | 'persona'
  | 'niche_id'
  | 'trust_score'
  | 'maturation_stage'
  | 'typing_wpm'
  | 'typo_rate'
  | 'patience_index'
  | 'engagement_rate'
  | 'niche_ids'
  | 'weighted_niches'
> & {
  created_at?: number;
  updated_at?: number;
  last_launched_at?: number | null;
  engine?: 'apostate' | 'camoufox';
  action_mode?: 'scripted' | 'llm' | null;
  captcha_budget_used?: number;
  persona?: string;
  niche_id?: string | null;
  trust_score?: number;
  maturation_stage?: string;
  typing_wpm?: number;
  typo_rate?: number;
  patience_index?: number;
  engagement_rate?: number;
  niche_ids?: string;
  weighted_niches?: string;
};

export type ProfilePatch = Partial<Omit<ProfileRow, 'id' | 'created_at'>>;

export class ProfileRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: string): Promise<ProfileRow | undefined> {
    return this.db
      .selectFrom('profiles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getWithDetails(id: string): Promise<ProfileWithDetails | undefined> {
    const res = await this.db
      .selectFrom('profiles')
      .innerJoin('presets', 'presets.id', 'profiles.preset_id')
      .leftJoin('proxy_leases', (join) =>
        join
          .onRef('proxy_leases.profile_id', '=', 'profiles.id')
          .on('proxy_leases.state', '=', 'active'),
      )
      .selectAll('profiles')
      .select([
        'presets.platform as platform',
        'proxy_leases.proxy_id as activeProxyId',
        'proxy_leases.id as activeLeaseId',
      ])
      .where('profiles.id', '=', id)
      .executeTakeFirst();

    if (!res) return undefined;

    return {
      id: res.id,
      name: res.name,
      tags: res.tags,
      preset_id: res.preset_id,
      fingerprint_seed: res.fingerprint_seed,
      fingerprint_bundle: res.fingerprint_bundle,
      user_data_dir: res.user_data_dir,
      state: res.state,
      notes: res.notes,
      created_at: res.created_at,
      updated_at: res.updated_at,
      last_launched_at: res.last_launched_at,
      platform: res.platform,
      activeProxyId: res.activeProxyId,
      activeLeaseId: res.activeLeaseId,
      engine: res.engine ?? 'apostate',
      action_mode: res.action_mode ?? null,
      captcha_budget_used: res.captcha_budget_used ?? 0,
      persona: res.persona ?? 'casual',
      niche_id: res.niche_id ?? null,
      trust_score: res.trust_score ?? 10,
      maturation_stage: res.maturation_stage ?? 'infant',
      typing_wpm: res.typing_wpm ?? 70,
      typo_rate: res.typo_rate ?? 0.03,
      patience_index: res.patience_index ?? 5.5,
      engagement_rate: res.engagement_rate ?? 0.20,
      niche_ids: res.niche_ids ?? '[]',
      weighted_niches: res.weighted_niches ?? '[]',
    };
  }

  async list(filter?: ProfileFilter): Promise<ProfileRow[]> {
    let query = this.db.selectFrom('profiles').selectAll('profiles');

    if (filter?.platform) {
      query = query
        .innerJoin('presets', 'presets.id', 'profiles.preset_id')
        .where('presets.platform', '=', filter.platform);
    }

    if (filter?.state) {
      if (Array.isArray(filter.state)) {
        query = query.where('profiles.state', 'in', filter.state);
      } else {
        query = query.where('profiles.state', '=', filter.state);
      }
    }

    if (filter?.presetId) {
      query = query.where('profiles.preset_id', '=', filter.presetId);
    }

    if (filter?.search) {
      const term = `%${filter.search}%`;
      query = query.where((eb) =>
        eb.or([eb('profiles.name', 'like', term), eb('profiles.notes', 'like', term)]),
      );
    }

    if (filter?.tag) {
      // In SQLite, tags is stored as a JSON array e.g. ["tag1","tag2"]
      query = query.where('profiles.tags', 'like', `%"${filter.tag}"%`);
    } else if (filter?.tags && filter.tags.length > 0) {
      for (const t of filter.tags) {
        query = query.where('profiles.tags', 'like', `%"${t}"%`);
      }
    }

    query = query.orderBy('profiles.created_at', 'desc');

    if (filter?.limit !== undefined) {
      query = query.limit(filter.limit);
    }

    if (filter?.offset !== undefined) {
      query = query.offset(filter.offset);
    }

    return query.execute();
  }

  async listWithDetails(filter?: ProfileFilter): Promise<ProfileWithDetails[]> {
    let query = this.db
      .selectFrom('profiles')
      .innerJoin('presets', 'presets.id', 'profiles.preset_id')
      .leftJoin('proxy_leases', (join) =>
        join
          .onRef('proxy_leases.profile_id', '=', 'profiles.id')
          .on('proxy_leases.state', '=', 'active'),
      )
      .selectAll('profiles')
      .select([
        'presets.platform as platform',
        'proxy_leases.proxy_id as activeProxyId',
        'proxy_leases.id as activeLeaseId',
      ]);

    if (filter?.platform) {
      query = query.where('presets.platform', '=', filter.platform);
    }

    if (filter?.state) {
      if (Array.isArray(filter.state)) {
        query = query.where('profiles.state', 'in', filter.state);
      } else {
        query = query.where('profiles.state', '=', filter.state);
      }
    }

    if (filter?.presetId) {
      query = query.where('profiles.preset_id', '=', filter.presetId);
    }

    if (filter?.search) {
      const term = `%${filter.search}%`;
      query = query.where((eb) =>
        eb.or([
          eb('profiles.name', 'like', term),
          eb('profiles.notes', 'like', term),
        ]),
      );
    }

    if (filter?.tag) {
      query = query.where('profiles.tags', 'like', `%"${filter.tag}"%`);
    } else if (filter?.tags && filter.tags.length > 0) {
      for (const t of filter.tags) {
        query = query.where('profiles.tags', 'like', `%"${t}"%`);
      }
    }

    query = query.orderBy('profiles.created_at', 'desc');

    if (filter?.limit !== undefined) {
      query = query.limit(filter.limit);
    }

    if (filter?.offset !== undefined) {
      query = query.offset(filter.offset);
    }

    const rows = await query.execute();
    return rows.map((res) => ({
      id: res.id,
      name: res.name,
      tags: res.tags,
      preset_id: res.preset_id,
      fingerprint_seed: res.fingerprint_seed,
      fingerprint_bundle: res.fingerprint_bundle,
      user_data_dir: res.user_data_dir,
      state: res.state,
      notes: res.notes,
      created_at: res.created_at,
      updated_at: res.updated_at,
      last_launched_at: res.last_launched_at,
      platform: res.platform,
      activeProxyId: res.activeProxyId,
      activeLeaseId: res.activeLeaseId,
      engine: res.engine ?? 'apostate',
      action_mode: res.action_mode ?? null,
      captcha_budget_used: res.captcha_budget_used ?? 0,
      persona: res.persona ?? 'casual',
      niche_id: res.niche_id ?? null,
      trust_score: res.trust_score ?? 10,
      maturation_stage: res.maturation_stage ?? 'infant',
      typing_wpm: res.typing_wpm ?? 70,
      typo_rate: res.typo_rate ?? 0.03,
      patience_index: res.patience_index ?? 5.5,
      engagement_rate: res.engagement_rate ?? 0.20,
      niche_ids: res.niche_ids ?? '[]',
      weighted_niches: res.weighted_niches ?? '[]',
    }));
  }

  async create(input: NewProfileInput): Promise<ProfileRow> {
    const now = Date.now();
    const row: ProfileRow = {
      ...input,
      engine: input.engine ?? 'apostate',
      action_mode: input.action_mode ?? null,
      captcha_budget_used: input.captcha_budget_used ?? 0,
      persona: input.persona ?? 'casual',
      niche_id: input.niche_id ?? null,
      trust_score: input.trust_score ?? 10,
      maturation_stage: input.maturation_stage ?? 'infant',
      typing_wpm: input.typing_wpm ?? 70,
      typo_rate: input.typo_rate ?? 0.03,
      patience_index: input.patience_index ?? 5.5,
      engagement_rate: input.engagement_rate ?? 0.20,
      niche_ids: input.niche_ids ?? '[]',
      weighted_niches: input.weighted_niches ?? '[]',
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
      last_launched_at: input.last_launched_at ?? null,
    };

    await this.db.insertInto('profiles').values(row).execute();
    return row;
  }

  async update(
    id: string,
    patch: ProfilePatch,
  ): Promise<ProfileRow | undefined> {
    const now = Date.now();
    const updatedPatch: ProfilePatch = {
      ...patch,
      updated_at: now,
    };

    const res = await this.db
      .updateTable('profiles')
      .set(updatedPatch)
      .where('id', '=', id)
      .executeTakeFirst();

    if (Number(res.numUpdatedRows ?? 0) === 0) {
      return undefined;
    }

    return this.getById(id);
  }

  async updateState(
    id: string,
    state: ProfileState,
    meta?: { lastLaunchedAt?: number },
  ): Promise<void> {
    const now = Date.now();
    await this.db
      .updateTable('profiles')
      .set({
        state,
        updated_at: now,
        ...(meta?.lastLaunchedAt !== undefined
          ? { last_launched_at: meta.lastLaunchedAt }
          : state === 'running'
            ? { last_launched_at: now }
            : {}),
      })
      .where('id', '=', id)
      .execute();
  }

  async setState(
    id: string,
    state: ProfileState,
    meta?: { lastLaunchedAt?: number },
  ): Promise<void> {
    return this.updateState(id, state, meta);
  }

  async getState(id: string): Promise<ProfileState | undefined> {
    const row = await this.db
      .selectFrom('profiles')
      .select('state')
      .where('id', '=', id)
      .executeTakeFirst();
    return row?.state as ProfileState | undefined;
  }

  async transitionState(
    id: string,
    fromState: ProfileState | ProfileState[],
    toState: ProfileState,
    meta?: { lastLaunchedAt?: number },
  ): Promise<ProfileRow> {
    const now = Date.now();
    let query = this.db
      .updateTable('profiles')
      .set({
        state: toState,
        updated_at: now,
        ...(meta?.lastLaunchedAt !== undefined
          ? { last_launched_at: meta.lastLaunchedAt }
          : toState === 'running'
            ? { last_launched_at: now }
            : {}),
      })
      .where('id', '=', id);

    if (Array.isArray(fromState)) {
      query = query.where('state', 'in', fromState);
    } else {
      query = query.where('state', '=', fromState);
    }

    const res = await query.executeTakeFirst();
    if (Number(res.numUpdatedRows ?? 0) === 0) {
      const existing = await this.getById(id);
      if (!existing) {
        throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${id}' not found`);
      }
      if (toState === 'running' && existing.state === 'running') {
        throw new ProfileError('ALREADY_RUNNING', `Profile '${id}' is already running`);
      }
      throw new ProfileError(
        'POLICY_VIOLATION',
        `Cannot transition profile '${id}' from '${existing.state}' to '${toState}'`,
      );
    }

    const updated = await this.getById(id);
    return updated!;
  }

  async acquireLock(
    profileId: string,
    options?: AcquireLockOptions,
  ): Promise<LockHandle> {
    const profile = await this.getById(profileId);
    if (!profile) {
      throw new ProfileError('PROFILE_NOT_FOUND', `Profile '${profileId}' not found`);
    }
    const lockPath = path.join(profile.user_data_dir, 'profile.lock');
    return acquireProfileLock(lockPath, profileId, options);
  }

  async isLocked(profileId: string): Promise<boolean> {
    const profile = await this.getById(profileId);
    if (!profile) return false;
    const lockPath = path.join(profile.user_data_dir, 'profile.lock');
    return isProfileLocked(lockPath);
  }

  async forceUnlock(profileId: string): Promise<void> {
    const profile = await this.getById(profileId);
    if (!profile) return;
    const lockPath = path.join(profile.user_data_dir, 'profile.lock');
    await forceUnlockProfile(lockPath);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('profiles')
      .where('id', '=', id)
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0) > 0;
  }

  async count(filter?: ProfileFilter): Promise<number> {
    let query = this.db
      .selectFrom('profiles')
      .select((eb) => eb.fn.countAll<number>().as('count'));

    if (filter?.platform) {
      query = query
        .innerJoin('presets', 'presets.id', 'profiles.preset_id')
        .where('presets.platform', '=', filter.platform);
    }

    if (filter?.state) {
      if (Array.isArray(filter.state)) {
        query = query.where('profiles.state', 'in', filter.state);
      } else {
        query = query.where('profiles.state', '=', filter.state);
      }
    }

    if (filter?.presetId) {
      query = query.where('profiles.preset_id', '=', filter.presetId);
    }

    if (filter?.search) {
      const term = `%${filter.search}%`;
      query = query.where((eb) =>
        eb.or([eb('profiles.name', 'like', term), eb('profiles.notes', 'like', term)]),
      );
    }

    if (filter?.tag) {
      query = query.where('profiles.tags', 'like', `%"${filter.tag}"%`);
    } else if (filter?.tags && filter.tags.length > 0) {
      for (const t of filter.tags) {
        query = query.where('profiles.tags', 'like', `%"${t}"%`);
      }
    }

    const res = await query.executeTakeFirst();
    return Number(res?.count ?? 0);
  }

  async existsByUserDataDir(
    userDataDir: string,
    excludeProfileId?: string,
  ): Promise<boolean> {
    let query = this.db
      .selectFrom('profiles')
      .select('id')
      .where('user_data_dir', '=', userDataDir);

    if (excludeProfileId) {
      query = query.where('id', '!=', excludeProfileId);
    }

    const row = await query.executeTakeFirst();
    return Boolean(row);
  }

  async get(id: string): Promise<ProfileRow | null> {
    return (await this.getById(id)) ?? null;
  }

  async incrementCaptchaCount(id: string): Promise<void> {
    await this.db
      .updateTable('profiles')
      .set((eb) => ({
        captcha_budget_used: eb('captcha_budget_used', '+', 1),
        updated_at: Date.now(),
      }))
      .where('id', '=', id)
      .execute();
  }

  async resetCaptchaCount(id: string): Promise<void> {
    await this.db
      .updateTable('profiles')
      .set({
        captcha_budget_used: 0,
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .execute();
  }
}
