import type { FleetStatus } from '@tersoo/contracts';
import { create } from 'zustand';

import { invokeIpc, subscribeIpc } from '../lib/ipc';
import { useProfilesStore } from './profilesStore';

export interface FleetState {
  status: FleetStatus | null;
  loading: boolean;
  error: string | null;
  pollIntervalId: ReturnType<typeof setInterval> | null;
  unsubscribeStateChanged: (() => void) | null;

  fetchStatus: () => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
}

export const useFleetStore = create<FleetState>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  pollIntervalId: null,
  unsubscribeStateChanged: null,

  fetchStatus: async () => {
    try {
      const status = await invokeIpc('fleet.status');
      set({ status, error: null });

      // Cross-check supervisor count vs renderer profiles store running count
      const profilesState = useProfilesStore.getState();
      const profileRunningCount = profilesState.profiles.filter((p) => p.state === 'running').length;
      if (profilesState.profiles.length > 0 && profileRunningCount !== status.activeInstances) {
        console.warn(
          `[FleetStore] State discrepancy: supervisor activeInstances=${status.activeInstances}, ` +
            `profilesStore runningCount=${profileRunningCount}`,
        );
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch fleet status' });
    }
  },

  startPolling: (intervalMs = 3000) => {
    const existing = get().pollIntervalId;
    if (existing) clearInterval(existing);

    void get().fetchStatus();
    const intervalId = setInterval(() => {
      void get().fetchStatus();
    }, intervalMs);

    let unsub = get().unsubscribeStateChanged;
    if (!unsub) {
      unsub = subscribeIpc('profile.state_changed', () => {
        void get().fetchStatus();
      });
    }

    set({ pollIntervalId: intervalId, unsubscribeStateChanged: unsub });
  },

  stopPolling: () => {
    const { pollIntervalId, unsubscribeStateChanged } = get();
    if (pollIntervalId) clearInterval(pollIntervalId);
    if (unsubscribeStateChanged) unsubscribeStateChanged();
    set({ pollIntervalId: null, unsubscribeStateChanged: null });
  },
}));
