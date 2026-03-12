"use client";

import { useEffect } from "react";

// ── Shared type — import this in showcase/page.tsx and page.tsx ─────────────

export interface ModalAdEntry {
  ad: {
    id: string;
    briefId: string;
    primaryText: string;
    headline: string;
    description: string;
    ctaButton: string;
  };
  evaluation: {
    aggregateScore: number;
  };
  iterationHistory: {
    cycles: unknown[];
    estimatedCostUsd: number;
  };
  selectedVariant: {
    visualEvaluation: {
      aggregateScore: number;
      scores: { dimension: string; score: number }[];
    };
  };
  combinedScore: number;
}

// ── Helpers (duplicated from page/showcase to keep component self-contained) ─

function parseAudience(briefId: string): string {
  if (briefId.includes("parents_anxious")) return "Anxious Parents";
  if (briefId.includes("students_stressed")) return "Stressed Students";
  if (briefId.includes("comparison_shoppers")) return "Comparison Shoppers";
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

function combinedPill(score: number): string {
  if (score >= 8.0) return "bg-green-100 text-green-800";
  if (score >= 7.5) return "bg-orange-100 text-orange-800";
  return "bg-yellow-100 text-yellow-800";
}

function scorePill(score: number): string {
  if (score >= 8) return "bg-blue-100 text-blue-800";
  if (score >= 7) return "bg-orange-100 text-orange-800";
  return "bg-zinc-100 text-zinc-600";
}

const VISUAL_DIM_LABELS: Record<string, string> = {
  brand_consistency: "Brand Consistency",
  visual_engagement: "Visual Engagement",
  text_image_coherence: "Text-Image Coherence",
};

// ── Stat cell ──────────────────────────────────────────────────────────────

function StatCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

// ── Meta ad card (full — no truncation) ────────────────────────────────────
// Used inside the modal. Marked with `print-ad-card` for print isolation.

function FullMetaCard({ entry }: { entry: ModalAdEntry }) {
  const { ad } = entry;
  return (
    <div
      className="print-ad-card w-full rounded-xl bg-white border border-zinc-200 shadow-md overflow-hidden"
    >
      {/* Brand header */}
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

      {/* Full primary text — no truncation */}
      <div className="px-4 pb-3">
        <p className="text-[14px] text-zinc-800 leading-snug whitespace-pre-wrap">
          {ad.primaryText}
        </p>
      </div>

      {/* Image */}
      <div className="w-full bg-zinc-100 overflow-hidden" style={{ aspectRatio: "1.91 / 1" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/images/${ad.id}`}
          alt={ad.headline}
          className="w-full h-full object-cover"
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
          <p className="text-[13px] text-zinc-500 mb-3">{ad.description}</p>
        )}
        <div className="flex items-center justify-between gap-2 mt-3">
          <button
            className="rounded border border-zinc-300 bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-700 cursor-default"
            tabIndex={-1}
          >
            {ad.ctaButton}
          </button>
          <span
            className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${combinedPill(entry.combinedScore)}`}
          >
            {entry.combinedScore.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AdDetailModal ──────────────────────────────────────────────────────────

export function AdDetailModal({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  entry: ModalAdEntry | null;
  onClose: () => void;
}) {
  // Keyboard: close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Print CSS: inject into <head> while modal is open, remove on close
  useEffect(() => {
    if (!open) return;
    const style = document.createElement("style");
    style.id = "ad-detail-print-styles";
    style.textContent = `
      @media print {
        * { visibility: hidden !important; }
        .print-ad-card,
        .print-ad-card * { visibility: visible !important; }
        .print-ad-card {
          position: fixed !important;
          top: 20px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 400px !important;
          box-shadow: none !important;
          border: 1px solid #e4e4e7 !important;
          border-radius: 12px !important;
          overflow: hidden !important;
          background: white !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById("ad-detail-print-styles")?.remove();
    };
  }, [open]);

  if (!open || !entry) return null;

  const visualScores = entry.selectedVariant.visualEvaluation.scores;
  const visualDims = ["brand_consistency", "visual_engagement", "text_image_coherence"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-[520px] bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors text-sm"
          aria-label="Close"
        >
          ×
        </button>

        {/* Ad card — full size, no truncation */}
        <div className="p-4">
          <FullMetaCard entry={entry} />
        </div>

        {/* Stats */}
        <div className="border-t border-zinc-100 px-5 pt-4 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Ad Statistics
          </p>

          {/* Row 1: Scores */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <StatCell label="Combined">
              <span
                className={`text-sm font-bold rounded-full px-2.5 py-0.5 inline-block ${combinedPill(entry.combinedScore)}`}
              >
                {entry.combinedScore.toFixed(1)}
              </span>
            </StatCell>
            <StatCell label="Text Score">
              <span
                className={`text-sm font-bold rounded-full px-2.5 py-0.5 inline-block ${scorePill(entry.evaluation.aggregateScore)}`}
              >
                {entry.evaluation.aggregateScore.toFixed(1)}
              </span>
            </StatCell>
            <StatCell label="Visual Score">
              <span
                className={`text-sm font-bold rounded-full px-2.5 py-0.5 inline-block ${scorePill(entry.selectedVariant.visualEvaluation.aggregateScore)}`}
              >
                {entry.selectedVariant.visualEvaluation.aggregateScore.toFixed(1)}
              </span>
            </StatCell>
          </div>

          {/* Row 2: Visual dimensions */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            {visualDims.map((dim) => {
              const s = visualScores.find((v) => v.dimension === dim);
              const score = s?.score ?? null;
              return (
                <StatCell key={dim} label={VISUAL_DIM_LABELS[dim] ?? dim}>
                  {score !== null ? (
                    <span
                      className={`text-xs font-semibold rounded-full px-2 py-0.5 inline-block ${scorePill(score)}`}
                    >
                      {score.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </StatCell>
              );
            })}
          </div>

          {/* Row 3: Audience / Goal / Hook */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <StatCell label="Audience">
              <span className="text-xs font-medium text-zinc-700">
                {parseAudience(entry.ad.briefId)}
              </span>
            </StatCell>
            <StatCell label="Goal">
              <span className="text-xs font-medium text-zinc-700">
                {parseGoal(entry.ad.briefId)}
              </span>
            </StatCell>
            <StatCell label="Hook">
              <span className="text-xs font-medium text-zinc-700">
                {parseHook(entry.ad.briefId)}
              </span>
            </StatCell>
          </div>

          {/* Row 4: Cost / Cycles / Brief ID */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatCell label="Est. Cost">
              <span className="text-xs font-mono text-zinc-700">
                ${entry.iterationHistory.estimatedCostUsd.toFixed(4)}
              </span>
            </StatCell>
            <StatCell label="Cycles">
              <span className="text-xs font-medium text-zinc-700">
                {entry.iterationHistory.cycles.length}
              </span>
            </StatCell>
            <StatCell label="Brief ID">
              <span className="text-[10px] font-mono text-zinc-500 break-all leading-tight">
                {entry.ad.briefId}
              </span>
            </StatCell>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3 px-5 pb-5 border-t border-zinc-100 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-white px-6 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-zinc-800 px-6 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            Print Ad
          </button>
        </div>
      </div>
    </div>
  );
}
