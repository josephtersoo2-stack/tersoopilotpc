import type { Kysely } from 'kysely';

import type { CaptchaEventRow, DB } from '../schema';

export interface InsertCaptchaEventInput {
  id: string;
  runId?: string;
  run_id?: string;
  profileId?: string;
  profile_id?: string;
  detectedAt?: number;
  detected_at?: number;
  challengeType?: string;
  challenge_type?: string;
  solvedBy?: string | null;
  solved_by?: string | null;
  attempts?: number;
  outcome: 'solved' | 'failed' | 'aborted' | 'unsolvable';
  screenshotPath?: string | null;
  screenshot_path?: string | null;
  createdAt?: number;
  created_at?: number;
}

export class CaptchaEventRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<CaptchaEventRow | undefined> {
    return this.db.selectFrom('captcha_events').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async listForRun(runId: string): Promise<CaptchaEventRow[]> {
    return this.db.selectFrom('captcha_events').selectAll().where('run_id', '=', runId).execute();
  }

  async listForProfile(profileId: string): Promise<CaptchaEventRow[]> {
    return this.db.selectFrom('captcha_events').selectAll().where('profile_id', '=', profileId).execute();
  }

  async insert(input: InsertCaptchaEventInput): Promise<CaptchaEventRow> {
    const row: CaptchaEventRow = {
      id: input.id,
      run_id: input.runId ?? input.run_id ?? '',
      profile_id: input.profileId ?? input.profile_id ?? '',
      detected_at: input.detectedAt ?? input.detected_at ?? Date.now(),
      challenge_type: input.challengeType ?? input.challenge_type ?? 'generic',
      solved_by: input.solvedBy ?? input.solved_by ?? null,
      attempts: input.attempts ?? 1,
      outcome: input.outcome,
      screenshot_path: input.screenshotPath ?? input.screenshot_path ?? null,
      created_at: input.createdAt ?? input.created_at ?? Date.now(),
    };
    await this.db.insertInto('captcha_events').values(row).execute();
    return row;
  }

  async create(row: CaptchaEventRow): Promise<CaptchaEventRow> {
    return this.insert(row);
  }

  async cleanupOlderThan(cutoffMs: number): Promise<number> {
    const res = await this.db
      .deleteFrom('captcha_events')
      .where('created_at', '<', cutoffMs)
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0);
  }

  async cleanupOlderThanDays(days = 30): Promise<number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.cleanupOlderThan(cutoff);
  }
}
