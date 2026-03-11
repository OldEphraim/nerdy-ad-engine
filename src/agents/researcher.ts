// ── Researcher Agent: competitive intelligence + ratchet assembly ──────────
// Fetches current competitor ad patterns via Vercel AI SDK with structured output,
// assembles ratchet pool examples, and returns an EnrichedBrief.

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type {
  AdBrief,
  CompetitorInsights,
  EnrichedBrief,
  RatchetEntry,
} from '../types.js';

const competitorInsightsSchema = z.object({
  dominantHooks: z.array(z.string()).describe('Hook types performing well in competitor ads'),
  ctaPatterns: z.array(z.string()).describe('Call-to-action patterns used by competitors'),
  emotionalAngles: z.array(z.string()).describe('Emotional angles performing well'),
  freshInsights: z.array(z.string()).describe('New creative formats or trends in the last 30 days'),
});

const RESEARCHER_SYSTEM_PROMPT = `You are a competitive intelligence analyst for Varsity Tutors' paid social team.
Your job is to identify patterns in competitor SAT prep ads currently running on Meta.

Focus on: hook types performing well, CTA patterns, emotional angles, new creative
formats appearing across multiple competitors.`;

const RATCHET_PATH = resolve(process.cwd(), 'data/ratchet/top-ads.json');
const REFERENCE_ADS_PATH = resolve(process.cwd(), 'data/reference-ads.json');

/**
 * Fetch competitive intelligence from the Meta Ad Library via Vercel AI SDK
 * with structured JSON output. Returns cached insights if provided;
 * falls back to reference-ads.json on failure.
 */
async function fetchCompetitorInsights(
  cache: CompetitorInsights | null,
): Promise<CompetitorInsights> {
  if (cache) return cache;

  try {
    const modelId = process.env['RESEARCHER_MODEL'] ?? 'claude-sonnet-4-5';

    const { object } = await generateObject({
      model: anthropic(modelId),
      schema: competitorInsightsSchema,
      temperature: 0,
      system: RESEARCHER_SYSTEM_PROMPT,
      prompt: `Search the Meta Ad Library for current active ads from Princeton Review, \
Kaplan, Khan Academy, and Chegg targeting SAT prep audiences. \
Identify: dominant hook types, CTA patterns, emotional angles, and any \
new creative formats active in the last 30 days.`,
    });

    return {
      ...object,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[researcher] Structured generation failed, falling back to reference-ads.json: ${err}`);
    return loadFallbackInsights();
  }
}

/**
 * Load fallback competitor insights from data/reference-ads.json.
 */
function loadFallbackInsights(): CompetitorInsights {
  try {
    if (existsSync(REFERENCE_ADS_PATH)) {
      const data = JSON.parse(readFileSync(REFERENCE_ADS_PATH, 'utf-8'));
      return {
        dominantHooks: data.dominantHooks ?? ['question', 'stat', 'story'],
        ctaPatterns: data.ctaPatterns ?? ['Start Free Trial', 'Get Started', 'Learn More'],
        emotionalAngles: data.emotionalAngles ?? ['aspiration', 'urgency', 'relief'],
        freshInsights: data.freshInsights ?? [],
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Fall through to hardcoded defaults
  }

  return {
    dominantHooks: ['question', 'stat', 'story'],
    ctaPatterns: ['Start Free Trial', 'Get Started', 'Learn More'],
    emotionalAngles: ['aspiration', 'urgency', 'relief'],
    freshInsights: [],
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Load ratchet pool from disk. Returns empty array if file is absent or invalid.
 */
function loadRatchetPool(): RatchetEntry[] {
  try {
    if (existsSync(RATCHET_PATH)) {
      return JSON.parse(readFileSync(RATCHET_PATH, 'utf-8')) as RatchetEntry[];
    }
  } catch {
    // Corrupted file — start fresh
  }
  return [];
}

/**
 * Select ratchet examples relevant to the brief.
 * Priority: same audience+goal > same audience > any.
 * Returns up to 3 examples.
 */
function selectRatchetExamples(pool: RatchetEntry[], brief: AdBrief): RatchetEntry[] {
  const MAX_EXAMPLES = 3;

  // Tier 1: exact match on audience + goal
  const exactMatch = pool.filter(
    (e) => e.ad.briefId && brief.audience && brief.goal
      && matchesBrief(e, brief.audience, brief.goal),
  );
  if (exactMatch.length >= MAX_EXAMPLES) {
    return exactMatch
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, MAX_EXAMPLES);
  }

  // Tier 2: same audience (any goal)
  const audienceMatch = pool.filter(
    (e) => matchesAudience(e, brief.audience),
  );
  if (audienceMatch.length >= MAX_EXAMPLES) {
    return audienceMatch
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, MAX_EXAMPLES);
  }

  // Tier 3: any ads from the pool, sorted by score
  return pool
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, MAX_EXAMPLES);
}

function matchesBrief(entry: RatchetEntry, audience: string, goal: string): boolean {
  const id = entry.ad.briefId ?? '';
  return id.includes(audience) && id.includes(goal);
}

function matchesAudience(entry: RatchetEntry, audience: string): boolean {
  const id = entry.ad.briefId ?? '';
  return id.includes(audience);
}

/**
 * Research agent entry point.
 * Fetches competitive intelligence (with caching) and assembles ratchet examples.
 */
export async function research(
  brief: AdBrief,
  insightsCache: CompetitorInsights | null,
): Promise<EnrichedBrief> {
  const competitorInsights = await fetchCompetitorInsights(insightsCache);
  const pool = loadRatchetPool();
  const ratchetExamples = selectRatchetExamples(pool, brief);

  return {
    ...brief,
    ratchetExamples,
    competitorInsights,
  };
}
