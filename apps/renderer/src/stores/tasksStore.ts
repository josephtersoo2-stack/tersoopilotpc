import {
  Workflow as WorkflowSchema,
  type DispatchInput,
  type Step,
  type TaskDetail,
  type TaskSummary,
  type Workflow,
} from '@tersoo/contracts';
import { create } from 'zustand';

import { invokeIpc } from '../lib/ipc';

export type TaskStudioTab = 'visual' | 'json';

export interface TasksState {
  tasks: TaskSummary[];
  selectedTaskId: string | null;
  selectedTaskDetail: TaskDetail | null;
  currentWorkflow: Workflow;
  jsonContent: string;
  activeTab: TaskStudioTab;
  validationErrors: string[];
  isLoading: boolean;
  isSaving: boolean;
  isDispatching: boolean;
  isDirty: boolean;
  isDispatchModalOpen: boolean;
  lastRunIds: string[] | null;
  error: string | null;

  // Actions
  loadTasks: (autoSelectFirst?: boolean) => Promise<void>;
  selectTask: (id: string | null) => Promise<void>;
  createNewTask: (name?: string) => void;
  updateWorkflowName: (name: string) => void;
  setWorkflowVariable: (key: string, value: string) => void;
  removeWorkflowVariable: (key: string) => void;
  addStep: (type: Step['type']) => void;
  updateStep: (index: number, step: Step) => void;
  removeStep: (index: number) => void;
  moveStep: (fromIndex: number, toIndex: number) => void;
  setActiveTab: (tab: TaskStudioTab) => void;
  updateJsonContent: (json: string) => void;
  validateCurrent: () => boolean;
  saveTask: (name?: string, tags?: string[]) => Promise<TaskDetail | null>;
  deleteTask: (id: string) => Promise<void>;
  openDispatchModal: () => void;
  closeDispatchModal: () => void;
  dispatchTask: (
    targets: DispatchInput['targets'],
    options?: DispatchInput['options'],
  ) => Promise<{ runIds: string[] }>;
}

const DEFAULT_WORKFLOW: Workflow = {
  schemaVersion: 1,
  name: 'New Automation Workflow',
  variables: {
    baseUrl: 'https://bot.sannysoft.com',
  },
  steps: [
    {
      type: 'navigate',
      url: '{{baseUrl}}',
      waitUntil: 'domcontentloaded',
    },
    {
      type: 'waitFor',
      selector: 'table',
      timeoutMs: 15000,
    },
    {
      type: 'scroll',
      direction: 'down',
      amount: 400,
      kinetic: true,
    },
  ],
};

function createDefaultStep(type: Step['type']): Step {
  switch (type) {
    case 'navigate':
      return { type: 'navigate', url: 'https://example.com', waitUntil: 'domcontentloaded' };
    case 'waitFor':
      return { type: 'waitFor', selector: 'body', timeoutMs: 15000 };
    case 'waitForUrl':
      return { type: 'waitForUrl', url: 'https://example.com', timeoutMs: 15000 };
    case 'click':
      return { type: 'click', selector: 'button.primary', humanized: true };
    case 'hover':
      return { type: 'hover', selector: 'button.primary', humanized: true };
    case 'mouseMove':
      return { type: 'mouseMove', selector: 'button.primary', humanized: true };
    case 'type':
      return { type: 'type', selector: 'input[name="search"]', text: 'Hello World', humanized: true };
    case 'scroll':
      return { type: 'scroll', direction: 'down', amount: 500, kinetic: true };
    case 'extract':
      return { type: 'extract', selector: 'h1', as: 'extractedHeading' };
    case 'screenshot':
      return { type: 'screenshot', name: 'step-screenshot' };
    case 'sleep':
      return { type: 'sleep', minMs: 1000, maxMs: 2500 };
    case 'llm':
      return { type: 'llm', goal: 'Complete task goal with AI', maxIterations: 10 };
    case 'engage':
      return { type: 'engage', action: 'like', optional: true };
    case 'goBack':
      return { type: 'goBack', timeoutMs: 30000 };
    case 'repeat':
      return {
        type: 'repeat',
        times: 2,
        label: 'Loop',
        continueOnError: false,
        steps: [{ type: 'sleep', minMs: 1000, maxMs: 2000 }],
      };
    default:
      return { type: 'navigate', url: 'https://example.com', waitUntil: 'domcontentloaded' };
  }
}

function validateWorkflowClient(workflow: Workflow): string[] {
  const result = WorkflowSchema.safeParse(workflow);
  const errors: string[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      errors.push(`${path ? `[${path}] ` : ''}${issue.message}`);
    }
  }

  // Variable validation
  const definedVariables = new Set(Object.keys(workflow.variables || {}));
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (!step) continue;

    if (step.type === 'extract') {
      definedVariables.add(step.as);
    }

    const checkString = (str: string, field: string) => {
      const matches = str.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g);
      if (matches) {
        for (const m of matches) {
          const varName = m.slice(2, -2).trim();
          if (!definedVariables.has(varName)) {
            errors.push(`Step ${i + 1} (${step.type}.${field}) references undefined variable '{{${varName}}}'`);
          }
        }
      }
    };

    if (step.type === 'navigate') checkString(step.url, 'url');
    if (step.type === 'waitFor') checkString(step.selector, 'selector');
    if (step.type === 'waitForUrl') checkString(step.url, 'url');
    if (step.type === 'click') checkString(step.selector, 'selector');
    if (step.type === 'hover') checkString(step.selector, 'selector');
    if (step.type === 'mouseMove' && step.selector) checkString(step.selector, 'selector');
    if (step.type === 'type') {
      checkString(step.selector, 'selector');
      checkString(step.text, 'text');
    }
    if (step.type === 'extract') checkString(step.selector, 'selector');
    if (step.type === 'screenshot') checkString(step.name, 'name');
    if (step.type === 'engage' && step.commentText) checkString(step.commentText, 'commentText');
  }

  return errors;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  selectedTaskDetail: null,
  currentWorkflow: DEFAULT_WORKFLOW,
  jsonContent: JSON.stringify(DEFAULT_WORKFLOW, null, 2),
  activeTab: 'visual',
  validationErrors: [],
  isLoading: false,
  isSaving: false,
  isDispatching: false,
  isDirty: false,
  isDispatchModalOpen: false,
  lastRunIds: null,
  error: null,

  loadTasks: async (autoSelectFirst = false) => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await invokeIpc('task.list');
      set({ tasks: tasks || [], isLoading: false });
      if (autoSelectFirst && tasks && tasks.length > 0 && !get().selectedTaskId) {
        const yt = tasks.find((t) => t.name.toLowerCase().includes('youtube'));
        const targetId = yt ? yt.id : tasks[0]!.id;
        void get().selectTask(targetId);
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load tasks',
        isLoading: false,
      });
    }
  },

  selectTask: async (id: string | null) => {
    if (!id) {
      set({
        selectedTaskId: null,
        selectedTaskDetail: null,
        currentWorkflow: DEFAULT_WORKFLOW,
        jsonContent: JSON.stringify(DEFAULT_WORKFLOW, null, 2),
        validationErrors: [],
        isDirty: false,
      });
      return;
    }

    set({ isLoading: true, error: null, selectedTaskId: id });
    try {
      const detail = await invokeIpc('task.get', { id });
      if (detail) {
        set({
          selectedTaskDetail: detail,
          currentWorkflow: detail.definition,
          jsonContent: JSON.stringify(detail.definition, null, 2),
          validationErrors: [],
          isLoading: false,
          isDirty: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch task detail',
        isLoading: false,
      });
    }
  },

  createNewTask: (name = 'New Automation Workflow') => {
    const wf: Workflow = {
      ...DEFAULT_WORKFLOW,
      name,
    };
    set({
      selectedTaskId: null,
      selectedTaskDetail: null,
      currentWorkflow: wf,
      jsonContent: JSON.stringify(wf, null, 2),
      validationErrors: [],
      isDirty: true,
      error: null,
    });
  },

  updateWorkflowName: (name: string) => {
    const current = get().currentWorkflow;
    const updated: Workflow = { ...current, name };
    const errs = validateWorkflowClient(updated);
    set({
      currentWorkflow: updated,
      jsonContent: JSON.stringify(updated, null, 2),
      validationErrors: errs,
      isDirty: true,
    });
  },

  setWorkflowVariable: (key: string, value: string) => {
    const current = get().currentWorkflow;
    const updated: Workflow = {
      ...current,
      variables: {
        ...current.variables,
        [key]: value,
      },
    };
    const errs = validateWorkflowClient(updated);
    set({
      currentWorkflow: updated,
      jsonContent: JSON.stringify(updated, null, 2),
      validationErrors: errs,
      isDirty: true,
    });
  },

  removeWorkflowVariable: (key: string) => {
    const current = get().currentWorkflow;
    const newVars = { ...current.variables };
    delete newVars[key];
    const updated: Workflow = {
      ...current,
      variables: newVars,
    };
    const errs = validateWorkflowClient(updated);
    set({
      currentWorkflow: updated,
      jsonContent: JSON.stringify(updated, null, 2),
      validationErrors: errs,
      isDirty: true,
    });
  },

  addStep: (type: Step['type']) => {
    const current = get().currentWorkflow;
    const newStep = createDefaultStep(type);
    const updated: Workflow = {
      ...current,
      steps: [...current.steps, newStep],
    };
    const errs = validateWorkflowClient(updated);
    set({
      currentWorkflow: updated,
      jsonContent: JSON.stringify(updated, null, 2),
      validationErrors: errs,
      isDirty: true,
    });
  },

  updateStep: (index: number, step: Step) => {
    const current = get().currentWorkflow;
    const nextSteps = [...current.steps];
    nextSteps[index] = step;
    const updated: Workflow = {
      ...current,
      steps: nextSteps,
    };
    const errs = validateWorkflowClient(updated);
    set({
      currentWorkflow: updated,
      jsonContent: JSON.stringify(updated, null, 2),
      validationErrors: errs,
      isDirty: true,
    });
  },

  removeStep: (index: number) => {
    const current = get().currentWorkflow;
    if (current.steps.length <= 1) return;
    const nextSteps = current.steps.filter((_, idx) => idx !== index);
    const updated: Workflow = {
      ...current,
      steps: nextSteps,
    };
    const errs = validateWorkflowClient(updated);
    set({
      currentWorkflow: updated,
      jsonContent: JSON.stringify(updated, null, 2),
      validationErrors: errs,
      isDirty: true,
    });
  },

  moveStep: (fromIndex: number, toIndex: number) => {
    const current = get().currentWorkflow;
    if (toIndex < 0 || toIndex >= current.steps.length) return;
    const nextSteps = [...current.steps];
    const [moved] = nextSteps.splice(fromIndex, 1);
    if (!moved) return;
    nextSteps.splice(toIndex, 0, moved);
    const updated: Workflow = {
      ...current,
      steps: nextSteps,
    };
    const errs = validateWorkflowClient(updated);
    set({
      currentWorkflow: updated,
      jsonContent: JSON.stringify(updated, null, 2),
      validationErrors: errs,
      isDirty: true,
    });
  },

  setActiveTab: (tab: TaskStudioTab) => {
    if (tab === 'visual' && get().activeTab === 'json') {
      try {
        const parsed = JSON.parse(get().jsonContent) as Workflow;
        const errs = validateWorkflowClient(parsed);
        set({
          currentWorkflow: parsed,
          validationErrors: errs,
          activeTab: tab,
        });
      } catch (e) {
        set({
          validationErrors: [`Malformed JSON: ${e instanceof Error ? e.message : 'Invalid JSON'}`],
          activeTab: tab,
        });
      }
    } else if (tab === 'json' && get().activeTab === 'visual') {
      set({
        jsonContent: JSON.stringify(get().currentWorkflow, null, 2),
        activeTab: tab,
      });
    } else {
      set({ activeTab: tab });
    }
  },

  updateJsonContent: (json: string) => {
    set({ jsonContent: json, isDirty: true });
    try {
      const parsed = JSON.parse(json) as Workflow;
      const errs = validateWorkflowClient(parsed);
      set({ currentWorkflow: parsed, validationErrors: errs });
    } catch (e) {
      set({
        validationErrors: [`JSON Syntax Error: ${e instanceof Error ? e.message : 'Invalid JSON'}`],
      });
    }
  },

  validateCurrent: () => {
    const current = get().currentWorkflow;
    const errs = validateWorkflowClient(current);
    set({ validationErrors: errs });
    return errs.length === 0;
  },

  saveTask: async (name?: string, tags?: string[]) => {
    const { currentWorkflow, selectedTaskId } = get();
    if (!get().validateCurrent()) {
      return null;
    }

    set({ isSaving: true, error: null });
    try {
      const taskName = name || currentWorkflow.name;
      const taskTags = tags || ['automation'];
      let detail: TaskDetail;

      if (selectedTaskId) {
        detail = await invokeIpc('task.update', {
          id: selectedTaskId,
          name: taskName,
          tags: taskTags,
          definition: currentWorkflow,
        });
      } else {
        detail = await invokeIpc('task.create', {
          name: taskName,
          tags: taskTags,
          definition: currentWorkflow,
        });
      }

      await get().loadTasks(false);
      set({
        selectedTaskId: detail.id,
        selectedTaskDetail: detail,
        isSaving: false,
        isDirty: false,
      });
      return detail;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to save task',
        isSaving: false,
      });
      return null;
    }
  },

  deleteTask: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await invokeIpc('task.delete', { id });
      if (get().selectedTaskId === id) {
        get().createNewTask();
      }
      await get().loadTasks();
      set({ isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete task',
        isLoading: false,
      });
    }
  },

  openDispatchModal: () => set({ isDispatchModalOpen: true }),
  closeDispatchModal: () => set({ isDispatchModalOpen: false }),

  dispatchTask: async (targets, options) => {
    const { selectedTaskId } = get();
    set({ isDispatching: true, error: null, lastRunIds: null });

    try {
      let taskId = selectedTaskId;
      if (!taskId) {
        const saved = await get().saveTask();
        if (!saved) {
          throw new Error('Please save the workflow first before dispatching.');
        }
        taskId = saved.id;
      }

      const result = await invokeIpc('task.dispatch', {
        taskId,
        targets,
        options: {
          concurrency: options?.concurrency ?? 5,
          staggerMinMs: options?.staggerMinMs ?? 10000,
          staggerMaxMs: options?.staggerMaxMs ?? 30000,
          failurePolicy: options?.failurePolicy ?? 'retry',
          maxAttempts: options?.maxAttempts ?? 3,
        },
      });

      set({
        isDispatching: false,
        lastRunIds: result.runIds,
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch workflow';
      set({ isDispatching: false, error: msg });
      throw err;
    }
  },
}));
