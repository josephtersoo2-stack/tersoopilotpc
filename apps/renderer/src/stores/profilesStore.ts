import {
  DEFAULT_PRESET_IDS,
  type HealthResult,
  type LeaseSummary,
  type ProfileCreateInput,
  type ProfileDetail,
  type ProfileSummary,
  type ProfileUpdateInput,
} from '@tersoo/contracts';
import { create } from 'zustand';

import { invokeIpc } from '../lib/ipc';

export interface ProfileFilter {
  platform?: string | undefined;
  state?: ProfileSummary['state'] | undefined;
  search?: string | undefined;
  tag?: string | undefined;
  tags?: string[] | undefined;
}

export type ProfileItem = Omit<ProfileSummary, 'state'> & {
  state: ProfileSummary['state'] | 'starting' | 'stopping';
};

export type SortField = 'name' | 'platform' | 'engine' | 'state' | 'lastLaunchedAt' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface ProfilesState {
  profiles: ProfileItem[];
  selectedProfileDetail: ProfileDetail | null;
  selectedIds: Set<string>;
  loading: boolean;
  error: string | null;

  // View & Sorting
  viewMode: 'table' | 'grid';
  sortField: SortField | null;
  sortDirection: SortDirection;

  // Filters
  filterPlatform: string;
  filterEngine: string;
  filterState: string;
  filterTag: string;
  searchQuery: string;

  // Pagination
  currentPage: number;
  pageSize: number;

  // Modal states
  isCreateModalOpen: boolean;
  editingProfileId: string | null;
  isImportModalOpen: boolean;
  personaModalProfileId: string | null;

  // Metrics cache
  stats: {
    total: number;
    running: number;
    idle: number;
    crashed: number;
    proxiesHealthy: number;
    proxiesTotal: number;
  };

  // Actions
  loadProfiles: () => Promise<void>;
  inspectProfile: (id: string | null) => Promise<void>;
  createProfile: (data: ProfileCreateInput) => Promise<ProfileDetail>;
  bulkCreateProfiles: (input: {
    count: number;
    presetId: string;
    engineDistribution:
      | { mode: 'single'; engine: 'apostate' | 'camoufox' }
      | { mode: 'mixed'; weights: { apostate: number; camoufox: number } };
    tags?: string[];
    persona?: string | undefined;
    nicheId?: string | null | undefined;
    nicheIds?: string[] | undefined;
    randomizePersona?: boolean | undefined;
  }) => Promise<ProfileSummary[]>;
  updateProfile: (id: string, patch: ProfileUpdateInput) => Promise<ProfileDetail>;
  autoMatureProfile: (id: string) => Promise<ProfileDetail>;
  deleteProfile: (id: string) => Promise<void>;
  deleteSelected: () => Promise<void>;
  cloneProfile: (id: string) => Promise<ProfileDetail>;
  launchProfile: (id: string) => Promise<void>;
  stopProfile: (id: string) => Promise<void>;
  launchSelected: () => Promise<void>;
  stopSelected: () => Promise<void>;

  // Proxy operations
  checkProxyHealth: (proxyId: string) => Promise<HealthResult | null>;
  swapProxy: (profileId: string) => Promise<LeaseSummary | null>;
  releaseProxy: (profileId: string) => Promise<void>;

  // Tag & note quick updates
  updateNotes: (id: string, notes: string) => Promise<void>;
  addTag: (id: string, tag: string) => Promise<void>;
  removeTag: (id: string, tag: string) => Promise<void>;

  // View & Filter Setters
  setViewMode: (mode: 'table' | 'grid') => void;
  setSorting: (field: SortField) => void;
  setPlatformFilter: (platform: string) => void;
  setEngineFilter: (engine: string) => void;
  setStateFilter: (state: string) => void;
  setTagFilter: (tag: string) => void;
  setSearchQuery: (query: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;

  openCreateModal: () => void;
  openEditModal: (id: string) => void;
  closeModal: () => void;
  openImportModal: () => void;
  closeImportModal: () => void;

  openPersonaModal: (id: string) => void;
  closePersonaModal: () => void;

  exportProfilesJson: (ids?: string[]) => string;
  importProfilesJson: (json: string) => Promise<number>;

  handleStateChanged: (payload: { profileId: string; state: string }) => void;
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  selectedProfileDetail: null,
  selectedIds: new Set<string>(),
  loading: false,
  error: null,

  viewMode: 'table',
  sortField: null,
  sortDirection: 'asc',

  filterPlatform: 'all',
  filterEngine: 'all',
  filterState: 'all',
  filterTag: 'all',
  searchQuery: '',

  currentPage: 1,
  pageSize: 8,

  isCreateModalOpen: false,
  editingProfileId: null,
  isImportModalOpen: false,
  personaModalProfileId: null,

  stats: {
    total: 0,
    running: 0,
    idle: 0,
    crashed: 0,
    proxiesHealthy: 0,
    proxiesTotal: 0,
  },

  loadProfiles: async () => {
    set({ loading: true, error: null });
    try {
      const { filterPlatform, filterState, filterTag, searchQuery, sortField, sortDirection } = get();
      const filter: ProfileFilter = {};

      if (filterPlatform !== 'all') filter.platform = filterPlatform;
      if (filterState !== 'all') filter.state = filterState as ProfileFilter['state'];
      if (filterTag !== 'all') {
        filter.tag = filterTag;
        filter.tags = [filterTag];
      }
      if (searchQuery.trim()) filter.search = searchQuery.trim();

      const rawProfiles = await invokeIpc('profile.list', { filter });

      // Apply client-side filtering for engine if selected
      const { filterEngine } = get();
      let filtered = [...rawProfiles];
      if (filterEngine && filterEngine !== 'all') {
        filtered = filtered.filter((p) => p.engine === filterEngine);
      }

      // Apply client-side sorting if user has selected a sort column
      const sorted = [...filtered];
      if (sortField) {
        sorted.sort((a, b) => {
          let valA: string | number = '';
          let valB: string | number = '';

          if (sortField === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
          } else if (sortField === 'platform') {
            valA = a.platform.toLowerCase();
            valB = b.platform.toLowerCase();
          } else if (sortField === 'engine') {
            valA = (a.engine ?? 'apostate').toLowerCase();
            valB = (b.engine ?? 'apostate').toLowerCase();
          } else if (sortField === 'state') {
            valA = a.state.toLowerCase();
            valB = b.state.toLowerCase();
          } else if (sortField === 'lastLaunchedAt') {
            valA = a.lastLaunchedAt ?? 0;
            valB = b.lastLaunchedAt ?? 0;
          } else if (sortField === 'createdAt') {
            valA = a.createdAt;
            valB = b.createdAt;
          }

          if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
          if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        });
      }

      // Calculate stats
      const running = sorted.filter((p) => p.state === 'running').length;
      const idle = sorted.filter((p) => p.state === 'idle').length;
      const crashed = sorted.filter((p) => p.state === 'crashed').length;

      let proxiesHealthy = 0;
      let proxiesTotal = 0;
      try {
        const fleet = await invokeIpc('fleet.status');
        proxiesHealthy = fleet.proxiesHealthy;
        proxiesTotal = fleet.proxiesTotal;
      } catch {
        // fallback to 0
      }

      set({
        profiles: sorted,
        loading: false,
        stats: {
          total: sorted.length,
          running,
          idle,
          crashed,
          proxiesHealthy,
          proxiesTotal,
        },
      });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  inspectProfile: async (id: string | null) => {
    if (!id) {
      set({ selectedProfileDetail: null });
      return;
    }
    try {
      const detail = await invokeIpc('profile.get', { id });
      set({ selectedProfileDetail: detail });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  createProfile: async (data: ProfileCreateInput) => {
    const detail = await invokeIpc('profile.create', data);
    set({ isCreateModalOpen: false });
    await get().loadProfiles();
    return detail;
  },

  bulkCreateProfiles: async (input: {
    count: number;
    presetId: string;
    engineDistribution:
      | { mode: 'single'; engine: 'apostate' | 'camoufox' }
      | { mode: 'mixed'; weights: { apostate: number; camoufox: number } };
    tags?: string[];
    persona?: string | undefined;
    nicheId?: string | null | undefined;
    nicheIds?: string[] | undefined;
    randomizePersona?: boolean | undefined;
  }) => {
    const summaries = await invokeIpc('profile.bulkCreate', input);
    set({ isCreateModalOpen: false });
    await get().loadProfiles();
    return summaries;
  },

  updateProfile: async (id: string, patch: ProfileUpdateInput) => {
    const detail = await invokeIpc('profile.update', { id, patch });
    set({ isCreateModalOpen: false, editingProfileId: null });
    await get().loadProfiles();
    if (get().selectedProfileDetail?.id === id) {
      set({ selectedProfileDetail: detail });
    }
    return detail;
  },

  autoMatureProfile: async (id: string) => {
    const detail = await invokeIpc('profile.autoMature', { id });
    await get().loadProfiles();
    if (get().selectedProfileDetail?.id === id) {
      set({ selectedProfileDetail: detail });
    }
    return detail;
  },

  deleteProfile: async (id: string) => {
    await invokeIpc('profile.delete', { id });
    if (get().selectedProfileDetail?.id === id) {
      set({ selectedProfileDetail: null });
    }
    const selectedIds = new Set(get().selectedIds);
    selectedIds.delete(id);
    set({ selectedIds });
    await get().loadProfiles();
  },

  deleteSelected: async () => {
    const ids = Array.from(get().selectedIds);
    for (const id of ids) {
      try {
        await invokeIpc('profile.delete', { id });
      } catch {
        // continue deletion
      }
    }
    set({ selectedIds: new Set(), selectedProfileDetail: null });
    await get().loadProfiles();
  },

  cloneProfile: async (id: string) => {
    const existing = await invokeIpc('profile.get', { id });
    const detail = await invokeIpc('profile.create', {
      name: `${existing.name} (Copy)`,
      presetId: existing.presetId,
      engine: existing.engine,
      tags: existing.tags ? [...existing.tags] : [],
      proxyId: existing.proxyId ?? undefined,
      fingerprintSeed: crypto.randomUUID(),
      notes: existing.notes ? `${existing.notes} [Cloned]` : undefined,
    });
    await get().loadProfiles();
    return detail;
  },

  launchProfile: async (id: string) => {
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, state: 'starting' } : p)),
    }));
    try {
      await invokeIpc('profile.launch', { id });
      await get().loadProfiles();
      if (get().selectedProfileDetail?.id === id) {
        await get().inspectProfile(id);
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      await get().loadProfiles();
    }
  },

  stopProfile: async (id: string) => {
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, state: 'stopping' } : p)),
    }));
    try {
      await invokeIpc('profile.stop', { id });
      await get().loadProfiles();
      if (get().selectedProfileDetail?.id === id) {
        await get().inspectProfile(id);
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      await get().loadProfiles();
    }
  },

  launchSelected: async () => {
    const ids = Array.from(get().selectedIds);
    for (const id of ids) {
      try {
        await invokeIpc('profile.launch', { id });
      } catch {
        // continue
      }
    }
    await get().loadProfiles();
  },

  stopSelected: async () => {
    const ids = Array.from(get().selectedIds);
    for (const id of ids) {
      try {
        await invokeIpc('profile.stop', { id });
      } catch {
        // continue
      }
    }
    await get().loadProfiles();
  },

  checkProxyHealth: async (proxyId: string) => {
    try {
      const result = await invokeIpc('proxy.check', { id: proxyId });
      return result;
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  swapProxy: async (profileId: string) => {
    try {
      const lease = await invokeIpc('proxy.swap', { profileId });
      await get().loadProfiles();
      if (get().selectedProfileDetail?.id === profileId) {
        await get().inspectProfile(profileId);
      }
      return lease;
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  releaseProxy: async (profileId: string) => {
    try {
      await invokeIpc('proxy.release', { profileId });
      await get().loadProfiles();
      if (get().selectedProfileDetail?.id === profileId) {
        await get().inspectProfile(profileId);
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  updateNotes: async (id: string, notes: string) => {
    await get().updateProfile(id, { notes });
  },

  addTag: async (id: string, newTag: string) => {
    const p = get().profiles.find((item) => item.id === id);
    if (!p) return;
    const currentTags = p.tags ?? [];
    if (currentTags.includes(newTag)) return;
    await get().updateProfile(id, { tags: [...currentTags, newTag] });
  },

  removeTag: async (id: string, tagToRemove: string) => {
    const p = get().profiles.find((item) => item.id === id);
    if (!p) return;
    const currentTags = (p.tags ?? []).filter((t) => t !== tagToRemove);
    await get().updateProfile(id, { tags: currentTags });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setSorting: (field) => {
    const { sortField, sortDirection } = get();
    if (sortField === field) {
      set({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sortField: field, sortDirection: 'asc' });
    }
    void get().loadProfiles();
  },

  setPlatformFilter: (platform: string) => {
    set({ filterPlatform: platform, currentPage: 1 });
    void get().loadProfiles();
  },

  setEngineFilter: (engine: string) => {
    set({ filterEngine: engine, currentPage: 1 });
    void get().loadProfiles();
  },

  setStateFilter: (state: string) => {
    set({ filterState: state, currentPage: 1 });
    void get().loadProfiles();
  },

  setTagFilter: (tag: string) => {
    set({ filterTag: tag, currentPage: 1 });
    void get().loadProfiles();
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query, currentPage: 1 });
    void get().loadProfiles();
  },

  setPage: (page: number) => {
    set({ currentPage: page });
  },

  setPageSize: (size: number) => {
    set({ pageSize: size, currentPage: 1 });
  },

  toggleSelect: (id: string) => {
    const selectedIds = new Set(get().selectedIds);
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    set({ selectedIds });
  },

  toggleSelectAll: () => {
    const { profiles, selectedIds, currentPage, pageSize } = get();
    const startIndex = (currentPage - 1) * pageSize;
    const pageProfiles = profiles.slice(startIndex, startIndex + pageSize);

    const allSelected = pageProfiles.every((p) => selectedIds.has(p.id));
    const nextSelected = new Set(selectedIds);

    if (allSelected) {
      pageProfiles.forEach((p) => nextSelected.delete(p.id));
    } else {
      pageProfiles.forEach((p) => nextSelected.add(p.id));
    }
    set({ selectedIds: nextSelected });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  openCreateModal: () => {
    set({ isCreateModalOpen: true, editingProfileId: null });
  },

  openEditModal: (id: string) => {
    set({ isCreateModalOpen: true, editingProfileId: id });
  },

  closeModal: () => {
    set({ isCreateModalOpen: false, editingProfileId: null });
  },

  openImportModal: () => {
    set({ isImportModalOpen: true });
  },

  closeImportModal: () => {
    set({ isImportModalOpen: false });
  },

  openPersonaModal: (id: string) => {
    set({ personaModalProfileId: id });
  },

  closePersonaModal: () => {
    set({ personaModalProfileId: null });
  },

  exportProfilesJson: (ids?: string[]) => {
    const { profiles, selectedIds } = get();
    const targetIds = ids ?? (selectedIds.size > 0 ? Array.from(selectedIds) : profiles.map((p) => p.id));
    const list = profiles.filter((p) => targetIds.includes(p.id));
    return JSON.stringify(list, null, 2);
  },

  importProfilesJson: async (json: string) => {
    const parsed = JSON.parse(json) as Array<Partial<ProfileCreateInput>>;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    let imported = 0;
    for (const item of items) {
      if (item.name) {
        await invokeIpc('profile.create', {
          name: item.name,
          presetId: item.presetId ?? DEFAULT_PRESET_IDS.windows11,
          tags: item.tags ?? ['imported'],
          notes: item.notes,
          proxyId: item.proxyId,
          fingerprintSeed: item.fingerprintSeed ?? crypto.randomUUID(),
        });
        imported++;
      }
    }
    await get().loadProfiles();
    return imported;
  },

  handleStateChanged: ({ profileId, state }) => {
    set((s) => ({
      profiles: s.profiles.map((p) =>
        p.id === profileId ? { ...p, state: state as ProfileSummary['state'] } : p,
      ),
      selectedProfileDetail:
        s.selectedProfileDetail?.id === profileId
          ? { ...s.selectedProfileDetail, state: state as ProfileDetail['state'] }
          : s.selectedProfileDetail,
    }));
  },
}));
