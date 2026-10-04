import { create } from 'zustand';
import type { PromptCategory, PromptItem } from '@tersoo/contracts';
import { invokeIpc } from '../lib/ipc';

export interface PromptsState {
  prompts: PromptItem[];
  selectedPromptId: string | null;
  editingText: string;
  searchQuery: string;
  selectedCategory: PromptCategory | 'all';
  loading: boolean;
  saving: boolean;
  resetting: boolean;
  testing: boolean;
  testResult: { success: boolean; reply: string; latencyMs?: number } | null;
  statusMessage: { type: 'success' | 'error'; text: string } | null;

  loadPrompts: () => Promise<void>;
  selectPrompt: (id: string) => void;
  setEditingText: (text: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (cat: PromptCategory | 'all') => void;
  saveCurrentPrompt: () => Promise<void>;
  resetCurrentPrompt: () => Promise<void>;
  resetAllPrompts: () => Promise<void>;
  testCurrentPrompt: () => Promise<void>;
  clearStatusMessage: () => void;
}

export const usePromptsStore = create<PromptsState>((set, get) => ({
  prompts: [],
  selectedPromptId: null,
  editingText: '',
  searchQuery: '',
  selectedCategory: 'all',
  loading: false,
  saving: false,
  resetting: false,
  testing: false,
  testResult: null,
  statusMessage: null,

  loadPrompts: async () => {
    set({ loading: true });
    try {
      const items = await invokeIpc('prompt.list');
      const currentSelected = get().selectedPromptId;
      const validSelected = items.some((p) => p.id === currentSelected)
        ? currentSelected
        : items[0]?.id ?? null;

      const currentItem = items.find((p) => p.id === validSelected);
      set({
        prompts: items,
        selectedPromptId: validSelected,
        editingText: currentItem ? currentItem.currentText : '',
        loading: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        loading: false,
        statusMessage: { type: 'error', text: `Failed to load prompts: ${msg}` },
      });
    }
  },

  selectPrompt: (id: string) => {
    const prompt = get().prompts.find((p) => p.id === id);
    if (prompt) {
      set({
        selectedPromptId: id,
        editingText: prompt.currentText,
        testResult: null,
        statusMessage: null,
      });
    }
  },

  setEditingText: (text: string) => {
    set({ editingText: text });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setSelectedCategory: (cat: PromptCategory | 'all') => {
    set({ selectedCategory: cat });
  },

  saveCurrentPrompt: async () => {
    const { selectedPromptId, editingText, prompts } = get();
    if (!selectedPromptId) return;

    set({ saving: true, statusMessage: null });
    try {
      const updated = await invokeIpc('prompt.update', {
        id: selectedPromptId,
        text: editingText,
      });

      const nextPrompts = prompts.map((p) => (p.id === selectedPromptId ? updated : p));
      set({
        prompts: nextPrompts,
        saving: false,
        statusMessage: { type: 'success', text: `Prompt "${updated.title}" saved successfully!` },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        saving: false,
        statusMessage: { type: 'error', text: `Failed to save prompt: ${msg}` },
      });
    }
  },

  resetCurrentPrompt: async () => {
    const { selectedPromptId, prompts } = get();
    if (!selectedPromptId) return;

    set({ resetting: true, statusMessage: null });
    try {
      const reset = await invokeIpc('prompt.reset', { id: selectedPromptId });
      const nextPrompts = prompts.map((p) => (p.id === selectedPromptId ? reset : p));
      set({
        prompts: nextPrompts,
        editingText: reset.defaultText,
        resetting: false,
        statusMessage: { type: 'success', text: `Prompt restored to factory default.` },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        resetting: false,
        statusMessage: { type: 'error', text: `Failed to reset prompt: ${msg}` },
      });
    }
  },

  resetAllPrompts: async () => {
    set({ resetting: true, statusMessage: null });
    try {
      const items = await invokeIpc('prompt.resetAll');
      const currentSelected = get().selectedPromptId;
      const current = items.find((p) => p.id === currentSelected) || items[0];
      set({
        prompts: items,
        selectedPromptId: current ? current.id : null,
        editingText: current ? current.defaultText : '',
        resetting: false,
        statusMessage: { type: 'success', text: 'All prompts restored to default settings.' },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        resetting: false,
        statusMessage: { type: 'error', text: `Failed to reset all prompts: ${msg}` },
      });
    }
  },

  testCurrentPrompt: async () => {
    const { editingText } = get();
    if (!editingText.trim()) return;

    set({ testing: true, testResult: null });
    const start = Date.now();
    try {
      // Run quick dry run test with the prompt
      const previewPrompt = editingText.slice(0, 500);
      const res = await invokeIpc('llm.test', {
        prompt: `System Prompt Test Verification:\n${previewPrompt}\n\nRespond with {"status":"ok","acknowledged":true}`,
      });
      const latencyMs = Date.now() - start;
      set({
        testing: false,
        testResult: {
          success: res.ok,
          reply: res.response || 'LLM acknowledged prompt syntax successfully.',
          latencyMs: res.latencyMs ?? latencyMs,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        testing: false,
        testResult: {
          success: false,
          reply: `Test run failed: ${msg}`,
          latencyMs: Date.now() - start,
        },
      });
    }
  },

  clearStatusMessage: () => {
    set({ statusMessage: null });
  },
}));
