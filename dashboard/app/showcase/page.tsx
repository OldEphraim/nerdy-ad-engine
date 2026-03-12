"use client";

import { useEffect, useState } from "react";
import { useRun } from "../run-context";
import { AdDetailModal, type ModalAdEntry } from "../../components/AdDetailModal";

// ── Types ──────────────────────────────────────────────────────────────────

interface VisualEval {
  aggregateScore: number;
  passesThreshold: boolean;
  scores: { dimension: string; score: number; rationale: string; confidence: string }[];
}

interface AdVariant {
  imageResult: { localPath: string; width: number; height: number; seed: number };
  visualEvaluation: VisualEval;
}

interface Ad {
  id: string;
  briefId: string;
  primaryText: string;
  headline: string;
  description: string;
  ctaButton: string;
}

interface AdEntry {
  ad: Ad;
  evaluation: { aggregateScore: number };
  iterationHistory: {
    cycles: { cycle: number; evaluation: { aggregateScore: number } }[];
    estimatedCostUsd: number;
  };
  isCombinedEntry?: boolean;
  selectedVariant?: AdVariant;
  combinedScore?: number;
}

type ImageAdEntry = AdEntry & { selectedVariant: AdVariant; combinedScore: number };

// ── Helpers ────────────────────────────────────────────────────────────────

function combinedScoreBadge(score: number): string {
  if (score >= 8.0) return "bg-green-100 text-green-800";
  if (score >= 7.5) return "bg-orange-100 text-orange-800";
  return "bg-yellow-100 text-yellow-800";
}

function toModalEntry(entry: ImageAdEntry): ModalAdEntry {
  return {
    ad: entry.ad,
    evaluation: entry.evaluation,
    iterationHistory: entry.iterationHistory,
    selectedVariant: { visualEvaluation: entry.selectedVariant.visualEvaluation },
    combinedScore: entry.combinedScore,
  };
}

const TOP_N = 12;
const PRIMARY_LIMIT = 125;

// ── Showcase card ──────────────────────────────────────────────────────────

function MetaAdCard({
  entry,
  onOpenDetail,
}: {
  entry: ImageAdEntry;
  onOpenDetail: (e: ImageAdEntry) => void;
}) {
  const { ad, combinedScore } = entry;
  const [expanded, setExpanded] = useState(false);

  const needsSeeMore = ad.primaryText.length > PRIMARY_LIMIT;
  const displayText =
    !expanded && needsSeeMore
      ? ad.primaryText.slice(0, PRIMARY_LIMIT)
      : ad.primaryText;

  return (
    <div className="w-full max-w-[400px] rounded-xl bg-white border border-zinc-200 shadow-md overflow-hidden">
      {/* Brand header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white select-none">
            VT
          </div>
          <div>
            <p className="text-[13px] font-semibold text-zinc-900 leading-tight">
              Varsity Tutors
            </p>
            <p className="text-[11px] text-zinc-500 leading-tight">Sponsored</p>
          </div>
        </div>
        <span className="text-zinc-400 text-base leading-none select-none px-1" aria-hidden>
          ···
        </span>
      </div>

      {/* Primary text with See more / See less toggle */}
      <div className="px-4 pb-3">
        <p className="text-[14px] text-zinc-800 leading-snug">
          {displayText}
          {needsSeeMore && !expanded && (
            <span
              className="text-blue-600 cursor-pointer hover:underline"
              onClick={() => setExpanded(true)}
            >
              {" "}
              ...See more
            </span>
          )}
          {needsSeeMore && expanded && (
            <span
              className="text-blue-600 cursor-pointer hover:underline"
              onClick={() => setExpanded(false)}
            >
              {" "}
              See less
            </span>
          )}
        </p>
      </div>

      {/* Ad image — click opens detail modal */}
      <div
        className="w-full bg-zinc-100 overflow-hidden cursor-pointer"
        style={{ aspectRatio: "1.91 / 1" }}
        onClick={() => onOpenDetail(entry)}
        title="View ad details"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/images/${ad.id}`}
          alt={ad.headline}
          className="w-full h-full object-cover hover:opacity-95 transition-opacity"
          loading="lazy"
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-100">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-0.5">
          varsitytutors.com
        </p>
        <p className="text-[16px] font-bold text-zinc-900 leading-tight mb-0.5">
          {ad.headline}
        </p>
        {ad.description && (
          <p className="text-[13px] text-zinc-500 truncate mb-3">
            {ad.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 mt-3">
          {/* CTA button — click also opens detail modal */}
          <button
            className="rounded border border-zinc-300 bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
            onClick={() => onOpenDetail(entry)}
          >
            {ad.ctaButton}
          </button>
          <span
            className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${combinedScoreBadge(combinedScore)}`}
          >
            {combinedScore.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ShowcasePage() {
  const { selectedRun } = useRun();
  const [entries, setEntries] = useState<AdEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEntry, setDetailEntry] = useState<ModalAdEntry | null>(null);

  useEffect(() => {
    setLoading(true);
    const url = selectedRun
      ? `/api/ads?run=${encodeURIComponent(selectedRun)}`
      : "/api/ads";
    fetch(url)
      .then((r) => r.json())
      .then((data: { ads: AdEntry[] }) => {
        setEntries(data.ads);
        setLoading(false);
      });
  }, [selectedRun]);

  if (loading) {
    return (
      <p className="text-zinc-500 py-12 text-center">Loading showcase...</p>
    );
  }

  // Only ads with real images
  const imageAds = entries.filter(
    (e): e is ImageAdEntry =>
      e.isCombinedEntry === true &&
      e.selectedVariant != null &&
      e.combinedScore != null,
  );

  const topAds = [...imageAds]
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, TOP_N);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Showcase</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Top-performing ads from this run, rendered in Meta ad format
          {selectedRun && (
            <span className="ml-2 text-blue-600 font-medium">
              [{selectedRun}]
            </span>
          )}
        </p>
      </div>

      {imageAds.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-zinc-500 text-sm leading-relaxed max-w-md mx-auto">
            This run does not have image creatives. Select a run that includes
            visual generation (v2-production or v3-production).
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-400 mb-6">
            Showing top {topAds.length} of {imageAds.length} image ads by
            combined score. Click an image or CTA button to see full details.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 justify-items-center">
            {topAds.map((entry) => (
              <MetaAdCard
                key={entry.ad.id}
                entry={entry}
                onOpenDetail={(e) => setDetailEntry(toModalEntry(e))}
              />
            ))}
          </div>
        </>
      )}

      <AdDetailModal
        open={detailEntry !== null}
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
      />
    </div>
  );
}
