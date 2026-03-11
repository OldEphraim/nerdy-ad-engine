"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { useRun } from "../run-context";

// ── Types ──────────────────────────────────────────────────────────────────

interface AdCycle {
  cycle: number;
  evaluation: { aggregateScore: number };
  improvementDelta?: number;
}

interface V3Stats {
  total: number;
  coherenceTriggered: number;
  coherenceImproved: number;
  copyRefTriggered: number;
  copyRefImproved: number;
}

interface AdSummary {
  ad: { briefId: string };
  evaluation: { aggregateScore: number };
  iterationHistory: { cycles: AdCycle[] };
  combinedScore?: number;
  coherenceLoop?: { triggered: boolean; improved: boolean };
}

interface ApiResponse {
  ads: AdSummary[];
  trend: { cycle: number; avgScore: number; adCount: number }[];
  stats: { passingCount: number; avgCyclesToConverge: number };
  v3Stats?: V3Stats;
}

interface SimpleChartPoint {
  cycle: number;
  avgAll: number;
  avgPassed: number | null;
  avgStillIterating: number | null;
  count: number;
  convergedHere: number;
  totalConverged: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const THRESHOLD = 7.0;

const SCORE_BUCKETS = [
  { range: "7.0–7.4", min: 7.0, max: 7.5 },
  { range: "7.5–7.9", min: 7.5, max: 8.0 },
  { range: "8.0–8.4", min: 8.0, max: 8.5 },
  { range: "8.5–9.0+", min: 8.5, max: Infinity },
];

// ── Data computation ───────────────────────────────────────────────────────

function parseHook(briefId: string): string {
  if (briefId.includes("-question")) return "Question";
  if (briefId.includes("-stat")) return "Stat";
  if (briefId.includes("-story")) return "Story";
  if (briefId.includes("-fear")) return "Fear";
  return "Other";
}

function avg(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10;
}

/**
 * Build simple cycle chart data.
 *
 * For each cycle N, ALL ads are included in avgAll:
 * - Ads still iterating at cycle N: use their actual score at cycles[N-1]
 * - Ads that converged before cycle N (cycles.length < N): carry forward
 *   their final converged score into cycle N and all subsequent cycles
 *
 * This means every cycle point includes exactly ads.length values, so the
 * line never drops due to sample-size changes — it reflects true population avg.
 *
 * avgPassed: same carry-forward logic, filtered to eventual passers (final >= 7)
 * avgStillIterating: only ads still active at cycle N (no carry-forward needed)
 */
function buildSimpleChartData(ads: AdSummary[]): SimpleChartPoint[] {
  if (ads.length === 0) return [];

  const maxCycle = Math.max(...ads.map((a) => a.iterationHistory.cycles.length));
  const points: SimpleChartPoint[] = [];
  let totalConverged = 0;

  for (let cycle = 1; cycle <= maxCycle; cycle++) {
    // All ads: actual score at cycle N if available, else carry forward final score
    const allScores = ads.map((a) => {
      const n = a.iterationHistory.cycles.length;
      const idx = cycle <= n ? cycle - 1 : n - 1;
      return a.iterationHistory.cycles[idx]!.evaluation.aggregateScore;
    });

    // Eventual passers only (same carry-forward logic)
    const passedScores = ads
      .filter((a) => a.evaluation.aggregateScore >= THRESHOLD)
      .map((a) => {
        const n = a.iterationHistory.cycles.length;
        const idx = cycle <= n ? cycle - 1 : n - 1;
        return a.iterationHistory.cycles[idx]!.evaluation.aggregateScore;
      });

    // Still iterating: ads not yet converged at this cycle (no carry-forward)
    const stillIteratingScores = ads
      .filter((a) => a.iterationHistory.cycles.length > cycle)
      .map((a) => a.iterationHistory.cycles[cycle - 1]!.evaluation.aggregateScore);

    const convergedHere = ads.filter(
      (a) => a.iterationHistory.cycles.length === cycle,
    ).length;
    totalConverged += convergedHere;

    points.push({
      cycle,
      avgAll: avg(allScores) ?? 0,
      avgPassed: avg(passedScores),
      avgStillIterating: avg(stillIteratingScores),
      count: ads.length,
      convergedHere,
      totalConverged,
    });
  }

  return points;
}

function buildScoreDistribution(ads: AdSummary[]): { range: string; count: number; label: string }[] {
  const totals = Object.fromEntries(SCORE_BUCKETS.map((b) => [b.range, 0]));
  for (const ad of ads) {
    const s = ad.combinedScore ?? ad.evaluation.aggregateScore;
    for (const bucket of SCORE_BUCKETS) {
      if (s >= bucket.min && s < bucket.max) {
        totals[bucket.range]!++;
        break;
      }
    }
  }
  return SCORE_BUCKETS.map((b) => ({
    range: b.range,
    count: totals[b.range] ?? 0,
    label: `${totals[b.range]} (${ads.length > 0 ? Math.round(((totals[b.range] ?? 0) / ads.length) * 100) : 0}%)`,
  }));
}

function buildHookPerformance(ads: AdSummary[]): { hook: string; avgScore: number; count: number }[] {
  const buckets: Record<string, { sum: number; count: number }> = {};
  for (const ad of ads) {
    const hook = parseHook(ad.ad.briefId);
    const score = ad.combinedScore ?? ad.evaluation.aggregateScore;
    if (!buckets[hook]) buckets[hook] = { sum: 0, count: 0 };
    buckets[hook]!.sum += score;
    buckets[hook]!.count++;
  }
  return Object.entries(buckets)
    .map(([hook, { sum, count }]) => ({
      hook,
      avgScore: Math.round((sum / count) * 10) / 10,
      count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3);
}

// ── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name: string;
  value: number;
  dataKey: string;
}

function CycleTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  if (!point) return null;

  // Pull the full data point from payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (point as any).payload as SimpleChartPoint;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm">
      <p className="font-medium text-zinc-700 mb-2">
        Cycle {label} <span className="text-zinc-400 font-normal">({data.count} ads)</span>
      </p>
      <p className="text-xs text-blue-600">
        Avg (all ads): {data.avgAll.toFixed(1)}
      </p>
      {data.avgPassed !== null && (
        <p className="text-xs text-green-600">
          Avg (passed ≥{THRESHOLD}): {data.avgPassed.toFixed(1)}
        </p>
      )}
      {data.avgStillIterating !== null && (
        <p className="text-xs text-orange-500">
          Avg (still iterating): {data.avgStillIterating.toFixed(1)}
        </p>
      )}
    </div>
  );
}

// ── Page component ─────────────────────────────────────────────────────────

export default function TrendsPage() {
  const { selectedRun } = useRun();
  const [ads, setAds] = useState<AdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAds, setTotalAds] = useState(0);
  const [passingCount, setPassingCount] = useState(0);
  const [avgCycles, setAvgCycles] = useState(0);
  const [v3Stats, setV3Stats] = useState<V3Stats | null>(null);
  const [hasV3Data, setHasV3Data] = useState(false);

  useEffect(() => {
    setLoading(true);
    const url = selectedRun ? `/api/ads?run=${encodeURIComponent(selectedRun)}` : "/api/ads";
    fetch(url)
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        setAds(data.ads);
        setTotalAds(data.ads.length);
        setPassingCount(data.stats.passingCount);
        setAvgCycles(data.stats.avgCyclesToConverge);
        const v3 = data.v3Stats ?? null;
        setV3Stats(v3);
        setHasV3Data(v3 !== null);
        setLoading(false);
      });
  }, [selectedRun]);

  if (loading) {
    return <p className="text-zinc-500 py-12 text-center">Loading trend data...</p>;
  }

  const multiCycleCount = ads.filter((a) => a.iterationHistory.cycles.length > 1).length;
  const chartData = buildSimpleChartData(ads);
  const hasChartData = chartData.length > 0;

  const scoreDist = buildScoreDistribution(ads);
  const hookPerf = buildHookPerformance(ads);
  const maxDistCount = Math.max(...scoreDist.map((d) => d.count), 1);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Quality Trends</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Average score across all ads by iteration cycle
          {selectedRun && <span className="ml-2 text-blue-600 font-medium">[{selectedRun}]</span>}
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <StatCard label="Total Ads" value={totalAds.toString()} />
        <StatCard
          label={`Passing (≥${THRESHOLD})`}
          value={`${passingCount} (${totalAds > 0 ? Math.round((passingCount / totalAds) * 100) : 0}%)`}
        />
        <StatCard label="Multi-Cycle Briefs" value={multiCycleCount.toString()} />
        <StatCard
          label="Avg Cycles to Converge"
          value={avgCycles > 0 ? avgCycles.toFixed(1) : "—"}
        />
      </div>

      {/* Iteration cycle chart */}
      {hasChartData ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 mb-8">
          <h2 className="text-sm font-semibold text-zinc-700 mb-1">
            Iteration Quality by Cycle
          </h2>
          <p className="text-xs text-zinc-400 mb-6">
            Average score of all ads at each iteration cycle. Hover for breakdown by eventual outcome.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 10, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis
                dataKey="cycle"
                label={{
                  value: "Iteration Cycle",
                  position: "insideBottom",
                  offset: -10,
                  style: { fill: "#71717a", fontSize: 12 },
                }}
                tick={{ fill: "#71717a", fontSize: 12 }}
                allowDecimals={false}
              />
              <YAxis
                domain={[5, 10]}
                label={{
                  value: "Avg Score",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fill: "#71717a", fontSize: 12 },
                }}
                tick={{ fill: "#71717a", fontSize: 12 }}
              />
              <Tooltip content={<CycleTooltip />} />
              <Line
                type="monotone"
                dataKey="avgAll"
                name="Avg score"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 5, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 7 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2">Cycle</th>
                  <th className="px-4 py-2">Avg All Ads</th>
                  <th className="px-4 py-2">Converged at This Cycle</th>
                  <th className="px-4 py-2">Total Converged So Far</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr key={row.cycle} className="border-b border-zinc-100">
                    <td className="px-4 py-2 font-medium">{row.cycle}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.avgAll >= 8
                            ? "bg-blue-100 text-blue-800"
                            : row.avgAll >= 7
                              ? "bg-orange-100 text-orange-800"
                              : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {row.avgAll.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-600">{row.convergedHere}</td>
                    <td className="px-4 py-2 text-zinc-600">{row.totalConverged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center mb-8">
          <p className="text-zinc-500">
            No iteration data available. Run the pipeline to generate trend data.
          </p>
        </div>
      )}

      {/* Combined Score Distribution */}
      {ads.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 mb-8">
          <h2 className="text-sm font-semibold text-zinc-700 mb-6">
            Combined Score Distribution
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              layout="vertical"
              data={scoreDist}
              margin={{ top: 0, right: 100, left: 16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, maxDistCount]}
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="range"
                width={72}
                tick={{ fill: "#52525b", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "#f4f4f5" }}
                contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13 }}
                formatter={(value) => [value, "Ads"]}
              />
              <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} maxBarSize={32}>
                <LabelList
                  dataKey="label"
                  position="right"
                  style={{ fill: "#3f3f46", fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column: V3 Pipeline Activity + Top Hook Types */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* V3 Pipeline Activity */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">V3 Pipeline Activity</h2>
          {hasV3Data && v3Stats ? (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Coherence Loop Triggered"
                value={`${v3Stats.coherenceTriggered}/${v3Stats.total} (${v3Stats.total > 0 ? Math.round((v3Stats.coherenceTriggered / v3Stats.total) * 100) : 0}%)`}
              />
              <StatCard
                label="Coherence Improved"
                value={`${v3Stats.coherenceImproved}/${v3Stats.coherenceTriggered} (${v3Stats.coherenceTriggered > 0 ? Math.round((v3Stats.coherenceImproved / v3Stats.coherenceTriggered) * 100) : 0}%)`}
              />
              <StatCard
                label="Copy Refinement Triggered"
                value={`${v3Stats.copyRefTriggered}/${v3Stats.total} (${v3Stats.total > 0 ? Math.round((v3Stats.copyRefTriggered / v3Stats.total) * 100) : 0}%)`}
              />
              <StatCard
                label="Copy Refinement Improved"
                value={`${v3Stats.copyRefImproved}/${v3Stats.copyRefTriggered} (${v3Stats.copyRefTriggered > 0 ? Math.round((v3Stats.copyRefImproved / v3Stats.copyRefTriggered) * 100) : 0}%)`}
              />
            </div>
          ) : ads.length > 0 ? (
            <p className="rounded-lg bg-zinc-50 px-4 py-3 text-xs text-zinc-500 leading-relaxed">
              V3 pipeline features (coherence loop, copy refinement, quality ratchet) were not active for this run.
            </p>
          ) : null}
        </div>

        {/* Top Hook Types */}
        {hookPerf.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-700 mb-4">
              Top Hook Types by Avg Combined Score
            </h2>
            <div className="space-y-3">
              {hookPerf.map((h, i) => (
                <div key={h.hook} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-zinc-700">{h.hook}</span>
                    <span className="text-xs text-zinc-400">{h.count} ads</span>
                  </div>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      h.avgScore >= 8
                        ? "bg-blue-100 text-blue-800"
                        : h.avgScore >= 7
                          ? "bg-orange-100 text-orange-800"
                          : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {h.avgScore.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
