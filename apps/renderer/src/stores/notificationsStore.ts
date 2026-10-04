import { create } from 'zustand';

import { subscribeIpc } from '../lib/ipc';

export interface AppNotification {
  id: string;
  type: 'action' | 'result' | 'alert' | 'system';
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationsState {
  notifications: AppNotification[];
  isInitialized: boolean;
  addNotification: (
    notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & { id?: string },
  ) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  purgeNotifications: () => void;
  initSubscriptions: () => () => void;
}

const STORAGE_KEY = 'tersoopilot_notifications_v1';

function loadPersisted(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 100); // retain latest 100
    }
  } catch {
    // fallback
  }
  return [];
}

function persist(notifications: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 100)));
  } catch {
    // best-effort
  }
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: loadPersisted(),
  isInitialized: false,

  addNotification: (notif) => {
    const newEntry: AppNotification = {
      id: notif.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: notif.type,
      level: notif.level,
      title: notif.title,
      message: notif.message,
      timestamp: Date.now(),
      read: false,
    };

    set((state) => {
      const next = [newEntry, ...state.notifications].slice(0, 100);
      persist(next);
      return { notifications: next };
    });
  },

  markAllAsRead: () => {
    set((state) => {
      const next = state.notifications.map((n) => ({ ...n, read: true }));
      persist(next);
      return { notifications: next };
    });
  },

  removeNotification: (id: string) => {
    set((state) => {
      const next = state.notifications.filter((n) => n.id !== id);
      persist(next);
      return { notifications: next };
    });
  },

  purgeNotifications: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ notifications: [] });
  },

  initSubscriptions: () => {
    if (get().isInitialized) {
      return () => {};
    }
    set({ isInitialized: true });

    const unsubs: Array<() => void> = [];

    // 1. Alerts raised by backend/supervisor
    unsubs.push(
      subscribeIpc('alert.raised', (payload) => {
        const levelMap: Record<string, AppNotification['level']> = {
          info: 'info',
          warn: 'warning',
          error: 'error',
        };
        get().addNotification({
          type: 'alert',
          level: levelMap[payload.level] || 'info',
          title: payload.title || 'System Alert',
          message: payload.message,
        });
      }),
    );

    // 2. Run state changes (actions & results)
    unsubs.push(
      subscribeIpc('run.state_changed', (payload) => {
        let level: AppNotification['level'] = 'info';
        if (payload.state === 'succeeded') level = 'success';
        else if (payload.state === 'failed') level = 'error';
        else if (payload.state === 'cancelled') level = 'warning';

        const runShort = payload.runId.slice(0, 8);
        get().addNotification({
          type: 'result',
          level,
          title: `Task Run ${payload.state.toUpperCase()}`,
          message: `Run #${runShort} transition to state: ${payload.state}`,
        });
      }),
    );

    // 3. Profile state changes
    unsubs.push(
      subscribeIpc('profile.state_changed', (payload) => {
        const profShort = payload.profileId.slice(0, 8);
        const level: AppNotification['level'] =
          payload.state === 'running'
            ? 'info'
            : payload.state === 'crashed'
              ? 'error'
              : 'info';

        get().addNotification({
          type: 'action',
          level,
          title: `Profile ${payload.state}`,
          message: `Profile #${profShort} state changed to ${payload.state}`,
        });
      }),
    );

    // 4. Backups created
    unsubs.push(
      subscribeIpc('backup.created', (payload) => {
        get().addNotification({
          type: 'result',
          level: 'success',
          title: 'Database Backup Created',
          message: `Successfully created backup ${payload.filename} (${(payload.sizeBytes / 1024).toFixed(1)} KB)`,
        });
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
      set({ isInitialized: false });
    };
  },
}));
