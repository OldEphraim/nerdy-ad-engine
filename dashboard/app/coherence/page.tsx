"use client";

import { useEffect, useState } from "react";
import { useRun } from "../run-context";

interface VisualScore {
  dimension: string;
  score: number;
  rationale: string;
}

interface VisualEval {
  aggregateScore: number;
  scores: VisualScore[];
}

interface AdVariant {
  imageResult: { localPath: string };
  visualEvaluation: VisualEval;
}

interface CoherenceLoop {
  triggered: boolean;
  improved: boolean;
  triggerScore: number;
  triggerRationale: string;
}

interface CopyRefinement {
  triggered: boolean;
  improved: boolean;
  copySideSignal: string | null;
}

interface AdEntry {
  ad: { id: string; briefId: string; primaryText: string; headline: string };
  evaluation: { aggregateScore: number };
  selectedVariant?: AdVariant;
  combinedScore?: number;
  coherenceLoop?: CoherenceLoop;
  copyRefinement?: CopyRefinement;
}

function getCoherenceScore(entry: AdEntry): number {
  const scores = entry.selectedVariant?.visualEvaluation?.scores;
  if (!scores) return -1;
  const coherence = scores.find((s) => s.dimension === "text_image_coherence");
  return coherence?.score ?? -1;
}

function getCoherenceRationale(entry: AdEntry): string {
  const scores = entry.selectedVariant?.visualEvaluation?.scores;
  if (!scores) return "";
  const coherence = scores.find((s) => s.dimension === "text_image_coherence");
  return coherence?.rationale ?? "";
}

function badgeClass(triggered: boolean, improved: boolean): string {
  if (!triggered) return "";
  return improved
    ? "bg-green-100 text-green-700"
    : "bg-yellow-100 text-yellow-700";
}

export default function CoherenceAnalysis() {
  const { selectedRun } = useRun();
  const [entries, setEntries] = useState<AdEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const url = selectedRun
      ? `/api/ads?run=${encodeURIComponent(selectedRun)}`
      : "/api/ads";
    fetch(url)
      .then((r) => r.json())
      .then((data: { ads: AdEntry[] }) => {
        // Only show entries with visual evaluation data
        const withImages = data.ads.filter(
          (e) => e.selectedVariant?.visualEvaluation != null
        );
        // Sort by coherence score ascending
        withImages.sort((a, b) => getCoherenceScore(a) - getCoherenceScore(b));
        setEntries(withImages);
        setLoading(false);
      });
  }, [selectedRun]);

  if (loading) {
    return (
      <p className="text-zinc-500 py-12 text-center">
        Loading coherence data...
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-4">
          Coherence Analysis
        </h1>
        <p className="text-zinc-500">
          No image pipeline data available. Run the v3 pipeline to generate
          coherence analysis data.
        </p>
      </div>
    );
  }

  const coherenceScores = entries.map(getCoherenceScore).filter((s) => s >= 0);
  const avgCoherence =
    coherenceScores.length > 0
      ? Math.round(
          (coherenceScores.reduce((s, v) => s + v, 0) /
            coherenceScores.length) *
            10
        ) / 10
      : 0;
  const below7 = coherenceScores.filter((s) => s < 7).length;
  const loopTriggered = entries.filter(
    (e) => e.coherenceLoop?.triggered
  ).length;
  const loopImproved = entries.filter((e) => e.coherenceLoop?.improved).length;
  const copyTriggered = entries.filter(
    (e) => e.copyRefinement?.triggered
  ).length;
  const copyImproved = entries.filter(
    (e) => e.copyRefinement?.improved
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Coherence Analysis
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Text-image coherence scores sorted ascending — lowest coherence first
          {selectedRun && (
            <span className="ml-2 text-blue-600 font-medium">
              [{selectedRun}]
            </span>
          )}
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Avg Coherence</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {avgCoherence}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Below 7.0</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{below7}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">
            Image Loop Triggered
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {loopTriggered}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">
            Image Loop Improved
          </p>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            {loopImproved}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Copy Refined</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {copyTriggered}{" "}
            <span className="text-sm font-normal text-green-600">
              ({copyImproved} improved)
            </span>
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Brief</th>
              <th className="px-4 py-3">Coherence</th>
              <th className="px-4 py-3">Combined</th>
              <th className="px-4 py-3">Image Loop</th>
              <th className="px-4 py-3">Copy Refinement</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const coherenceScore = getCoherenceScore(entry);
              const isExpanded = expandedId === entry.ad.id;
              return (
                <CoherenceRow
                  key={entry.ad.id}
                  entry={entry}
                  coherenceScore={coherenceScore}
                  isExpanded={isExpanded}
                  onToggle={() =>
                    setExpandedId(isExpanded ? null : entry.ad.id)
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoherenceRow({
  entry,
  coherenceScore,
  isExpanded,
  onToggle,
}: {
  entry: AdEntry;
  coherenceScore: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const scoreBg =
    coherenceScore >= 8
      ? "bg-green-100 text-green-800"
      : coherenceScore >= 7
        ? "bg-orange-100 text-orange-800"
        : "bg-red-100 text-red-800";

  return (
    <>
      <tr
        className={`border-b border-zinc-100 cursor-pointer transition-colors hover:bg-zinc-50 ${isExpanded ? "bg-zinc-50" : ""}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-xs text-zinc-700">
          {entry.ad.briefId.replace(/^brief-/, "")}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreBg}`}
          >
            {coherenceScore >= 0 ? coherenceScore.toFixed(1) : "—"}
          </span>
        </td>
        <td className="px-4 py-3 text-zinc-600">
          {entry.combinedScore?.toFixed(1) ?? "—"}
        </td>
        <td className="px-4 py-3">
          {entry.coherenceLoop?.triggered && (
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(true, entry.coherenceLoop.improved)}`}
            >
              {entry.coherenceLoop.improved
                ? "\u2713 Improved"
                : "\uD83D\uDD01 Triggered"}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {entry.copyRefinement?.triggered && (
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(true, entry.copyRefinement.improved)}`}
            >
              {entry.copyRefinement.improved
                ? "\u2713 Improved"
                : "\u270F\uFE0F Triggered"}
            </span>
          )}
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={5} className="px-0 py-0">
            <CoherenceDetail entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

function CoherenceDetail({ entry }: { entry: AdEntry }) {
  const rationale = getCoherenceRationale(entry);
  const coherenceScore = getCoherenceScore(entry);

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-5 space-y-4">
      {/* Coherence rationale */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Coherence Score: {coherenceScore >= 0 ? coherenceScore.toFixed(1) : "—"}
        </h3>
        {rationale && (
          <p className="text-sm text-zinc-700 leading-relaxed">{rationale}</p>
        )}
      </div>

      {/* Ad copy preview */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Ad Copy
        </h3>
        <p className="text-sm text-zinc-800">{entry.ad.primaryText}</p>
        <p className="text-sm font-semibold text-zinc-700 mt-1">
          {entry.ad.headline}
        </p>
      </div>

      {/* Image thumbnail */}
      {entry.selectedVariant && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Selected Image
          </h3>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images/${entry.ad.id}`}
              alt={`Ad creative for ${entry.ad.headline}`}
              className="rounded max-h-[200px] w-auto"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Loop details */}
      {entry.coherenceLoop?.triggered && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Coherence Loop
          </h3>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm space-y-1">
            <p>
              <span className="font-medium text-zinc-600">Trigger score:</span>{" "}
              {entry.coherenceLoop.triggerScore}
            </p>
            <p>
              <span className="font-medium text-zinc-600">Result:</span>{" "}
              {entry.coherenceLoop.improved
                ? "Variant 3 replaced the winner"
                : "Variant 3 did not improve"}
            </p>
            {entry.coherenceLoop.triggerRationale && (
              <p className="text-xs text-zinc-500 mt-2">
                {entry.coherenceLoop.triggerRationale}
              </p>
            )}
          </div>
        </div>
      )}

      {entry.copyRefinement?.triggered && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Copy Refinement
          </h3>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm space-y-1">
            <p>
              <span className="font-medium text-zinc-600">Signal:</span>{" "}
              {entry.copyRefinement.copySideSignal ?? "No copy-side signal"}
            </p>
            <p>
              <span className="font-medium text-zinc-600">Result:</span>{" "}
              {entry.copyRefinement.improved
                ? "Copy was refined and improved combined score"
                : "Copy refinement did not improve"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
