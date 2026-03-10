// ── Writer Agent: wraps generator with ratchet examples + competitor context ─
// Injects dynamic few-shot examples from the ratchet pool and competitive
// intelligence from the Researcher agent into the generation prompt.

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { EnrichedBrief, GeneratedAd, RatchetEntry } from '../types.js';
import { buildGenerationPrompt, GENERATOR_SYSTEM_PROMPT } from '../generate/prompts.js';
import { parseGeneratorResponse } from '../generate/generator.js';

const client = new Anthropic({ maxRetries: 5 });

/**
 * Format ratchet examples as few-shot examples in the same structure
 * as the static examples in GENERATOR_SYSTEM_PROMPT.
 */
function formatRatchetExamples(examples: RatchetEntry[]): string {
  if (examples.length === 0) return '';

  const formatted = examples.map((e, i) => {
    const ad = e.ad;
    return `TOP-PERFORMING EXAMPLE ${i + 1} (combined score: ${e.combinedScore}):
{
  "primaryText": ${JSON.stringify(ad.primaryText)},
  "headline": ${JSON.stringify(ad.headline)},
  "description": ${JSON.stringify(ad.description)},
  "ctaButton": ${JSON.stringify(ad.ctaButton)}
}`;
  }).join('\n\n');

  return `\n\nDYNAMIC FEW-SHOT EXAMPLES (top-scoring ads from the library — match or exceed this quality level):\n${formatted}`;
}

/**
 * Format competitor insights as a system prompt appendix.
 */
function formatCompetitorInsights(insights: EnrichedBrief['competitorInsights']): string {
  return `

CURRENT COMPETITOR PATTERNS (live Meta Ad Library analysis):
- Dominant hooks right now: ${insights.dominantHooks.join(', ')}
- Leading CTAs: ${insights.ctaPatterns.join(', ')}
- Emotional angles performing well: ${insights.emotionalAngles.join(', ')}
- Fresh insights: ${insights.freshInsights.length > 0 ? insights.freshInsights.join('; ') : 'None available'}

Use these as inspiration. Fit the Varsity Tutors brand into proven shapes — don't copy.`;
}

/**
 * Build the enriched system prompt with ratchet examples and competitor context.
 */
function buildEnrichedSystemPrompt(enrichedBrief: EnrichedBrief): string {
  const ratchetEnabled = process.env['RATCHET_ENABLED'] !== 'false';

  let systemPrompt = GENERATOR_SYSTEM_PROMPT;

  // Inject ratchet examples if enabled and available
  if (ratchetEnabled && enrichedBrief.ratchetExamples.length > 0) {
    systemPrompt += formatRatchetExamples(enrichedBrief.ratchetExamples);
  }

  // Inject competitor insights
  if (enrichedBrief.competitorInsights.dominantHooks.length > 0) {
    systemPrompt += formatCompetitorInsights(enrichedBrief.competitorInsights);
  }

  return systemPrompt;
}

/**
 * Writer agent entry point.
 * Wraps generateAd() with an enriched system prompt that injects ratchet
 * examples and competitor intelligence.
 */
export async function write(enrichedBrief: EnrichedBrief): Promise<GeneratedAd> {
  const systemPrompt = buildEnrichedSystemPrompt(enrichedBrief);
  const userPrompt = buildGenerationPrompt(enrichedBrief);

  const response = await client.messages.create({
    model: process.env['GENERATOR_MODEL'] ?? 'claude-haiku-4-5',
    max_tokens: 512,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return parseGeneratorResponse(response, enrichedBrief, 1);
}
