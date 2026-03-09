import { describe, it, expect } from 'vitest';
import { estimateCost, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN } from '../src/types.js';
import { getQualityTrend } from '../src/output/trends.js';
import type { AdLibraryEntry, GeneratedAd, EvaluationResult, IterationRecord, DimensionScore } from '../src/types.js';

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
