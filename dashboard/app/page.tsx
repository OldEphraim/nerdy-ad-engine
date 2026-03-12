"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useRun } from "./run-context";
import { AdDetailModal, type ModalAdEntry } from "../components/AdDetailModal";

// ── Types ──────────────────────────────────────────────────────────────────

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

interface VisualScore {
  dimension: string;
  score: number;
  rationale: string;
  confidence: string;
}

interface VisualEval {
  aggregateScore: number;
  passesThreshold: boolean;
  scores: VisualScore[];
}

interface AdVariant {
  imageResult: { localPath: string; width: number; height: number; seed: number };
  visualEvaluation: VisualEval;
}

interface CoherenceLoop {
  triggered: boolean;
  improved: boolean;
  triggerScore: number;
}

interface CopyRefinement {
  triggered: boolean;
  improved: boolean;
}

interface AdEntry {
  ad: Ad;
  evaluation: Evaluation;
  iterationHistory: IterationHistory;
  isCombinedEntry?: boolean;
  selectedVariant?: AdVariant;
  allVariants?: AdVariant[];
  combinedScore?: number;
  coherenceLoop?: CoherenceLoop;
  copyRefinement?: CopyRefinement;
  ratchetExamplesUsed?: number;
  competitorInsightsUsed?: boolean;
}

interface DimAverage {
  dimension: string;
  avgScore: number;
}

type SortKey = "score" | "combined" | "briefId" | "cycles" | "cost";
type Audience = "parents_anxious" | "students_stressed" | "comparison_shoppers";
type CampaignGoal = "awareness" | "conversion";
type HookType = "question" | "stat" | "story" | "fear";

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const THRESHOLD = 7.0;

// ── Formatting helpers ─────────────────────────────────────────────────────

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
  brand_consistency: "Brand Consistency",
  visual_engagement: "Visual Engagement",
  text_image_coherence: "Text-Image Coherence",
};

// ── Tooltip ────────────────────────────────────────────────────────────────

function InfoTooltip({
  text,
  align = "center",
  wide = false,
}: {
  text: ReactNode;
  align?: "left" | "center" | "right";
  wide?: boolean;
}) {
  const posClass =
    align === "right" ? "right-0" :
    align === "left"  ? "left-0"  :
    "left-1/2 -translate-x-1/2";
  const widthClass = wide ? "w-72" : "w-52";
  return (
    <span className="group relative inline-block align-middle ml-1">
      <span className="text-gray-500 text-xs font-normal normal-case select-none">&#x24D8;</span>
      <div className={`pointer-events-none absolute top-full mt-1 z-[9999] ${widthClass} rounded-md border border-zinc-200 bg-white p-2 text-xs font-normal normal-case text-zinc-600 shadow-lg leading-relaxed opacity-0 transition-opacity group-hover:opacity-100 ${posClass}`}>
        {text}
      </div>
    </span>
  );
}

// ── Generate Ad modal ──────────────────────────────────────────────────────

function GenerateModal({
  open,
  generating,
  error,
  audience,
  goal,
  hookType,
  onAudienceChange,
  onGoalChange,
  onHookTypeChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  generating: boolean;
  error: string | null;
  audience: Audience;
  goal: CampaignGoal;
  hookType: HookType;
  onAudienceChange: (v: Audience) => void;
  onGoalChange: (v: CampaignGoal) => void;
  onHookTypeChange: (v: HookType) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const selectClass =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelClass = "block text-xs font-medium text-zinc-500 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={generating ? undefined : onClose}
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">Generate Ad</h2>
          {!generating && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Audience */}
          <div>
            <label className={labelClass}>Audience</label>
            <select
              className={selectClass}
              value={audience}
              onChange={(e) => onAudienceChange(e.target.value as Audience)}
              disabled={generating}
            >
              <option value="parents_anxious">Anxious Parents</option>
              <option value="students_stressed">Stressed Students</option>
              <option value="comparison_shoppers">Comparison Shoppers</option>
            </select>
          </div>

          {/* Goal */}
          <div>
            <label className={labelClass}>Goal</label>
            <select
              className={selectClass}
              value={goal}
              onChange={(e) => onGoalChange(e.target.value as CampaignGoal)}
              disabled={generating}
            >
              <option value="awareness">Awareness</option>
              <option value="conversion">Conversion</option>
            </select>
          </div>

          {/* Hook Type */}
          <div>
            <label className={labelClass}>Hook Type</label>
            <select
              className={selectClass}
              value={hookType}
              onChange={(e) => onHookTypeChange(e.target.value as HookType)}
              disabled={generating}
            >
              <option value="question">Question</option>
              <option value="stat">Statistic</option>
              <option value="story">Story / Testimonial</option>
              <option value="fear">Fear / Urgency</option>
            </select>
          </div>

          {/* Loading state */}
          {generating && (
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
              <svg
                className="animate-spin h-4 w-4 text-blue-600 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-sm text-blue-700">
                Generating your ad… (this takes ~45 seconds)
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !generating && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-100">
          {!generating && (
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={generating ? undefined : onSubmit}
            disabled={generating}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? "Generating…" : "Generate Ad"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AdLibrary() {
  const { selectedRun } = useRun();
  const [entries, setEntries] = useState<AdEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [passingCount, setPassingCount] = useState(0);
  const [dimAverages, setDimAverages] = useState<DimAverage[]>([]);
  const [imageStats, setImageStats] = useState<{
    adsWithImages: number;
    avgVisualScore: number;
    avgCombinedScore: number;
    avgScoreByDimension: Record<string, number>;
  } | null>(null);

  // Generate Ad modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAudience, setModalAudience] = useState<Audience>("parents_anxious");
  const [modalGoal, setModalGoal] = useState<CampaignGoal>("awareness");
  const [modalHookType, setModalHookType] = useState<HookType>("question");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // Ad detail modal — shown after a successful generation
  const [generatedEntry, setGeneratedEntry] = useState<ModalAdEntry | null>(null);

  const fetchAds = useCallback(() => {
    setLoading(true);
    setPage(1);
    const url = selectedRun
      ? `/api/ads?run=${encodeURIComponent(selectedRun)}`
      : "/api/ads";
    fetch(url)
      .then((r) => r.json())
      .then(
        (data: {
          ads: AdEntry[];
          stats: { passingCount: number };
          dimAverages: DimAverage[];
          imageStats?: {
            adsWithImages: number;
            avgVisualScore: number;
            avgCombinedScore: number;
            avgScoreByDimension: Record<string, number>;
          };
        }) => {
          setEntries(data.ads);
          setPassingCount(data.stats.passingCount);
          setDimAverages(data.dimAverages ?? []);
          setImageStats(
            data.imageStats?.adsWithImages ? data.imageStats : null
          );
          setLoading(false);
        }
      );
  }, [selectedRun]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  // Scroll to + expand a newly generated ad after the list refreshes
  useEffect(() => {
    if (!pendingScrollId) return;
    const el = document.querySelector(`[data-ad-id="${pendingScrollId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setExpandedId(pendingScrollId);
      setPendingScrollId(null);
    }
  }, [pendingScrollId, entries]);

  const handleGenerateSubmit = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: modalAudience,
          goal: modalGoal,
          hookType: modalHookType,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok || typeof data.error === "string") {
        setGenerateError((data.error as string) ?? "Generation failed with no error message");
        setGenerating(false);
        return;
      }
      // Success — close the generate modal and open the detail modal.
      // Also kick off a background list refresh so the new ad appears when the
      // detail modal is closed.
      const entry = data as unknown as ModalAdEntry;
      setModalOpen(false);
      setGenerating(false);
      setGenerateError(null);
      // Stage scroll-to for when the detail modal closes and list re-renders
      setPendingScrollId(entry.ad.id);
      // Show the freshly generated ad immediately
      setGeneratedEntry(entry);
      // Refresh list in background so it's ready by the time detail modal closes
      fetchAds();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Unexpected error"
      );
      setGenerating(false);
    }
  };

  const handleOpenModal = () => {
    setGenerateError(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (generating) return;
    setModalOpen(false);
    setGenerateError(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(1);
  };

  const sorted = [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "score":
        cmp = a.evaluation.aggregateScore - b.evaluation.aggregateScore;
        break;
      case "combined":
        cmp =
          (a.combinedScore ?? a.evaluation.aggregateScore) -
          (b.combinedScore ?? b.evaluation.aggregateScore);
        break;
      case "briefId":
        cmp = a.ad.briefId.localeCompare(b.ad.briefId);
        break;
      case "cycles":
        cmp =
          a.iterationHistory.cycles.length - b.iterationHistory.cycles.length;
        break;
      case "cost":
        cmp =
          a.iterationHistory.estimatedCostUsd -
          b.iterationHistory.estimatedCostUsd;
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  if (loading) {
    return (
      <p className="text-zinc-500 py-12 text-center">
        Loading ad library...
      </p>
    );
  }

  const passRate =
    entries.length > 0
      ? Math.round((passingCount / entries.length) * 100)
      : 0;

  return (
    <div>
      {/* Header row */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Ad Library</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {entries.length} ads generated — {passingCount} passing at{" "}
            {THRESHOLD}+ ({passRate}%)
            {selectedRun && (
              <span className="ml-2 text-blue-600 font-medium">
                [{selectedRun}]
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleOpenModal}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + Generate Ad
        </button>
      </div>

      {/* Dimension averages summary */}
      {dimAverages.length > 0 && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Average Dimension Scores
            <InfoTooltip
              wide
              text={
                <span>
                  Text quality scores averaged across all ads in this run:
                  <ul className="mt-1.5 space-y-1">
                    <li>
                      • <strong>CTA:</strong> How clear, specific, and
                      action-driving the call-to-action is
                    </li>
                    <li>
                      • <strong>Brand Voice:</strong> How well the copy
                      reflects Varsity Tutors&apos; tone — knowledgeable,
                      empathetic, and trustworthy
                    </li>
                    <li>
                      • <strong>Emotion:</strong> How effectively the copy
                      connects with the audience&apos;s feelings and
                      motivations
                    </li>
                    <li>
                      • <strong>Clarity:</strong> How easy the message is to
                      understand with no competing ideas
                    </li>
                    <li>
                      • <strong>Value Prop:</strong> How compelling and
                      specific the core benefit offered is
                    </li>
                  </ul>
                </span>
              }
            />
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
                <span
                  className={`font-medium ${
                    i === 0 ? "text-red-700" : "text-zinc-700"
                  }`}
                >
                  {DIMENSION_LABELS[d.dimension] ?? d.dimension}
                </span>
                <span
                  className={`font-semibold ${
                    i === 0 ? "text-red-800" : "text-zinc-900"
                  }`}
                >
                  {d.avgScore.toFixed(1)}
                </span>
                {i === 0 && (
                  <span className="text-xs text-red-600 font-medium">
                    weakest
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image stats summary */}
      {imageStats && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Visual Scores
            <InfoTooltip
              wide
              text={
                <span>
                  Image quality scores averaged across all ads in this run:
                  <ul className="mt-1.5 space-y-1">
                    <li>
                      • <strong>Avg Visual:</strong> Average of the three
                      visual dimension scores below
                    </li>
                    <li>
                      • <strong>Avg Combined:</strong> Weighted blend of text
                      score (60%) and visual score (40%) — the primary quality
                      metric
                    </li>
                    <li>
                      • <strong>Brand Consistency:</strong> How well the image
                      reflects Varsity Tutors&apos; warm, authentic,
                      approachable visual identity
                    </li>
                    <li>
                      • <strong>Visual Engagement:</strong> How distinctive
                      and scroll-stopping the image is
                    </li>
                    <li>
                      • <strong>Text-Image Coherence:</strong> How well the
                      image and ad copy reinforce each other
                    </li>
                  </ul>
                </span>
              }
            />
          </h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              <span className="font-medium text-zinc-700">Avg Visual</span>
              <span className="font-semibold text-zinc-900">
                {imageStats.avgVisualScore.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              <span className="font-medium text-zinc-700">Avg Combined</span>
              <span className="font-semibold text-zinc-900">
                {imageStats.avgCombinedScore.toFixed(1)}
              </span>
            </div>
            {Object.entries(imageStats.avgScoreByDimension).map(
              ([dim, avg]) => (
                <div
                  key={dim}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-zinc-700">
                    {DIMENSION_LABELS[dim] ?? dim}
                  </span>
                  <span className="font-semibold text-zinc-900">
                    {avg.toFixed(1)}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Ad table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th
                className="px-4 py-3 cursor-pointer hover:text-zinc-800"
                onClick={() => handleSort("briefId")}
              >
                Brief {sortKey === "briefId" ? (sortAsc ? "↑" : "↓") : ""}
                <InfoTooltip
                  align="left"
                  wide
                  text={
                    <span>
                      Each brief is named by four attributes: Audience / Goal /
                      Hook / Run number.
                      <ul className="mt-1.5 space-y-1">
                        <li>
                          • <strong>Audience:</strong> Parents Anxious,
                          Students Stressed, or Comparison Shoppers
                        </li>
                        <li>
                          • <strong>Goal:</strong> Conversion (drive sign-ups)
                          or Awareness (build brand recognition)
                        </li>
                        <li>
                          • <strong>Hook:</strong> Story, Stat, Fear, or
                          Question — the creative angle of the copy
                        </li>
                        <li>
                          • <strong>Run:</strong> multiple runs per combination
                          test variety within the same brief type
                        </li>
                      </ul>
                    </span>
                  }
                />
              </th>
              <th className="px-4 py-3">Audience</th>
              <th className="px-4 py-3">Goal</th>
              <th className="px-4 py-3">
                Hook
                <InfoTooltip text="Hook type derived from brief ID: Question, Stat, Story, or Fear." />
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-zinc-800"
                onClick={() => handleSort("score")}
              >
                Text {sortKey === "score" ? (sortAsc ? "↑" : "↓") : ""}
                <InfoTooltip text="Text evaluation aggregate score (0–10). Passes threshold at 7.0." />
              </th>
              {imageStats && (
                <th
                  className="px-4 py-3 cursor-pointer hover:text-zinc-800"
                  onClick={() => handleSort("combined")}
                >
                  Combined{" "}
                  {sortKey === "combined" ? (sortAsc ? "↑" : "↓") : ""}
                  <InfoTooltip text="Combined score: text (60%) + visual (40%). V3 loop badges shown below when triggered." />
                </th>
              )}
              <th
                className="px-4 py-3 cursor-pointer hover:text-zinc-800"
                onClick={() => handleSort("cycles")}
              >
                Cycles {sortKey === "cycles" ? (sortAsc ? "↑" : "↓") : ""}
                <InfoTooltip text="Number of text iteration cycles before the ad passed threshold." />
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-zinc-800"
                onClick={() => handleSort("cost")}
              >
                Cost {sortKey === "cost" ? (sortAsc ? "↑" : "↓") : ""}
                <InfoTooltip
                  text="Estimated cost in USD for text generation and evaluation only (excludes image generation)."
                  align="right"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((entry) => {
              const isExpanded = expandedId === entry.ad.id;
              return (
                <AdRow
                  key={entry.ad.id}
                  entry={entry}
                  isExpanded={isExpanded}
                  onToggle={() =>
                    setExpandedId(isExpanded ? null : entry.ad.id)
                  }
                  hasImageColumn={!!imageStats}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        total={sorted.length}
        page={safePage}
        pageSize={PAGE_SIZE}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />

      <GenerateModal
        open={modalOpen}
        generating={generating}
        error={generateError}
        audience={modalAudience}
        goal={modalGoal}
        hookType={modalHookType}
        onAudienceChange={setModalAudience}
        onGoalChange={setModalGoal}
        onHookTypeChange={setModalHookType}
        onSubmit={handleGenerateSubmit}
        onClose={handleCloseModal}
      />

      <AdDetailModal
        open={generatedEntry !== null}
        entry={generatedEntry}
        onClose={() => setGeneratedEntry(null)}
      />
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────

function Pagination({
  total,
  page,
  pageSize,
  onPrev,
  onNext,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
      <span>
        Showing {from}–{to} of {total} ads
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page === 1}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-xs text-zinc-400">
          {page} / {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={page === totalPages}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── V3 badges ──────────────────────────────────────────────────────────────

function V3Badges({ entry }: { entry: AdEntry }) {
  const badges: { label: string; className: string }[] = [];

  if (entry.coherenceLoop?.triggered) {
    badges.push(
      entry.coherenceLoop.improved
        ? { label: "\u2713 Coherence", className: "bg-green-100 text-green-700" }
        : { label: "\uD83D\uDD01 Coherence", className: "bg-yellow-100 text-yellow-700" }
    );
  }

  if (entry.copyRefinement?.triggered) {
    badges.push(
      entry.copyRefinement.improved
        ? { label: "\u2713 Copy", className: "bg-green-100 text-green-700" }
        : {
            label: "\u270F\uFE0F Copy refined",
            className: "bg-purple-100 text-purple-700",
          }
    );
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`inline-block rounded-full px-1.5 py-0 text-[10px] font-medium leading-5 ${b.className}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ── Ad row ─────────────────────────────────────────────────────────────────

function AdRow({
  entry,
  isExpanded,
  onToggle,
  hasImageColumn,
}: {
  entry: AdEntry;
  isExpanded: boolean;
  onToggle: () => void;
  hasImageColumn: boolean;
}) {
  const { ad, evaluation, iterationHistory } = entry;
  const score = evaluation.aggregateScore;
  const colSpan = hasImageColumn ? 8 : 7;

  return (
    <>
      <tr
        data-ad-id={ad.id}
        className={`border-b border-zinc-100 cursor-pointer transition-colors hover:bg-zinc-50 ${
          isExpanded ? "bg-zinc-50" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-xs text-zinc-700 max-w-[280px]">
          {formatBriefId(ad.briefId)}
        </td>
        <td className="px-4 py-3">{parseAudience(ad.briefId)}</td>
        <td className="px-4 py-3">{parseGoal(ad.briefId)}</td>
        <td className="px-4 py-3">{parseHook(ad.briefId)}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreBadge(score)}`}
          >
            {score.toFixed(1)}
          </span>
        </td>
        {hasImageColumn && (
          <td className="px-4 py-3">
            {entry.combinedScore != null ? (
              <div>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreBadge(entry.combinedScore)}`}
                >
                  {entry.combinedScore.toFixed(1)}
                </span>
                <V3Badges entry={entry} />
              </div>
            ) : (
              <span className="text-xs text-zinc-400">—</span>
            )}
          </td>
        )}
        <td className="px-4 py-3 text-zinc-600">
          {iterationHistory.cycles.length}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-zinc-500">
          ${iterationHistory.estimatedCostUsd.toFixed(4)}
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={colSpan} className="px-0 py-0">
            <AdDetail entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Ad detail (expanded row) ───────────────────────────────────────────────

function AdDetail({ entry }: { entry: AdEntry }) {
  const { ad, evaluation, iterationHistory } = entry;

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-5 space-y-5">
      {/* V2: Image thumbnail */}
      {entry.isCombinedEntry && entry.selectedVariant && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Ad Creative
            {entry.combinedScore != null && (
              <span className="ml-2 text-zinc-500 normal-case font-normal">
                combined score: {entry.combinedScore.toFixed(1)} (text{" "}
                {evaluation.aggregateScore.toFixed(1)} × 0.6 + image{" "}
                {entry.selectedVariant.visualEvaluation.aggregateScore.toFixed(1)}{" "}
                × 0.4)
              </span>
            )}
          </h3>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images/${ad.id}`}
              alt={`Ad creative for ${ad.headline}`}
              className="rounded max-h-[200px] w-auto"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Ad Copy */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Ad Copy
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-400 mb-1">
              Primary Text
            </p>
            <p className="text-sm text-zinc-800 leading-relaxed">
              {ad.primaryText}
            </p>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-400 mb-1">
                Headline
              </p>
              <p className="text-sm font-semibold text-zinc-800">
                {ad.headline}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-400 mb-1">
                Description
              </p>
              <p className="text-sm text-zinc-700">{ad.description}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-400 mb-1">
                CTA Button
              </p>
              <span className="inline-block rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                {ad.ctaButton}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Text Dimension Scores */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Dimension Scores (aggregate: {evaluation.aggregateScore.toFixed(1)})
        </h3>
        <div className="space-y-2">
          {evaluation.scores.map((s) => (
            <div
              key={s.dimension}
              className={`rounded-lg border border-zinc-200 p-3 ${dimScoreBg(s.score)}`}
            >
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

      {/* V2: Visual Dimension Scores */}
      {entry.isCombinedEntry && entry.selectedVariant && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Visual Scores (aggregate:{" "}
            {entry.selectedVariant.visualEvaluation.aggregateScore.toFixed(1)})
          </h3>
          <div className="space-y-2">
            {entry.selectedVariant.visualEvaluation.scores.map((s) => (
              <div
                key={s.dimension}
                className={`rounded-lg border border-zinc-200 p-3 ${dimScoreBg(s.score)}`}
              >
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
      )}

      {/* Iteration History */}
      {iterationHistory.cycles.length > 1 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Iteration History ({iterationHistory.cycles.length} cycles,{" "}
            {iterationHistory.converged ? "converged" : "did not converge"})
          </h3>
          <div className="space-y-2">
            {iterationHistory.cycles.map((cycle) => (
              <div
                key={cycle.cycle}
                className="rounded-lg border border-zinc-200 bg-white p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-zinc-700">
                    Cycle {cycle.cycle}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBadge(cycle.evaluation.aggregateScore)}`}
                  >
                    {cycle.evaluation.aggregateScore.toFixed(1)}
                  </span>
                  {cycle.improvementDelta !== 0 && (
                    <span
                      className={`text-xs font-semibold ${
                        cycle.improvementDelta > 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {cycle.improvementDelta > 0 ? "+" : ""}
                      {cycle.improvementDelta.toFixed(1)}
                    </span>
                  )}
                </div>
                {cycle.interventionUsed && (
                  <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">
                    {cycle.interventionUsed}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
