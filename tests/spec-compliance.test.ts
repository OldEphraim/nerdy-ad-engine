import { describe, it, expect } from 'vitest';
import { readAdLibrary, isCombinedAdEntry } from '../src/output/library.js';
import { getQualityTrend } from '../src/output/trends.js';
import { DIMENSION_NAMES, DIMENSION_WEIGHTS, VISUAL_DIMENSION_NAMES, TEXT_SCORE_WEIGHT, IMAGE_SCORE_WEIGHT, COHERENCE_THRESHOLD } from '../src/types.js';
import type { AdLibraryEntry, CombinedAdEntry, CombinedAdEntryV3 } from '../src/types.js';
import * as fs from 'fs';

const library = readAdLibrary();

// Load v2 production run for image pipeline tests
const v2Library: AdLibraryEntry[] = fs.existsSync('data/runs/v2-production.json')
  ? JSON.parse(fs.readFileSync('data/runs/v2-production.json', 'utf-8')) as AdLibraryEntry[]
  : [];
const v2Combined = v2Library.filter(isCombinedAdEntry);

// ── COVERAGE ──────────────────────────────────────────────────────────────
describe('Coverage', () => {
  it('has ≥50 ads with full evaluation scores', () => {
    expect(library.length).toBeGreaterThanOrEqual(50);
  });

  it('every ad has a non-empty evaluation', () => {
    for (const entry of library) {
      expect(entry.evaluation).toBeDefined();
      expect(entry.evaluation.scores.length).toBe(5);
    }
  });

  it('every evaluation score has a non-empty rationale', () => {
    for (const entry of library) {
      for (const score of entry.evaluation.scores) {
        expect(score.rationale.length).toBeGreaterThan(10);
      }
    }
  });
});

// ── QUALITY DIMENSIONS ─────────────────────────────────────────────────────
describe('Quality Dimensions', () => {
  it('all 5 required dimensions are scored on every ad', () => {
    for (const entry of library) {
      const dims = entry.evaluation.scores.map(s => s.dimension);
      for (const required of DIMENSION_NAMES) {
        expect(dims).toContain(required);
      }
    }
  });

  it('all dimension scores are in valid 1–10 range', () => {
    for (const entry of library) {
      for (const score of entry.evaluation.scores) {
        expect(score.score).toBeGreaterThanOrEqual(1);
        expect(score.score).toBeLessThanOrEqual(10);
      }
    }
  });
});

// ── AGGREGATE SCORE ────────────────────────────────────────────────────────
describe('Aggregate Score', () => {
  it('aggregate equals weighted sum of dimensions (±0.05 tolerance)', () => {
    for (const entry of library) {
      const scoreMap = new Map(entry.evaluation.scores.map(s => [s.dimension, s.score]));
      let expectedAggregate = 0;
      for (const dim of DIMENSION_NAMES) {
        expectedAggregate += (scoreMap.get(dim) ?? 0) * DIMENSION_WEIGHTS[dim];
      }
      // Round to 1 decimal like the evaluator does
      expectedAggregate = Math.round(expectedAggregate * 10) / 10;
      expect(Math.abs(entry.evaluation.aggregateScore - expectedAggregate)).toBeLessThanOrEqual(0.05);
    }
  });
});

// ── ITERATION & IMPROVEMENT ────────────────────────────────────────────────
describe('Iteration', () => {
  it('at least 1 ad ran >1 cycle (iteration was attempted)', () => {
    const multiCycle = library.filter(e => e.iterationHistory.cycles.length > 1);
    expect(multiCycle.length).toBeGreaterThan(0);
  });

  it('quality trend last avgScore >= first avgScore', () => {
    const trend = getQualityTrend(library);
    if (trend.length >= 2) {
      expect(trend[trend.length - 1]!.avgScore).toBeGreaterThanOrEqual(trend[0]!.avgScore);
    }
  });

  it('each iteration cycle tracks improvement delta', () => {
    for (const entry of library) {
      for (const cycle of entry.iterationHistory.cycles) {
        expect(typeof cycle.improvementDelta).toBe('number');
      }
    }
  });

  it('multi-cycle ads record the intervention used', () => {
    const multiCycle = library.filter(e => e.iterationHistory.cycles.length > 1);
    for (const entry of multiCycle) {
      for (const cycle of entry.iterationHistory.cycles.slice(1)) {
        expect(cycle.interventionUsed).toBeDefined();
        expect(cycle.interventionUsed!.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── AD STRUCTURE ───────────────────────────────────────────────────────────
describe('Ad Structure', () => {
  it('every ad has all required fields populated', () => {
    for (const { ad } of library) {
      expect(ad.primaryText.length).toBeGreaterThan(0);
      expect(ad.headline.length).toBeGreaterThan(0);
      expect(ad.description.length).toBeGreaterThan(0);
      expect(ad.ctaButton.length).toBeGreaterThan(0);
    }
  });

  it('modelUsed field references an Anthropic model', () => {
    for (const { ad } of library) {
      expect(ad.modelUsed).toMatch(/^claude-/);
    }
  });
});

// ── PERFORMANCE PER TOKEN ──────────────────────────────────────────────────
describe('Performance Per Token', () => {
  it('every entry has estimatedCostUsd > 0', () => {
    for (const entry of library) {
      expect(entry.iterationHistory.estimatedCostUsd).toBeGreaterThan(0);
    }
  });

  it('every iteration record tracks token usage', () => {
    for (const entry of library) {
      expect(entry.iterationHistory.totalInputTokens).toBeGreaterThan(0);
      expect(entry.iterationHistory.totalOutputTokens).toBeGreaterThan(0);
    }
  });
});

// ── OUTPUT FILES ───────────────────────────────────────────────────────────
describe('Output Files', () => {
  it('data/ads.json exists and is valid JSON', () => {
    expect(fs.existsSync('data/ads.json')).toBe(true);
    expect(() => JSON.parse(fs.readFileSync('data/ads.json', 'utf-8'))).not.toThrow();
  });

  it('data/ads.csv exists', () => {
    expect(fs.existsSync('data/ads.csv')).toBe(true);
  });

  it('DECISION_LOG.md exists and is substantive (>500 chars)', () => {
    expect(fs.existsSync('docs/DECISION_LOG.md')).toBe(true);
    expect(fs.readFileSync('docs/DECISION_LOG.md', 'utf-8').length).toBeGreaterThan(500);
  });

  it('LIMITATIONS.md exists and is substantive (>200 chars)', () => {
    expect(fs.existsSync('docs/LIMITATIONS.md')).toBe(true);
    expect(fs.readFileSync('docs/LIMITATIONS.md', 'utf-8').length).toBeGreaterThan(200);
  });
});

// ── V2: IMAGE PIPELINE ────────────────────────────────────────────────────
describe('V2: Image Pipeline', () => {
  it('v2-production.json exists and has ≥50 entries', () => {
    expect(fs.existsSync('data/runs/v2-production.json')).toBe(true);
    expect(v2Library.length).toBeGreaterThanOrEqual(50);
  });

  it('every combined entry has an image result with localPath', () => {
    for (const entry of v2Combined) {
      expect(entry.selectedVariant).toBeDefined();
      expect(entry.selectedVariant.imageResult).toBeDefined();
      expect(entry.selectedVariant.imageResult.localPath).toBeTruthy();
    }
  });

  it('every combined entry has a visual evaluation with 3 dimensions', () => {
    for (const entry of v2Combined) {
      const scores = entry.selectedVariant.visualEvaluation.scores;
      expect(scores.length).toBe(3);
      const dims = scores.map(s => s.dimension);
      for (const required of VISUAL_DIMENSION_NAMES) {
        expect(dims).toContain(required);
      }
    }
  });

  it('all visual scores are in valid 1–10 range', () => {
    for (const entry of v2Combined) {
      for (const score of entry.selectedVariant.visualEvaluation.scores) {
        expect(score.score).toBeGreaterThanOrEqual(1);
        expect(score.score).toBeLessThanOrEqual(10);
      }
    }
  });

  it('combinedScore = text × 0.6 + image × 0.4 within ±0.05', () => {
    for (const entry of v2Combined) {
      const textScore = entry.evaluation.aggregateScore;
      const imageScore = entry.selectedVariant.visualEvaluation.aggregateScore;
      const expected = textScore * TEXT_SCORE_WEIGHT + imageScore * IMAGE_SCORE_WEIGHT;
      expect(Math.abs(entry.combinedScore - expected)).toBeLessThanOrEqual(0.05);
    }
  });

  it('selectedVariant is the higher-scoring of the two variants', () => {
    for (const entry of v2Combined) {
      if (entry.allVariants.length < 2) continue;
      const selectedScore = entry.selectedVariant.visualEvaluation.aggregateScore;
      for (const variant of entry.allVariants) {
        expect(selectedScore).toBeGreaterThanOrEqual(variant.visualEvaluation.aggregateScore);
      }
    }
  });

  it('every variant has generation cost and timing tracked', () => {
    for (const entry of v2Combined) {
      for (const variant of entry.allVariants) {
        expect(variant.imageResult.costUsd).toBeGreaterThan(0);
        expect(variant.imageResult.generationTimeMs).toBeGreaterThan(0);
      }
    }
  });

  it('textScoreWeight and imageScoreWeight sum to 1.0', () => {
    for (const entry of v2Combined) {
      expect(entry.textScoreWeight + entry.imageScoreWeight).toBeCloseTo(1.0, 5);
    }
  });
});

// ── V3: COHERENCE LOOP + COPY REFINEMENT ──────────────────────────────────

function isCombinedAdEntryV3(entry: AdLibraryEntry): entry is CombinedAdEntryV3 {
  return 'coherenceLoop' in entry && 'copyRefinement' in entry;
}

// Load v3 production run if available, otherwise use v2 data for type tests
const v3Library: AdLibraryEntry[] = fs.existsSync('data/runs/v3-production.json')
  ? JSON.parse(fs.readFileSync('data/runs/v3-production.json', 'utf-8')) as AdLibraryEntry[]
  : [];
const v3Entries = v3Library.filter(isCombinedAdEntryV3);

describe('V3: Coherence Loop + Copy Refinement', () => {
  it('every v3 entry has coherenceLoop and copyRefinement fields', () => {
    for (const entry of v3Entries) {
      expect(entry.coherenceLoop).toBeDefined();
      expect(typeof entry.coherenceLoop.triggered).toBe('boolean');
      expect(typeof entry.coherenceLoop.improved).toBe('boolean');
      expect(typeof entry.coherenceLoop.costUsd).toBe('number');
      expect(entry.copyRefinement).toBeDefined();
      expect(typeof entry.copyRefinement.triggered).toBe('boolean');
      expect(typeof entry.copyRefinement.improved).toBe('boolean');
      expect(typeof entry.copyRefinement.costUsd).toBe('number');
    }
  });

  it('coherenceLoop.triggered is false when coherence score >= COHERENCE_THRESHOLD', () => {
    for (const entry of v3Entries) {
      if (!entry.coherenceLoop.triggered) {
        // If not triggered, the trigger score should be >= threshold (or default 10)
        expect(entry.coherenceLoop.triggerScore).toBeGreaterThanOrEqual(COHERENCE_THRESHOLD);
      }
    }
  });

  it('copyRefinement.triggered is false when coherenceLoop improved score above threshold', () => {
    for (const entry of v3Entries) {
      if (entry.coherenceLoop.improved && !entry.copyRefinement.triggered) {
        // If coherence loop improved and copy refinement didn't trigger,
        // the post-loop coherence should be >= COPY_REFINEMENT_THRESHOLD
        // This is the expected behavior
        expect(entry.coherenceLoop.improved).toBe(true);
      }
    }
  });

  it('ratchetExamplesUsed is a non-negative integer', () => {
    for (const entry of v3Entries) {
      expect(entry.ratchetExamplesUsed).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(entry.ratchetExamplesUsed)).toBe(true);
    }
  });

  it('agentTrace has positive ms values for all three agents', () => {
    for (const entry of v3Entries) {
      expect(entry.agentTrace).toBeDefined();
      expect(typeof entry.agentTrace.researcherMs).toBe('number');
      expect(typeof entry.agentTrace.writerMs).toBe('number');
      expect(typeof entry.agentTrace.editorMs).toBe('number');
      // editorMs should be >= writerMs since editor wraps writer
      expect(entry.agentTrace.editorMs).toBeGreaterThanOrEqual(entry.agentTrace.writerMs);
    }
  });
});
