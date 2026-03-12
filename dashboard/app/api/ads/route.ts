import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { ensureImages } from "../../../lib/ensure-images";

const THRESHOLD = 7.0;

interface DimensionScore {
  dimension: string;
  score: number;
}

interface CycleData {
  cycle: number;
  evaluation: { aggregateScore: number };
  improvementDelta: number;
  interventionUsed?: string;
}

interface VisualDimScore {
  dimension: string;
  score: number;
  rationale: string;
  confidence: string;
}

interface VisualEval {
  aggregateScore: number;
  passesThreshold: boolean;
  scores: VisualDimScore[];
  weakestDimension: VisualDimScore;
}

interface ImageResult {
  url?: string;        // fal.ai CDN URL — used by ensure-images to re-download if localPath is missing
  localPath: string;
  width: number;
  height: number;
  seed: number;
  generationTimeMs: number;
  costUsd: number;
}

interface AdVariant {
  imageResult: ImageResult;
  visualEvaluation: VisualEval;
}

interface CoherenceLoop {
  triggered: boolean;
  triggerScore: number;
  triggerRationale: string;
  improved: boolean;
  costUsd: number;
}

interface CopyRefinement {
  triggered: boolean;
  copySideSignal: string | null;
  improved: boolean;
  costUsd: number;
}

interface AdEntry {
  ad: { id: string; briefId: string };
  evaluation: { aggregateScore: number; scores: DimensionScore[] };
  iterationHistory: { cycles: CycleData[]; converged: boolean };
  // V2 fields (present on CombinedAdEntry)
  selectedVariant?: AdVariant;
  allVariants?: AdVariant[];
  combinedScore?: number;
  textScoreWeight?: number;
  imageScoreWeight?: number;
  // V3 fields (present on CombinedAdEntryV3)
  coherenceLoop?: CoherenceLoop;
  copyRefinement?: CopyRefinement;
  ratchetExamplesUsed?: number;
  competitorInsightsUsed?: boolean;
}

export async function GET(request: NextRequest) {
  const run = request.nextUrl.searchParams.get("run");
  const dataDir = path.resolve(process.cwd(), "..", "data");

  // Determine which file to load
  let adsPath: string;
  if (run) {
    adsPath = path.resolve(dataDir, "runs", `${run}.json`);
  } else {
    adsPath = path.resolve(dataDir, "ads.json");
  }

  if (!fs.existsSync(adsPath)) {
    return NextResponse.json({ ads: [], trend: [], stats: { passingCount: 0, avgCyclesToConverge: 0 }, availableRuns: listRuns(dataDir) });
  }

  const raw = fs.readFileSync(adsPath, "utf-8");
  const ads = JSON.parse(raw) as AdEntry[];

  // Ensure image files exist on disk; download from CDN URL if missing.
  // Only fires when files are actually absent — subsequent requests are instant.
  const imagesDir = path.resolve(dataDir, "images");
  await ensureImages(ads, adsPath, imagesDir);

  // Always evaluate passing against 7.0, not the stored passesThreshold
  const passingCount = ads.filter((a) => a.evaluation.aggregateScore >= THRESHOLD).length;

  // Compute quality trend (multi-cycle briefs only)
  const multiCycle = ads.filter((a) => a.iterationHistory.cycles.length > 1);

  const cycleBuckets = new Map<number, number[]>();
  for (const entry of multiCycle) {
    for (const cycle of entry.iterationHistory.cycles) {
      const scores = cycleBuckets.get(cycle.cycle) ?? [];
      scores.push(cycle.evaluation.aggregateScore);
      cycleBuckets.set(cycle.cycle, scores);
    }
  }

  const trend = [...cycleBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([cycle, scores]) => ({
      cycle,
      avgScore: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10,
      adCount: scores.length,
    }));

  // Compute avg cycles to converge (all ads)
  const totalCycles = ads.reduce((sum, a) => sum + a.iterationHistory.cycles.length, 0);
  const avgCyclesToConverge = ads.length > 0
    ? Math.round((totalCycles / ads.length) * 10) / 10
    : 0;

  // Compute weakest dimension on average
  const dimTotals = new Map<string, { sum: number; count: number }>();
  for (const entry of ads) {
    for (const s of entry.evaluation.scores) {
      const existing = dimTotals.get(s.dimension) ?? { sum: 0, count: 0 };
      existing.sum += s.score;
      existing.count++;
      dimTotals.set(s.dimension, existing);
    }
  }
  const dimAverages = [...dimTotals.entries()]
    .map(([dimension, { sum, count }]) => ({
      dimension,
      avgScore: Math.round((sum / count) * 10) / 10,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);

  // V2: Annotate each ad with isCombinedEntry flag and compute image stats
  const annotatedAds = ads.map((a) => ({
    ...a,
    isCombinedEntry: a.selectedVariant != null,
  }));

  const combinedEntries = ads.filter((a) => a.selectedVariant != null);
  const imageStats = computeImageStats(combinedEntries);

  // V3: Compute coherence/copy refinement stats
  const v3Entries = ads.filter((a) => a.coherenceLoop != null);
  const v3Stats = v3Entries.length > 0 ? {
    total: v3Entries.length,
    coherenceTriggered: v3Entries.filter((e) => e.coherenceLoop!.triggered).length,
    coherenceImproved: v3Entries.filter((e) => e.coherenceLoop!.improved).length,
    copyRefTriggered: v3Entries.filter((e) => e.copyRefinement?.triggered).length,
    copyRefImproved: v3Entries.filter((e) => e.copyRefinement?.improved).length,
  } : null;

  return NextResponse.json({
    ads: annotatedAds,
    trend,
    stats: { passingCount, avgCyclesToConverge },
    dimAverages,
    imageStats,
    v3Stats,
    availableRuns: listRuns(dataDir),
  });
}

function listRuns(dataDir: string): string[] {
  const runsDir = path.resolve(dataDir, "runs");
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

const VISUAL_DIMS = ["brand_consistency", "visual_engagement", "text_image_coherence"] as const;

function computeImageStats(entries: AdEntry[]) {
  if (entries.length === 0) {
    return {
      adsWithImages: 0,
      variantsGenerated: 0,
      imagePassRate: 0,
      avgVisualScore: 0,
      avgCombinedScore: 0,
      avgScoreByDimension: {} as Record<string, number>,
    };
  }

  const variantsGenerated = entries.reduce(
    (sum, e) => sum + (e.allVariants?.length ?? 0),
    0,
  );

  const passing = entries.filter(
    (e) => e.selectedVariant!.visualEvaluation.passesThreshold,
  ).length;

  const avgVisualScore =
    Math.round(
      (entries.reduce(
        (sum, e) => sum + e.selectedVariant!.visualEvaluation.aggregateScore,
        0,
      ) / entries.length) * 10,
    ) / 10;

  const avgCombinedScore =
    Math.round(
      (entries.reduce((sum, e) => sum + (e.combinedScore ?? 0), 0) /
        entries.length) * 10,
    ) / 10;

  const dimSums: Record<string, number> = {};
  for (const name of VISUAL_DIMS) dimSums[name] = 0;
  for (const entry of entries) {
    for (const s of entry.selectedVariant!.visualEvaluation.scores) {
      dimSums[s.dimension] = (dimSums[s.dimension] ?? 0) + s.score;
    }
  }
  const avgScoreByDimension: Record<string, number> = {};
  for (const name of VISUAL_DIMS) {
    avgScoreByDimension[name] =
      Math.round(((dimSums[name] ?? 0) / entries.length) * 10) / 10;
  }

  return {
    adsWithImages: entries.length,
    variantsGenerated,
    imagePassRate: Math.round((passing / entries.length) * 100),
    avgVisualScore,
    avgCombinedScore,
    avgScoreByDimension,
  };
}
