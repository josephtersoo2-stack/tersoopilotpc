import { create } from 'zustand';
import type {
  TaskDetail,
  TaskTemplate,
  TaskTemplateCategory,
  TemplateCreateInput,
  TemplateUpdateInput,
  TemplateInstantiateInput,
} from '@tersoo/contracts';
import { invokeIpc } from '../lib/ipc';

export interface TemplatesState {
  templates: TaskTemplate[];
  selectedTemplateId: string | null;
  loading: boolean;
  error: string | null;
  categoryFilter: TaskTemplateCategory | 'all';
  searchQuery: string;

  loadTemplates: (category?: string) => Promise<void>;
  getTemplate: (id: string) => Promise<TaskTemplate | null>;
  createTemplate: (input: TemplateCreateInput) => Promise<TaskTemplate>;
  updateTemplate: (input: TemplateUpdateInput) => Promise<TaskTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
  instantiateTemplate: (input: TemplateInstantiateInput) => Promise<TaskDetail>;
  setSelectedTemplateId: (id: string | null) => void;
  setCategoryFilter: (category: TaskTemplateCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  selectedTemplateId: null,
  loading: false,
  error: null,
  categoryFilter: 'all',
  searchQuery: '',

  loadTemplates: async (category?: string) => {
    set({ loading: true, error: null });
    try {
      const result = await invokeIpc('template.list', category ? { category } : undefined);
      set({ templates: Array.isArray(result) ? result : [], loading: false });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  getTemplate: async (id: string) => {
    try {
      const tpl = await invokeIpc('template.get', { id });
      return tpl ?? null;
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  createTemplate: async (input: TemplateCreateInput) => {
    set({ loading: true, error: null });
    try {
      const created = await invokeIpc('template.create', input);
      set((state) => ({
        templates: [created, ...state.templates],
        loading: false,
      }));
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      throw err;
    }
  },

  updateTemplate: async (input: TemplateUpdateInput) => {
    set({ loading: true, error: null });
    try {
      const updated = await invokeIpc('template.update', input);
      set((state) => ({
        templates: state.templates.map((t) => (t.id === updated.id ? updated : t)),
        loading: false,
      }));
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      throw err;
    }
  },

  deleteTemplate: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await invokeIpc('template.delete', { id });
      set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
        selectedTemplateId: state.selectedTemplateId === id ? null : state.selectedTemplateId,
        loading: false,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      throw err;
    }
  },

  instantiateTemplate: async (input: TemplateInstantiateInput) => {
    set({ loading: true, error: null });
    try {
      const task = await invokeIpc('template.instantiate', input);
      set({ loading: false });
      return task;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      throw err;
    }
  },

  setSelectedTemplateId: (id: string | null) => set({ selectedTemplateId: id }),
  setCategoryFilter: (category: TaskTemplateCategory | 'all') => set({ categoryFilter: category }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
}));
