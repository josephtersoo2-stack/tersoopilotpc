import type { Kysely } from 'kysely';
import { describe, expect, it, vi } from 'vitest';

import type { DB } from '../src/persistence/schema';
import { JobQueue } from '../src/queue/JobQueue';

describe('Ticket 0.9: JobQueue', () => {
  const dummyDb = {} as unknown as Kysely<DB>;

  it('enqueues jobs and processes them with priority order', async () => {
    const queue = new JobQueue(dummyDb, { concurrency: 1 });
    const processed: string[] = [];

    // Enqueue before attaching processor
    await queue.enqueue('low-priority', { name: 'job-1' }, 0);
    await queue.enqueue('high-priority', { name: 'job-2' }, 10);
    await queue.enqueue('mid-priority', { name: 'job-3' }, 5);

    expect(queue.size()).toBe(3);

    queue.process(async (job) => {
      processed.push((job.payload as { name: string }).name);
    });

    await queue.waitForIdle();

    expect(processed).toEqual(['job-2', 'job-3', 'job-1']);
    expect(queue.size()).toBe(0);
    expect(queue.activeCount()).toBe(0);
  });

  it('respects concurrency limits', async () => {
    const queue = new JobQueue(dummyDb, { concurrency: 2 });
    let maxActive = 0;
    let currentActive = 0;

    queue.process(async () => {
      currentActive++;
      if (currentActive > maxActive) {
        maxActive = currentActive;
      }
      await new Promise((r) => setTimeout(r, 20));
      currentActive--;
    });

    await Promise.all([
      queue.enqueue('t1', {}),
      queue.enqueue('t2', {}),
      queue.enqueue('t3', {}),
      queue.enqueue('t4', {}),
    ]);

    await queue.waitForIdle();
    expect(maxActive).toBe(2);
  });

  it('pauses, resumes, and cancels queued jobs', async () => {
    const queue = new JobQueue(dummyDb, { concurrency: 1 });
    const handler = vi.fn();

    queue.pause();
    expect(queue.isPaused()).toBe(true);

    const j1 = await queue.enqueue('task', { id: 1 });
    const j2 = await queue.enqueue('task', { id: 2 });

    queue.process(handler);

    // Queue is paused, nothing should be processed yet
    await new Promise((r) => setTimeout(r, 10));
    expect(handler).not.toHaveBeenCalled();

    // Cancel j1
    const cancelled = queue.cancel(j1);
    expect(cancelled).toBe(true);
    expect(queue.size()).toBe(1);

    // Resume
    queue.resume();
    expect(queue.isPaused()).toBe(false);

    await queue.waitForIdle();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: j2 }));
  });

  it('clears pending jobs', async () => {
    const queue = new JobQueue(dummyDb);
    queue.pause();

    await queue.enqueue('t1', {});
    await queue.enqueue('t2', {});
    expect(queue.size()).toBe(2);

    queue.clear();
    expect(queue.size()).toBe(0);
  });
});
