// ── Entry point: full pipeline run ────────────────────────────────────────
// Expands briefs, runs iteration loops with concurrency control,
// writes results incrementally, and prints a summary.

import 'dotenv/config';
import { expandBriefs } from './generate/briefs.js';
import { iterateToQuality, runImagePipeline } from './iterate/loop.js';
import { appendToLibrary, writeAdLibrary, isCombinedAdEntry, getImageStats } from './output/library.js';
import { getQualityTrend } from './output/trends.js';
import type { AdLibraryEntry, CombinedAdEntry } from './types.js';

const CONCURRENCY_LIMIT = parseInt(process.env['CONCURRENCY_LIMIT'] ?? '5', 10);

async function main() {
  const briefs = expandBriefs(75);
  const imageEnabled = !!process.env['FAL_KEY'];

  console.log(`\n=== Ad Engine Pipeline (${imageEnabled ? 'v2: text+image' : 'v1: text-only'}) ===`);
  console.log(`Briefs to process: ${briefs.length}`);
  console.log(`Concurrency limit: ${CONCURRENCY_LIMIT}`);
  console.log(`Quality threshold: ${process.env['QUALITY_THRESHOLD'] ?? '7.0'}`);
  console.log(`Generator model: ${process.env['GENERATOR_MODEL'] ?? 'claude-haiku-4-5'}`);
  console.log(`Evaluator model: ${process.env['EVALUATOR_MODEL'] ?? 'claude-haiku-4-5'}`);
  if (imageEnabled) {
    console.log(`Image model: ${process.env['IMAGE_MODEL'] ?? 'fal-ai/flux/schnell'}`);
    console.log(`Visual evaluator: ${process.env['VISUAL_EVALUATOR_MODEL'] ?? 'claude-sonnet-4-5'}`);
    console.log(`Image variants: ${process.env['IMAGE_VARIANTS'] ?? '2'}`);
  }
  console.log();

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

        let entry: AdLibraryEntry = {
          ad: finalAd,
          evaluation: finalEvaluation,
          iterationHistory: record,
        };

        // V2: Run image pipeline if text passes and FAL_KEY is configured
        if (imageEnabled && record.converged) {
          const combined = await runImagePipeline(entry, brief);
          if (combined) {
            entry = combined;
          }
          // If null, entry stays as text-only AdLibraryEntry
        }

        // Write incrementally — survives crashes
        appendToLibrary(entry);
        results.push(entry);

        const status = record.converged ? 'PASS' : 'FAIL';
        const scoreLabel = isCombinedAdEntry(entry)
          ? `text=${finalEvaluation.aggregateScore} combined=${entry.combinedScore}`
          : `score=${finalEvaluation.aggregateScore}`;
        completed++;
        console.log(
          `[${completed}/${briefs.length}] ${status} ${brief.id} ` +
          `${scoreLabel} ` +
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

  // V2: Image pipeline stats
  const combinedEntries = results.filter(isCombinedAdEntry);
  if (combinedEntries.length > 0) {
    const imgStats = getImageStats(combinedEntries);
    console.log(`\n--- Image Pipeline Stats ---`);
    console.log(`Ads with images: ${combinedEntries.length}/${results.length}`);
    console.log(`Variants generated: ${imgStats.variantsGenerated}`);
    console.log(`Image pass rate (≥7.0): ${(imgStats.imagePassRate * 100).toFixed(1)}%`);
    console.log(`Avg visual score: ${imgStats.avgVisualScore}`);
    console.log(`Avg combined score: ${imgStats.avgCombinedScore}`);
    console.log(`Weakest visual dimension: ${imgStats.weakestVisualDimension}`);
    console.log(`Visual scores by dimension:`);
    for (const [dim, avg] of Object.entries(imgStats.avgScoreByDimension)) {
      console.log(`  ${dim.replace(/_/g, ' ')}: ${avg}`);
    }

    // Estimate total image cost
    const imageCost = combinedEntries.reduce((sum, e) => {
      const genCost = e.allVariants.reduce((s, v) => s + v.imageResult.costUsd, 0);
      return sum + genCost;
    }, 0);
    console.log(`Image generation cost: $${imageCost.toFixed(4)}`);
    console.log(`Total cost (text + image): $${(totalCost + imageCost).toFixed(4)}`);
  }

  console.log(`\nResults written to data/ads.json and data/ads.csv`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
