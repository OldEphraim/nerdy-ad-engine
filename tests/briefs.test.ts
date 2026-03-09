import { describe, it, expect } from 'vitest';
import { expandBriefs, generateBaseBriefs, OFFERS } from '../src/generate/briefs.js';

describe('generateBaseBriefs', () => {
  it('produces 24 base briefs (3 audiences × 2 goals × 4 hooks)', () => {
    const briefs = generateBaseBriefs();
    expect(briefs).toHaveLength(24);
  });
});

describe('expandBriefs', () => {
  const briefs = expandBriefs(75);

  it('returns exactly 75 entries', () => {
    expect(briefs).toHaveLength(75);
  });

  it('every brief has all required fields', () => {
    for (const b of briefs) {
      expect(b.id).toBeTruthy();
      expect(b.audience).toBeTruthy();
      expect(b.goal).toBeTruthy();
      expect(b.hookType).toBeTruthy();
      expect(b.offer).toBeTruthy();
      expect(b.tone).toBeTruthy();
    }
  });

  it('all audiences are represented', () => {
    const audiences = new Set(briefs.map(b => b.audience));
    expect(audiences).toContain('parents_anxious');
    expect(audiences).toContain('students_stressed');
    expect(audiences).toContain('comparison_shoppers');
  });

  it('all goals are represented', () => {
    const goals = new Set(briefs.map(b => b.goal));
    expect(goals).toContain('awareness');
    expect(goals).toContain('conversion');
  });

  it('all hook types are represented', () => {
    const hooks = new Set(briefs.map(b => b.hookType));
    expect(hooks).toContain('question');
    expect(hooks).toContain('stat');
    expect(hooks).toContain('story');
    expect(hooks).toContain('fear');
  });

  it('brief IDs include run numbers', () => {
    for (const b of briefs) {
      expect(b.id).toMatch(/-run\d+$/);
    }
  });

  it('offers rotate across runs of the same base brief', () => {
    // Find a base brief with multiple runs and a goal that has >1 offer
    const conversionBriefs = briefs.filter(b =>
      b.id.startsWith('brief-parents_anxious-conversion-question-')
    );
    expect(conversionBriefs.length).toBeGreaterThanOrEqual(2);

    // Conversion has 4 offers, so run1 and run2 should get different offers
    // (unless there's only 1 run, which won't happen with 75 total)
    const offers = conversionBriefs.map(b => b.offer);
    // At least the first two runs should differ since offer pool has >1 entry
    if (conversionBriefs.length >= 2) {
      // The offer pool cycles: index 0 -> offer[0], index 1 -> offer[1]
      const pool = OFFERS.conversion;
      expect(offers[0]).toBe(pool[0]);
      if (pool.length > 1) {
        expect(offers[1]).toBe(pool[1]);
      }
    }
  });
});
