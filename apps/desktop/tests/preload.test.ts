import { describe, expect, it, vi } from 'vitest';

const mockContextBridge = {
  exposeInMainWorld: vi.fn(),
};

const mockIpcRenderer = {
  invoke: vi.fn().mockResolvedValue('ok-result'),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

describe('Ticket 0.10: Preload Script', () => {
  it('exposes tersoo API in main world and routes invoke/on calls to ipcRenderer', async () => {
    const { api } = await import('../src/preload/index');

    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith('tersoo', api);

    // Test invoke
    const res = await api.invoke('test.channel', { foo: 'bar' });
    expect(res).toBe('ok-result');
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('test.channel', { foo: 'bar' });

    // Test on and unsubscribe
    const handler = vi.fn();
    const unsub = api.on('test.event', handler);
    expect(mockIpcRenderer.on).toHaveBeenCalledWith('test.event', expect.any(Function));

    unsub();
    expect(mockIpcRenderer.off).toHaveBeenCalledWith('test.event', expect.any(Function));
  });
});
