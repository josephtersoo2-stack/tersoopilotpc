import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskDetail, TaskSummary } from '@tersoo/contracts';

import { useTasksStore } from '../src/stores/tasksStore';
import { TaskStudioView } from '../src/views/TaskStudioView';

describe('Ticket 4.9: TaskStudioView & Visual Workflow Builder', () => {
  let mockTasks: TaskSummary[];
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTasks = [
      {
        id: '11111111-1111-4111-a111-111111111111',
        name: 'Login Canary',
        tags: ['smoke', 'canary'],
        schemaVersion: 1,
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 1800000,
      },
    ];

    invokeMock = vi.fn().mockImplementation(async (cmd: string, input?: unknown) => {
      if (cmd === 'task.list') {
        return mockTasks;
      }
      if (cmd === 'task.get') {
        const id = (input as { id: string }).id;
        const task = mockTasks.find((t) => t.id === id);
        if (!task) return null;
        const detail: TaskDetail = {
          ...task,
          definition: {
            schemaVersion: 1,
            name: task.name,
            variables: { baseUrl: 'https://example.com' },
            steps: [
              { type: 'navigate', url: '{{baseUrl}}', waitUntil: 'domcontentloaded' },
              { type: 'click', selector: 'button.login', humanized: true },
            ],
          },
        };
        return detail;
      }
      if (cmd === 'task.create') {
        const payload = input as { name: string; tags: string[]; definition: unknown };
        const newTask: TaskDetail = {
          id: '22222222-2222-4222-a222-222222222222',
          name: payload.name,
          tags: payload.tags || [],
          schemaVersion: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          definition: payload.definition as TaskDetail['definition'],
        };
        mockTasks.push({
          id: newTask.id,
          name: newTask.name,
          tags: newTask.tags,
          schemaVersion: newTask.schemaVersion,
          createdAt: newTask.createdAt,
          updatedAt: newTask.updatedAt,
        });
        return newTask;
      }
      if (cmd === 'task.dispatch') {
        return { runIds: ['33333333-3333-4333-a333-333333333333'] };
      }
      if (cmd === 'profile.list') {
        return [
          {
            id: '44444444-4444-4444-a444-444444444444',
            name: 'Profile 1',
            presetId: '00000000-0000-4000-8000-000000000001',
            platform: 'windows',
            state: 'idle',
            tags: ['worker'],
            proxyId: null,
            lastLaunchedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];
      }
      return null;
    });

    (window as unknown as { tersoo: { invoke: typeof invokeMock } }).tersoo = {
      invoke: invokeMock,
    };

    // Reset store
    useTasksStore.getState().createNewTask();
  });

  it('renders default workflow with steps and variables', async () => {
    render(<TaskStudioView />);

    expect(screen.getByPlaceholderText('Workflow Name')).toBeInTheDocument();
    expect(screen.getByText('Visual Builder')).toBeInTheDocument();
    expect(screen.getByText('JSON Editor')).toBeInTheDocument();

    // Verify initial steps exist
    expect(screen.getByDisplayValue('{{baseUrl}}')).toBeInTheDocument();
    expect(screen.getByDisplayValue('table')).toBeInTheDocument();
  });

  it('adds a new step to the workflow', async () => {
    render(<TaskStudioView />);

    const addClickBtn = screen.getByTestId('add-step-click');
    act(() => {
      fireEvent.click(addClickBtn);
    });

    const store = useTasksStore.getState();
    expect(store.currentWorkflow.steps.some((s) => s.type === 'click')).toBe(true);
  });

  it('detects undefined variable references and displays issues', async () => {
    render(<TaskStudioView />);

    const urlInput = screen.getByDisplayValue('{{baseUrl}}');
    act(() => {
      fireEvent.change(urlInput, { target: { value: '{{unresolvedDomain}}/login' } });
    });

    const store = useTasksStore.getState();
    expect(store.validationErrors.length).toBeGreaterThan(0);
    expect(screen.getByText(/Issue/i)).toBeInTheDocument();
  });

  it('switches between Visual Builder and JSON Editor with live sync', async () => {
    render(<TaskStudioView />);

    const jsonTabBtn = screen.getByRole('button', { name: /JSON Editor/i });
    act(() => {
      fireEvent.click(jsonTabBtn);
    });

    const textarea = screen.getByTestId('workflow-json-editor');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toContain('schemaVersion');

    // Switch back to visual
    const visualTabBtn = screen.getByRole('button', { name: /Visual Builder/i });
    act(() => {
      fireEvent.click(visualTabBtn);
    });

    expect(screen.getByPlaceholderText('Workflow Name')).toBeInTheDocument();
  });

  it('saves workflow and dispatches run', async () => {
    render(<TaskStudioView />);

    const saveBtn = screen.getByRole('button', { name: /Save Workflow/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(invokeMock).toHaveBeenCalledWith('task.create', expect.anything());

    const dispatchBtn = screen.getByRole('button', { name: /Dispatch Run/i });
    act(() => {
      fireEvent.click(dispatchBtn);
    });

    // Modal is open
    expect(screen.getByText('Dispatch Automation Workflow')).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Start Execution/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(invokeMock).toHaveBeenCalledWith('task.dispatch', expect.anything());
    await waitFor(() => {
      expect(screen.getByText(/Successfully Dispatched 1 Run/i)).toBeInTheDocument();
    });
  });
});
