// ── Entry point: full pipeline run ────────────────────────────────────────
// Expands briefs, runs iteration loops with concurrency control,
// writes results incrementally, and prints a summary.

import 'dotenv/config';
import { expandBriefs } from './generate/briefs.js';
import { iterateToQuality } from './iterate/loop.js';
import { appendToLibrary, writeAdLibrary } from './output/library.js';
import { getQualityTrend } from './output/trends.js';
import type { AdLibraryEntry } from './types.js';

const CONCURRENCY_LIMIT = parseInt(process.env['CONCURRENCY_LIMIT'] ?? '5', 10);

async function main() {
  const briefs = expandBriefs(75);
  console.log(`\n=== Ad Engine Pipeline ===`);
  console.log(`Briefs to process: ${briefs.length}`);
  console.log(`Concurrency limit: ${CONCURRENCY_LIMIT}`);
  console.log(`Quality threshold: ${process.env['QUALITY_THRESHOLD'] ?? '7.0'}`);
  console.log(`Generator model: ${process.env['GENERATOR_MODEL'] ?? 'claude-haiku-4-5'}`);
  console.log(`Evaluator model: ${process.env['EVALUATOR_MODEL'] ?? 'claude-haiku-4-5'}\n`);

  // Clear previous run
  writeAdLibrary([]);

  const results: AdLibraryEntry[] = [];
  let completed = 0;
  let failed = 0;

  // Process briefs in batches with concurrency control
  for (let i = 0; i < briefs.length; i += CONCURRENCY_LIMIT) {
    const batch = briefs.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.allSettled(
      batch.map(async (brief) => {
        const { record, finalAd, finalEvaluation } = await iterateToQuality(brief);

        const entry: AdLibraryEntry = {
          ad: finalAd,
          evaluation: finalEvaluation,
          iterationHistory: record,
        };

        // Write incrementally — survives crashes
        appendToLibrary(entry);
        results.push(entry);

        const status = record.converged ? 'PASS' : 'FAIL';
        completed++;
        console.log(
          `[${completed}/${briefs.length}] ${status} ${brief.id} ` +
          `score=${finalEvaluation.aggregateScore} ` +
          `cycles=${record.cycles.length} ` +
          `cost=$${record.estimatedCostUsd.toFixed(4)}`
        );

        return entry;
      })
    );

    for (const r of batchResults) {
      if (r.status === 'rejected') {
        failed++;
        completed++;
        console.error(`[${completed}/${briefs.length}] ERROR: ${(r.reason as Error).message}`);
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const passing = results.filter(e => e.evaluation.passesThreshold);
  const totalCost = results.reduce((sum, e) => sum + e.iterationHistory.estimatedCostUsd, 0);
  const costPerPassing = passing.length > 0 ? totalCost / passing.length : 0;

  console.log(`\n=== Pipeline Summary ===`);
  console.log(`Total briefs processed: ${results.length} (${failed} errors)`);
  console.log(`Passing (≥7.0): ${passing.length}/${results.length} (${(passing.length / results.length * 100).toFixed(1)}%)`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);
  console.log(`Cost per passing ad: $${costPerPassing.toFixed(4)}`);

  const trend = getQualityTrend(results);
  if (trend.length > 0) {
    console.log(`\n--- Quality Trend ---`);
    for (const t of trend) {
      console.log(`  Cycle ${t.cycle}: avg=${t.avgScore} (n=${t.adCount})`);
    }
  }

  console.log(`\nResults written to data/ads.json and data/ads.csv`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
