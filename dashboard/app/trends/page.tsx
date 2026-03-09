"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useRun } from "../run-context";

interface TrendPoint {
  cycle: number;
  avgScore: number;
  adCount: number;
}

interface ApiResponse {
  ads: Array<{ evaluation: { aggregateScore: number }; iterationHistory: { cycles: unknown[] } }>;
  trend: TrendPoint[];
  stats: { passingCount: number; avgCyclesToConverge: number };
}

const THRESHOLD = 7.0;

export default function TrendsPage() {
  const { selectedRun } = useRun();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAds, setTotalAds] = useState(0);
  const [passingCount, setPassingCount] = useState(0);
  const [avgCycles, setAvgCycles] = useState(0);

  useEffect(() => {
    setLoading(true);
    const url = selectedRun ? `/api/ads?run=${encodeURIComponent(selectedRun)}` : "/api/ads";
    fetch(url)
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        setTrend(data.trend);
        setTotalAds(data.ads.length);
        setPassingCount(data.stats.passingCount);
        setAvgCycles(data.stats.avgCyclesToConverge);
        setLoading(false);
      });
  }, [selectedRun]);

  if (loading) {
    return (
      <p className="text-zinc-500 py-12 text-center">Loading trend data...</p>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Quality Trends
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Average score by iteration cycle across multi-cycle briefs
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
        <StatCard
          label="Multi-Cycle Briefs"
          value={trend.length > 0 ? trend[0]!.adCount.toString() : "0"}
        />
        <StatCard
          label="Avg Cycles to Converge"
          value={avgCycles > 0 ? avgCycles.toFixed(1) : "—"}
        />
      </div>

      {/* Chart */}
      {trend.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">
            Average Score by Iteration Cycle (multi-cycle briefs only)
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={trend}
              margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis
                dataKey="cycle"
                label={{
                  value: "Iteration Cycle",
                  position: "insideBottom",
                  offset: -5,
                  style: { fill: "#71717a", fontSize: 12 },
                }}
                tick={{ fill: "#71717a", fontSize: 12 }}
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
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  fontSize: 13,
                }}
                formatter={(value) => [
                  Number(value).toFixed(1),
                  "Avg Score",
                ]}
                labelFormatter={(label) => `Cycle ${label}`}
              />
              <ReferenceLine
                y={7}
                stroke="#ea580c"
                strokeDasharray="6 4"
                label={{
                  value: "Threshold (7.0)",
                  position: "right",
                  fill: "#ea580c",
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 5, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 7, fill: "#2563eb" }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Data table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2">Cycle</th>
                  <th className="px-4 py-2">Avg Score</th>
                  <th className="px-4 py-2">Ads at this Cycle</th>
                  <th className="px-4 py-2">Delta from Cycle 1</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((t) => {
                  const delta = t.avgScore - trend[0]!.avgScore;
                  return (
                    <tr
                      key={t.cycle}
                      className="border-b border-zinc-100"
                    >
                      <td className="px-4 py-2 font-medium">{t.cycle}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            t.avgScore >= 8
                              ? "bg-blue-100 text-blue-800"
                              : t.avgScore >= 7
                                ? "bg-orange-100 text-orange-800"
                                : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {t.avgScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-zinc-600">{t.adCount}</td>
                      <td className="px-4 py-2">
                        {t.cycle === 1 ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          <span
                            className={`text-xs font-semibold ${
                              delta > 0
                                ? "text-green-600"
                                : delta < 0
                                  ? "text-red-600"
                                  : "text-zinc-500"
                            }`}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(1)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-zinc-500">
            No multi-cycle iteration data available. Run the pipeline with a
            higher quality threshold to generate trend data.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
