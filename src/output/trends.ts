// ── Quality trend calculation ─────────────────────────────────────────────
// Computes average score by iteration cycle number across all ads.
// Used by the spec compliance test to prove measurable improvement.

import { readAdLibrary } from './library.js';
import type { AdLibraryEntry } from '../types.js';

export interface TrendPoint {
  cycle: number;
  avgScore: number;
  adCount: number;
}

/**
 * Compute average aggregate score per iteration cycle across the full library.
 *
 * Cycle 1 = first-pass generation scores (before any intervention).
 * Cycle 2+ = scores after targeted regeneration.
 *
 * Only includes entries that have data for a given cycle — if an ad
 * converged on cycle 1, it only contributes to the cycle 1 average.
 */
export function getQualityTrend(library?: AdLibraryEntry[]): TrendPoint[] {
  const entries = library ?? readAdLibrary();

  // Group scores by cycle number
  const cycleBuckets = new Map<number, number[]>();

  for (const entry of entries) {
    for (const cycle of entry.iterationHistory.cycles) {
      const scores = cycleBuckets.get(cycle.cycle) ?? [];
      scores.push(cycle.evaluation.aggregateScore);
      cycleBuckets.set(cycle.cycle, scores);
    }
  }

  // Convert to sorted trend points
  const trend: TrendPoint[] = [];
  const sortedCycles = [...cycleBuckets.keys()].sort((a, b) => a - b);

  for (const cycleNum of sortedCycles) {
    const scores = cycleBuckets.get(cycleNum)!;
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    trend.push({
      cycle: cycleNum,
      avgScore: Math.round(avg * 10) / 10,
      adCount: scores.length,
    });
  }

  return trend;
}
