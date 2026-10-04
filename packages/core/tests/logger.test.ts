import { describe, expect, it, vi } from 'vitest';

import { createLogger, type IEventAppender } from '../src/util/logger';

describe('Core: Logger', () => {
  it('creates scoped child logger and records events to eventRepo', () => {
    const mockAppender: IEventAppender = {
      append: vi.fn(),
    };

    const logger = createLogger({
      level: 'debug',
      eventRepo: mockAppender,
    });

    const child = logger.child('supervisor', { profileId: 'p-1' });

    child.debug('supervisor.debug_event', { key: 'val' });
    // debug does not persist to eventRepo by design in companion §6
    expect(mockAppender.append).not.toHaveBeenCalled();

    child.info('supervisor.ready', { pid: 1234 });
    expect(mockAppender.append).toHaveBeenCalledWith(
      'info',
      'supervisor',
      'supervisor.ready',
      { pid: 1234 },
      { profileId: 'p-1' },
    );

    child.warn('supervisor.warning', { retries: 2 });
    expect(mockAppender.append).toHaveBeenCalledWith(
      'warn',
      'supervisor',
      'supervisor.warning',
      { retries: 2 },
      { profileId: 'p-1' },
    );

    child.error('supervisor.error', { code: 'CRASH' });
    expect(mockAppender.append).toHaveBeenCalledWith(
      'error',
      'supervisor',
      'supervisor.error',
      { code: 'CRASH' },
      { profileId: 'p-1' },
    );
  });
});
