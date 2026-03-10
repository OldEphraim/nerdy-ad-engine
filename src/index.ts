// ── Entry point: full v3 pipeline run ──────────────────────────────────────
// Expands briefs, runs agentic pipeline (researcher → writer → editor),
// writes results incrementally, and prints a summary with v3 stats.

import 'dotenv/config';
import { expandBriefs } from './generate/briefs.js';
import { iterateToQuality, runImagePipeline } from './iterate/loop.js';
import { appendToLibrary, writeAdLibrary, isCombinedAdEntry, getImageStats, updateRatchetPool, readRatchetPool } from './output/library.js';
import { getQualityTrend } from './output/trends.js';
import { research } from './agents/researcher.js';
import { edit } from './agents/editor.js';
import type { AdLibraryEntry, CombinedAdEntry, CombinedAdEntryV3, CompetitorInsights } from './types.js';

const CONCURRENCY_LIMIT = parseInt(process.env['CONCURRENCY_LIMIT'] ?? '5', 10);

/** Type guard for v3 entries */
function isCombinedAdEntryV3(entry: AdLibraryEntry): entry is CombinedAdEntryV3 {
  return 'coherenceLoop' in entry && 'copyRefinement' in entry;
}

async function main() {
  const briefs = expandBriefs(75);
  const imageEnabled = !!process.env['FAL_KEY'];
  const v3Enabled = imageEnabled; // v3 features require image pipeline

  console.log(`\n=== Ad Engine Pipeline (${v3Enabled ? 'v3: agentic text+image' : imageEnabled ? 'v2: text+image' : 'v1: text-only'}) ===`);
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
  if (v3Enabled) {
    console.log(`Coherence loop: ${process.env['COHERENCE_LOOP_ENABLED'] !== 'false' ? 'enabled' : 'disabled'} (threshold ${process.env['COHERENCE_THRESHOLD'] ?? '7.5'})`);
    console.log(`Copy refinement: ${process.env['COPY_REFINEMENT_ENABLED'] !== 'false' ? 'enabled' : 'disabled'} (threshold ${process.env['COPY_REFINEMENT_THRESHOLD'] ?? '7.0'})`);
    console.log(`Quality ratchet: ${process.env['RATCHET_ENABLED'] !== 'false' ? 'enabled' : 'disabled'} (min score ${process.env['RATCHET_MIN_SCORE'] ?? '8.0'}, pool size ${process.env['RATCHET_POOL_SIZE'] ?? '10'})`);
    console.log(`Researcher model: ${process.env['RESEARCHER_MODEL'] ?? 'claude-sonnet-4-5'}`);
  }
  console.log();

  // Clear previous run
  writeAdLibrary([]);

  const results: AdLibraryEntry[] = [];
  let completed = 0;
  let failed = 0;
  let insightsCache: CompetitorInsights | null = null;
  let insightsFetchedFresh = false;

  // Process briefs sequentially for v3 (ratchet pool updates mid-run)
  // or in batches for v1/v2
  if (v3Enabled) {
    for (const brief of briefs) {
      try {
        // Researcher agent
        const researcherStart = Date.now();
        const enrichedBrief = await research(brief, insightsCache);
        const researcherMs = Date.now() - researcherStart;

        if (!insightsCache) {
          insightsCache = enrichedBrief.competitorInsights;
          insightsFetchedFresh = true;
        }

        // Editor agent (wraps writer + text iteration + image pipeline + loops)
        const editorStart = Date.now();
        const entry = await edit(enrichedBrief, Date.now());

        if (entry) {
          // Set researcher timing (writerMs and editorMs are set by editor.ts)
          entry.agentTrace.researcherMs = researcherMs;

          appendToLibrary(entry);
          updateRatchetPool(entry);
          results.push(entry);

          completed++;
          console.log(
            `[${completed}/${briefs.length}] PASS ${brief.id} ` +
            `text=${entry.evaluation.aggregateScore} combined=${entry.combinedScore} ` +
            `cycles=${entry.iterationHistory.cycles.length} ` +
            `cost=$${entry.iterationHistory.estimatedCostUsd.toFixed(4)}`
          );
        } else {
          completed++;
          failed++;
          console.log(`[${completed}/${briefs.length}] FAIL ${brief.id} (text did not converge)`);
        }
      } catch (err) {
        completed++;
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${completed}/${briefs.length}] ERROR ${brief.id}: ${msg}`);
      }
    }
  } else {
    // v1/v2 path — batched concurrency (unchanged from v2)
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
          }

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

  // V3: Coherence loop + copy refinement + ratchet stats
  const v3Entries = results.filter(isCombinedAdEntryV3);
  if (v3Entries.length > 0) {
    const coherenceTriggered = v3Entries.filter(e => e.coherenceLoop.triggered).length;
    const coherenceImproved = v3Entries.filter(e => e.coherenceLoop.improved).length;
    const copyRefTriggered = v3Entries.filter(e => e.copyRefinement.triggered).length;
    const copyRefImproved = v3Entries.filter(e => e.copyRefinement.improved).length;

    const coherenceLoopCost = v3Entries.reduce((sum, e) => sum + e.coherenceLoop.costUsd, 0);
    const copyRefCost = v3Entries.reduce((sum, e) => sum + e.copyRefinement.costUsd, 0);

    const pct = (n: number, total: number) => total > 0 ? `${Math.round(n / total * 100)}%` : '0%';

    console.log(`\n--- V3: Coherence Loop Stats ---`);
    console.log(`Triggered: ${coherenceTriggered}/${v3Entries.length} (${pct(coherenceTriggered, v3Entries.length)})`);
    console.log(`Improved: ${coherenceImproved}/${coherenceTriggered} (${pct(coherenceImproved, coherenceTriggered)})`);
    console.log(`Cost: $${coherenceLoopCost.toFixed(4)}`);

    console.log(`\n--- V3: Copy Refinement Stats ---`);
    console.log(`Triggered: ${copyRefTriggered}/${v3Entries.length} (${pct(copyRefTriggered, v3Entries.length)})`);
    console.log(`Improved: ${copyRefImproved}/${copyRefTriggered} (${pct(copyRefImproved, copyRefTriggered)})`);
    console.log(`Cost: $${copyRefCost.toFixed(4)}`);

    const avgAgentTrace = {
      researcherMs: Math.round(v3Entries.reduce((s, e) => s + e.agentTrace.researcherMs, 0) / v3Entries.length),
      writerMs: Math.round(v3Entries.reduce((s, e) => s + e.agentTrace.writerMs, 0) / v3Entries.length),
      editorMs: Math.round(v3Entries.reduce((s, e) => s + e.agentTrace.editorMs, 0) / v3Entries.length),
    };
    console.log(`\n--- V3: Agent Timing (avg per brief) ---`);
    console.log(`Researcher: ${avgAgentTrace.researcherMs}ms`);
    console.log(`Writer: ${avgAgentTrace.writerMs}ms`);
    console.log(`Editor: ${avgAgentTrace.editorMs}ms`);

    const ratchetPool = readRatchetPool();
    const avgRatchetScore = ratchetPool.length > 0
      ? Math.round(ratchetPool.reduce((sum, e) => sum + e.combinedScore, 0) / ratchetPool.length * 10) / 10
      : 0;
    console.log(`\n--- V3: Quality Ratchet ---`);
    console.log(`Pool size: ${ratchetPool.length} ads`);
    console.log(`Avg pool score: ${avgRatchetScore}`);

    console.log(`\n--- V3: Competitive Intelligence ---`);
    console.log(`Insights: ${insightsFetchedFresh ? 'fetched fresh' : 'served from cache'}`);
    if (insightsCache) {
      console.log(`Dominant hooks: ${insightsCache.dominantHooks.join(', ')}`);
      console.log(`CTA patterns: ${insightsCache.ctaPatterns.join(', ')}`);
    }
  }

  console.log(`\nResults written to data/ads.json and data/ads.csv`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
