import { DEFAULT_PRESET_IDS, type ProfileSummary } from '@tersoo/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/app/App';
import { useProfilesStore } from '../../src/stores/profilesStore';

describe('Ticket 1.7: ProfilesView UI & Interactive Template', () => {
  const mockProfiles: ProfileSummary[] = [
    {
      id: 'profile-1',
      name: 'Pixel 8 Pro #04',
      tags: ['farming', 'us'],
      presetId: DEFAULT_PRESET_IDS.android14,
      state: 'running' as const,
      platform: 'android',
      engine: 'apostate',
      captchaBudgetUsed: 0,
      proxyId: 'proxy-1',
      lastLaunchedAt: Date.now() - 60000,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
    },
    {
      id: 'profile-2',
      name: 'Win11 Workstation 01',
      tags: ['banking', 'main'],
      presetId: DEFAULT_PRESET_IDS.windows11,
      state: 'idle' as const,
      platform: 'windows',
      engine: 'apostate',
      captchaBudgetUsed: 0,
      proxyId: 'proxy-2',
      lastLaunchedAt: null,
      createdAt: Date.now() - 7200000,
      updatedAt: Date.now() - 7200000,
    },
    {
      id: 'profile-3',
      name: 'macOS Sonoma Mini',
      tags: ['dev'],
      presetId: DEFAULT_PRESET_IDS.macosSonoma,
      state: 'crashed' as const,
      platform: 'macos',
      engine: 'camoufox',
      captchaBudgetUsed: 0,
      proxyId: null,
      lastLaunchedAt: null,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    },
  ];

  const mockDetail = {
    id: 'profile-1',
    name: 'Pixel 8 Pro #04',
    tags: ['farming', 'us'],
    presetId: DEFAULT_PRESET_IDS.android14,
    state: 'running' as const,
    platform: 'android',
    engine: 'apostate' as const,
    captchaBudgetUsed: 0,
    proxyId: 'proxy-1',
    lastLaunchedAt: Date.now() - 60000,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
    fingerprintSeed: 'test-seed-12345',
    fingerprintBundle: {
      screen: { width: 412, height: 915, devicePixelRatio: 2.625 },
      hardware: { cores: 8, memoryGb: 8, maxTouchPoints: 5 },
      webgl: { unmaskedRenderer: 'Qualcomm / Adreno (TM) 750', unmaskedVendor: 'Qualcomm' },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36',
    },
    userDataDir: '/tersoopilot/profiles/profile-1',
    notes: 'Farm account 04',
  };

  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock = vi.fn().mockImplementation(async (channel: string, input: unknown) => {
      if (channel === 'profile.list') {
        const filter = (input as { filter?: { search?: string; platform?: string; state?: string } } | undefined)?.filter;
        let list = [...mockProfiles];
        if (filter?.search) {
          list = list.filter((p) => p.name.toLowerCase().includes(filter.search!.toLowerCase()));
        }
        if (filter?.platform && filter.platform !== 'all') {
          list = list.filter((p) => p.platform === filter.platform);
        }
        if (filter?.state && filter.state !== 'all') {
          list = list.filter((p) => p.state === filter.state);
        }
        return list;
      }
      if (channel === 'profile.get') {
        return mockDetail;
      }
      if (channel === 'profile.create') {
        const createInput = input as { name: string; presetId: string; tags?: string[] };
        const created = {
          id: `profile-created-${Date.now()}`,
          name: createInput.name,
          tags: createInput.tags ?? [],
          presetId: createInput.presetId,
          state: 'idle' as const,
          platform: 'windows',
          engine: 'apostate' as const,
          captchaBudgetUsed: 0,
          proxyId: null,
          lastLaunchedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          fingerprintSeed: 'generated-seed',
          fingerprintBundle: mockDetail.fingerprintBundle,
          userDataDir: '/tmp/test-profile',
          notes: null,
        };
        mockProfiles.push(created);
        return created;
      }
      if (channel === 'profile.launch') {
        const { id } = input as { id: string };
        const p = mockProfiles.find((item) => item.id === id);
        if (p) p.state = 'running';
        return { runId: 'run-123' };
      }
      if (channel === 'profile.stop') {
        const { id } = input as { id: string };
        const p = mockProfiles.find((item) => item.id === id);
        if (p) p.state = 'idle';
        return undefined;
      }
      if (channel === 'profile.delete') {
        const { id } = input as { id: string };
        const idx = mockProfiles.findIndex((item) => item.id === id);
        if (idx !== -1) mockProfiles.splice(idx, 1);
        return undefined;
      }
      if (channel === 'profile.update') {
        const { id, patch } = input as { id: string; patch: Record<string, unknown> };
        return {
          ...mockDetail,
          id,
          ...patch,
        };
      }
      return { ok: true };
    });

    if (window.tersoo) {
      window.tersoo.invoke = invokeMock;
    }
  });

  afterEach(() => {
    useProfilesStore.setState({
      profiles: [],
      selectedProfileDetail: null,
      selectedIds: new Set(),
      filterPlatform: 'all',
      filterState: 'all',
      filterTag: 'all',
      searchQuery: '',
      currentPage: 1,
    });
    vi.clearAllMocks();
  });

  it('renders the complete Profile Studio header, metric cards, and table', async () => {
    render(<App />);

    // Assert Header & Cards
    expect(screen.getByText('Profile Studio')).toBeInTheDocument();
    expect(screen.getByText('Total Profiles')).toBeInTheDocument();
    expect(screen.getByText('Active Instances')).toBeInTheDocument();
    expect(screen.getByText('Healthy Proxies')).toBeInTheDocument();
    expect(screen.getByText('Active Runs')).toBeInTheDocument();

    // Wait for profiles table load
    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
      expect(screen.getByText('Win11 Workstation 01')).toBeInTheDocument();
      expect(screen.getByText('macOS Sonoma Mini')).toBeInTheDocument();
    });

    // Check badges
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
    expect(screen.getByText('IDLE')).toBeInTheDocument();
    expect(screen.getByText('CRASHED')).toBeInTheDocument();
  });

  it('opens create profile modal, submits form, and creates a profile', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
    });

    // Click "New Profile" button
    const newProfileBtn = screen.getByRole('button', { name: /New Profile/i });
    fireEvent.click(newProfileBtn);

    // Modal should be visible
    expect(screen.getByText('Create New Profile')).toBeInTheDocument();

    // Fill form
    const nameInput = screen.getByPlaceholderText(/e\.g\. Pixel 8 Pro #04/i);
    fireEvent.change(nameInput, { target: { value: 'Marketing Agent Profile' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Create Profile/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('profile.create', expect.objectContaining({
        name: 'Marketing Agent Profile',
      }));
    });
  });

  it('triggers profile launch and stop with IPC commands', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Win11 Workstation 01')).toBeInTheDocument();
    });

    // Run button for idle profile
    const runBtn = screen.getAllByTitle('Launch Profile')[0]!;
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('profile.launch', { id: 'profile-2' });
    });

    // Stop button for running profile
    const stopBtn = screen.getAllByTitle('Stop Profile')[0]!;
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('profile.stop', { id: 'profile-1' });
    });
  });

  it('opens Profile Inspector side drawer when clicking a profile row', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
    });

    // Click on row
    fireEvent.click(screen.getByText('Pixel 8 Pro #04'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('profile.get', { id: 'profile-1' });
      expect(screen.getByText('Profile Inspector')).toBeInTheDocument();
      expect(screen.getByText('Hardware & Coherence')).toBeInTheDocument();
      expect(screen.getByText('Network & Proxy Tunnel')).toBeInTheDocument();
      expect(screen.getByText('Fingerprint Hashes')).toBeInTheDocument();
    });

    // Inspect drawer values from fingerprint bundle
    expect(screen.getByText('412 × 915')).toBeInTheDocument();
    expect(screen.getByText('Qualcomm / Adreno (TM) 750')).toBeInTheDocument();

    // Close drawer
    const closeBtn = screen.getByTitle('Close Inspector');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Profile Inspector')).not.toBeInTheDocument();
    });
  });

  it('handles real-time profile.state_changed event from main process', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Win11 Workstation 01')).toBeInTheDocument();
    });

    // Simulate backend state_changed event
    (window.tersoo as unknown as { __emit: (e: string, p: unknown) => void }).__emit(
      'profile.state_changed',
      { profileId: 'profile-2', state: 'running' },
    );

    await waitFor(() => {
      const state = useProfilesStore.getState().profiles.find((p) => p.id === 'profile-2');
      expect(state?.state).toBe('running');
    });
  });

  it('supports multi-select and bulk actions toolbar', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    // Select first row checkbox
    fireEvent.click(checkboxes[1]!);

    // Bulk action bar should appear
    await waitFor(() => {
      expect(screen.getByText(/1 profile selected/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Launch Selected/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Stop Selected/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Delete Selected/i })).toBeInTheDocument();
    });

    // Deselect all
    const deselectBtn = screen.getByRole('button', { name: /Deselect All/i });
    fireEvent.click(deselectBtn);

    await waitFor(() => {
      expect(screen.queryByText(/profile selected/i)).not.toBeInTheDocument();
    });
  });

  it('toggles between Table view and Grid view', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
    });

    // Switch to Grid view
    const gridBtn = screen.getByTitle('Grid Cards View');
    fireEvent.click(gridBtn);

    // Verify grid view active in store
    expect(useProfilesStore.getState().viewMode).toBe('grid');

    // Switch back to Table view
    const tableBtn = screen.getByTitle('Table View');
    fireEvent.click(tableBtn);

    expect(useProfilesStore.getState().viewMode).toBe('table');
  });

  it('supports duplicate/clone persona from dropdown menu', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
    });

    // Click more options button on first profile
    const moreBtns = screen.getAllByTitle('More Profile Options');
    fireEvent.click(moreBtns[0]!);

    // Click Duplicate Persona
    const duplicateBtn = screen.getByText('Duplicate Persona');
    fireEvent.click(duplicateBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('profile.create', expect.objectContaining({
        name: 'Pixel 8 Pro #04 (Copy)',
      }));
    });
  });

  it('opens and interacts with Import/Export modal', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
    });

    const importExportBtn = screen.getByTitle('Import or Export Profile JSON');
    fireEvent.click(importExportBtn);

    // Modal should be open
    await waitFor(() => {
      expect(screen.getByText('Export Profiles')).toBeInTheDocument();
      expect(screen.getByText('Import Profiles')).toBeInTheDocument();
    });

    // Switch to Import mode
    const importTab = screen.getByText('Import Profiles');
    fireEvent.click(importTab);

    expect(screen.getByPlaceholderText(/\[ { "name": "Imported Profile"/i)).toBeInTheDocument();

    // Cancel modal
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Export Profiles/i)).not.toBeInTheDocument();
    });
  });

  it('allows editing and saving notes directly inside Profile Inspector', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pixel 8 Pro #04')).toBeInTheDocument();
    });

    // Open inspector
    fireEvent.click(screen.getByText('Pixel 8 Pro #04'));

    await waitFor(() => {
      expect(screen.getByText('Notes & Remarks')).toBeInTheDocument();
    });

    // Edit notes textarea
    const notesTextarea = screen.getByPlaceholderText('Enter notes or account details for this profile...');
    fireEvent.change(notesTextarea, { target: { value: 'Updated farm account notes via inspector' } });

    // Click Save Notes
    const saveNotesBtn = screen.getByRole('button', { name: 'Save Notes' });
    fireEvent.click(saveNotesBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('profile.update', expect.objectContaining({
        id: 'profile-1',
        patch: expect.objectContaining({
          notes: 'Updated farm account notes via inspector',
        }),
      }));
    });
  });
});

