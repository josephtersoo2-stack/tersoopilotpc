import { contextBridge, ipcRenderer } from 'electron';

export const api = {
  invoke: (name: string, input: unknown): Promise<unknown> => ipcRenderer.invoke(name, input),
  on: (name: string, handler: (payload: unknown) => void): (() => void) => {
    const listener = (_: unknown, payload: unknown) => {
      handler(payload);
    };
    ipcRenderer.on(name, listener);
    return () => {
      ipcRenderer.off(name, listener);
    };
  },
};

contextBridge.exposeInMainWorld('tersoo', api);

export type TersooApi = typeof api;
