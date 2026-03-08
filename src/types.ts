// ── Core type definitions for the ad generation pipeline ──────────────────
// Every module communicates through these interfaces. Changes here ripple
// through generate/, evaluate/, iterate/, and output/.

export type Audience = 'parents_anxious' | 'students_stressed' | 'comparison_shoppers';
export type CampaignGoal = 'awareness' | 'conversion';
export type HookType = 'question' | 'stat' | 'story' | 'fear';
export type DimensionName = typeof DIMENSION_NAMES[number];
export type Confidence = 'high' | 'medium' | 'low';

export interface AdBrief {
  id: string;
  audience: Audience;
  goal: CampaignGoal;
  offer?: string;      // e.g. "free diagnostic test"
  tone?: string;       // e.g. "urgent", "empathetic", "aspirational"
  hookType?: HookType;
}

export interface GeneratedAd {
  id: string;
  briefId: string;
  primaryText: string;
  headline: string;
  description: string;
  ctaButton: string;
  generatedAt: string;   // ISO timestamp
  modelUsed: string;     // e.g. "claude-haiku-4-5"
  iterationCycle: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DimensionScore {
  dimension: DimensionName;
  score: number;         // 1–10
  rationale: string;
  confidence: Confidence;
}

export interface EvaluationResult {
  adId: string;
  scores: DimensionScore[];
  aggregateScore: number;
  passesThreshold: boolean;  // >= QUALITY_THRESHOLD (7.0)
  weakestDimension: DimensionScore;
  evaluatedAt: string;
  inputTokens: number;
  outputTokens: number;
}

export interface IterationCycle {
  cycle: number;
  ad: GeneratedAd;
  evaluation: EvaluationResult;
  improvementDelta: number;   // 0 for cycle 1
  interventionUsed?: string;
}

export interface IterationRecord {
  briefId: string;
  cycles: IterationCycle[];
  finalAd: GeneratedAd | null;
  finalEvaluation: EvaluationResult | null;
  converged: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface AdLibraryEntry {
  ad: GeneratedAd;
  evaluation: EvaluationResult;
  iterationHistory: IterationRecord;
}

// ── Constants ─────────────────────────────────────────────────────────────

export const QUALITY_THRESHOLD = 7.0;

export const DIMENSION_NAMES = [
  'clarity', 'value_proposition', 'call_to_action', 'brand_voice', 'emotional_resonance',
] as const;

// Equal weights for V1. Document rationale in DECISION_LOG.md.
export const DIMENSION_WEIGHTS: Record<DimensionName, number> = {
  clarity: 0.2,
  value_proposition: 0.2,
  call_to_action: 0.2,
  brand_voice: 0.2,
  emotional_resonance: 0.2,
};

// Haiku pricing: input $0.80/1M tokens, output $4.00/1M tokens
export const COST_PER_INPUT_TOKEN = 0.0000008;
export const COST_PER_OUTPUT_TOKEN = 0.000004;

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
}
