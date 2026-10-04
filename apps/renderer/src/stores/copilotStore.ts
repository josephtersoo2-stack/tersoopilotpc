import { create } from 'zustand';
import type {
  CopilotActionProposed,
  CopilotAttachment,
  CopilotContext,
  CopilotMessage,
} from '@tersoo/contracts';
import { invokeIpc } from '../lib/ipc';
import { useProfilesStore } from './profilesStore';
import { useNichesStore } from './nichesStore';
import { useTasksStore } from './tasksStore';
import { useTemplatesStore } from './templatesStore';

const STORAGE_KEY_POS = 'tersoo_copilot_orb_pos';
const STORAGE_KEY_MESSAGES = 'tersoo_copilot_messages';

function getInitialPosition(): { x: number; y: number } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_POS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return parsed;
      }
    }
  } catch {}
  // Default to bottom-right corner
  return {
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 80) : 1200,
    y: typeof window !== 'undefined' ? Math.max(20, window.innerHeight - 100) : 700,
  };
}

function getInitialMessages(): CopilotMessage[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "👋 Hello! I am **Tersoo Copilot**, your browser automation assistant. I'm aware of the page you're currently viewing and can:\n\n* **Generate & refine tasks** from descriptions or uploaded specs\n* **Create or randomize profiles** with calibrated personas & niches\n* **Diagnose errors & inspect failed runs**\n* **Analyze images & documents** you drop or paste into chat\n\nHow can I help you today?",
      timestamp: Date.now(),
    },
  ];
}

export interface CopilotState {
  isOpen: boolean;
  position: { x: number; y: number };
  messages: CopilotMessage[];
  attachments: CopilotAttachment[];
  loading: boolean;
  error: string | null;
  hasUnread: boolean;

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setPosition: (pos: { x: number; y: number }) => void;
  addAttachment: (att: CopilotAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  sendMessage: (text: string, context: CopilotContext) => Promise<void>;
  editMessage: (id: string, newContent: string) => void;
  resendMessageFrom: (id: string, newContent: string, context: CopilotContext) => Promise<void>;
  executeAction: (action: CopilotActionProposed) => Promise<{ success: boolean; message: string; view?: string | undefined }>;
  clearHistory: () => void;
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  isOpen: false,
  position: getInitialPosition(),
  messages: getInitialMessages(),
  attachments: [],
  loading: false,
  error: null,
  hasUnread: false,

  setOpen: (open: boolean) => {
    set({ isOpen: open, ...(open ? { hasUnread: false } : {}) });
  },

  toggleOpen: () => {
    const next = !get().isOpen;
    set({ isOpen: next, ...(next ? { hasUnread: false } : {}) });
  },

  setPosition: (pos: { x: number; y: number }) => {
    // Clamp to window boundaries
    const maxX = typeof window !== 'undefined' ? window.innerWidth - 65 : 1200;
    const maxY = typeof window !== 'undefined' ? window.innerHeight - 65 : 700;
    const clamped = {
      x: Math.max(10, Math.min(pos.x, maxX)),
      y: Math.max(10, Math.min(pos.y, maxY)),
    };
    try {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(clamped));
    } catch {}
    set({ position: clamped });
  },

  addAttachment: (att: CopilotAttachment) => {
    set((state) => ({
      attachments: [...state.attachments, att],
    }));
  },

  removeAttachment: (id: string) => {
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    }));
  },

  clearAttachments: () => {
    set({ attachments: [] });
  },

  sendMessage: async (text: string, context: CopilotContext) => {
    if (!text.trim() && get().attachments.length === 0) return;

    const currentAttachments = [...get().attachments];
    const userMsg: CopilotMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
    };

    const nextMessages = [...get().messages, userMsg];
    set({
      messages: nextMessages,
      attachments: [],
      loading: true,
      error: null,
    });

    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(nextMessages.slice(-20)));
    } catch {}

    try {
      const res = await invokeIpc('copilot.chat', {
        messages: nextMessages,
        context,
        userMessage: text.trim(),
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      });

      const reply = res.reply;
      const updatedMessages = [...nextMessages, reply];

      set({
        messages: updatedMessages,
        loading: false,
        hasUnread: !get().isOpen,
      });

      try {
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updatedMessages.slice(-20)));
      } catch {}
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorReply: CopilotMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ **Failed to contact Copilot**: ${msg}\n\nPlease check your LLM provider key in Settings.`,
        timestamp: Date.now(),
      };
      set({
        messages: [...nextMessages, errorReply],
        loading: false,
        error: msg,
      });
    }
  },

  editMessage: (id: string, newContent: string) => {
    const updated = get().messages.map((m) =>
      m.id === id ? { ...m, content: newContent } : m,
    );
    set({ messages: updated });
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updated.slice(-20)));
    } catch {}
  },

  resendMessageFrom: async (id: string, newContent: string, context: CopilotContext) => {
    if (!newContent.trim()) return;

    const messages = get().messages;
    const index = messages.findIndex((m) => m.id === id);
    if (index === -1) return;

    // Truncate messages to this message and update its content
    const truncated = messages.slice(0, index);
    const updatedUserMsg: CopilotMessage = {
      ...messages[index]!,
      content: newContent.trim(),
      timestamp: Date.now(),
    };

    const nextMessages = [...truncated, updatedUserMsg];
    set({
      messages: nextMessages,
      loading: true,
      error: null,
    });

    try {
      const res = await invokeIpc('copilot.chat', {
        messages: nextMessages.slice(-6),
        context,
        userMessage: newContent.trim(),
      });

      const reply = res.reply;
      const finalMessages = [...nextMessages, reply];
      set({
        messages: finalMessages,
        loading: false,
      });

      try {
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(finalMessages.slice(-20)));
      } catch {}
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorReply: CopilotMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ **Failed to contact Copilot**: ${msg}\n\nPlease check your LLM provider key in Settings.`,
        timestamp: Date.now(),
      };
      set({
        messages: [...nextMessages, errorReply],
        loading: false,
        error: msg,
      });
    }
  },

  executeAction: async (action: CopilotActionProposed) => {
    set({ loading: true });
    try {
      const res = await invokeIpc('copilot.executeAction', { action });

      // Update message action status
      set((state) => ({
        loading: false,
        messages: state.messages.map((m) => {
          if (!m.actions) return m;
          return {
            ...m,
            actions: m.actions.map((a) =>
              a.id === action.id
                ? { ...a, status: res.success ? 'executed' : 'rejected' }
                : a,
            ),
          };
        }),
      }));

      // If the action modified data (e.g. created profiles, niches, tasks, or templates), refresh immediately
      if (res.success) {
        if (action.type === 'create_profile' || action.type === 'bulk_create_profiles') {
          void useProfilesStore.getState().loadProfiles();
        } else if (action.type === 'create_niche') {
          void useNichesStore.getState().loadNiches();
        } else if (action.type === 'create_task') {
          void useTasksStore.getState().loadTasks();
        } else if (
          action.type === 'create_template' ||
          action.type === 'update_template' ||
          action.type === 'delete_template'
        ) {
          void useTemplatesStore.getState().loadTemplates();
        } else if (action.type === 'instantiate_template') {
          void useTasksStore.getState().loadTasks();
        }
      }

      return {
        success: res.success,
        message: res.message,
        view: res.result && typeof res.result.view === 'string' ? res.result.view : undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false });
      return { success: false, message: msg };
    }
  },

  clearHistory: () => {
    const welcome = getInitialMessages();
    set({ messages: welcome, error: null, attachments: [] });
    try {
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
    } catch {}
  },
}));
