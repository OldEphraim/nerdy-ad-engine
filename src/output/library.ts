// ── Ad library persistence (JSON + CSV) ──────────────────────────────────
// All ads, evaluations, and iteration records persisted to data/ads.json
// and data/ads.csv for the dashboard and spec compliance tests.

import * as fs from 'fs';
import * as path from 'path';
import type { AdLibraryEntry } from '../types.js';

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
