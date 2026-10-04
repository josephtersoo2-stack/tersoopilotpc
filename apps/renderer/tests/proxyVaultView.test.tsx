import type { HealthResult, ImportReport, LeaseSummary, ProxySummary } from '@tersoo/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProfilesStore } from '../src/stores/profilesStore';
import { useProxyVaultStore } from '../src/stores/proxyVaultStore';
import { ProxyVaultView } from '../src/views/ProxyVaultView';

describe('Ticket 2.8: ProxyVaultView UI & Subsystem Interaction', () => {
  let mockProxies: ProxySummary[];
  let mockLeases: LeaseSummary[];
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockProxies = [
      {
        id: 'proxy-1',
        protocol: 'socks5',
        host: '198.51.100.42',
        port: 1080,
        username: 'user1',
        geoCountry: 'US',
        geoCity: 'Ashburn',
        geoTz: 'America/New_York',
        geoIsp: 'Cogent Communications',
        exitIp: '198.51.100.42',
        status: 'healthy',
        statusReason: null,
        lastCheckedAt: Date.now() - 60000,
        lastLatencyMs: 42,
        createdAt: Date.now() - 3600000,
      },
      {
        id: 'proxy-2',
        protocol: 'http',
        host: '185.190.140.22',
        port: 8080,
        username: null,
        geoCountry: 'DE',
        geoCity: 'Frankfurt',
        geoTz: 'Europe/Berlin',
        geoIsp: 'Deutsche Telekom',
        exitIp: '185.190.140.22',
        status: 'slow',
        statusReason: 'Latency > 2500ms',
        lastCheckedAt: Date.now() - 120000,
        lastLatencyMs: 2750,
        createdAt: Date.now() - 7200000,
      },
      {
        id: 'proxy-3',
        protocol: 'socks5',
        host: '45.138.16.89',
        port: 1080,
        username: 'user3',
        geoCountry: 'CA',
        geoCity: 'Montreal',
        geoTz: 'America/Toronto',
        geoIsp: 'OVH SAS',
        exitIp: null,
        status: 'auth_error',
        statusReason: '407 Proxy Authentication Required',
        lastCheckedAt: Date.now() - 180000,
        lastLatencyMs: null,
        createdAt: Date.now() - 86400000,
      },
    ];

    mockLeases = [];

    // Reset store state between tests
    useProxyVaultStore.setState({
      proxies: [],
      searchQuery: '',
      protocolFilter: 'all',
      statusFilter: 'all',
      selectedIds: new Set(),
      currentPage: 1,
      pageSize: 25,
      isAddModalOpen: false,
      isBulkImportModalOpen: false,
      isAssignModalOpen: false,
      assignTargetProxy: null,
      checkingProxyIds: new Set(),
      isCheckingAll: false,
    });

    // Mock window.tersoo bridge
    invokeMock = vi.fn(async (channel: string, input?: unknown) => {
        if (channel === 'proxy.list') {
          return [...mockProxies];
        }

        if (channel === 'proxy.create') {
          const createInput = input as { protocol: 'socks5' | 'http' | 'https'; host: string; port: number; username?: string; password?: string };
          const created: ProxySummary = {
            id: `proxy-created-${Date.now()}`,
            protocol: createInput.protocol,
            host: createInput.host,
            port: createInput.port,
            username: createInput.username ?? null,
            geoCountry: 'US',
            geoCity: 'New York',
            geoTz: 'America/New_York',
            geoIsp: 'Mock ISP',
            exitIp: createInput.host,
            status: 'unknown',
            statusReason: null,
            lastCheckedAt: null,
            lastLatencyMs: null,
            createdAt: Date.now(),
          };
          mockProxies.push(created);
          return created;
        }

        if (channel === 'proxy.importBulk') {
          const bulkInput = input as { text?: string };
          const lines = (bulkInput.text ?? '').split('\n').filter((l) => l.trim().length > 0);
          const report: ImportReport = {
            parsed: lines.length,
            imported: lines.length,
            skipped: 0,
            errors: [],
          };
          return report;
        }

        if (channel === 'proxy.check') {
          const { id } = input as { id: string };
          const p = mockProxies.find((item) => item.id === id);
          if (p) {
            p.status = 'healthy';
            p.lastLatencyMs = 65;
            p.lastCheckedAt = Date.now();
          }
          const result: HealthResult = {
            proxyId: id,
            ok: true,
            latencyMs: 65,
            exitIp: '198.51.100.42',
            geo: {
              country: 'US',
              city: 'Ashburn',
              tz: 'America/New_York',
              isp: 'Cogent Communications',
              lat: 39.0438,
              lng: -77.4874,
            },
            webrtcSafe: true,
            dnsSafe: true,
            error: null,
          };
          return result;
        }

        if (channel === 'proxy.assign') {
          const { profileId, proxyId } = input as { profileId: string; proxyId?: string };
          const targetId = proxyId ?? mockProxies[0]!.id;
          const lease: LeaseSummary = {
            id: `lease-${Date.now()}`,
            profileId,
            proxyId: targetId,
            state: 'active',
            acquiredAt: Date.now(),
            expiresAt: Date.now() + 3600000,
            heartbeatAt: Date.now(),
          };
          mockLeases.push(lease);
          return lease;
        }

        if (channel === 'proxy.delete') {
          const { id } = input as { id: string };
          const idx = mockProxies.findIndex((item) => item.id === id);
          if (idx !== -1) mockProxies.splice(idx, 1);
          return undefined;
        }

        if (channel === 'profile.list') {
          return [
            {
              id: 'prof-test-1',
              name: 'Alpha Profile',
              platform: 'windows',
              state: 'idle',
              tags: ['test'],
              presetId: 'default',
              proxyId: null,
              lastLaunchedAt: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ];
        }

        return undefined;
      }) as never;

    window.tersoo = {
      invoke: invokeMock,
      on: vi.fn(() => () => {}) as never,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Proxy Vault header with metric cards', async () => {
    await act(async () => {
      render(<ProxyVaultView />);
    });

    expect(screen.getByText('Proxy Vault')).toBeInTheDocument();
    expect(screen.getByText('Forwarder Active')).toBeInTheDocument();
    expect(screen.getByText('Total Proxies')).toBeInTheDocument();
    expect(screen.getByText('Healthy Pool')).toBeInTheDocument();
    expect(screen.getByText('Average Latency')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('198.51.100.42:1080')).toBeInTheDocument();
      expect(screen.getByText('185.190.140.22:8080')).toBeInTheDocument();
      expect(screen.getByText('45.138.16.89:1080')).toBeInTheDocument();
    });
  });

  it('filters proxies by search query and protocol pill', async () => {
    await act(async () => {
      render(<ProxyVaultView />);
    });

    await waitFor(() => {
      expect(screen.getByText('198.51.100.42:1080')).toBeInTheDocument();
    });

    // 1. Filter by protocol HTTP
    const httpPill = screen.getByRole('button', { name: /^http$/i });
    await act(async () => {
      fireEvent.click(httpPill);
    });

    expect(screen.queryByText('198.51.100.42:1080')).not.toBeInTheDocument();
    expect(screen.getByText('185.190.140.22:8080')).toBeInTheDocument();

    // 2. Reset protocol to ALL
    const allPill = screen.getByRole('button', { name: /^all$/i });
    await act(async () => {
      fireEvent.click(allPill);
    });
    expect(screen.getByText('198.51.100.42:1080')).toBeInTheDocument();

    // 3. Search query
    const searchInput = screen.getByPlaceholderText(/search host/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Montreal' } });
    });

    expect(screen.queryByText('198.51.100.42:1080')).not.toBeInTheDocument();
    expect(screen.getByText('45.138.16.89:1080')).toBeInTheDocument();
  });

  it('opens Add Proxy modal and creates a proxy', async () => {
    await act(async () => {
      render(<ProxyVaultView />);
    });

    const addBtn = screen.getByRole('button', { name: /add proxy/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByText('Add Proxy Endpoint')).toBeInTheDocument();

    const hostInput = screen.getByPlaceholderText(/198.51.100.1 or proxy/i);
    await act(async () => {
      fireEvent.change(hostInput, { target: { value: '99.88.77.66' } });
    });

    const submitBtn = screen.getByRole('button', { name: 'Add to Vault' });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('proxy.create', expect.objectContaining({
        host: '99.88.77.66',
        protocol: 'socks5',
      }));
    });
  });

  it('opens Bulk Ingest modal and imports proxy list', async () => {
    await act(async () => {
      render(<ProxyVaultView />);
    });

    const bulkBtn = screen.getByRole('button', { name: /bulk ingest/i });
    await act(async () => {
      fireEvent.click(bulkBtn);
    });

    expect(screen.getByText('Bulk Proxy Ingestion')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/paste proxies line by line/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'socks5://1.2.3.4:1080\nhttp://5.6.7.8:8080' } });
    });

    const submitImportBtn = screen.getByRole('button', { name: /import 2 proxies/i });
    await act(async () => {
      fireEvent.click(submitImportBtn);
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('proxy.importBulk', expect.objectContaining({
        text: 'socks5://1.2.3.4:1080\nhttp://5.6.7.8:8080',
      }));
    });
  });

  it('triggers health check on proxy and updates status', async () => {
    await act(async () => {
      render(<ProxyVaultView />);
    });

    await waitFor(() => {
      expect(screen.getByText('198.51.100.42:1080')).toBeInTheDocument();
    });

    const testButtons = screen.getAllByRole('button', { name: /test/i });
    await act(async () => {
      fireEvent.click(testButtons[0]!);
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('proxy.check', { id: 'proxy-1' });
    });
  });

  it('deletes proxy from vault', async () => {
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => {
      render(<ProxyVaultView />);
    });

    await waitFor(() => {
      expect(screen.getByText('198.51.100.42:1080')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('Remove proxy');
    await act(async () => {
      fireEvent.click(deleteButtons[0]!);
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('proxy.delete', { id: 'proxy-1' });
    });
  });
});
