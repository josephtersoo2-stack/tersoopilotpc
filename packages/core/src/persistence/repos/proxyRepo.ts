import { sql, type Kysely } from 'kysely';

import type { DB, ProxyRow } from '../schema';

export interface ProxyFilter {
  status?: string | string[] | undefined;
  protocol?: string | string[] | undefined;
  country?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export class ProxyRepo {
  constructor(private db: Kysely<DB>) {}

  async getById(id: string): Promise<ProxyRow | undefined> {
    return this.db.selectFrom('proxies').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async get(id: string): Promise<ProxyRow | undefined> {
    return this.getById(id);
  }

  async findByEndpoint(
    protocol: string,
    host: string,
    port: number,
    username?: string | null,
  ): Promise<ProxyRow | undefined> {
    let query = this.db
      .selectFrom('proxies')
      .selectAll()
      .where('protocol', '=', protocol.toLowerCase())
      .where('host', '=', host.toLowerCase())
      .where('port', '=', port);

    if (username) {
      query = query.where('username', '=', username);
    } else {
      query = query.where('username', 'is', null);
    }

    return query.executeTakeFirst();
  }

  /**
   * Picks a healthy (or unknown) proxy that is not currently leased by any profile.
   * Prioritizes healthy proxies over unknown ones, and lowest latency if available.
   */
  async pickHealthyUnleased(excludeIds?: string[]): Promise<ProxyRow | undefined> {
    let query = this.db
      .selectFrom('proxies')
      .selectAll()
      .where('status', 'in', ['healthy', 'unknown'])
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('proxy_leases')
              .select('id')
              .whereRef('proxy_leases.proxy_id', '=', 'proxies.id')
              .where('proxy_leases.state', '=', 'active'),
          ),
        ),
      );

    if (excludeIds && excludeIds.length > 0) {
      query = query.where('id', 'not in', excludeIds);
    }

    // Order: 'healthy' comes before 'unknown' alphabetically ('healthy' < 'unknown')
    return query
      .orderBy('status', 'asc')
      .orderBy(sql`CASE WHEN last_latency_ms IS NULL THEN 999999 ELSE last_latency_ms END`, 'asc')
      .orderBy(sql`RANDOM()`)
      .executeTakeFirst();
  }

  async list(filter?: ProxyFilter): Promise<ProxyRow[]> {
    let query = this.db.selectFrom('proxies').selectAll();

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        query = query.where('status', 'in', filter.status);
      } else {
        query = query.where('status', '=', filter.status);
      }
    }

    if (filter?.protocol) {
      if (Array.isArray(filter.protocol)) {
        query = query.where('protocol', 'in', filter.protocol);
      } else {
        query = query.where('protocol', '=', filter.protocol);
      }
    }

    if (filter?.country) {
      query = query.where('geo_country', '=', filter.country);
    }

    if (filter?.search) {
      const term = `%${filter.search.toLowerCase()}%`;
      query = query.where((eb) =>
        eb.or([
          eb('host', 'like', term),
          eb('username', 'like', term),
          eb('geo_country', 'like', term),
          eb('geo_city', 'like', term),
          eb('geo_isp', 'like', term),
        ]),
      );
    }

    query = query.orderBy('created_at', 'desc');

    if (filter?.limit) {
      query = query.limit(filter.limit);
    }
    if (filter?.offset) {
      query = query.offset(filter.offset);
    }

    return query.execute();
  }

  async count(filter?: ProxyFilter): Promise<number> {
    let query = this.db
      .selectFrom('proxies')
      .select(this.db.fn.count<number>('id').as('count'));

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        query = query.where('status', 'in', filter.status);
      } else {
        query = query.where('status', '=', filter.status);
      }
    }

    if (filter?.protocol) {
      if (Array.isArray(filter.protocol)) {
        query = query.where('protocol', 'in', filter.protocol);
      } else {
        query = query.where('protocol', '=', filter.protocol);
      }
    }

    if (filter?.country) {
      query = query.where('geo_country', '=', filter.country);
    }

    if (filter?.search) {
      const term = `%${filter.search.toLowerCase()}%`;
      query = query.where((eb) =>
        eb.or([
          eb('host', 'like', term),
          eb('username', 'like', term),
          eb('geo_country', 'like', term),
          eb('geo_city', 'like', term),
          eb('geo_isp', 'like', term),
        ]),
      );
    }

    const res = await query.executeTakeFirst();
    return Number(res?.count ?? 0);
  }

  async create(row: ProxyRow): Promise<ProxyRow> {
    await this.db.insertInto('proxies').values(row).execute();
    return row;
  }

  async createBulk(rows: ProxyRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insertInto('proxies').values(rows).execute();
  }

  async updateStatus(id: string, status: string, reason: string | null = null): Promise<void> {
    await this.db
      .updateTable('proxies')
      .set({
        status,
        status_reason: reason,
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .execute();
  }

  async updateHealth(
    id: string,
    patch: Partial<
      Pick<
        ProxyRow,
        | 'status'
        | 'status_reason'
        | 'last_checked_at'
        | 'last_latency_ms'
        | 'exit_ip'
        | 'geo_country'
        | 'geo_city'
        | 'geo_tz'
        | 'geo_isp'
        | 'geo_lat'
        | 'geo_lng'
      >
    >,
  ): Promise<void> {
    await this.db
      .updateTable('proxies')
      .set({
        ...patch,
        updated_at: Date.now(),
      })
      .where('id', '=', id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('proxies').where('id', '=', id).execute();
  }
}
