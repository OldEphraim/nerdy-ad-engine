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

export const QUALITY_THRESHOLD = parseFloat(process.env['QUALITY_THRESHOLD'] ?? '7.0');

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

// Sonnet pricing: input $3.00/1M tokens, output $15.00/1M tokens
export const SONNET_COST_PER_INPUT_TOKEN = 0.000003;
export const SONNET_COST_PER_OUTPUT_TOKEN = 0.000015;

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
}

export function estimateSonnetCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * SONNET_COST_PER_INPUT_TOKEN + outputTokens * SONNET_COST_PER_OUTPUT_TOKEN;
}

// ── V2: Image Pipeline Types ────────────────────────────────────────────────

export interface ImageResult {
  url: string;              // fal.ai CDN URL (expires ~1 hour)
  localPath: string;        // data/images/{uuid}.jpg (permanent)
  width: number;
  height: number;
  seed: number;
  generationTimeMs: number;
  costUsd: number;
}

export type VisualDimensionName = typeof VISUAL_DIMENSION_NAMES[number];

export interface VisualDimensionScore {
  dimension: VisualDimensionName;
  score: number;            // 1–10
  rationale: string;
  confidence: Confidence;
}

export interface VisualEvaluation {
  imageLocalPath: string;
  scores: VisualDimensionScore[];
  aggregateScore: number;
  passesThreshold: boolean;
  weakestDimension: VisualDimensionScore;
  evaluatedAt: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AdVariant {
  imageResult: ImageResult;
  visualEvaluation: VisualEvaluation;
}

export interface CombinedAdEntry extends AdLibraryEntry {
  selectedVariant: AdVariant;
  allVariants: AdVariant[];
  combinedScore: number;        // text * 0.6 + image * 0.4
  textScoreWeight: number;      // 0.6
  imageScoreWeight: number;     // 0.4
}

export const VISUAL_DIMENSION_NAMES = [
  'brand_consistency', 'visual_engagement', 'text_image_coherence',
] as const;

export const TEXT_SCORE_WEIGHT = parseFloat(process.env['TEXT_SCORE_WEIGHT'] ?? '0.6');
export const IMAGE_SCORE_WEIGHT = parseFloat(process.env['IMAGE_SCORE_WEIGHT'] ?? '0.4');

// Cost per image for Flux Schnell on fal.ai
export const FLUX_SCHNELL_COST_PER_IMAGE = 0.003;

// ── V3: Coherence Loop, Copy Refinement, Quality Ratchet, Agentic Types ───

export const COHERENCE_THRESHOLD = parseFloat(process.env['COHERENCE_THRESHOLD'] ?? '7.5');
export const COPY_REFINEMENT_THRESHOLD = parseFloat(process.env['COPY_REFINEMENT_THRESHOLD'] ?? '7.0');
export const RATCHET_MIN_SCORE = parseFloat(process.env['RATCHET_MIN_SCORE'] ?? '8.0');
export const RATCHET_POOL_SIZE = parseInt(process.env['RATCHET_POOL_SIZE'] ?? '10', 10);

export interface CompetitorInsights {
  dominantHooks: string[];
  ctaPatterns: string[];
  emotionalAngles: string[];
  freshInsights: string[];
  fetchedAt: string;   // ISO timestamp
}

export interface EnrichedBrief extends AdBrief {
  ratchetExamples: RatchetEntry[];
  competitorInsights: CompetitorInsights;
}

export interface RatchetEntry {
  ad: GeneratedAd;
  evaluation: EvaluationResult;
  combinedScore: number;
  selectedAt: string;
}

export interface CoherenceLoopResult {
  triggered: boolean;
  triggerScore: number;
  triggerRationale: string;
  revisedPrompt: string;
  variant3: AdVariant | null;
  variant3Score: number | null;
  improved: boolean;
  costUsd: number;
}

export interface CopyRefinementResult {
  triggered: boolean;
  copySideSignal: string | null;
  originalCopy: string;
  refinedAd: GeneratedAd | null;
  refinedTextScore: number | null;
  refinedCombinedScore: number | null;
  improved: boolean;
  costUsd: number;
}

export interface CombinedAdEntryV3 extends CombinedAdEntry {
  coherenceLoop: CoherenceLoopResult;
  copyRefinement: CopyRefinementResult;
  ratchetExamplesUsed: number;
  competitorInsightsUsed: boolean;
  agentTrace: {
    researcherMs: number;
    writerMs: number;
    editorMs: number;
  };
}
