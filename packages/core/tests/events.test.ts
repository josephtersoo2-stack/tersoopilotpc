import { describe, expect, it, vi } from 'vitest';

import { EventBus } from '../src/events/EventBus';

describe('Ticket 0.9: EventBus', () => {
  it('subscribes, emits, and handles typed events', async () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.on('profile.state_changed', handler);
    expect(bus.listenerCount('profile.state_changed')).toBe(1);

    await bus.emit('profile.state_changed', {
      profileId: '123e4567-e89b-12d3-a456-426614174000',
      state: 'running',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      profileId: '123e4567-e89b-12d3-a456-426614174000',
      state: 'running',
    });

    unsub();
    expect(bus.listenerCount('profile.state_changed')).toBe(0);

    await bus.emit('profile.state_changed', {
      profileId: '123e4567-e89b-12d3-a456-426614174000',
      state: 'idle',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('once subscribes for a single event invocation', async () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.once('alert.raised', handler);
    expect(bus.listenerCount('alert.raised')).toBe(1);

    await bus.emit('alert.raised', {
      level: 'warn',
      title: 'Warning Title',
      message: 'Warning Message',
    });
    await bus.emit('alert.raised', {
      level: 'error',
      title: 'Error Title',
      message: 'Error Message',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('alert.raised')).toBe(0);
  });

  it('isolates listener errors and emits alert.raised', async () => {
    const bus = new EventBus();
    const alertHandler = vi.fn();
    bus.on('alert.raised', alertHandler);

    bus.on('proxy.health_changed', () => {
      throw new Error('Boom in listener');
    });

    await bus.emit('proxy.health_changed', {
      proxyId: '123e4567-e89b-12d3-a456-426614174000',
      status: 'dead',
    });

    expect(alertHandler).toHaveBeenCalledTimes(1);
    expect(alertHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'Boom in listener',
      }),
    );
  });

  it('removeAllListeners clears specific or all listeners', () => {
    const bus = new EventBus();
    bus.on('alert.raised', () => {});
    bus.on('profile.state_changed', () => {});

    expect(bus.listenerCount('alert.raised')).toBe(1);
    expect(bus.listenerCount('profile.state_changed')).toBe(1);

    bus.removeAllListeners('alert.raised');
    expect(bus.listenerCount('alert.raised')).toBe(0);
    expect(bus.listenerCount('profile.state_changed')).toBe(1);

    bus.removeAllListeners();
    expect(bus.listenerCount('profile.state_changed')).toBe(0);
  });
});
