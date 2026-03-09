import { describe, it, expect } from 'vitest';
import { readAdLibrary } from '../src/output/library.js';
import { getQualityTrend } from '../src/output/trends.js';
import { DIMENSION_NAMES, DIMENSION_WEIGHTS } from '../src/types.js';
import * as fs from 'fs';

const library = readAdLibrary();

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
