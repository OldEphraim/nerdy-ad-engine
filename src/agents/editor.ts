// ── Editor Agent: wraps the complete v3 pipeline ────────────────────────────
// iterateToQuality → runImagePipeline (with coherence + copy refinement)
// Assembles CombinedAdEntryV3 with timing and metadata.

import type {
  EnrichedBrief,
  CombinedAdEntryV3,
  AdLibraryEntry,
} from '../types.js';
import { iterateToQuality, runImagePipeline } from '../iterate/loop.js';

/**
 * Editor agent entry point.
 * Runs the full v3 pipeline for a single enriched brief:
 * 1. Text iteration loop (iterateToQuality)
 * 2. Image pipeline with coherence loop + copy refinement (runImagePipeline)
 *
 * Sets ratchetExamplesUsed, competitorInsightsUsed, and editorMs timing.
 * researcherMs and writerMs are set by the caller (index.ts) since the editor
 * does not invoke those agents.
 *
 * Returns null only if text never passes threshold.
 * Image/coherence/refinement failures return partial results with the text entry
 * promoted to a CombinedAdEntryV3 with default (not-triggered) loop results.
 */
export async function edit(
  enrichedBrief: EnrichedBrief,
  startTime: number,
): Promise<CombinedAdEntryV3 | null> {
  const editorStart = Date.now();
  const imageEnabled = !!process.env['FAL_KEY'];

  // 1. Text iteration loop (writer phase — generation + evaluation cycles)
  const writerStart = Date.now();
  const { record, finalAd, finalEvaluation } = await iterateToQuality(enrichedBrief);
  const writerMs = Date.now() - writerStart;

  if (!record.converged) {
    return null;
  }

  const textEntry: AdLibraryEntry = {
    ad: finalAd,
    evaluation: finalEvaluation,
    iterationHistory: record,
  };

  // 2. Image pipeline (v3: includes coherence loop + copy refinement)
  if (imageEnabled) {
    const combined = await runImagePipeline(textEntry, enrichedBrief);

    if (combined) {
      combined.ratchetExamplesUsed = enrichedBrief.ratchetExamples.length;
      combined.competitorInsightsUsed = enrichedBrief.competitorInsights.dominantHooks.length > 0;
      combined.agentTrace.writerMs = writerMs;
      combined.agentTrace.editorMs = Date.now() - editorStart;
      return combined;
    }
  }

  // Image pipeline failed or not enabled — return text-only as CombinedAdEntryV3
  // with stub image fields. This ensures the caller always gets a v3 entry when
  // text passes, even if images fail.
  const editorMs = Date.now() - editorStart;

  return {
    ad: finalAd,
    evaluation: finalEvaluation,
    iterationHistory: record,
    selectedVariant: null as never, // No image data — caller should check imageEnabled
    allVariants: [],
    combinedScore: finalEvaluation.aggregateScore, // text-only: combined = text score
    textScoreWeight: 1,
    imageScoreWeight: 0,
    coherenceLoop: {
      triggered: false,
      triggerScore: 10,
      triggerRationale: '',
      revisedPrompt: '',
      variant3: null,
      variant3Score: null,
      improved: false,
      costUsd: 0,
    },
    copyRefinement: {
      triggered: false,
      copySideSignal: null,
      originalCopy: finalAd.primaryText,
      refinedAd: null,
      refinedTextScore: null,
      refinedCombinedScore: null,
      improved: false,
      costUsd: 0,
    },
    ratchetExamplesUsed: enrichedBrief.ratchetExamples.length,
    competitorInsightsUsed: enrichedBrief.competitorInsights.dominantHooks.length > 0,
    agentTrace: {
      researcherMs: 0,
      writerMs,
      editorMs,
    },
  };
}
