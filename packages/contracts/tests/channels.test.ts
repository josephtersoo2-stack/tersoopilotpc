import { describe, expect, it } from 'vitest';

import { Commands } from '../src/channels';
import { Events } from '../src/events';

describe('Contracts: Commands and Events Channels', () => {
  it('has all required commands defined with input/output schemas', () => {
    const commandNames = Object.keys(Commands);
    expect(commandNames).toContain('profile.list');
    expect(commandNames).toContain('profile.get');
    expect(commandNames).toContain('profile.create');
    expect(commandNames).toContain('profile.update');
    expect(commandNames).toContain('profile.delete');
    expect(commandNames).toContain('profile.launch');
    expect(commandNames).toContain('profile.stop');

    expect(commandNames).toContain('proxy.list');
    expect(commandNames).toContain('proxy.create');
    expect(commandNames).toContain('proxy.importBulk');
    expect(commandNames).toContain('proxy.check');
    expect(commandNames).toContain('proxy.assign');
    expect(commandNames).toContain('proxy.release');
    expect(commandNames).toContain('proxy.swap');
    expect(commandNames).toContain('proxy.delete');

    expect(commandNames).toContain('task.list');
    expect(commandNames).toContain('task.create');
    expect(commandNames).toContain('task.dispatch');

    expect(commandNames).toContain('run.list');
    expect(commandNames).toContain('run.cancel');
    expect(commandNames).toContain('run.resume');

    expect(commandNames).toContain('fleet.status');
    expect(commandNames).toContain('logs.query');
    expect(commandNames).toContain('engine.list');
    expect(commandNames).toContain('engine.config.get');
    expect(commandNames).toContain('engine.config.set');
    expect(commandNames).toContain('llm.config.get');
    expect(commandNames).toContain('llm.config.set');
    expect(commandNames).toContain('captcha.events.list');
    expect(commandNames).toContain('captcha.budget.get');
    expect(commandNames).toContain('settings.weights.get');
    expect(commandNames).toContain('settings.weights.set');
    expect(commandNames).toContain('profile.bulkCreate');
  });

  it('validates command inputs and outputs', () => {
    const launchInput = { id: '11111111-1111-1111-1111-111111111111' };
    expect(Commands['profile.launch'].input.parse(launchInput)).toEqual(launchInput);
    expect(Commands['profile.launch'].output.parse({ runId: launchInput.id })).toEqual({
      runId: launchInput.id,
    });

    const logsQuery = { limit: 50 };
    const parsedLogs = Commands['logs.query'].input.parse(logsQuery);
    expect(parsedLogs.limit).toBe(50);
  });

  it('validates event schemas', () => {
    const stateChangeEvent = {
      profileId: '11111111-1111-1111-1111-111111111111',
      state: 'running',
    };
    expect(Events['profile.state_changed'].parse(stateChangeEvent)).toEqual(stateChangeEvent);

    const alertEvent = {
      level: 'error',
      title: 'Crash Detected',
      message: 'Process exited unexpectedly',
    };
    expect(Events['alert.raised'].parse(alertEvent)).toEqual(alertEvent);
  });
});
