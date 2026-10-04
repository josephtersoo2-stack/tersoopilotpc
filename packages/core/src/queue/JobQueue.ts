import crypto from 'node:crypto';

import type { Kysely } from 'kysely';

import type { DB } from '../persistence/schema';

export type Job<T = Record<string, unknown>> = {
  id: string;
  type: string;
  payload: T;
  priority: number;
  createdAt: number;
};

export type JobHandler<T = Record<string, unknown>> = (job: Job<T>) => Promise<void>;

export class JobQueue {
  private queue: Array<Job<Record<string, unknown>>> = [];
  private activeJobs = new Map<string, Job<Record<string, unknown>>>();
  private handler: JobHandler<Record<string, unknown>> | null = null;
  private paused = false;
  private concurrency: number;
  private idleResolvers: Array<() => void> = [];

  constructor(
    private db: Kysely<DB>,
    options: { concurrency?: number } = {},
  ) {
    this.concurrency = options.concurrency ?? 5;
  }

  getDb(): Kysely<DB> {
    return this.db;
  }

  setConcurrency(limit: number): void {
    this.concurrency = Math.max(1, limit);
    this.pump();
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  enqueue<T extends Record<string, unknown>>(
    type: string,
    payload: T,
    priority = 0,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const job: Job<Record<string, unknown>> = {
      id,
      type,
      payload,
      priority,
      createdAt: Date.now(),
    };

    // Insert sorted by priority desc, then createdAt asc
    const index = this.queue.findIndex(
      (j) => j.priority < priority || (j.priority === priority && j.createdAt > job.createdAt),
    );
    if (index === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(index, 0, job);
    }

    this.pump();
    return Promise.resolve(id);
  }

  process(handler: JobHandler<Record<string, unknown>>): void {
    this.handler = handler;
    this.pump();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (this.paused) {
      this.paused = false;
      this.pump();
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  size(): number {
    return this.queue.length;
  }

  activeCount(): number {
    return this.activeJobs.size;
  }

  cancel(jobId: string): boolean {
    const idx = this.queue.findIndex((j) => j.id === jobId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  clear(): void {
    this.queue = [];
  }

  async waitForIdle(): Promise<void> {
    if (this.queue.length === 0 && this.activeJobs.size === 0) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private pump(): void {
    if (this.paused || !this.handler) return;

    while (this.activeJobs.size < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      this.activeJobs.set(job.id, job);
      const currentHandler = this.handler;

      void (async () => {
        try {
          await currentHandler(job);
        } catch {
          // Worker error handled by consumer
        } finally {
          this.activeJobs.delete(job.id);
          if (this.queue.length === 0 && this.activeJobs.size === 0) {
            const resolvers = this.idleResolvers;
            this.idleResolvers = [];
            for (const resolve of resolvers) {
              resolve();
            }
          }
          this.pump();
        }
      })();
    }
  }
}
