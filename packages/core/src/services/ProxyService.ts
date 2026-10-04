import crypto from 'node:crypto';

import {
  Id,
  ProxyBulkImportInput,
  ProxyCreateInput,
  type HealthResult as HealthResultType,
  type ImportReport as ImportReportType,
  type LeaseSummary as LeaseSummaryType,
  type ProxySummary as ProxySummaryType,
} from '@tersoo/contracts';
import { z } from 'zod';

import type { EventBus } from '../events/EventBus';
import type { Repos } from '../persistence/repos';
import type { ProxyFilter } from '../persistence/repos/proxyRepo';
import type { ProxyRow } from '../persistence/schema';
import { deduplicateParsedProxies, parseProxyInput } from '../proxy/ingest';
import type { HealthProbe } from '../proxy/HealthProbe';
import type { ProxyBroker } from '../proxy/ProxyBroker';
import type { SecretVault } from '../secrets/SecretVault';
import { ProxyError } from '../util/errors';

export interface ProxyServiceDeps {
  repos: Repos;
  broker: ProxyBroker;
  health: HealthProbe;
  secrets: SecretVault;
  events: EventBus;
}

const ProxyAssignInput = z.object({
  profileId: Id,
  strategy: z.enum(['manual', 'random']),
  proxyId: Id.optional(),
});

function toProxySummary(row: ProxyRow): ProxySummaryType {
  return {
    id: row.id,
    protocol: row.protocol as 'socks5' | 'http' | 'https',
    host: row.host,
    port: row.port,
    username: row.username,
    geoCountry: row.geo_country,
    geoCity: row.geo_city,
    geoTz: row.geo_tz,
    geoIsp: row.geo_isp,
    exitIp: row.exit_ip,
    status: row.status as 'unknown' | 'healthy' | 'slow' | 'auth_error' | 'dead',
    statusReason: row.status_reason,
    lastCheckedAt: row.last_checked_at,
    lastLatencyMs: row.last_latency_ms,
    createdAt: row.created_at,
  };
}

export class ProxyService {
  constructor(private readonly deps: ProxyServiceDeps) {}

  async list(filter?: unknown): Promise<ProxySummaryType[]> {
    const rows = await this.deps.repos.proxies.list(filter as ProxyFilter | undefined);
    return rows.map(toProxySummary);
  }

  async get(id: string): Promise<ProxySummaryType> {
    const row = await this.deps.repos.proxies.get(id);
    if (!row) {
      throw new ProxyError('PROXY_MISSING', `Proxy '${id}' not found`);
    }
    return toProxySummary(row);
  }

  async create(rawInput: unknown): Promise<ProxySummaryType> {
    const input = ProxyCreateInput.parse(rawInput);
    const hostNorm = input.host.trim().toLowerCase();
    const usernameNorm = input.username?.trim() || null;

    const existing = await this.deps.repos.proxies.findByEndpoint(
      input.protocol,
      hostNorm,
      input.port,
      usernameNorm,
    );
    if (existing) {
      throw new ProxyError(
        'POLICY_VIOLATION',
        `Proxy with endpoint ${input.protocol}://${hostNorm}:${input.port} already exists`,
      );
    }

    const id = crypto.randomUUID();
    let passwordRef: string | null = null;
    if (input.password) {
      passwordRef = await this.deps.secrets.setProxyPassword(id, input.password);
    }

    const now = Date.now();
    const row: ProxyRow = {
      id,
      protocol: input.protocol,
      host: hostNorm,
      port: input.port,
      username: usernameNorm,
      password_ref: passwordRef,
      geo_country: null,
      geo_city: null,
      geo_tz: null,
      geo_isp: null,
      geo_lat: null,
      geo_lng: null,
      exit_ip: null,
      last_checked_at: null,
      last_latency_ms: null,
      status: 'unknown',
      status_reason: null,
      created_at: now,
      updated_at: now,
    };

    await this.deps.repos.proxies.create(row);
    await this.deps.repos.audit.record({
      actor: 'user',
      action: 'proxy.created',
      target: id,
      meta: {
        protocol: input.protocol,
        host: hostNorm,
        port: input.port,
        username: usernameNorm,
      },
    });

    return toProxySummary(row);
  }

  async importBulk(rawInput: unknown): Promise<ImportReportType> {
    const input = ProxyBulkImportInput.parse(rawInput);
    const parseResult = await parseProxyInput({
      text: input.text,
      filePath: input.filePath,
      format: input.format,
    });

    const { unique, duplicates } = deduplicateParsedProxies(parseResult.items);
    let skippedCount = duplicates.length;

    const now = Date.now();
    const newRows: ProxyRow[] = [];

    for (const item of unique) {
      const hostNorm = item.host.trim().toLowerCase();
      const userNorm = item.username?.trim() || null;

      const existing = await this.deps.repos.proxies.findByEndpoint(
        item.protocol,
        hostNorm,
        item.port,
        userNorm,
      );
      if (existing) {
        skippedCount++;
        continue;
      }

      const id = crypto.randomUUID();
      let passwordRef: string | null = null;
      if (item.password) {
        passwordRef = await this.deps.secrets.setProxyPassword(id, item.password);
      }

      newRows.push({
        id,
        protocol: item.protocol,
        host: hostNorm,
        port: item.port,
        username: userNorm,
        password_ref: passwordRef,
        geo_country: null,
        geo_city: null,
        geo_tz: null,
        geo_isp: null,
        geo_lat: null,
        geo_lng: null,
        exit_ip: null,
        last_checked_at: null,
        last_latency_ms: null,
        status: 'unknown',
        status_reason: null,
        created_at: now,
        updated_at: now,
      });
    }

    if (newRows.length > 0) {
      await this.deps.repos.proxies.createBulk(newRows);
    }

    await this.deps.repos.audit.record({
      actor: 'user',
      action: 'proxy.import_bulk',
      meta: {
        parsed: parseResult.items.length,
        imported: newRows.length,
        skipped: skippedCount,
        errorsCount: parseResult.errors.length,
      },
    });

    return {
      parsed: parseResult.items.length,
      imported: newRows.length,
      skipped: skippedCount,
      errors: parseResult.errors.map((e) => ({ line: e.line, reason: e.reason })),
    };
  }

  async check(id: string): Promise<HealthResultType> {
    const proxy = await this.deps.repos.proxies.get(id);
    if (!proxy) {
      throw new ProxyError('PROXY_MISSING', `Proxy '${id}' not found`);
    }

    const password = await this.deps.secrets.getProxyPassword(id);

    const probe = await this.deps.health.probe({
      proxyId: id,
      protocol: proxy.protocol as 'socks5' | 'http' | 'https',
      host: proxy.host,
      port: proxy.port,
      username: proxy.username ?? undefined,
      password: password ?? undefined,
    });

    let newStatus: 'healthy' | 'slow' | 'auth_error' | 'dead';
    if (probe.ok) {
      newStatus = probe.latencyMs !== null && probe.latencyMs > 2500 ? 'slow' : 'healthy';
    } else {
      const errLower = (probe.error ?? '').toLowerCase();
      if (
        errLower.includes('auth') ||
        errLower.includes('407') ||
        errLower.includes('credential') ||
        errLower.includes('0x01')
      ) {
        newStatus = 'auth_error';
      } else {
        newStatus = 'dead';
      }
    }

    await this.deps.repos.proxies.updateHealth(id, {
      status: newStatus,
      status_reason: probe.error,
      last_checked_at: Date.now(),
      last_latency_ms: probe.latencyMs,
      exit_ip: probe.exitIp,
      geo_country: probe.geo.country,
      geo_city: probe.geo.city,
      geo_tz: probe.geo.tz,
      geo_isp: probe.geo.isp,
      geo_lat: probe.geo.lat,
      geo_lng: probe.geo.lng,
    });

    await this.deps.events.emit('proxy.health_changed', {
      proxyId: id,
      status: newStatus,
    });

    return probe;
  }

  async assign(rawInput: unknown): Promise<LeaseSummaryType> {
    const input = ProxyAssignInput.parse(rawInput);
    const lease = await this.deps.broker.acquire(input.profileId, {
      strategy: input.strategy,
      proxyId: input.proxyId,
    });
    await this.deps.events.emit('lease.acquired', lease);
    return lease;
  }

  async release(profileId: string): Promise<void> {
    const activeLease = await this.deps.repos.leases.getActiveForProfile(profileId);
    if (activeLease) {
      await this.deps.broker.releaseForProfile(profileId);
      await this.deps.events.emit('lease.released', {
        leaseId: activeLease.id,
        profileId,
      });
    }
  }

  async swap(profileId: string): Promise<LeaseSummaryType> {
    const lease = await this.deps.broker.swap(profileId);
    await this.deps.events.emit('lease.acquired', lease);
    return lease;
  }

  async delete(id: string): Promise<void> {
    const proxy = await this.deps.repos.proxies.get(id);
    if (!proxy) {
      throw new ProxyError('PROXY_MISSING', `Proxy '${id}' not found`);
    }

    const activeLease = await this.deps.repos.leases.getActiveForProxy(id);
    if (activeLease) {
      throw new ProxyError('LEASE_CONFLICT', `Cannot delete proxy '${id}' while active lease exists`);
    }

    await this.deps.secrets.deleteProxyPassword(id);
    await this.deps.repos.proxies.delete(id);
    await this.deps.repos.audit.record({
      actor: 'user',
      action: 'proxy.deleted',
      target: id,
      meta: { host: proxy.host, port: proxy.port },
    });
  }
}
