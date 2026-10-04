import { describe, expect, it } from 'vitest';

import {
  ProfileCreateInput,
  ProfileDetail,
  ProfileSummary,
  ProfileUpdateInput,
} from '../src/profile';

describe('Contracts: Profile', () => {
  const profileId = 'a1234567-e89b-12d3-a456-426614174000';
  const presetId = 'b1234567-e89b-12d3-a456-426614174000';

  it('validates ProfileSummary', () => {
    const summary = {
      id: profileId,
      name: 'QA Profile 1',
      tags: ['qa', 'test'],
      presetId,
      state: 'idle',
      platform: 'windows',
      engine: 'apostate' as const,
      captchaBudgetUsed: 0,
      proxyId: null,
      lastLaunchedAt: null,
      createdAt: 1727500000000,
      updatedAt: 1727500000000,
    };
    expect(ProfileSummary.parse(summary)).toEqual(summary);
  });

  it('validates ProfileCreateInput with defaults', () => {
    const input = {
      name: 'New Profile',
      presetId,
    };
    const parsed = ProfileCreateInput.parse(input);
    expect(parsed.tags).toEqual([]);
    expect(parsed.name).toBe('New Profile');
  });

  it('validates ProfileUpdateInput', () => {
    const input = {
      name: 'Updated Profile',
      tags: ['updated'],
      notes: null,
    };
    expect(ProfileUpdateInput.parse(input)).toEqual(input);
  });

  it('rejects invalid names in ProfileCreateInput', () => {
    expect(() => ProfileCreateInput.parse({ name: '', presetId })).toThrow();
    expect(() => ProfileCreateInput.parse({ name: 'a'.repeat(121), presetId })).toThrow();
  });
});
