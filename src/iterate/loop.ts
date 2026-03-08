// ── Iteration loop: generate → evaluate → regenerate until quality ≥ 7.0 ──
// Tracks per-cycle improvement deltas, token usage, and interventions.

import type {
  AdBrief,
  GeneratedAd,
  EvaluationResult,
  IterationCycle,
  IterationRecord,
} from '../types.js';
import { QUALITY_THRESHOLD, estimateCost } from '../types.js';

export interface IterationResult {
  record: IterationRecord;
  finalAd: GeneratedAd;
  finalEvaluation: EvaluationResult;
}
import { generateAd, regenerateAd } from '../generate/generator.js';
import { evaluateAd } from '../evaluate/evaluator.js';
import { getStrategy } from './strategies.js';

export async function iterateToQuality(
  brief: AdBrief,
  maxCycles: number = parseInt(process.env['MAX_ITERATIONS'] ?? '5', 10),
): Promise<IterationResult> {
  const cycles: IterationCycle[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // ── Cycle 1: initial generation + evaluation ──────────────────────────
  const firstAd = await generateAd(brief, 1);
  totalInputTokens += firstAd.inputTokens;
  totalOutputTokens += firstAd.outputTokens;

  const firstEval = await evaluateAd(firstAd);
  totalInputTokens += firstEval.inputTokens;
  totalOutputTokens += firstEval.outputTokens;

  cycles.push({
    cycle: 1,
    ad: firstAd,
    evaluation: firstEval,
    improvementDelta: 0,
  });

  console.log(
    `  [${brief.id}] Cycle 1: score=${firstEval.aggregateScore} ` +
    `weakest=${firstEval.weakestDimension.dimension}(${firstEval.weakestDimension.score})`
  );

  // ── Cycles 2–N: iterate on weakest dimension ─────────────────────────
  for (let cycle = 2; cycle <= maxCycles; cycle++) {
    const prev = cycles[cycles.length - 1]!;

    // If we've already passed, stop iterating
    if (prev.evaluation.passesThreshold) {
      break;
    }

    const weakDim = prev.evaluation.weakestDimension.dimension;
    const strategy = getStrategy(weakDim);

    const improvedAd = await regenerateAd(
      brief,
      prev.ad,
      weakDim,
      strategy,
      cycle,
    );
    totalInputTokens += improvedAd.inputTokens;
    totalOutputTokens += improvedAd.outputTokens;

    const improvedEval = await evaluateAd(improvedAd);
    totalInputTokens += improvedEval.inputTokens;
    totalOutputTokens += improvedEval.outputTokens;

    const delta = improvedEval.aggregateScore - prev.evaluation.aggregateScore;

    cycles.push({
      cycle,
      ad: improvedAd,
      evaluation: improvedEval,
      improvementDelta: Math.round(delta * 10) / 10,
      interventionUsed: `Targeted ${weakDim}: ${strategy.slice(0, 80)}...`,
    });

    console.log(
      `  [${brief.id}] Cycle ${cycle}: score=${improvedEval.aggregateScore} ` +
      `delta=${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ` +
      `weakest=${improvedEval.weakestDimension.dimension}(${improvedEval.weakestDimension.score})`
    );

    // If score went down, don't keep chasing — the intervention may have
    // hurt another dimension. Log it and move on.
    if (delta < -0.5 && cycle >= 3) {
      console.log(
        `  [${brief.id}] Score regressed significantly (${delta.toFixed(1)}), stopping early.`
      );
      break;
    }
  }

  // ── Build final record ────────────────────────────────────────────────
  const best = selectBestCycle(cycles);

  return {
    record: {
      briefId: brief.id,
      cycles,
      converged: best.evaluation.passesThreshold,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUsd: estimateCost(totalInputTokens, totalOutputTokens),
    },
    finalAd: best.ad,
    finalEvaluation: best.evaluation,
  };
}

/**
 * Select the cycle with the highest aggregate score as the final output.
 * This handles the case where a later iteration regresses — we always
 * surface the best version, not necessarily the last one.
 */
function selectBestCycle(cycles: IterationCycle[]): IterationCycle {
  return cycles.reduce((best, c) =>
    c.evaluation.aggregateScore > best.evaluation.aggregateScore ? c : best
  );
}
