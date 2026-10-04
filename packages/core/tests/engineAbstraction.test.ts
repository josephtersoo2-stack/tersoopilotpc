import { describe, expect, it } from 'vitest';
import { EngineFactory } from '../src/engines/EngineFactory';
import { ApostateEngine } from '../src/engines/apostate/ApostateEngine';
import { buildApostateArgs } from '../src/engines/apostate/buildArgs';
import { buildArgs as supervisorBuildArgs } from '../src/supervisor/buildArgs';

describe('Phase 2 — Engine Abstraction Layer', () => {
  it('instantiates EngineFactory and retrieves ApostateEngine', () => {
    const factory = new EngineFactory();
    expect(factory.hasEngine('apostate')).toBe(true);

    const engine = factory.getEngine('apostate');
    expect(engine).toBeInstanceOf(ApostateEngine);
    expect(engine.type).toBe('apostate');
  });

  it('throws when getting an unregistered engine', () => {
    const factory = new EngineFactory();
    expect(() => factory.getEngine('unregistered' as any)).toThrow('ENGINE_NOT_REGISTERED:unregistered');
  });

  it('produces byte-identical buildArgs compared to supervisor buildArgs', () => {
    const inputs = [
      {
        profileId: 'test-profile-1',
        userDataDir: 'C:\\Users\\Akende Micheal\\AppData\\Local\\tersoo\\profiles\\p1',
        forwarderPort: 12345,
        headless: true,
        additionalArgs: ['--lang=en-US', '--accept-lang=en-US,en'],
        leaseId: 'lease-abc',
        screen: { width: 1920, height: 1080, dpr: 1.25 },
      },
      {
        profileId: 'test-profile-2',
        userDataDir: '/tmp/profiles/p2',
        forwarderPort: 0,
        headless: false,
      },
    ];

    for (const input of inputs) {
      const apostateArgs = buildApostateArgs(input);
      const supervisorArgs = supervisorBuildArgs(input);

      expect(apostateArgs).toEqual(supervisorArgs);
      expect(JSON.stringify(apostateArgs)).toBe(JSON.stringify(supervisorArgs));
    }
  });
});
