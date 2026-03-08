// ── Ad copy generator using Anthropic SDK ────────────────────────────────
// Temperature 0.7 for creative variance. JSON-only output, no markdown.

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { AdBrief, GeneratedAd } from '../types.js';
import { GENERATOR_SYSTEM_PROMPT, buildGenerationPrompt, buildRegenerationPrompt } from './prompts.js';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

export async function generateAd(
  brief: AdBrief,
  iterationCycle: number = 1,
): Promise<GeneratedAd> {
  const response = await client.messages.create({
    model: process.env['GENERATOR_MODEL'] ?? 'claude-haiku-4-5',
    max_tokens: 512,
    temperature: 0.7,
    system: GENERATOR_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildGenerationPrompt(brief) },
    ],
  });

  return parseGeneratorResponse(response, brief, iterationCycle);
}

export async function regenerateAd(
  brief: AdBrief,
  previousAd: GeneratedAd,
  weakestDimension: string,
  interventionStrategy: string,
  iterationCycle: number,
): Promise<GeneratedAd> {
  const prompt = buildRegenerationPrompt(brief, previousAd, weakestDimension, interventionStrategy);

  const response = await client.messages.create({
    model: process.env['GENERATOR_MODEL'] ?? 'claude-haiku-4-5',
    max_tokens: 512,
    temperature: 0.7,
    system: GENERATOR_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  return parseGeneratorResponse(response, brief, iterationCycle);
}

function parseGeneratorResponse(
  response: Anthropic.Message,
  brief: AdBrief,
  iterationCycle: number,
): GeneratedAd {
  const block = response.content[0];
  const text = block?.type === 'text' ? block.text : '';

  // Strip markdown fences if the model wraps output despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = JSON.parse(cleaned) as {
    primaryText?: string;
    headline?: string;
    description?: string;
    ctaButton?: string;
  };

  if (!parsed.primaryText || !parsed.headline || !parsed.description || !parsed.ctaButton) {
    throw new Error(`Generator returned incomplete ad: ${JSON.stringify(parsed)}`);
  }

  return {
    id: randomUUID(),
    briefId: brief.id,
    primaryText: parsed.primaryText,
    headline: parsed.headline,
    description: parsed.description,
    ctaButton: parsed.ctaButton,
    generatedAt: new Date().toISOString(),
    modelUsed: response.model,
    iterationCycle,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
