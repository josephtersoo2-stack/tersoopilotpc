import type { LeaseSummary } from '@tersoo/contracts';

import type { Config } from '../config';
import type { LeaseRepo } from '../persistence/repos/leaseRepo';
import type { ProxyRepo } from '../persistence/repos/proxyRepo';
import { TersooError } from '../util/errors';

export interface AcquireOptions {
  strategy: 'random' | 'manual';
  proxyId?: string | undefined;
  excludeProxyIds?: string[] | undefined;
}

export class ProxyBroker {
  constructor(
    private readonly leaseRepo: LeaseRepo,
    private readonly proxyRepo: ProxyRepo,
    private readonly config: Config,
  ) {}

  /**
   * Acquires a lease for a profile, returning existing active lease if already held.
   * Atomic database constraints guarantee mutual exclusion.
   */
  async acquire(profileId: string, opts: AcquireOptions): Promise<LeaseSummary> {
    const existing = await this.leaseRepo.getActiveForProfile(profileId);
    if (existing) {
      // If manual strategy requested and existing lease is for a different proxy,
      // release the existing lease first to allow the switch
      if (opts.strategy === 'manual' && opts.proxyId && existing.proxy_id !== opts.proxyId) {
        await this.release(existing.id);
      } else {
        return {
          id: existing.id,
          proxyId: existing.proxy_id,
          profileId: existing.profile_id,
          state: existing.state as 'active' | 'released' | 'expired',
          acquiredAt: existing.acquired_at,
          expiresAt: existing.expires_at,
          heartbeatAt: existing.heartbeat_at,
        };
      }
    }

    if (opts.strategy === 'manual') {
      if (!opts.proxyId) {
        throw new TersooError('PROXY_MISSING', 'proxyId is required when using manual strategy');
      }

      const candidate = await this.proxyRepo.get(opts.proxyId);
      if (!candidate) {
        throw new TersooError('PROXY_MISSING', `Proxy ${opts.proxyId} not found`);
      }

      const lease = await this.leaseRepo.acquire(profileId, candidate.id, this.config.leaseTtlMs);
      if (!lease) {
        throw new TersooError('LEASE_CONFLICT', `Proxy ${candidate.id} is already leased`);
      }
      return lease;
    }

    // Random strategy with collision retry
    const excluded = new Set<string>(opts.excludeProxyIds ?? []);
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const candidate = await this.proxyRepo.pickHealthyUnleased(Array.from(excluded));
      if (!candidate) {
        throw new TersooError('NO_HEALTHY_PROXY', 'No healthy, unleased proxy available');
      }

      const lease = await this.leaseRepo.acquire(profileId, candidate.id, this.config.leaseTtlMs);
      if (lease) {
        return lease;
      }

      // Collided with concurrent acquisition, add to excluded and retry
      excluded.add(candidate.id);
    }

    throw new TersooError('LEASE_CONFLICT', 'Failed to acquire unleased proxy after retries');
  }

  /**
   * Releases an active lease by lease ID.
   */
  async release(leaseId: string): Promise<void> {
    await this.leaseRepo.release(leaseId, 'released');
  }

  /**
   * Releases any active lease held by the given profile.
   */
  async releaseForProfile(profileId: string): Promise<void> {
    await this.leaseRepo.releaseForProfile(profileId, 'released');
  }

  /**
   * Heartbeats an active lease to extend its expiration TTL.
   */
  async heartbeat(leaseId: string): Promise<void> {
    await this.leaseRepo.heartbeat(leaseId, this.config.leaseTtlMs);
  }

  /**
   * Sweeps expired leases whose expires_at timestamp has passed.
   */
  async sweep(): Promise<number> {
    return this.leaseRepo.sweepExpired();
  }

  /**
   * Swaps a profile's current proxy for a new random proxy, avoiding immediate re-assignment.
   */
  async swap(profileId: string): Promise<LeaseSummary> {
    const existing = await this.leaseRepo.getActiveForProfile(profileId);
    const oldProxyId = existing?.proxy_id;

    if (existing) {
      await this.release(existing.id);
    }

    return this.acquire(profileId, {
      strategy: 'random',
      excludeProxyIds: oldProxyId ? [oldProxyId] : undefined,
    });
  }
}
