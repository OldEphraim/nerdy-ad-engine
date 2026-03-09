import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

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

interface AdEntry {
  ad: { id: string; briefId: string };
  evaluation: { aggregateScore: number; scores: DimensionScore[] };
  iterationHistory: { cycles: CycleData[]; converged: boolean };
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

  return NextResponse.json({
    ads,
    trend,
    stats: { passingCount, avgCyclesToConverge },
    dimAverages,
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
