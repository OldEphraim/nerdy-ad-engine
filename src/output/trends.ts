// ── Quality trend calculation ─────────────────────────────────────────────
// Computes per-brief improvement trajectory across iteration cycles.
// Only includes briefs that ran >1 cycle — single-cycle passes don't
// contribute since there's no improvement to measure.

import { readAdLibrary } from './library.js';
import type { AdLibraryEntry } from '../types.js';

export interface TrendPoint {
  cycle: number;
  avgScore: number;
  adCount: number;
}

/**
 * Compute average aggregate score per cycle across multi-cycle briefs only.
 *
 * For each brief that ran >1 cycle, we track its score at cycle 1, cycle 2,
 * etc. The trend shows: "for ads that needed iteration, how did their scores
 * change across cycles?" This avoids the methodological error of comparing
 * all cycle-1 scores (dominated by passing ads) against only the weakest
 * ads' cycle-2 scores.
 *
 * A brief contributes to cycle N only if it actually ran cycle N.
 */
export function getQualityTrend(library?: AdLibraryEntry[]): TrendPoint[] {
  const entries = library ?? readAdLibrary();

  // Filter to only briefs that went through multiple cycles
  const multiCycleEntries = entries.filter(e => e.iterationHistory.cycles.length > 1);

  if (multiCycleEntries.length === 0) {
    return [];
  }

  // Group scores by cycle number across multi-cycle briefs
  const cycleBuckets = new Map<number, number[]>();

  for (const entry of multiCycleEntries) {
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
