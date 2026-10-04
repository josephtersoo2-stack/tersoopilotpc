import {
  type HealthResult,
  type ImportReport,
  type LeaseSummary,
  type ProxyBulkImportInput,
  type ProxyCreateInput,
  type ProxyStatus,
  type ProxySummary,
} from '@tersoo/contracts';
import { create } from 'zustand';

import { invokeIpc } from '../lib/ipc';

export type ProxySortField = 'protocol' | 'host' | 'port' | 'latency' | 'status' | 'country' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface ProxyVaultStats {
  total: number;
  healthy: number;
  slow: number;
  authError: number;
  dead: number;
  inUse: number;
  avgLatency: number;
}

export interface ProxyVaultState {
  proxies: ProxySummary[];
  loading: boolean;
  error: string | null;

  // Filters
  searchQuery: string;
  protocolFilter: 'all' | 'socks5' | 'http' | 'https';
  statusFilter: 'all' | 'healthy' | 'slow' | 'auth_error' | 'dead' | 'unknown';

  // Sorting
  sortField: ProxySortField;
  sortDirection: SortDirection;

  // Selection
  selectedIds: Set<string>;

  // Pagination
  currentPage: number;
  pageSize: number;

  // Active check operations
  checkingProxyIds: Set<string>;
  isCheckingAll: boolean;

  // Modals
  isAddModalOpen: boolean;
  isBulkImportModalOpen: boolean;
  isAssignModalOpen: boolean;
  assignTargetProxy: ProxySummary | null;

  // Stats
  stats: ProxyVaultStats;

  // Actions
  loadProxies: () => Promise<void>;
  createProxy: (input: ProxyCreateInput) => Promise<ProxySummary>;
  importBulk: (input: ProxyBulkImportInput) => Promise<ImportReport>;
  checkProxy: (id: string) => Promise<HealthResult | null>;
  checkAll: () => Promise<void>;
  assignProxy: (profileId: string, proxyId: string) => Promise<LeaseSummary>;
  releaseProxy: (profileId: string) => Promise<void>;
  swapProxy: (profileId: string) => Promise<LeaseSummary>;
  deleteProxy: (id: string) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkCheck: (ids: string[]) => Promise<void>;

  // Setters
  setSearchQuery: (q: string) => void;
  setProtocolFilter: (proto: 'all' | 'socks5' | 'http' | 'https') => void;
  setStatusFilter: (status: 'all' | 'healthy' | 'slow' | 'auth_error' | 'dead' | 'unknown') => void;
  setSort: (field: ProxySortField) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  toggleSelect: (id: string) => void;
  toggleSelectAll: (allIds: string[]) => void;
  clearSelection: () => void;
  setAddModalOpen: (open: boolean) => void;
  setBulkImportModalOpen: (open: boolean) => void;
  setAssignModalOpen: (open: boolean, proxy?: ProxySummary | null) => void;

  // Event handlers
  handleHealthChanged: (payload: { proxyId: string; status: ProxyStatus }) => void;
  handleLeaseAcquired: (payload: LeaseSummary) => void;
  handleLeaseReleased: (payload: { leaseId: string; profileId: string }) => void;
}

function calculateStats(proxies: ProxySummary[]): ProxyVaultStats {
  let healthy = 0;
  let slow = 0;
  let authError = 0;
  let dead = 0;
  let latencySum = 0;
  let latencyCount = 0;

  for (const p of proxies) {
    if (p.status === 'healthy') healthy++;
    else if (p.status === 'slow') slow++;
    else if (p.status === 'auth_error') authError++;
    else if (p.status === 'dead') dead++;

    if (p.lastLatencyMs !== null && p.lastLatencyMs > 0) {
      latencySum += p.lastLatencyMs;
      latencyCount++;
    }
  }

  return {
    total: proxies.length,
    healthy,
    slow,
    authError,
    dead,
    inUse: 0, // updated dynamically or via leases
    avgLatency: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
  };
}

export const useProxyVaultStore = create<ProxyVaultState>((set, get) => ({
  proxies: [],
  loading: false,
  error: null,

  searchQuery: '',
  protocolFilter: 'all',
  statusFilter: 'all',

  sortField: 'createdAt',
  sortDirection: 'desc',

  selectedIds: new Set<string>(),

  currentPage: 1,
  pageSize: 25,

  checkingProxyIds: new Set<string>(),
  isCheckingAll: false,

  isAddModalOpen: false,
  isBulkImportModalOpen: false,
  isAssignModalOpen: false,
  assignTargetProxy: null,

  stats: {
    total: 0,
    healthy: 0,
    slow: 0,
    authError: 0,
    dead: 0,
    inUse: 0,
    avgLatency: 0,
  },

  loadProxies: async () => {
    set({ loading: true, error: null });
    try {
      const list = await invokeIpc('proxy.list');
      set({
        proxies: list,
        stats: calculateStats(list),
        loading: false,
      });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load proxies',
        loading: false,
      });
    }
  },

  createProxy: async (input: ProxyCreateInput) => {
    set({ loading: true, error: null });
    try {
      const created = await invokeIpc('proxy.create', input);
      set((state) => {
        const nextProxies = [created, ...state.proxies];
        return {
          proxies: nextProxies,
          stats: calculateStats(nextProxies),
          loading: false,
          isAddModalOpen: false,
        };
      });
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create proxy';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  importBulk: async (input: ProxyBulkImportInput) => {
    set({ loading: true, error: null });
    try {
      const report = await invokeIpc('proxy.importBulk', input);
      await get().loadProxies();
      set({ loading: false });
      return report;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import proxies';
      set({ error: msg, loading: false });
      throw err;
    }
  },

  checkProxy: async (id: string) => {
    set((state) => {
      const next = new Set(state.checkingProxyIds);
      next.add(id);
      return { checkingProxyIds: next };
    });

    try {
      const result = await invokeIpc('proxy.check', { id });
      set((state) => {
        const next = new Set(state.checkingProxyIds);
        next.delete(id);

        const nextProxies = state.proxies.map((p) => {
          if (p.id !== id) return p;
          const status: 'healthy' | 'slow' | 'auth_error' | 'dead' = result.ok
            ? result.latencyMs && result.latencyMs > 2500
              ? 'slow'
              : 'healthy'
            : (result.error ?? '').toLowerCase().includes('auth')
              ? 'auth_error'
              : 'dead';
          return {
            ...p,
            status,
            lastLatencyMs: result.latencyMs,
            lastCheckedAt: Date.now(),
            exitIp: result.exitIp ?? p.exitIp,
            geoCountry: result.geo.country ?? p.geoCountry,
            geoCity: result.geo.city ?? p.geoCity,
            geoTz: result.geo.tz ?? p.geoTz,
            geoIsp: result.geo.isp ?? p.geoIsp,
            statusReason: result.error,
          };
        });

        return {
          checkingProxyIds: next,
          proxies: nextProxies,
          stats: calculateStats(nextProxies),
        };
      });
      return result;
    } catch {
      set((state) => {
        const next = new Set(state.checkingProxyIds);
        next.delete(id);
        return { checkingProxyIds: next };
      });
      return null;
    }
  },

  checkAll: async () => {
    const { proxies, checkProxy } = get();
    if (proxies.length === 0) return;

    set({ isCheckingAll: true });
    // Run concurrent health checks in batches of 5 to avoid socket exhaustion
    const batchSize = 5;
    for (let i = 0; i < proxies.length; i += batchSize) {
      const batch = proxies.slice(i, i + batchSize);
      await Promise.all(batch.map((p) => checkProxy(p.id)));
    }
    set({ isCheckingAll: false });
  },

  assignProxy: async (profileId: string, proxyId: string) => {
    try {
      const lease = await invokeIpc('proxy.assign', {
        profileId,
        strategy: 'manual',
        proxyId,
      });
      set({ isAssignModalOpen: false, assignTargetProxy: null });
      return lease;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign proxy';
      set({ error: msg });
      throw err;
    }
  },

  releaseProxy: async (profileId: string) => {
    try {
      await invokeIpc('proxy.release', { profileId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to release proxy';
      set({ error: msg });
      throw err;
    }
  },

  swapProxy: async (profileId: string) => {
    try {
      const lease = await invokeIpc('proxy.swap', { profileId });
      return lease;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to swap proxy';
      set({ error: msg });
      throw err;
    }
  },

  deleteProxy: async (id: string) => {
    try {
      await invokeIpc('proxy.delete', { id });
      set((state) => {
        const next = state.proxies.filter((p) => p.id !== id);
        const sel = new Set(state.selectedIds);
        sel.delete(id);
        return {
          proxies: next,
          selectedIds: sel,
          stats: calculateStats(next),
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete proxy';
      set({ error: msg });
      throw err;
    }
  },

  bulkDelete: async (ids: string[]) => {
    for (const id of ids) {
      try {
        await invokeIpc('proxy.delete', { id });
      } catch {
        // continue
      }
    }
    await get().loadProxies();
    set({ selectedIds: new Set() });
  },

  bulkCheck: async (ids: string[]) => {
    const { checkProxy } = get();
    await Promise.all(ids.map((id) => checkProxy(id)));
  },

  setSearchQuery: (q: string) => set({ searchQuery: q, currentPage: 1 }),
  setProtocolFilter: (proto) => set({ protocolFilter: proto, currentPage: 1 }),
  setStatusFilter: (status) => set({ statusFilter: status, currentPage: 1 }),

  setSort: (field: ProxySortField) => {
    set((state) => {
      if (state.sortField === field) {
        return {
          sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
        };
      }
      return { sortField: field, sortDirection: 'asc' };
    });
  },

  setCurrentPage: (page: number) => set({ currentPage: page }),
  setPageSize: (size: number) => set({ pageSize: size, currentPage: 1 }),

  toggleSelect: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    });
  },

  toggleSelectAll: (allIds: string[]) => {
    set((state) => {
      if (state.selectedIds.size === allIds.length && allIds.length > 0) {
        return { selectedIds: new Set() };
      }
      return { selectedIds: new Set(allIds) };
    });
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  setAddModalOpen: (open: boolean) => set({ isAddModalOpen: open, error: null }),
  setBulkImportModalOpen: (open: boolean) => set({ isBulkImportModalOpen: open, error: null }),
  setAssignModalOpen: (open: boolean, proxy?: ProxySummary | null) =>
    set({ isAssignModalOpen: open, assignTargetProxy: proxy ?? null, error: null }),

  handleHealthChanged: ({ proxyId, status }) => {
    set((state) => {
      const next = state.proxies.map((p) => {
        if (p.id === proxyId) {
          return { ...p, status };
        }
        return p;
      });
      return { proxies: next, stats: calculateStats(next) };
    });
  },

  handleLeaseAcquired: () => {
    // Refresh proxy list or active states
    void get().loadProxies();
  },

  handleLeaseReleased: () => {
    void get().loadProxies();
  },
}));
