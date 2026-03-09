"use client";

import { useEffect, useState } from "react";
import { useRun } from "./run-context";

interface DimensionScore {
  dimension: string;
  score: number;
  rationale: string;
  confidence: string;
}

interface Evaluation {
  aggregateScore: number;
  passesThreshold: boolean;
  scores: DimensionScore[];
}

interface Ad {
  id: string;
  briefId: string;
  primaryText: string;
  headline: string;
  description: string;
  ctaButton: string;
  modelUsed: string;
}

interface IterationCycle {
  cycle: number;
  evaluation: { aggregateScore: number };
  improvementDelta: number;
  interventionUsed?: string;
}

interface IterationHistory {
  cycles: IterationCycle[];
  converged: boolean;
  estimatedCostUsd: number;
}

interface AdEntry {
  ad: Ad;
  evaluation: Evaluation;
  iterationHistory: IterationHistory;
}

interface DimAverage {
  dimension: string;
  avgScore: number;
}

type SortKey = "score" | "briefId" | "cycles" | "cost";

function formatBriefId(briefId: string): string {
  return briefId
    .replace(/^brief-/, "")
    .replace(/-run(\d+)$/, " / Run $1")
    .split("-")
    .map((seg) =>
      seg
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .join(" / ");
}

function parseAudience(briefId: string): string {
  if (briefId.includes("parents_anxious")) return "Parents";
  if (briefId.includes("students_stressed")) return "Students";
  if (briefId.includes("comparison_shoppers")) return "Comparison";
  return "—";
}

function parseGoal(briefId: string): string {
  if (briefId.includes("conversion")) return "Conversion";
  if (briefId.includes("awareness")) return "Awareness";
  return "—";
}

function parseHook(briefId: string): string {
  if (briefId.includes("-question")) return "Question";
  if (briefId.includes("-stat")) return "Stat";
  if (briefId.includes("-story")) return "Story";
  if (briefId.includes("-fear")) return "Fear";
  return "—";
}

function dimScoreBg(score: number): string {
  if (score >= 8) return "bg-green-50 text-green-800";
  if (score >= 7) return "bg-orange-50 text-orange-700";
  return "bg-red-50 text-red-700";
}

function dimBarColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 7) return "bg-orange-400";
  return "bg-red-400";
}

function scoreBadge(score: number): string {
  if (score >= 8) return "bg-blue-100 text-blue-800";
  if (score >= 7) return "bg-orange-100 text-orange-800";
  return "bg-zinc-100 text-zinc-600";
}

const DIMENSION_LABELS: Record<string, string> = {
  clarity: "Clarity",
  value_proposition: "Value Prop",
  call_to_action: "CTA",
  brand_voice: "Brand Voice",
  emotional_resonance: "Emotion",
};

const THRESHOLD = 7.0;

export default function AdLibrary() {
  const { selectedRun } = useRun();
  const [entries, setEntries] = useState<AdEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [passingCount, setPassingCount] = useState(0);
  const [dimAverages, setDimAverages] = useState<DimAverage[]>([]);

  useEffect(() => {
    setLoading(true);
    const url = selectedRun ? `/api/ads?run=${encodeURIComponent(selectedRun)}` : "/api/ads";
    fetch(url)
      .then((r) => r.json())
      .then((data: { ads: AdEntry[]; stats: { passingCount: number }; dimAverages: DimAverage[] }) => {
        setEntries(data.ads);
        setPassingCount(data.stats.passingCount);
        setDimAverages(data.dimAverages ?? []);
        setLoading(false);
      });
  }, [selectedRun]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sorted = [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "score":
        cmp = a.evaluation.aggregateScore - b.evaluation.aggregateScore;
        break;
      case "briefId":
        cmp = a.ad.briefId.localeCompare(b.ad.briefId);
        break;
      case "cycles":
        cmp = a.iterationHistory.cycles.length - b.iterationHistory.cycles.length;
        break;
      case "cost":
        cmp = a.iterationHistory.estimatedCostUsd - b.iterationHistory.estimatedCostUsd;
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  if (loading) {
    return <p className="text-zinc-500 py-12 text-center">Loading ad library...</p>;
  }

  const passRate = entries.length > 0 ? Math.round((passingCount / entries.length) * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Ad Library</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {entries.length} ads generated — {passingCount} passing at {THRESHOLD}+ ({passRate}%)
          {selectedRun && <span className="ml-2 text-blue-600 font-medium">[{selectedRun}]</span>}
        </p>
      </div>

      {/* Dimension averages summary */}
      {dimAverages.length > 0 && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Average Dimension Scores
          </h2>
          <div className="flex flex-wrap gap-3">
            {dimAverages.map((d, i) => (
              <div
                key={d.dimension}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  i === 0
                    ? "border-red-200 bg-red-50"
                    : "border-zinc-200 bg-zinc-50"
                }`}
              >
                <span className={`font-medium ${i === 0 ? "text-red-700" : "text-zinc-700"}`}>
                  {DIMENSION_LABELS[d.dimension] ?? d.dimension}
                </span>
                <span className={`font-semibold ${i === 0 ? "text-red-800" : "text-zinc-900"}`}>
                  {d.avgScore.toFixed(1)}
                </span>
                {i === 0 && (
                  <span className="text-xs text-red-600 font-medium">weakest</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 cursor-pointer hover:text-zinc-800" onClick={() => handleSort("briefId")}>
                Brief {sortKey === "briefId" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-3">Audience</th>
              <th className="px-4 py-3">Goal</th>
              <th className="px-4 py-3">Hook</th>
              <th className="px-4 py-3 cursor-pointer hover:text-zinc-800" onClick={() => handleSort("score")}>
                Score {sortKey === "score" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-zinc-800" onClick={() => handleSort("cycles")}>
                Cycles {sortKey === "cycles" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-zinc-800" onClick={() => handleSort("cost")}>
                Cost {sortKey === "cost" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => {
              const isExpanded = expandedId === entry.ad.id;
              return (
                <AdRow
                  key={entry.ad.id}
                  entry={entry}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : entry.ad.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: AdEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { ad, evaluation, iterationHistory } = entry;
  const score = evaluation.aggregateScore;

  return (
    <>
      <tr
        className={`border-b border-zinc-100 cursor-pointer transition-colors hover:bg-zinc-50 ${isExpanded ? "bg-zinc-50" : ""}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-xs text-zinc-700 max-w-[280px]">
          {formatBriefId(ad.briefId)}
        </td>
        <td className="px-4 py-3">{parseAudience(ad.briefId)}</td>
        <td className="px-4 py-3">{parseGoal(ad.briefId)}</td>
        <td className="px-4 py-3">{parseHook(ad.briefId)}</td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreBadge(score)}`}>
            {score.toFixed(1)}
          </span>
        </td>
        <td className="px-4 py-3 text-zinc-600">{iterationHistory.cycles.length}</td>
        <td className="px-4 py-3 font-mono text-xs text-zinc-500">
          ${iterationHistory.estimatedCostUsd.toFixed(4)}
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={7} className="px-0 py-0">
            <AdDetail entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

function AdDetail({ entry }: { entry: AdEntry }) {
  const { ad, evaluation, iterationHistory } = entry;

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-5 space-y-5">
      {/* Ad Copy */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Ad Copy</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-400 mb-1">Primary Text</p>
            <p className="text-sm text-zinc-800 leading-relaxed">{ad.primaryText}</p>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-400 mb-1">Headline</p>
              <p className="text-sm font-semibold text-zinc-800">{ad.headline}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-400 mb-1">Description</p>
              <p className="text-sm text-zinc-700">{ad.description}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-400 mb-1">CTA Button</p>
              <span className="inline-block rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                {ad.ctaButton}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Dimension Scores */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Dimension Scores (aggregate: {evaluation.aggregateScore.toFixed(1)})
        </h3>
        <div className="space-y-2">
          {evaluation.scores.map((s) => (
            <div key={s.dimension} className={`rounded-lg border border-zinc-200 p-3 ${dimScoreBg(s.score)}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">
                  {DIMENSION_LABELS[s.dimension] ?? s.dimension}
                </span>
                <span className="text-sm font-semibold">{s.score}/10</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-200 overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full ${dimBarColor(s.score)}`}
                  style={{ width: `${s.score * 10}%` }}
                />
              </div>
              <p className="text-xs opacity-80">{s.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Iteration History */}
      {iterationHistory.cycles.length > 1 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Iteration History ({iterationHistory.cycles.length} cycles, {iterationHistory.converged ? "converged" : "did not converge"})
          </h3>
          <div className="space-y-2">
            {iterationHistory.cycles.map((cycle) => (
              <div key={cycle.cycle} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-zinc-700">Cycle {cycle.cycle}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBadge(cycle.evaluation.aggregateScore)}`}>
                    {cycle.evaluation.aggregateScore.toFixed(1)}
                  </span>
                  {cycle.improvementDelta !== 0 && (
                    <span className={`text-xs font-semibold ${cycle.improvementDelta > 0 ? "text-green-600" : "text-red-600"}`}>
                      {cycle.improvementDelta > 0 ? "+" : ""}{cycle.improvementDelta.toFixed(1)}
                    </span>
                  )}
                </div>
                {cycle.interventionUsed && (
                  <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">{cycle.interventionUsed}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
