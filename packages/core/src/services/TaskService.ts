import crypto from 'node:crypto';

import {
  DispatchInput as DispatchInputSchema,
  TaskCreateInput as TaskCreateInputSchema,
  TaskUpdateInput as TaskUpdateInputSchema,
  type DispatchInput,
  type TaskCreateInput,
  type TaskUpdateInput,
  type TaskDetail,
  type TaskSummary,
} from '@tersoo/contracts';

import type { EventBus } from '../events/EventBus';
import type { Repos } from '../persistence/repos';
import type { JobQueue } from '../queue/JobQueue';
import { WorkflowValidator } from '../task/WorkflowValidator';
import { TaskError } from '../util/errors';

export interface TaskServiceDeps {
  repos: Repos;
  queue: JobQueue;
  events: EventBus;
}

export class TaskService {
  constructor(private readonly deps: TaskServiceDeps) {}

  async list(): Promise<TaskSummary[]> {
    const rows = await this.deps.repos.tasks.list();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tags: JSON.parse(row.tags || '[]') as string[],
      schemaVersion: row.schema_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getById(id: string): Promise<TaskDetail | null> {
    const row = await this.deps.repos.tasks.getById(id);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      tags: JSON.parse(row.tags || '[]') as string[],
      schemaVersion: row.schema_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      definition: JSON.parse(row.definition),
    };
  }

  async create(input: TaskCreateInput | unknown): Promise<TaskDetail> {
    const parsed = TaskCreateInputSchema.parse(input);
    WorkflowValidator.validate(parsed.definition);

    const now = Date.now();
    const id = crypto.randomUUID();
    const row = {
      id,
      name: parsed.name,
      schema_version: parsed.definition.schemaVersion,
      definition: JSON.stringify(parsed.definition),
      tags: JSON.stringify(parsed.tags ?? []),
      created_at: now,
      updated_at: now,
    };

    await this.deps.repos.tasks.create(row);

    const detail: TaskDetail = {
      id,
      name: parsed.name,
      tags: parsed.tags ?? [],
      schemaVersion: parsed.definition.schemaVersion,
      createdAt: now,
      updatedAt: now,
      definition: parsed.definition,
    };

    return detail;
  }

  async update(input: TaskUpdateInput | unknown): Promise<TaskDetail> {
    const parsed = TaskUpdateInputSchema.parse(input);
    const existing = await this.deps.repos.tasks.getById(parsed.id);
    if (!existing) {
      throw new TaskError('INTERNAL', `Task ${parsed.id} not found`);
    }

    if (parsed.definition) {
      WorkflowValidator.validate(parsed.definition);
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      updated_at: now,
    };
    if (parsed.name) patch.name = parsed.name;
    if (parsed.tags) patch.tags = JSON.stringify(parsed.tags);
    if (parsed.definition) {
      patch.definition = JSON.stringify(parsed.definition);
      patch.schema_version = parsed.definition.schemaVersion;
    }

    await this.deps.repos.tasks.update(parsed.id, patch);

    const updated = await this.getById(parsed.id);
    return updated!;
  }

  async delete(id: string): Promise<void> {
    await this.deps.repos.tasks.delete(id);
  }

  async dispatch(input: DispatchInput | unknown): Promise<{ runIds: string[] }> {
    const parsed = DispatchInputSchema.parse(input);
    const task = await this.deps.repos.tasks.getById(parsed.taskId);
    if (!task) {
      throw new TaskError('INTERNAL', `Task ${parsed.taskId} not found`);
    }

    let targetProfileIds: string[] = [];
    if (parsed.targets.all) {
      const profiles = await this.deps.repos.profiles.list();
      targetProfileIds = profiles.map((p) => p.id);
    } else if (parsed.targets.profileIds && parsed.targets.profileIds.length > 0) {
      targetProfileIds = parsed.targets.profileIds;
    } else if (parsed.targets.tags && parsed.targets.tags.length > 0) {
      const profiles = await this.deps.repos.profiles.list({ tags: parsed.targets.tags });
      targetProfileIds = profiles.map((p) => p.id);
    }

    if (parsed.options?.concurrency) {
      this.deps.queue.setConcurrency(parsed.options.concurrency);
    }

    const runIds: string[] = [];
    const now = Date.now();
    for (const profileId of targetProfileIds) {
      const runId = crypto.randomUUID();
      await this.deps.repos.runs.create({
        id: runId,
        task_id: task.id,
        profile_id: profileId,
        state: 'queued',
        idempotency_key: null,
        attempt: 1,
        checkpoint: null,
        error_class: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: now,
      });

      await this.deps.queue.enqueue('workflow.run', {
        runId,
        taskId: task.id,
        profileId,
        options: parsed.options,
      });

      runIds.push(runId);
    }

    return { runIds };
  }
}

