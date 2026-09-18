import { describe, expect, it } from 'vitest';
import { pageQuerySchema, socialPostInputSchema, teamEventInputSchema } from './redesign';

describe('redesign domain schemas', () => {
  it('caps pagination and rejects client identity fields', () => {
    expect(pageQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    const parsed = socialPostInputSchema.parse({ body: '  Training update  ', authorId: 999 });
    expect(parsed).toEqual({ body: 'Training update', visibility: 'public' });
    expect('authorId' in parsed).toBe(false);
  });

  it('requires an event end after its start', () => {
    expect(
      teamEventInputSchema.safeParse({
        title: 'Run',
        description: 'Intervals',
        startsAt: '2026-09-18T12:00:00Z',
        endsAt: '2026-09-18T11:00:00Z',
        location: 'Track',
      }).success,
    ).toBe(false);
  });
});
