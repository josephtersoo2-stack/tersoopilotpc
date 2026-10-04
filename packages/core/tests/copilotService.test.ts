import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CopilotService } from '../src/copilot/CopilotService';
import type { LlmService } from '../src/llm/LlmService';

describe('Tersoo Copilot Service', () => {
  let mockLlm: LlmService;
  let mockProfiles: any;
  let mockTasks: any;
  let mockNiches: any;
  let mockRuns: any;
  let copilotService: CopilotService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLlm = {
      chat: vi.fn(),
    } as unknown as LlmService;

    mockProfiles = {
      create: vi.fn().mockResolvedValue({ id: 'p-1', name: 'Gamer Profile 1' }),
      bulkCreate: vi.fn().mockResolvedValue([
        { id: 'p-1', name: 'Profile 1' },
        { id: 'p-2', name: 'Profile 2' },
      ]),
      launch: vi.fn().mockResolvedValue({ instance: { pid: 5678 } }),
      stop: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([
        { id: 'p-1', name: 'Gamer Profile 1', platform: 'windows', engine: 'apostate', state: 'idle', createdAt: 1000 },
        { id: 'p-2', name: 'Android Pixel', platform: 'android', engine: 'apostate', state: 'running', createdAt: 2000 },
      ]),
    };

    mockTasks = {
      create: vi.fn().mockResolvedValue({ id: 't-1', name: 'YouTube Watcher' }),
      dispatch: vi.fn().mockResolvedValue({ runIds: ['run-1'] }),
      list: vi.fn().mockResolvedValue([
        { id: 't-1', name: 'YouTube Watcher', tags: ['video'], definition: { steps: [{ type: 'navigate' }] } },
      ]),
    };

    mockNiches = {
      create: vi.fn().mockResolvedValue({ id: 'n-1', name: 'Flight Simulators', keywords: ['fs2024'] }),
    };

    mockRuns = {
      cancel: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([
        { id: 'run-1', profileId: 'p-2', taskId: 't-1', state: 'running', startedAt: Date.now() },
      ]),
    };

    copilotService = new CopilotService({
      llm: mockLlm,
      profiles: mockProfiles,
      tasks: mockTasks,
      niches: mockNiches,
      runs: mockRuns,
    });
  });

  describe('chat interaction', () => {
    it('returns conversational reply without actions when only asking questions', async () => {
      vi.spyOn(mockLlm, 'chat').mockResolvedValue(
        JSON.stringify({
          message: 'TersooPilot supports Apostate Chromium and Camoufox Firefox anti-detect engines.',
        }),
      );

      const res = await copilotService.chat({
        messages: [],
        context: { activeView: 'profiles' },
        userMessage: 'What engines are supported?',
      });

      expect(res.reply.role).toBe('assistant');
      expect(res.reply.content).toContain('Apostate Chromium');
      expect(res.reply.actions).toBeUndefined();
    });

    it('proposes structured action cards when requesting task generation', async () => {
      vi.spyOn(mockLlm, 'chat').mockResolvedValue(
        JSON.stringify({
          message: "I've drafted a task to search YouTube.",
          action: {
            type: 'create_task',
            title: 'Create YouTube Task',
            description: 'Automated search and watch',
            payload: {
              name: 'YouTube Search',
              workflow: {
                schemaVersion: 1,
                name: 'YouTube Search',
                steps: [
                  { type: 'navigate', url: 'https://youtube.com', waitUntil: 'domcontentloaded' },
                ],
              },
            },
          },
        }),
      );

      const res = await copilotService.chat({
        messages: [],
        context: { activeView: 'tasks' },
        userMessage: 'Create a task that searches YouTube',
      });

      expect(res.reply.actions).toHaveLength(1);
      expect(res.reply.actions![0]!.type).toBe('create_task');
      expect(res.reply.actions![0]!.title).toBe('Create YouTube Task');
    });

    it('handles image and document attachments in user turn', async () => {
      const chatSpy = vi.spyOn(mockLlm, 'chat').mockResolvedValue(
        JSON.stringify({
          message: 'I inspected your uploaded document and screenshot.',
        }),
      );

      await copilotService.chat({
        messages: [],
        context: { activeView: 'tasks' },
        userMessage: 'Look at this screenshot and spec',
        attachments: [
          {
            id: 'att-1',
            name: 'spec.md',
            type: 'markdown',
            size: 1024,
            textContent: '# Automation Spec\nNavigate to steam',
          },
          {
            id: 'att-2',
            name: 'screen.png',
            type: 'image',
            size: 2048,
            dataUrl: 'data:image/png;base64,iVBORw0KGgo...',
          },
        ],
      });

      expect(chatSpy).toHaveBeenCalled();
      const calledMessages = chatSpy.mock.calls[0]![0];
      const lastUserMsg = calledMessages[calledMessages.length - 1];
      expect(Array.isArray(lastUserMsg?.content)).toBe(true);
      const parts = lastUserMsg?.content as any[];
      expect(parts.some((p) => p.type === 'image_url')).toBe(true);
      expect(parts.some((p) => p.type === 'text' && p.text.includes('Automation Spec'))).toBe(true);
    });
  });

  /**
   * Proposes an action through chat() and then executes the returned card.
   *
   * executeAction deliberately only accepts an action the service itself
   * proposed, because the confirmation boundary has to live in the main
   * process rather than in a renderer-supplied flag. So the tests have to go
   * through the real propose-then-approve flow to obtain a valid capability.
   */
  async function proposeAndExecute(
    action: { type: string; title: string; description: string; payload: Record<string, unknown> },
  ) {
    vi.spyOn(mockLlm, 'chat').mockResolvedValue(
      JSON.stringify({ message: 'Proposed an action.', action }),
    );

    const chatRes = await copilotService.chat({
      messages: [],
      context: { activeView: 'profiles' },
      userMessage: 'do it',
    });

    const proposed = chatRes.reply.actions?.[0];
    expect(proposed).toBeDefined();
    expect(proposed?.actionToken).toBeTruthy();

    return copilotService.executeAction({ action: proposed! });
  }

  describe('executeAction', () => {
    it('refuses an action that was never proposed by the service', async () => {
      await expect(
        copilotService.executeAction({
          action: {
            id: 'act-forged',
            type: 'create_niche',
            title: 'Create Niche',
            description: 'never proposed',
            payload: { name: 'Forged', keywords: [] },
            requiresConfirmation: false,
            status: 'pending',
          },
        }),
      ).rejects.toThrow(/not proposed by Tersoo Copilot/);
      expect(mockNiches.create).not.toHaveBeenCalled();
    });

    it('rejects a replayed action token', async () => {
      vi.spyOn(mockLlm, 'chat').mockResolvedValue(
        JSON.stringify({
          message: 'Proposed an action.',
          action: {
            type: 'create_niche',
            title: 'Create Niche',
            description: 'once',
            payload: { name: 'Niche', keywords: ['a'] },
          },
        }),
      );
      const chatRes = await copilotService.chat({
        messages: [],
        context: { activeView: 'profiles' },
        userMessage: 'do it',
      });
      const proposed = chatRes.reply.actions![0]!;

      const first = await copilotService.executeAction({ action: proposed });
      expect(first.success).toBe(true);

      await expect(copilotService.executeAction({ action: proposed })).rejects.toThrow(
        /no longer valid/,
      );
      expect(mockNiches.create).toHaveBeenCalledTimes(1);
    });

    it('executes proposed action even after memory wipe (app restart simulation)', async () => {
      vi.spyOn(mockLlm, 'chat').mockResolvedValue(
        JSON.stringify({
          message: 'Proposed task.',
          action: {
            type: 'create_task',
            title: 'Restart Proof Task',
            description: 'Survives restart',
            payload: {
              name: 'Resilient Task',
              workflow: {
                schemaVersion: 1,
                name: 'Resilient Task',
                steps: [{ type: 'navigate', url: 'https://example.com' }],
              },
            },
          },
        }),
      );
      const chatRes = await copilotService.chat({
        messages: [],
        context: { activeView: 'tasks' },
        userMessage: 'create task',
      });
      const proposed = chatRes.reply.actions![0]!;
      expect(proposed.actionToken).toBeDefined();

      // Simulate app restart / memory wipe
      (copilotService as any).pendingActions.clear();

      // Action should still execute smoothly via cryptographic token verification!
      const res = await copilotService.executeAction({ action: proposed });
      expect(res.success).toBe(true);
      expect(mockTasks.create).toHaveBeenCalled();
    });

    it('does not burn token if execution fails, permitting safe user retry', async () => {
      vi.spyOn(mockLlm, 'chat').mockResolvedValue(
        JSON.stringify({
          message: 'Proposed task.',
          action: {
            type: 'create_task',
            title: 'Retry Task',
            description: 'Allows retry',
            payload: {
              name: 'Retry Task',
              workflow: {
                schemaVersion: 1,
                name: 'Retry Task',
                steps: [{ type: 'navigate', url: 'https://example.com' }],
              },
            },
          },
        }),
      );
      const chatRes = await copilotService.chat({
        messages: [],
        context: { activeView: 'tasks' },
        userMessage: 'create task',
      });
      const proposed = chatRes.reply.actions![0]!;

      // 1. Simulate transient failure on first attempt
      mockTasks.create.mockRejectedValueOnce(new Error('Transient SQLite Busy'));
      const firstAttempt = await copilotService.executeAction({ action: proposed });
      expect(firstAttempt.success).toBe(false);
      expect(firstAttempt.message).toContain('Transient SQLite Busy');

      // 2. Second attempt: token must NOT have been burned, retry succeeds!
      mockTasks.create.mockResolvedValueOnce({
        id: 't-success',
        name: 'Retry Task',
        definition: { steps: [] },
      });
      const secondAttempt = await copilotService.executeAction({ action: proposed });
      expect(secondAttempt.success).toBe(true);
      expect(secondAttempt.message).toContain('saved to Task Studio');
    });

    it('allows valid task creation fallback even if token is legacy or memory was cleared', async () => {
      const legacyAction: any = {
        id: 'legacy-id',
        type: 'create_task',
        title: 'Legacy Action Card',
        description: 'From previous session',
        payload: {
          name: 'Legacy Task',
          workflow: {
            schemaVersion: 1,
            name: 'Legacy Task',
            steps: [{ type: 'navigate', url: 'https://example.com' }],
          },
        },
        actionToken: 'old-random-uuid-token-from-disk',
        status: 'pending',
      };

      // Clear memory
      (copilotService as any).pendingActions.clear();

      mockTasks.create.mockResolvedValueOnce({
        id: 't-legacy',
        name: 'Legacy Task',
        definition: { steps: [] },
      });

      const res = await copilotService.executeAction({ action: legacyAction });
      expect(res.success).toBe(true);
      expect(mockTasks.create).toHaveBeenCalled();
    });

    it('executes create_task action with schema validation', async () => {
      const res = await proposeAndExecute({
        type: 'create_task',
        title: 'Save Task',
        description: 'Save task to Task Studio',
        payload: {
          name: 'Search Steam',
          workflow: {
            schemaVersion: 1,
            name: 'Search Steam',
            steps: [
              { type: 'navigate', url: 'https://store.steampowered.com', waitUntil: 'domcontentloaded' },
            ],
          },
        },
      });

      expect(res.success).toBe(true);
      expect(mockTasks.create).toHaveBeenCalled();
    });

    it('executes create_task action with numeric/boolean variables in workflow', async () => {
      const res = await proposeAndExecute({
        type: 'create_task',
        title: 'Watch YouTube Video',
        description: 'Warm-up with watch duration',
        payload: {
          name: 'YouTube Watch',
          workflow: {
            schemaVersion: 1,
            name: 'YouTube Watch',
            variables: {
              watchMs: 60000,
              query: 'eFootball',
              isMobile: true,
            },
            steps: [
              { type: 'navigate', url: 'https://youtube.com', waitUntil: 'domcontentloaded' },
              { type: 'sleep', minMs: 2000, maxMs: 4000 },
            ],
          },
        },
      });

      expect(res.success).toBe(true);
      expect(mockTasks.create).toHaveBeenCalled();
    });

    it('executes create_niche action', async () => {
      const res = await proposeAndExecute({
        type: 'create_niche',
        title: 'Create Flight Sim Niche',
        description: 'Niche with simulator keywords',
        payload: {
          name: 'Flight Simulators',
          keywords: ['msfs2024', 'xplane12'],
          seedUrls: ['https://flightsim.to'],
        },
      });

      expect(res.success).toBe(true);
      expect(mockNiches.create).toHaveBeenCalledWith({
        name: 'Flight Simulators',
        keywords: ['msfs2024', 'xplane12'],
        seedUrls: ['https://flightsim.to'],
      });
    });

    it('executes navigate action returning view payload', async () => {
      const res = await proposeAndExecute({
        type: 'navigate',
        title: 'Go to Task Studio',
        description: 'Switch view',
        payload: { view: 'tasks' },
      });

      expect(res.success).toBe(true);
      expect(res.result).toEqual({ view: 'tasks' });
    });

    it('self-heals invalid or legacy preset-chrome-win11 to a valid windows preset in bulk_create_profiles', async () => {
      const res = await proposeAndExecute({
        type: 'bulk_create_profiles',
        title: 'Create 2 Chromium Profiles',
        description: 'Bulk create profiles',
        payload: {
          count: 2,
          presetId: 'preset-chrome-win11',
          engineDistribution: { mode: 'single', engine: 'apostate' },
        },
      });

      expect(res.success).toBe(true);
      expect(mockProfiles.bulkCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 2,
          presetId: '00000000-0000-4000-8000-000000000001',
        }),
      );
    });

    it('resolves macos preset alias in create_profile', async () => {
      const res = await proposeAndExecute({
        type: 'create_profile',
        title: 'Create macOS Profile',
        description: 'Create single profile',
        payload: {
          name: 'Mac Workstation',
          presetId: 'macos',
          engine: 'apostate',
        },
      });

      expect(res.success).toBe(true);
      expect(mockProfiles.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Mac Workstation',
          presetId: '00000000-0000-4000-8000-000000000002',
        }),
      );
    });

    it('supports multi-profile items payload in bulk_create_profiles', async () => {
      const res = await proposeAndExecute({
        type: 'bulk_create_profiles',
        title: 'Create Mixed Profiles',
        description: 'Windows and macOS profiles',
        payload: {
          profiles: [
            { name: 'Win Profile', presetId: 'windows11', engine: 'apostate' },
            { name: 'Mac Profile', presetId: 'macosSonoma', engine: 'apostate' },
          ],
        },
      });

      expect(res.success).toBe(true);
      expect(mockProfiles.create).toHaveBeenCalledTimes(2);
      expect(mockProfiles.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          name: 'Win Profile',
          presetId: '00000000-0000-4000-8000-000000000001',
        }),
      );
      expect(mockProfiles.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          name: 'Mac Profile',
          presetId: '00000000-0000-4000-8000-000000000002',
        }),
      );
    });

    it('launches a specified profile via launch_profile action', async () => {
      const res = await proposeAndExecute({
        type: 'launch_profile',
        title: 'Launch Android Profile',
        description: 'Launch profile p-2',
        payload: {
          profileId: 'p-2',
          headless: false,
        },
      });

      expect(res.success).toBe(true);
      expect(mockProfiles.launch).toHaveBeenCalledWith('p-2', { headless: false });
      expect(res.result).toHaveProperty('pid', 5678);
    });

    it('launches the last created profile when profileId is "last"', async () => {
      // First create a profile
      await proposeAndExecute({
        type: 'create_profile',
        title: 'Create Profile',
        description: 'Create test profile',
        payload: { name: 'Recently Created Profile', presetId: 'windows11' },
      });

      // Now launch with profileId: 'last'
      const res = await proposeAndExecute({
        type: 'launch_profile',
        title: 'Launch Last Profile',
        description: 'Launch the profile just created',
        payload: { profileId: 'last' },
      });

      expect(res.success).toBe(true);
      expect(mockProfiles.launch).toHaveBeenCalledWith('p-1', { headless: false });
    });

    it('stops a specified profile via stop_profile action', async () => {
      const res = await proposeAndExecute({
        type: 'stop_profile',
        title: 'Stop Profile',
        description: 'Stop profile p-2',
        payload: { profileId: 'p-2' },
      });

      expect(res.success).toBe(true);
      expect(mockProfiles.stop).toHaveBeenCalledWith('p-2');
    });

    it('stops an active run via stop_run action', async () => {
      const res = await proposeAndExecute({
        type: 'stop_run',
        title: 'Stop Run',
        description: 'Cancel active run',
        payload: { runId: 'run-1' },
      });

      expect(res.success).toBe(true);
      expect(mockRuns.cancel).toHaveBeenCalledWith('run-1');
    });
  });

  describe('context awareness', () => {
    it('injects available profiles, tasks, and last created profile into the chat prompt context', async () => {
      vi.spyOn(mockLlm, 'chat').mockImplementation(async (messages: any) => {
        const userMsg = messages.find((m: any) => m.role === 'user');
        const text = typeof userMsg?.content === 'string' ? userMsg.content : '';
        // Verify context contains profiles, tasks, and last created profile
        expect(text).toContain('[AVAILABLE PROFILES]');
        expect(text).toContain('[LAST CREATED PROFILE]');
        expect(text).toContain('[AVAILABLE TASKS]');
        expect(text).toContain('[ACTIVE RUNS]');
        return JSON.stringify({ message: 'I see all your profiles and tasks.' });
      });

      const res = await copilotService.chat({
        messages: [],
        context: { activeView: 'profiles' },
        userMessage: 'What is the last profile I created?',
      });

      expect(res.reply.content).toContain('I see all your profiles and tasks.');
    });
  });
});
