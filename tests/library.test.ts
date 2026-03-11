import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { estimateCost, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN, RATCHET_MIN_SCORE, RATCHET_POOL_SIZE } from '../src/types.js';
import { getQualityTrend } from '../src/output/trends.js';
import { updateRatchetPool, readRatchetPool } from '../src/output/library.js';
import type { AdLibraryEntry, GeneratedAd, EvaluationResult, IterationRecord, DimensionScore, CombinedAdEntryV3 } from '../src/types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('estimateCost', () => {
  it('computes correctly for known token counts', () => {
    // 1000 input tokens at $0.80/1M = $0.0008
    // 500 output tokens at $4.00/1M = $0.002
    const cost = estimateCost(1000, 500);
    expect(cost).toBeCloseTo(0.0008 + 0.002, 6);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCost(0, 0)).toBe(0);
  });

  it('matches the documented Haiku pricing', () => {
    // $0.80 per 1M input tokens
    expect(COST_PER_INPUT_TOKEN).toBeCloseTo(0.0000008, 10);
    // $4.00 per 1M output tokens
    expect(COST_PER_OUTPUT_TOKEN).toBeCloseTo(0.000004, 10);
  });

  it('scales linearly with token count', () => {
    const cost1 = estimateCost(1000, 1000);
    const cost2 = estimateCost(2000, 2000);
    expect(cost2).toBeCloseTo(cost1 * 2, 10);
  });
});

// ── Fixtures for trend tests ──────────────────────────────────────────────

function makeDimScores(aggregate: number): DimensionScore[] {
  // Distribute the aggregate equally across dimensions for simplicity
  const score = aggregate;
  return [
    { dimension: 'clarity', score, rationale: 'test', confidence: 'high' },
    { dimension: 'value_proposition', score, rationale: 'test', confidence: 'high' },
    { dimension: 'call_to_action', score, rationale: 'test', confidence: 'high' },
    { dimension: 'brand_voice', score, rationale: 'test', confidence: 'high' },
    { dimension: 'emotional_resonance', score, rationale: 'test', confidence: 'high' },
  ];
}

function makeAd(briefId: string, cycle: number): GeneratedAd {
  return {
    id: `ad-${briefId}-c${cycle}`,
    briefId,
    primaryText: 'test',
    headline: 'test',
    description: 'test',
    ctaButton: 'test',
    generatedAt: new Date().toISOString(),
    modelUsed: 'claude-haiku-4-5',
    iterationCycle: cycle,
    inputTokens: 100,
    outputTokens: 50,
  };
}

function makeEval(adId: string, aggregate: number): EvaluationResult {
  const scores = makeDimScores(aggregate);
  return {
    adId,
    scores,
    aggregateScore: aggregate,
    passesThreshold: aggregate >= 7.0,
    weakestDimension: scores[0]!,
    evaluatedAt: new Date().toISOString(),
    inputTokens: 100,
    outputTokens: 200,
  };
}

function makeEntry(briefId: string, cycleScores: number[]): AdLibraryEntry {
  const cycles = cycleScores.map((score, i) => ({
    cycle: i + 1,
    ad: makeAd(briefId, i + 1),
    evaluation: makeEval(`ad-${briefId}-c${i + 1}`, score),
    improvementDelta: i === 0 ? 0 : Math.round((score - cycleScores[i - 1]!) * 10) / 10,
    interventionUsed: i > 0 ? 'Targeted clarity: test strategy' : undefined,
  }));

  const lastCycle = cycles[cycles.length - 1]!;
  return {
    ad: lastCycle.ad,
    evaluation: lastCycle.evaluation,
    iterationHistory: {
      briefId,
      cycles,
      converged: lastCycle.evaluation.passesThreshold,
      totalInputTokens: 400,
      totalOutputTokens: 500,
      estimatedCostUsd: estimateCost(400, 500),
    },
  };
}

describe('getQualityTrend', () => {
  it('returns ascending scores given multi-cycle briefs that improve', () => {
    const library: AdLibraryEntry[] = [
      makeEntry('brief-a', [6.0, 6.8, 7.2]),   // improves each cycle
      makeEntry('brief-b', [5.5, 6.5, 7.0]),   // improves each cycle
    ];

    const trend = getQualityTrend(library);

    expect(trend.length).toBe(3);
    expect(trend[0]!.cycle).toBe(1);
    expect(trend[2]!.cycle).toBe(3);
    // Last cycle avg should be higher than first
    expect(trend[2]!.avgScore).toBeGreaterThan(trend[0]!.avgScore);
  });

  it('excludes single-cycle briefs from the trend', () => {
    const library: AdLibraryEntry[] = [
      makeEntry('brief-pass', [8.0]),            // single cycle, passes immediately
      makeEntry('brief-iterate', [6.0, 7.2]),    // multi-cycle
    ];

    const trend = getQualityTrend(library);

    // Only the multi-cycle brief should contribute
    expect(trend.length).toBe(2);
    expect(trend[0]!.adCount).toBe(1);  // only 1 multi-cycle brief at cycle 1
  });

  it('returns empty array when no multi-cycle briefs exist', () => {
    const library: AdLibraryEntry[] = [
      makeEntry('brief-a', [8.0]),
      makeEntry('brief-b', [7.5]),
    ];

    const trend = getQualityTrend(library);
    expect(trend).toHaveLength(0);
  });

  it('rounds avgScore to 1 decimal place', () => {
    const library: AdLibraryEntry[] = [
      makeEntry('brief-a', [6.3, 7.1]),
      makeEntry('brief-b', [6.7, 7.3]),
    ];

    const trend = getQualityTrend(library);
    // Cycle 1: (6.3 + 6.7) / 2 = 6.5
    expect(trend[0]!.avgScore).toBe(6.5);
    // Cycle 2: (7.1 + 7.3) / 2 = 7.2
    expect(trend[1]!.avgScore).toBe(7.2);
  });
});

// ── V3: Ratchet Pool ────────────────────────────────────────────────────────

const RATCHET_TEST_PATH = path.resolve('data', 'ratchet', 'top-ads.json');

function makeV3Entry(briefId: string, combinedScore: number): CombinedAdEntryV3 {
  const ad = makeAd(briefId, 1);
  const evaluation = makeEval(ad.id, 7.5);
  return {
    ad,
    evaluation,
    iterationHistory: {
      briefId,
      cycles: [{ cycle: 1, ad, evaluation, improvementDelta: 0 }],
      converged: true,
      totalInputTokens: 400,
      totalOutputTokens: 500,
      estimatedCostUsd: estimateCost(400, 500),
    },
    selectedVariant: null as never,
    allVariants: [],
    combinedScore,
    textScoreWeight: 0.6,
    imageScoreWeight: 0.4,
    coherenceLoop: {
      triggered: false, triggerScore: 10, triggerRationale: '',
      revisedPrompt: '', variant3: null, variant3Score: null,
      improved: false, costUsd: 0,
    },
    copyRefinement: {
      triggered: false, copySideSignal: null, originalCopy: ad.primaryText,
      refinedAd: null, refinedTextScore: null, refinedCombinedScore: null,
      improved: false, costUsd: 0,
    },
    ratchetExamplesUsed: 0,
    competitorInsightsUsed: false,
    agentTrace: { researcherMs: 10, writerMs: 50, editorMs: 100 },
  };
}

describe('updateRatchetPool', () => {
  let originalPool: string | null = null;

  beforeEach(() => {
    // Save original pool if it exists
    if (fs.existsSync(RATCHET_TEST_PATH)) {
      originalPool = fs.readFileSync(RATCHET_TEST_PATH, 'utf-8');
    }
    // Start with empty pool
    const dir = path.dirname(RATCHET_TEST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RATCHET_TEST_PATH, '[]', 'utf-8');
  });

  afterEach(() => {
    // Restore original pool
    if (originalPool !== null) {
      fs.writeFileSync(RATCHET_TEST_PATH, originalPool, 'utf-8');
    } else if (fs.existsSync(RATCHET_TEST_PATH)) {
      fs.writeFileSync(RATCHET_TEST_PATH, '[]', 'utf-8');
    }
  });

  it('adds entries with combinedScore >= RATCHET_MIN_SCORE', () => {
    const entry = makeV3Entry('brief-high', 8.5);
    updateRatchetPool(entry);
    const pool = readRatchetPool();
    expect(pool.length).toBe(1);
    expect(pool[0]!.combinedScore).toBe(8.5);
  });

  it('does not add entries below RATCHET_MIN_SCORE', () => {
    const entry = makeV3Entry('brief-low', 7.0);
    updateRatchetPool(entry);
    const pool = readRatchetPool();
    expect(pool.length).toBe(0);
  });

  it('ratchet pool never exceeds RATCHET_POOL_SIZE', () => {
    // Fill pool beyond capacity
    for (let i = 0; i < RATCHET_POOL_SIZE + 3; i++) {
      const entry = makeV3Entry(`brief-${i}`, 8.0 + (i * 0.01));
      updateRatchetPool(entry);
    }
    const pool = readRatchetPool();
    expect(pool.length).toBeLessThanOrEqual(RATCHET_POOL_SIZE);
  });

  it('ratchet pool never drops below 3 entries', () => {
    // Add exactly 3 entries
    for (let i = 0; i < 3; i++) {
      const entry = makeV3Entry(`brief-${i}`, 8.0 + i);
      updateRatchetPool(entry);
    }
    const pool = readRatchetPool();
    expect(pool.length).toBeGreaterThanOrEqual(3);
  });
});
