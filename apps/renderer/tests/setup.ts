import '@testing-library/jest-dom';

if (typeof window !== 'undefined') {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  (window as unknown as { tersoo: unknown }).tersoo = {
    invoke: async (name: string, input: unknown): Promise<unknown> => {
      return { ok: true, name, input };
    },
    on: (name: string, handler: (payload: unknown) => void): (() => void) => {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
      }
      set.add(handler);
      return () => {
        set?.delete(handler);
      };
    },
    __emit: (name: string, payload: unknown) => {
      const set = listeners.get(name);
      set?.forEach((fn) => fn(payload));
    },
  };
}
