// ── Ad Brief Definitions ──────────────────────────────────────────────────
// 3 audiences × 2 goals × 4 hook types = 24 base briefs.
// The pipeline runs multiple ads per brief to reach 50+.

import type { AdBrief, Audience, CampaignGoal, HookType } from '../types.js';

// ── Audience definitions (used in prompt construction) ────────────────────

export const AUDIENCE_DESCRIPTIONS: Record<Audience, string> = {
  parents_anxious:
    'Parents worried about their child\'s college admissions prospects. ' +
    'They want the best preparation but feel overwhelmed by options. ' +
    'They respond to reassurance, proven results, and expert guidance.',
  students_stressed:
    'High school juniors and seniors stressed about SAT scores. ' +
    'They feel pressure from parents, peers, and college deadlines. ' +
    'They respond to empowerment, relatable stories, and quick wins.',
  comparison_shoppers:
    'Families actively comparing SAT prep options — Princeton Review, ' +
    'Khan Academy, Chegg, Kaplan. They\'re doing research and want clear ' +
    'differentiators, proof points, and low-risk ways to try.',
};

// ── Offer pool per goal ──────────────────────────────────────────────────

export const OFFERS: Record<CampaignGoal, string[]> = {
  awareness: [
    'free SAT score analysis',
    'free college readiness assessment',
    'free study plan consultation',
  ],
  conversion: [
    'free diagnostic practice test',
    'first tutoring session free',
    'free 1-week trial',
    '20% off first month of SAT prep',
  ],
};

// ── Tone mappings ────────────────────────────────────────────────────────

export const TONES: Record<CampaignGoal, Record<HookType, string>> = {
  awareness: {
    question: 'curious, empathetic',
    stat: 'authoritative, eye-opening',
    story: 'warm, relatable',
    fear: 'urgent, concerned',
  },
  conversion: {
    question: 'direct, solution-oriented',
    stat: 'confident, data-driven',
    story: 'inspiring, proof-driven',
    fear: 'urgent, action-oriented',
  },
};

// ── Brief generation ─────────────────────────────────────────────────────

const AUDIENCES: Audience[] = ['parents_anxious', 'students_stressed', 'comparison_shoppers'];
const GOALS: CampaignGoal[] = ['awareness', 'conversion'];
const HOOK_TYPES: HookType[] = ['question', 'stat', 'story', 'fear'];

/**
 * Generate all base briefs by crossing audiences × goals × hook types.
 * Each brief gets a deterministic ID for traceability.
 * Returns 24 briefs (3 × 2 × 4).
 */
export function generateBaseBriefs(): AdBrief[] {
  const briefs: AdBrief[] = [];
  let index = 0;

  for (const audience of AUDIENCES) {
    for (const goal of GOALS) {
      for (const hookType of HOOK_TYPES) {
        // Rotate through offers deterministically
        const offerPool = OFFERS[goal];
        const offer = offerPool[index % offerPool.length]!;
        const tone = TONES[goal][hookType];

        briefs.push({
          id: `brief-${audience}-${goal}-${hookType}`,
          audience,
          goal,
          hookType,
          offer,
          tone,
        });

        index++;
      }
    }
  }

  return briefs;
}

/**
 * Expand briefs to reach a target ad count.
 * For each brief, we run `adsPerBrief` iterations through the pipeline.
 * With 24 base briefs × 3 ads per brief = 72 pipeline runs.
 * At ~60-70% pass rate after iteration, expect 50+ final ads.
 */
export function expandBriefs(targetRuns: number = 75): AdBrief[] {
  const baseBriefs = generateBaseBriefs();
  const expanded: AdBrief[] = [];

  // Distribute runs across briefs evenly, then fill remainder
  const adsPerBrief = Math.floor(targetRuns / baseBriefs.length);
  const remainder = targetRuns % baseBriefs.length;

  for (let i = 0; i < baseBriefs.length; i++) {
    const brief = baseBriefs[i]!;
    const count = adsPerBrief + (i < remainder ? 1 : 0);

    for (let j = 0; j < count; j++) {
      // Each run gets a unique ID but shares the base brief's config
      const offerPool = OFFERS[brief.goal];
      // Rotate offers across runs of the same brief for variety
      const offer = offerPool[j % offerPool.length]!;

      expanded.push({
        ...brief,
        id: `${brief.id}-run${j + 1}`,
        offer,
      });
    }
  }

  return expanded;
}
