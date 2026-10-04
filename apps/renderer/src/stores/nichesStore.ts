import { create } from 'zustand';
import type { Niche, NicheCreateInput, NicheUpdateInput } from '@tersoo/contracts';
import { invokeIpc } from '../lib/ipc';

export interface NichesState {
  niches: Niche[];
  loading: boolean;
  error: string | null;

  loadNiches: () => Promise<void>;
  createNiche: (input: NicheCreateInput) => Promise<Niche>;
  updateNiche: (input: NicheUpdateInput) => Promise<Niche>;
  deleteNiche: (id: string) => Promise<void>;
}

export const useNichesStore = create<NichesState>((set, get) => ({
  niches: [],
  loading: false,
  error: null,

  loadNiches: async () => {
    set({ loading: true, error: null });
    try {
      const result = await invokeIpc('niche.list');
      set({ niches: Array.isArray(result) ? result : [], loading: false });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  createNiche: async (input: NicheCreateInput) => {
    set({ loading: true, error: null });
    try {
      const created = await invokeIpc('niche.create', input);
      set((state) => ({
        niches: [created, ...state.niches],
        loading: false,
      }));
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      throw err;
    }
  },

  updateNiche: async (input: NicheUpdateInput) => {
    set({ loading: true, error: null });
    try {
      const updated = await invokeIpc('niche.update', input);
      set((state) => ({
        niches: state.niches.map((n) => (n.id === updated.id ? updated : n)),
        loading: false,
      }));
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      throw err;
    }
  },

  deleteNiche: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await invokeIpc('niche.delete', { id });
      set((state) => ({
        niches: state.niches.filter((n) => n.id !== id),
        loading: false,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      throw err;
    }
  },
}));
