import { describe, expect, it } from 'vitest';
import {
  Id,
  Timestamp,
  Tags,
  Platform,
  ProxyProtocol,
  ProxyStatus,
  ProfileState,
  RunState,
  StepState,
  LogLevel,
  LogScope,
} from '../src/primitives';

describe('Contracts: Primitives', () => {
  it('validates UUIDs correctly', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(Id.parse(validUuid)).toBe(validUuid);
    expect(() => Id.parse('not-a-uuid')).toThrow();
    expect(() => Id.parse(12345)).toThrow();
  });

  it('validates non-negative integer timestamps', () => {
    const now = Date.now();
    expect(Timestamp.parse(now)).toBe(now);
    expect(Timestamp.parse(0)).toBe(0);
    expect(() => Timestamp.parse(-1)).toThrow();
    expect(() => Timestamp.parse(12.34)).toThrow();
    expect(() => Timestamp.parse('12345')).toThrow();
  });

  it('validates tags array constraints', () => {
    expect(Tags.parse(['qa', 'tier-1', 'active'])).toEqual(['qa', 'tier-1', 'active']);
    expect(Tags.parse([])).toEqual([]);
    expect(() => Tags.parse([''])).toThrow(); // min 1 char
    expect(() => Tags.parse(['a'.repeat(65)])).toThrow(); // max 64 chars
    expect(() => Tags.parse(Array.from({ length: 33 }, (_, i) => `tag-${i}`))).toThrow(); // max 32 items
  });

  it('validates enum values strictly', () => {
    expect(Platform.parse('windows')).toBe('windows');
    expect(Platform.parse('macos')).toBe('macos');
    expect(Platform.parse('android')).toBe('android');
    expect(() => Platform.parse('linux')).toThrow();

    expect(ProxyProtocol.parse('socks5')).toBe('socks5');
    expect(ProxyProtocol.parse('http')).toBe('http');
    expect(ProxyProtocol.parse('https')).toBe('https');
    expect(() => ProxyProtocol.parse('ftp')).toThrow();

    expect(ProxyStatus.parse('healthy')).toBe('healthy');
    expect(ProxyStatus.parse('dead')).toBe('dead');
    expect(() => ProxyStatus.parse('broken')).toThrow();

    expect(ProfileState.parse('idle')).toBe('idle');
    expect(ProfileState.parse('running')).toBe('running');
    expect(ProfileState.parse('crashed')).toBe('crashed');

    expect(RunState.parse('queued')).toBe('queued');
    expect(RunState.parse('succeeded')).toBe('succeeded');
    expect(RunState.parse('failed')).toBe('failed');

    expect(StepState.parse('pending')).toBe('pending');
    expect(StepState.parse('succeeded')).toBe('succeeded');

    expect(LogLevel.parse('info')).toBe('info');
    expect(LogLevel.parse('fatal')).toBe('fatal');

    expect(LogScope.parse('supervisor')).toBe('supervisor');
    expect(LogScope.parse('proxy')).toBe('proxy');
    expect(LogScope.parse('task')).toBe('task');
  });
});
