// ── Ad library persistence (JSON + CSV) ──────────────────────────────────
// All ads, evaluations, and iteration records persisted to data/ads.json
// and data/ads.csv for the dashboard and spec compliance tests.

import * as fs from 'fs';
import * as path from 'path';
import type { AdLibraryEntry, CombinedAdEntry, VisualDimensionName } from '../types.js';
import { VISUAL_DIMENSION_NAMES } from '../types.js';

const DATA_DIR = path.resolve('data');
const JSON_PATH = path.join(DATA_DIR, 'ads.json');
const CSV_PATH = path.join(DATA_DIR, 'ads.csv');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readAdLibrary(): AdLibraryEntry[] {
  if (!fs.existsSync(JSON_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  return JSON.parse(raw) as AdLibraryEntry[];
}

export function writeAdLibrary(entries: AdLibraryEntry[]): void {
  ensureDataDir();
  fs.writeFileSync(JSON_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  writeCsv(entries);
}

export function appendToLibrary(entry: AdLibraryEntry): void {
  const existing = readAdLibrary();
  existing.push(entry);
  writeAdLibrary(existing);
}

export function appendManyToLibrary(newEntries: AdLibraryEntry[]): void {
  const existing = readAdLibrary();
  existing.push(...newEntries);
  writeAdLibrary(existing);
}

// ── CSV export ───────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'id', 'briefId', 'primaryText', 'headline', 'description', 'ctaButton',
  'clarity', 'value_proposition', 'call_to_action', 'brand_voice', 'emotional_resonance',
  'aggregate', 'passes_threshold', 'iteration_cycles',
  'total_input_tokens', 'total_output_tokens', 'estimated_cost_usd',
];

function writeCsv(entries: AdLibraryEntry[]): void {
  const rows = [CSV_HEADERS.join(',')];

  for (const entry of entries) {
    const { ad, evaluation, iterationHistory } = entry;
    const scoreMap = new Map(evaluation.scores.map(s => [s.dimension, s.score]));

    const row = [
      csvEscape(ad.id),
      csvEscape(ad.briefId),
      csvEscape(ad.primaryText),
      csvEscape(ad.headline),
      csvEscape(ad.description),
      csvEscape(ad.ctaButton),
      scoreMap.get('clarity') ?? '',
      scoreMap.get('value_proposition') ?? '',
      scoreMap.get('call_to_action') ?? '',
      scoreMap.get('brand_voice') ?? '',
      scoreMap.get('emotional_resonance') ?? '',
      evaluation.aggregateScore,
      evaluation.passesThreshold,
      iterationHistory.cycles.length,
      iterationHistory.totalInputTokens,
      iterationHistory.totalOutputTokens,
      iterationHistory.estimatedCostUsd.toFixed(6),
    ];

    rows.push(row.join(','));
  }

  fs.writeFileSync(CSV_PATH, rows.join('\n') + '\n', 'utf-8');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── V2: Image stats ─────────────────────────────────────────────────────────

/** Type guard: check if an entry has image data */
export function isCombinedAdEntry(entry: AdLibraryEntry): entry is CombinedAdEntry {
  return 'selectedVariant' in entry && entry.selectedVariant != null;
}

export interface ImageStats {
  variantsGenerated: number;
  imagePassRate: number;
  avgVisualScore: number;
  avgCombinedScore: number;
  weakestVisualDimension: VisualDimensionName;
  avgScoreByDimension: Record<VisualDimensionName, number>;
}

export function getImageStats(entries: CombinedAdEntry[]): ImageStats {
  if (entries.length === 0) {
    return {
      variantsGenerated: 0,
      imagePassRate: 0,
      avgVisualScore: 0,
      avgCombinedScore: 0,
      weakestVisualDimension: 'brand_consistency',
      avgScoreByDimension: { brand_consistency: 0, visual_engagement: 0, text_image_coherence: 0 },
    };
  }

  const variantsGenerated = entries.reduce((sum, e) => sum + e.allVariants.length, 0);

  const passingImages = entries.filter(
    (e) => e.selectedVariant.visualEvaluation.passesThreshold,
  ).length;
  const imagePassRate = passingImages / entries.length;

  const avgVisualScore =
    Math.round(
      (entries.reduce((sum, e) => sum + e.selectedVariant.visualEvaluation.aggregateScore, 0) /
        entries.length) *
        10,
    ) / 10;

  const avgCombinedScore =
    Math.round(
      (entries.reduce((sum, e) => sum + e.combinedScore, 0) / entries.length) * 10,
    ) / 10;

  // Per-dimension averages
  const dimSums: Record<string, number> = {};
  for (const name of VISUAL_DIMENSION_NAMES) {
    dimSums[name] = 0;
  }
  for (const entry of entries) {
    for (const score of entry.selectedVariant.visualEvaluation.scores) {
      dimSums[score.dimension] = (dimSums[score.dimension] ?? 0) + score.score;
    }
  }

  const avgScoreByDimension = {} as Record<VisualDimensionName, number>;
  let weakestDim: VisualDimensionName = VISUAL_DIMENSION_NAMES[0];
  let weakestAvg = Infinity;

  for (const name of VISUAL_DIMENSION_NAMES) {
    const avg = Math.round(((dimSums[name] ?? 0) / entries.length) * 10) / 10;
    avgScoreByDimension[name] = avg;
    if (avg < weakestAvg) {
      weakestAvg = avg;
      weakestDim = name;
    }
  }

  return {
    variantsGenerated,
    imagePassRate,
    avgVisualScore,
    avgCombinedScore,
    weakestVisualDimension: weakestDim,
    avgScoreByDimension,
  };
}
