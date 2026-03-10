// ── Iteration loop: generate → evaluate → regenerate until quality ≥ 7.0 ──
// Tracks per-cycle improvement deltas, token usage, and interventions.

import Anthropic from '@anthropic-ai/sdk';
import type {
  AdBrief,
  GeneratedAd,
  EvaluationResult,
  IterationCycle,
  IterationRecord,
  AdLibraryEntry,
  CombinedAdEntry,
  CombinedAdEntryV3,
  CoherenceLoopResult,
  CopyRefinementResult,
  AdVariant,
} from '../types.js';
import {
  QUALITY_THRESHOLD,
  estimateCost,
  estimateSonnetCost,
  TEXT_SCORE_WEIGHT,
  IMAGE_SCORE_WEIGHT,
  COHERENCE_THRESHOLD,
  COPY_REFINEMENT_THRESHOLD,
  FLUX_SCHNELL_COST_PER_IMAGE,
} from '../types.js';

export interface IterationResult {
  record: IterationRecord;
  finalAd: GeneratedAd;
  finalEvaluation: EvaluationResult;
}
import { generateAd, regenerateAd, parseGeneratorResponse } from '../generate/generator.js';
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
      interventionUsed: `Targeted ${weakDim.replace(/_/g, ' ')}: ${strategy}`,
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

// ── V2: Image pipeline — runs after text passes ─────────────────────────────

import { buildImagePrompt, buildCoherenceRevisionPrompt, buildCopyRefinementPrompt } from '../generate/prompts.js';
import { generateImageVariants } from '../generate/image-generator.js';
import { evaluateImage } from '../evaluate/visual-evaluator.js';

const signalClient = new Anthropic({ maxRetries: 5 });

// ── V3: Copy-side signal detection ──────────────────────────────────────────

/**
 * Classify whether a coherence mismatch is image-side, copy-side, or both.
 * Returns the copy-side signal string if the mismatch is copy-side or both,
 * null if image-side only.
 */
export async function detectCopySideSignal(
  coherenceRationale: string,
): Promise<string | null> {
  const response = await signalClient.messages.create({
    model: process.env['EVALUATOR_MODEL'] ?? 'claude-haiku-4-5',
    max_tokens: 256,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Classify whether this text-image coherence failure is:
A) Image-side: the image fails to visualize what the copy says
B) Copy-side: the copy fails to match the emotional register of the image
C) Both

Coherence evaluation rationale:
"${coherenceRationale}"

If B or C: extract the specific copy-side signal in one sentence.
Return ONLY valid JSON: { "side": "image" | "copy" | "both", "copySideSignal": string | null }`,
    }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') return null;

  let jsonText = block.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonText) as { side: string; copySideSignal: string | null };
  if (parsed.side === 'copy' || parsed.side === 'both') {
    return parsed.copySideSignal ?? 'Copy does not match the emotional register of the image';
  }
  return null;
}

/**
 * Run the image pipeline for a passing text ad (v3):
 * 1. Generate an image prompt from the ad copy
 * 2. Generate 2 image variants with different seeds
 * 3. Evaluate each variant with Claude Sonnet vision
 * 4. Select the higher-scoring variant
 * 5. Coherence loop: if text_image_coherence < threshold, generate revised variant 3
 * 6. Copy refinement: if coherence still low after image loop, refine copy if copy-side
 * 7. Compute the combined text+image score
 *
 * Returns null on any image pipeline failure — the text result is never lost.
 */
export async function runImagePipeline(
  entry: AdLibraryEntry,
  brief: AdBrief,
): Promise<CombinedAdEntryV3 | null> {
  // Initialize default loop results (not triggered)
  let coherenceLoop: CoherenceLoopResult = {
    triggered: false,
    triggerScore: 10,
    triggerRationale: '',
    revisedPrompt: '',
    variant3: null,
    variant3Score: null,
    improved: false,
    costUsd: 0,
  };
  let copyRefinement: CopyRefinementResult = {
    triggered: false,
    copySideSignal: null,
    originalCopy: entry.ad.primaryText,
    refinedAd: null,
    refinedTextScore: null,
    refinedCombinedScore: null,
    improved: false,
    costUsd: 0,
  };

  try {
    // 1. Generate image prompt from ad copy
    console.log(`  [${brief.id}] Generating image prompt...`);
    const imagePromptText = await buildImagePrompt(entry.ad, brief);

    // 2. Generate image variants
    const variantCount = parseInt(process.env['IMAGE_VARIANTS'] ?? '2');
    console.log(`  [${brief.id}] Generating ${variantCount} image variants...`);
    const imageResults = await generateImageVariants(imagePromptText, variantCount);

    // 3. Evaluate each variant
    const variants: AdVariant[] = [];
    for (let i = 0; i < imageResults.length; i++) {
      const imageResult = imageResults[i]!;
      console.log(`  [${brief.id}] Evaluating variant ${i + 1}/${imageResults.length}...`);
      const visualEvaluation = await evaluateImage(imageResult.localPath, entry.ad, brief);
      variants.push({ imageResult, visualEvaluation });
      console.log(
        `  [${brief.id}] Variant ${i + 1}: visual_score=${visualEvaluation.aggregateScore} ` +
        `weakest=${visualEvaluation.weakestDimension.dimension}(${visualEvaluation.weakestDimension.score})`,
      );
    }

    // 4. Select best variant (highest aggregate score, first wins on tie)
    let selectedVariant = variants.reduce((best, v) =>
      v.visualEvaluation.aggregateScore > best.visualEvaluation.aggregateScore ? v : best,
    );

    let finalAd = entry.ad;

    // ── 5. Coherence loop ──────────────────────────────────────────────────
    const coherenceEnabled = process.env['COHERENCE_LOOP_ENABLED'] !== 'false';
    const coherenceScoreObj = selectedVariant.visualEvaluation.scores
      .find(s => s.dimension === 'text_image_coherence');
    const coherenceScore = coherenceScoreObj?.score ?? 10;
    const coherenceRationale = coherenceScoreObj?.rationale ?? '';

    if (coherenceEnabled && coherenceScore < COHERENCE_THRESHOLD) {
      console.log(
        `  [${brief.id}] Coherence loop: score=${coherenceScore} < ${COHERENCE_THRESHOLD}, generating variant 3...`,
      );
      coherenceLoop.triggered = true;
      coherenceLoop.triggerScore = coherenceScore;
      coherenceLoop.triggerRationale = coherenceRationale;

      try {
        const revisedPrompt = buildCoherenceRevisionPrompt(
          finalAd, brief, imagePromptText, coherenceRationale,
        );
        coherenceLoop.revisedPrompt = revisedPrompt;

        const [variant3Image] = await generateImageVariants(revisedPrompt, 1);
        const variant3Eval = await evaluateImage(variant3Image!.localPath, finalAd, brief);
        const variant3Entry: AdVariant = { imageResult: variant3Image!, visualEvaluation: variant3Eval };

        coherenceLoop.variant3 = variant3Entry;
        coherenceLoop.variant3Score = variant3Eval.aggregateScore;
        coherenceLoop.costUsd = FLUX_SCHNELL_COST_PER_IMAGE
          + estimateSonnetCost(variant3Eval.inputTokens, variant3Eval.outputTokens);

        variants.push(variant3Entry);

        if (variant3Eval.aggregateScore > selectedVariant.visualEvaluation.aggregateScore) {
          selectedVariant = variant3Entry;
          coherenceLoop.improved = true;
          console.log(
            `  [${brief.id}] Coherence loop: variant 3 improved! score=${variant3Eval.aggregateScore}`,
          );
        } else {
          console.log(
            `  [${brief.id}] Coherence loop: variant 3 did not improve (${variant3Eval.aggregateScore} <= ${selectedVariant.visualEvaluation.aggregateScore})`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  [${brief.id}] Coherence loop failed (continuing): ${msg}`);
        coherenceLoop.improved = false;
      }
    }

    // ── 6. Copy refinement loop ────────────────────────────────────────────
    const copyRefEnabled = process.env['COPY_REFINEMENT_ENABLED'] !== 'false';
    const finalCoherenceScoreObj = selectedVariant.visualEvaluation.scores
      .find(s => s.dimension === 'text_image_coherence');
    const finalCoherenceScore = finalCoherenceScoreObj?.score ?? 10;
    const finalCoherenceRationale = finalCoherenceScoreObj?.rationale ?? '';

    if (copyRefEnabled && finalCoherenceScore < COPY_REFINEMENT_THRESHOLD) {
      console.log(
        `  [${brief.id}] Copy refinement: coherence=${finalCoherenceScore} < ${COPY_REFINEMENT_THRESHOLD}, detecting signal...`,
      );
      copyRefinement.triggered = true;

      try {
        const signal = await detectCopySideSignal(finalCoherenceRationale);
        copyRefinement.copySideSignal = signal;

        if (signal) {
          console.log(`  [${brief.id}] Copy refinement: copy-side signal detected, regenerating copy...`);

          // Use the image prompt as a description of the image scene
          const imageDescription = coherenceLoop.revisedPrompt || imagePromptText;

          const refinementPrompt = buildCopyRefinementPrompt(finalAd, brief, imageDescription, signal);
          const refinementClient = new Anthropic({ maxRetries: 5 });
          const refinementResponse = await refinementClient.messages.create({
            model: process.env['GENERATOR_MODEL'] ?? 'claude-haiku-4-5',
            max_tokens: 512,
            temperature: 0.7,
            system: `You are an expert Facebook/Instagram ad copywriter for Varsity Tutors. Respond ONLY with valid JSON matching this schema — no preamble, no markdown fences: { "primaryText": string, "headline": string, "description": string, "ctaButton": string }`,
            messages: [{ role: 'user', content: refinementPrompt }],
          });

          const newAd = parseGeneratorResponse(refinementResponse, brief, finalAd.iterationCycle);
          copyRefinement.refinedAd = newAd;

          // Re-evaluate text quality
          const refinedEval = await evaluateAd(newAd);
          copyRefinement.refinedTextScore = refinedEval.aggregateScore;

          const signalCost = estimateCost(
            refinementResponse.usage.input_tokens,
            refinementResponse.usage.output_tokens,
          );

          if (refinedEval.passesThreshold) {
            const newCombined = Math.round(
              (refinedEval.aggregateScore * TEXT_SCORE_WEIGHT
                + selectedVariant.visualEvaluation.aggregateScore * IMAGE_SCORE_WEIGHT) * 10,
            ) / 10;

            const oldCombined = Math.round(
              (entry.evaluation.aggregateScore * TEXT_SCORE_WEIGHT
                + selectedVariant.visualEvaluation.aggregateScore * IMAGE_SCORE_WEIGHT) * 10,
            ) / 10;

            if (newCombined > oldCombined) {
              // Re-evaluate visual coherence with the new copy
              const reVisualEval = await evaluateImage(
                selectedVariant.imageResult.localPath, newAd, brief,
              );

              finalAd = newAd;
              selectedVariant = { imageResult: selectedVariant.imageResult, visualEvaluation: reVisualEval };
              // Don't mutate variants array — selectedVariant is the updated one

              const finalCombined = Math.round(
                (refinedEval.aggregateScore * TEXT_SCORE_WEIGHT
                  + reVisualEval.aggregateScore * IMAGE_SCORE_WEIGHT) * 10,
              ) / 10;

              copyRefinement.refinedCombinedScore = finalCombined;
              copyRefinement.improved = true;
              copyRefinement.costUsd = signalCost
                + estimateSonnetCost(reVisualEval.inputTokens, reVisualEval.outputTokens);

              console.log(
                `  [${brief.id}] Copy refinement improved! combined=${finalCombined} (was ${oldCombined})`,
              );
            } else {
              copyRefinement.refinedCombinedScore = newCombined;
              copyRefinement.costUsd = signalCost;
              console.log(
                `  [${brief.id}] Copy refinement did not improve combined score (${newCombined} <= ${oldCombined})`,
              );
            }
          } else {
            copyRefinement.costUsd = signalCost;
            console.log(
              `  [${brief.id}] Copy refinement: refined text did not pass threshold (${refinedEval.aggregateScore})`,
            );
          }
        } else {
          console.log(`  [${brief.id}] Copy refinement: image-side signal only, skipping copy refinement`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  [${brief.id}] Copy refinement failed (continuing): ${msg}`);
        copyRefinement.improved = false;
      }
    }

    // ── 7. Compute combined score ──────────────────────────────────────────
    const textScore = (copyRefinement.improved && copyRefinement.refinedTextScore != null)
      ? copyRefinement.refinedTextScore
      : entry.evaluation.aggregateScore;
    const imageScore = selectedVariant.visualEvaluation.aggregateScore;
    const combinedScore = Math.round(
      (textScore * TEXT_SCORE_WEIGHT + imageScore * IMAGE_SCORE_WEIGHT) * 10,
    ) / 10;

    console.log(
      `  [${brief.id}] Combined: text=${textScore} × ${TEXT_SCORE_WEIGHT} + ` +
      `image=${imageScore} × ${IMAGE_SCORE_WEIGHT} = ${combinedScore}`,
    );

    // Use the refined ad's evaluation if copy was improved
    const finalEvaluation = (copyRefinement.improved && copyRefinement.refinedAd)
      ? { ...entry.evaluation, aggregateScore: copyRefinement.refinedTextScore! }
      : entry.evaluation;

    return {
      ad: finalAd,
      evaluation: finalEvaluation,
      iterationHistory: entry.iterationHistory,
      selectedVariant,
      allVariants: variants,
      combinedScore,
      textScoreWeight: TEXT_SCORE_WEIGHT,
      imageScoreWeight: IMAGE_SCORE_WEIGHT,
      coherenceLoop,
      copyRefinement,
      ratchetExamplesUsed: 0,       // Set by caller (editor agent)
      competitorInsightsUsed: false, // Set by caller (editor agent)
      agentTrace: {
        researcherMs: 0,            // Set by caller (index.ts)
        writerMs: 0,
        editorMs: 0,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `  [${brief.id}] Image pipeline failed (text result preserved): ${message}`,
    );
    return null;
  }
}
