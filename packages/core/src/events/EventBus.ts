import type { EventName, EventPayload } from '@tersoo/contracts';

export type EventHandler<E extends EventName> = (payload: EventPayload<E>) => void | Promise<void>;

type InternalHandler = (payload: unknown) => void | Promise<void>;

export class EventBus {
  private listeners = new Map<EventName, Set<InternalHandler>>();

  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as unknown as InternalHandler);

    return () => {
      this.off(event, handler);
    };
  }

  once<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    const wrapper: EventHandler<E> = async (payload) => {
      this.off(event, wrapper);
      await handler(payload);
    };
    return this.on(event, wrapper);
  }

  off<E extends EventName>(event: E, handler: EventHandler<E>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as unknown as InternalHandler);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  async emit<E extends EventName>(event: E, payload: EventPayload<E>): Promise<void> {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    const handlers = Array.from(set);
    for (const handler of handlers) {
      try {
        await (handler as unknown as EventHandler<E>)(payload);
      } catch (err: unknown) {
        if (event !== 'alert.raised') {
          void this.emit('alert.raised', {
            level: 'error',
            title: `Unhandled error in listener for ${event}`,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  listenerCount(event: EventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  removeAllListeners(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
