/**
 * tests/showcase.test.ts
 *
 * Unit tests for the showcase page's data-transformation logic.
 * No rendering — pure filtering, sorting, slicing, and badge helpers.
 */

import { describe, it, expect } from 'vitest';

// ── Mirror the types and constants from showcase/page.tsx ─────────────────

const TOP_N = 12;
const PRIMARY_LIMIT = 125;

interface AdVariant {
  imageResult: { localPath: string; width: number; height: number; seed: number };
  visualEvaluation: { aggregateScore: number; passesThreshold: boolean; scores: unknown[] };
}

interface AdEntry {
  ad: { id: string; primaryText: string; headline: string; description: string; ctaButton: string; briefId: string };
  evaluation: { aggregateScore: number };
  iterationHistory: { cycles: unknown[]; estimatedCostUsd: number };
  isCombinedEntry?: boolean;
  selectedVariant?: AdVariant;
  combinedScore?: number;
}

type ImageAdEntry = AdEntry & { selectedVariant: AdVariant; combinedScore: number };

// ── Mirror the filtering and sorting logic ────────────────────────────────

function filterImageAds(entries: AdEntry[]): ImageAdEntry[] {
  return entries.filter(
    (e): e is ImageAdEntry =>
      e.isCombinedEntry === true &&
      e.selectedVariant != null &&
      e.combinedScore != null,
  );
}

function getTopAds(imageAds: ImageAdEntry[]): ImageAdEntry[] {
  return [...imageAds]
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, TOP_N);
}

function truncatePrimaryText(text: string): string {
  if (text.length > PRIMARY_LIMIT) {
    return text.slice(0, PRIMARY_LIMIT);
  }
  return text;
}

function combinedScoreBadge(score: number): string {
  if (score >= 8.0) return 'bg-green-100 text-green-800';
  if (score >= 7.5) return 'bg-orange-100 text-orange-800';
  return 'bg-yellow-100 text-yellow-800';
}

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeVariant(): AdVariant {
  return {
    imageResult: { localPath: '/tmp/test.jpg', width: 1200, height: 628, seed: 42 },
    visualEvaluation: {
      aggregateScore: 7.5,
      passesThreshold: true,
      scores: [{ dimension: 'brand_consistency', score: 7.5, rationale: 'ok', confidence: 'high' }],
    },
  };
}

function makeEntry(overrides: Partial<AdEntry> = {}): AdEntry {
  return {
    ad: {
      id: `ad-${Math.random().toString(36).slice(2)}`,
      primaryText: 'Test primary text',
      headline: 'Test headline',
      description: 'Test description',
      ctaButton: 'Learn More',
      briefId: 'brief-parents_anxious-conversion-question-run1',
    },
    evaluation: { aggregateScore: 7.5 },
    iterationHistory: { cycles: [{}], estimatedCostUsd: 0.03 },
    isCombinedEntry: true,
    selectedVariant: makeVariant(),
    combinedScore: 7.8,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('filterImageAds', () => {
  it('excludes entries where isCombinedEntry is false or missing', () => {
    const entries: AdEntry[] = [
      makeEntry({ isCombinedEntry: true }),
      makeEntry({ isCombinedEntry: false }),
      makeEntry({ isCombinedEntry: undefined }),
    ];

    const result = filterImageAds(entries);

    expect(result).toHaveLength(1);
    expect(result[0]!.isCombinedEntry).toBe(true);
  });

  it('excludes entries without selectedVariant', () => {
    const entries: AdEntry[] = [
      makeEntry({ selectedVariant: makeVariant() }),
      makeEntry({ selectedVariant: undefined }),
    ];

    const result = filterImageAds(entries);

    expect(result).toHaveLength(1);
    expect(result[0]!.selectedVariant).toBeDefined();
  });

  it('excludes entries without combinedScore', () => {
    const entries: AdEntry[] = [
      makeEntry({ combinedScore: 8.2 }),
      makeEntry({ combinedScore: undefined }),
    ];

    const result = filterImageAds(entries);

    expect(result).toHaveLength(1);
    expect(result[0]!.combinedScore).toBe(8.2);
  });
});

describe('getTopAds', () => {
  it('returns entries sorted by combinedScore descending', () => {
    const imageAds = [
      makeEntry({ combinedScore: 7.5 }),
      makeEntry({ combinedScore: 8.9 }),
      makeEntry({ combinedScore: 8.1 }),
    ] as ImageAdEntry[];

    const topAds = getTopAds(imageAds);

    expect(topAds[0]!.combinedScore).toBe(8.9);
    expect(topAds[1]!.combinedScore).toBe(8.1);
    expect(topAds[2]!.combinedScore).toBe(7.5);
  });

  it(`returns at most ${TOP_N} entries even when more are available`, () => {
    const imageAds = Array.from({ length: TOP_N + 5 }, (_, i) =>
      makeEntry({ combinedScore: 7.0 + i * 0.1 }),
    ) as ImageAdEntry[];

    const topAds = getTopAds(imageAds);

    expect(topAds).toHaveLength(TOP_N);
  });
});

describe('primary text truncation', () => {
  it(`truncates text longer than ${PRIMARY_LIMIT} chars at the limit`, () => {
    const longText = 'A'.repeat(PRIMARY_LIMIT + 50);
    const result = truncatePrimaryText(longText);

    expect(result).toHaveLength(PRIMARY_LIMIT);
    expect(result).toBe(longText.slice(0, PRIMARY_LIMIT));
  });

  it('returns text unchanged when at or below the limit', () => {
    const shortText = 'Short text that fits comfortably within the limit.';
    expect(truncatePrimaryText(shortText)).toBe(shortText);

    const exactText = 'A'.repeat(PRIMARY_LIMIT);
    expect(truncatePrimaryText(exactText)).toBe(exactText);
  });
});

describe('combinedScoreBadge', () => {
  it('returns green classes for score >= 8.0', () => {
    expect(combinedScoreBadge(8.0)).toBe('bg-green-100 text-green-800');
    expect(combinedScoreBadge(9.5)).toBe('bg-green-100 text-green-800');
  });

  it('returns orange classes for score in [7.5, 8.0)', () => {
    expect(combinedScoreBadge(7.5)).toBe('bg-orange-100 text-orange-800');
    expect(combinedScoreBadge(7.9)).toBe('bg-orange-100 text-orange-800');
  });

  it('returns yellow classes for score below 7.5', () => {
    expect(combinedScoreBadge(7.0)).toBe('bg-yellow-100 text-yellow-800');
    expect(combinedScoreBadge(5.0)).toBe('bg-yellow-100 text-yellow-800');
  });
});
