// ── LLM-as-judge evaluator using Anthropic SDK ───────────────────────────
// Temperature MUST be 0 for deterministic scoring.
// Parses structured JSON scores and computes weighted aggregate.

import Anthropic from '@anthropic-ai/sdk';
import {
  type DimensionScore,
  type EvaluationResult,
  type GeneratedAd,
  type DimensionName,
  DIMENSION_NAMES,
  DIMENSION_WEIGHTS,
  QUALITY_THRESHOLD,
} from '../types.js';
import { EVALUATOR_SYSTEM_PROMPT, buildEvaluationPrompt } from './dimensions.js';

const client = new Anthropic({ maxRetries: 5 });

export async function evaluateAd(ad: GeneratedAd): Promise<EvaluationResult> {
  const response = await client.messages.create({
    model: process.env['EVALUATOR_MODEL'] ?? 'claude-haiku-4-5',
    max_tokens: 1024,
    temperature: 0, // MUST be 0 — evaluator must be deterministic
    system: EVALUATOR_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildEvaluationPrompt(ad) },
    ],
  });

  const block = response.content[0];
  const text = block?.type === 'text' ? block.text : '';

  // Strip markdown fences if present despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = JSON.parse(cleaned) as {
    scores?: Array<{
      dimension?: string;
      score?: number;
      rationale?: string;
      confidence?: string;
    }>;
  };

  if (!parsed.scores || !Array.isArray(parsed.scores)) {
    throw new Error(`Evaluator returned invalid structure: ${cleaned}`);
  }

  // Validate and normalize scores
  const scores: DimensionScore[] = [];

  for (const name of DIMENSION_NAMES) {
    const raw = parsed.scores.find(s => s.dimension === name);
    if (!raw || typeof raw.score !== 'number') {
      throw new Error(`Missing or invalid score for dimension "${name}": ${JSON.stringify(raw)}`);
    }

    // Clamp to valid range
    const score = Math.max(1, Math.min(10, Math.round(raw.score)));

    scores.push({
      dimension: name,
      score,
      rationale: raw.rationale ?? '',
      confidence: validateConfidence(raw.confidence),
    });
  }

  // Compute weighted aggregate
  const aggregateScore = computeAggregate(scores);

  // Find weakest dimension
  const weakest = scores.reduce((min, s) =>
    s.score < min.score ? s : min
  );

  return {
    adId: ad.id,
    scores,
    aggregateScore,
    passesThreshold: aggregateScore >= QUALITY_THRESHOLD,
    weakestDimension: weakest,
    evaluatedAt: new Date().toISOString(),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function computeAggregate(scores: DimensionScore[]): number {
  let total = 0;
  for (const s of scores) {
    total += s.score * DIMENSION_WEIGHTS[s.dimension];
  }
  // Round to 1 decimal place for clean display
  return Math.round(total * 10) / 10;
}

function validateConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return 'medium'; // default if model returns unexpected value
}
