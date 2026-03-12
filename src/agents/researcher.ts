// ── Researcher Agent: competitive intelligence + ratchet assembly ──────────
// Two-call approach:
//   Call 1 — Anthropic SDK directly with web_search_20250305 tool: fetches
//             live competitor ad patterns from the Meta Ad Library and web.
//   Call 2 — Vercel AI SDK generateObject: structures the raw findings into
//             CompetitorInsights using the Zod schema.
// Falls back to training-knowledge generateObject if either call fails.

import Anthropic from '@anthropic-ai/sdk';
import { generateObject } from 'ai';
import { anthropic as vercelAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type {
  AdBrief,
  CompetitorInsights,
  EnrichedBrief,
  RatchetEntry,
} from '../types.js';

// ── Zod schema (unchanged — drives Call 2 and downstream pipeline) ─────────

const competitorInsightsSchema = z.object({
  dominantHooks: z.array(z.string()).describe('Hook types performing well in competitor ads'),
  ctaPatterns: z.array(z.string()).describe('Call-to-action patterns used by competitors'),
  emotionalAngles: z.array(z.string()).describe('Emotional angles performing well'),
  freshInsights: z.array(z.string()).describe('New creative formats or trends in the last 30 days'),
});

// ── Prompts ────────────────────────────────────────────────────────────────

const WEB_SEARCH_SYSTEM_PROMPT = `You are a competitive intelligence researcher for Varsity Tutors, a premium \
SAT tutoring brand. Search the web to find current Facebook and Instagram ad \
patterns from SAT prep competitors: Princeton Review, Kaplan, Khan Academy, \
Chegg, and Varsity Tutors itself. Focus on: what hooks they use in the first \
line, what CTAs appear most often, what emotional angles they exploit (fear, \
aspiration, urgency, social proof), how they handle specificity (numbers, \
timeframes, guarantees), and what visual styles accompany the copy. \
The Meta Ad Library at facebook.com/ads/library is a primary source. \
Return a detailed summary of patterns you find.`;

const WEB_SEARCH_USER_PROMPT = `Research current SAT prep ads on Facebook and Instagram from Princeton Review, \
Kaplan, Khan Academy, Chegg, and Varsity Tutors. Search the Meta Ad Library \
and any other sources you find. Summarize the dominant patterns in hooks, \
CTAs, emotional angles, and copy structure. Be specific — cite actual examples \
where you find them.`;

// Fallback prompt used when web search is skipped or fails
const FALLBACK_SYSTEM_PROMPT = `You are a competitive intelligence analyst for Varsity Tutors' paid social team.
Your job is to identify patterns in competitor SAT prep ads currently running on Meta.

Focus on: hook types performing well, CTA patterns, emotional angles, new creative
formats appearing across multiple competitors.`;

const FALLBACK_USER_PROMPT = `Search the Meta Ad Library for current active ads from Princeton Review, \
Kaplan, Khan Academy, and Chegg targeting SAT prep audiences. \
Identify: dominant hook types, CTA patterns, emotional angles, and any \
new creative formats active in the last 30 days.`;

// ── Paths ──────────────────────────────────────────────────────────────────

const RATCHET_PATH = resolve(process.cwd(), 'data/ratchet/top-ads.json');
const REFERENCE_ADS_PATH = resolve(process.cwd(), 'data/reference-ads.json');

// ── Call 1: web search via Anthropic SDK ───────────────────────────────────

async function runWebSearch(modelId: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

  // web_search_20250305 is a server-side built-in tool: the API executes the
  // search automatically and returns all content blocks in one response.
  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    tools: [
      // web_search_20250305 is a server-side built-in tool; it has no input_schema.
    // Cast through unknown because Anthropic.Tool requires input_schema for
    // custom tools but built-in tools omit it.
    { type: 'web_search_20250305', name: 'web_search' } as unknown as Anthropic.Tool,
    ],
    system: WEB_SEARCH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: WEB_SEARCH_USER_PROMPT }],
  });

  // Collect only text blocks — ignore tool_use and tool_result blocks that
  // appear in the content array during the search execution trace.
  const findings = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');

  return findings;
}

// ── Call 2: structure findings via generateObject ──────────────────────────

async function structureFindings(
  modelId: string,
  findings: string,
  webSearchSucceeded: boolean,
): Promise<CompetitorInsights> {
  const system = webSearchSucceeded
    ? 'You are extracting structured competitive intelligence from research findings.'
    : FALLBACK_SYSTEM_PROMPT;

  const prompt = webSearchSucceeded
    ? `Based on these research findings about competitor SAT prep ads, extract structured competitive intelligence:\n\n${findings}`
    : FALLBACK_USER_PROMPT;

  const { object } = await generateObject({
    model: vercelAnthropic(modelId),
    schema: competitorInsightsSchema,
    temperature: 0,
    system,
    prompt,
  });

  return { ...object, fetchedAt: new Date().toISOString() };
}

// ── Main fetch (with caching and fallback) ─────────────────────────────────

async function fetchCompetitorInsights(
  cache: CompetitorInsights | null,
): Promise<CompetitorInsights> {
  // Cache key is fixed per process — web results vary by run, not by brief.
  if (cache) {
    console.log('[researcher] Using cached competitor insights.');
    return cache;
  }

  const modelId = process.env['RESEARCHER_MODEL'] ?? 'claude-sonnet-4-6';

  // ── Attempt Call 1: web search ──────────────────────────────────────────
  let findings = '';
  let webSearchSucceeded = false;

  try {
    findings = await runWebSearch(modelId);
    if (findings.length > 0) {
      console.log(
        `[researcher] Web search complete. Findings: ${findings.length} chars. Proceeding to structure...`,
      );
      webSearchSucceeded = true;
    } else {
      console.warn('[researcher] Web search returned no text content. Falling back to training knowledge.');
    }
  } catch (err) {
    console.warn(`[researcher] Web search call failed, falling back to training knowledge: ${err}`);
  }

  // ── Attempt Call 2: structure (with or without findings) ────────────────
  try {
    const insights = await structureFindings(modelId, findings, webSearchSucceeded);

    if (!webSearchSucceeded) {
      console.warn('[researcher] Competitor insights generated from training knowledge only (no live web search).');
    } else {
      console.log('[researcher] Competitor insights structured successfully from web search findings.');
    }

    return insights;
  } catch (err) {
    console.warn(`[researcher] Structure call failed, falling back to reference-ads.json: ${err}`);
    return loadFallbackInsights();
  }
}

// ── Fallback: data/reference-ads.json ─────────────────────────────────────

function loadFallbackInsights(): CompetitorInsights {
  try {
    if (existsSync(REFERENCE_ADS_PATH)) {
      const data = JSON.parse(readFileSync(REFERENCE_ADS_PATH, 'utf-8')) as Record<string, unknown>;
      return {
        dominantHooks: (data['dominantHooks'] as string[] | undefined) ?? ['question', 'stat', 'story'],
        ctaPatterns: (data['ctaPatterns'] as string[] | undefined) ?? ['Start Free Trial', 'Get Started', 'Learn More'],
        emotionalAngles: (data['emotionalAngles'] as string[] | undefined) ?? ['aspiration', 'urgency', 'relief'],
        freshInsights: (data['freshInsights'] as string[] | undefined) ?? [],
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Fall through to hardcoded defaults
  }

  console.warn('[researcher] reference-ads.json unavailable. Using hardcoded defaults.');
  return {
    dominantHooks: ['question', 'stat', 'story'],
    ctaPatterns: ['Start Free Trial', 'Get Started', 'Learn More'],
    emotionalAngles: ['aspiration', 'urgency', 'relief'],
    freshInsights: [],
    fetchedAt: new Date().toISOString(),
  };
}

// ── Ratchet pool helpers (unchanged) ──────────────────────────────────────

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

// ── Research agent entry point (unchanged signature) ──────────────────────

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
