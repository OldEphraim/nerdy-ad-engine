// ── Visual evaluation using Claude Sonnet vision ────────────────────────────
// Temperature MUST be 0 for deterministic scoring — same principle as text evaluator.
// Reads a local image file, encodes as base64, and scores 3 visual dimensions.

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import {
  type VisualDimensionScore,
  type VisualEvaluation,
  type VisualDimensionName,
  type GeneratedAd,
  type AdBrief,
  VISUAL_DIMENSION_NAMES,
  QUALITY_THRESHOLD,
} from '../types.js';

const client = new Anthropic({ maxRetries: 5 });

const VISUAL_EVALUATOR_SYSTEM_PROMPT = `You are a senior visual creative director with 10+ years of experience evaluating Facebook/Instagram ad creatives. You are evaluating image creatives for Varsity Tutors, a leading SAT prep brand by Nerdy.

BRAND CONTEXT:
Varsity Tutors' visual identity is empowering, knowledgeable, approachable, and results-focused. Images should feel warm, authentic, and aspirational — like a candid moment captured naturally, not a staged stock photo. The brand targets SAT test prep: parents anxious about college admissions, students stressed about scores, and families comparing prep options.

YOUR TASK: Score the given image on each of 3 visual quality dimensions from 1-10, with a written rationale for each score. You will also see the ad copy this image accompanies — use it to assess text-image coherence.

CALIBRATION GUIDELINES:
- Be rigorous. Most ad images score 4-7. Reserve 9-10 for genuinely exceptional work.
- A score of 7+ means the image is publishable as-is on Meta platforms alongside the ad copy.
- A score of 3 or below means the image actively hurts the ad's effectiveness.
- Scores should be independent — strong composition doesn't make up for poor brand fit.

SCORING RUBRIC:

1. BRAND CONSISTENCY (Does the image feel like Varsity Tutors?)
   1 = Completely off-brand: wrong tone, inappropriate imagery, could be any company or product
   5 = Neutral: inoffensive but generic, no distinct Varsity Tutors feel, could be any education brand
   7 = On-brand: warm and approachable, education context is clear, feels authentic and aspirational
   10 = Unmistakably Varsity Tutors: perfect blend of professionalism and warmth, aspirational yet relatable, clearly SAT/education focused

2. VISUAL ENGAGEMENT (Would this stop a scroll on Facebook/Instagram?)
   1 = Boring: flat composition, no focal point, no contrast, eyes slide right past it
   5 = Adequate: acceptable composition but nothing distinctive, could work as a placeholder
   7 = Engaging: clear focal point, good use of color/contrast/depth, draws the eye naturally
   10 = Scroll-stopping: exceptional composition, strong visual hierarchy, immediate emotional impact, memorable

3. TEXT-IMAGE COHERENCE (Does the image reinforce the ad copy's message?)
   1 = Contradictory: image tells a completely different story than the copy, creates confusion
   5 = Loosely related: generic education image that doesn't contradict the copy but doesn't amplify it either
   7 = Reinforcing: image clearly supports the copy's emotional hook and message, they feel like a pair
   10 = Amplifying: image and copy together are stronger than either alone, the visual adds a dimension the text can't convey

IMPORTANT:
- Score each dimension independently. Do not let one dimension influence another.
- Write 1-2 sentence rationale for each score explaining WHY, referencing specific visual elements you observe.
- Set confidence to "high" when you're certain, "medium" when the score could go ±1, "low" when the image is ambiguous.
- If the image contains rendered text, logos, or watermarks, note it but do not penalize unless it conflicts with the brand.

Respond ONLY with valid JSON — no preamble, no markdown fences, no explanation outside the JSON.
Schema:
{
  "scores": [
    { "dimension": "brand_consistency", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" },
    { "dimension": "visual_engagement", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" },
    { "dimension": "text_image_coherence", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" }
  ]
}`;

export async function evaluateImage(
  localPath: string,
  ad: GeneratedAd,
  brief: AdBrief,
): Promise<VisualEvaluation> {
  // Read image and encode as base64
  const imageBuffer = await readFile(localPath);
  const base64Image = imageBuffer.toString('base64');

  // Detect media type from file content (JPEG starts with FF D8, PNG with 89 50)
  const mediaType = imageBuffer[0] === 0x89 ? 'image/png' : 'image/jpeg';

  const userPrompt = `Evaluate this Facebook/Instagram ad image for Varsity Tutors SAT prep.

The image accompanies this ad copy:
- Primary text: "${ad.primaryText}"
- Headline: "${ad.headline}"

Target audience: ${brief.audience.replace(/_/g, ' ')}
Campaign goal: ${brief.goal}

Score all 3 visual dimensions. JSON only.`;

  const response = await client.messages.create({
    model: process.env['VISUAL_EVALUATOR_MODEL'] ?? 'claude-sonnet-4-5',
    max_tokens: 1024,
    temperature: 0, // MUST be 0 — evaluator must be deterministic
    system: VISUAL_EVALUATOR_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ],
  });

  const block = response.content[0];
  const text = block?.type === 'text' ? block.text : '';

  // Strip markdown fences if present despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = JSON.parse(cleaned) as {
    scores?: Array<{
      dimension?: string;
      score?: number;
      rationale?: string;
      confidence?: string;
    }>;
  };

  if (!parsed.scores || !Array.isArray(parsed.scores)) {
    throw new Error(`Visual evaluator returned invalid structure: ${cleaned}`);
  }

  // Validate and normalize scores — mirror text evaluator exactly
  const scores: VisualDimensionScore[] = [];

  for (const name of VISUAL_DIMENSION_NAMES) {
    const raw = parsed.scores.find(s => s.dimension === name);
    if (!raw || typeof raw.score !== 'number') {
      throw new Error(`Missing or invalid score for visual dimension "${name}": ${JSON.stringify(raw)}`);
    }

    // Clamp to valid range
    const score = Math.max(1, Math.min(10, Math.round(raw.score)));

    scores.push({
      dimension: name as VisualDimensionName,
      score,
      rationale: raw.rationale ?? '',
      confidence: validateConfidence(raw.confidence),
    });
  }

  // Equal-weight average across 3 visual dimensions
  const aggregateScore = computeVisualAggregate(scores);

  // Find weakest dimension (first wins on tie — consistent with text evaluator)
  const weakest = scores.reduce((min, s) =>
    s.score < min.score ? s : min,
  );

  return {
    imageLocalPath: localPath,
    scores,
    aggregateScore,
    passesThreshold: aggregateScore >= QUALITY_THRESHOLD,
    weakestDimension: weakest,
    evaluatedAt: new Date().toISOString(),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function computeVisualAggregate(scores: VisualDimensionScore[]): number {
  const total = scores.reduce((sum, s) => sum + s.score, 0);
  // Equal weight: divide by 3, round to 1 decimal place
  return Math.round((total / scores.length) * 10) / 10;
}

function validateConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return 'medium'; // default if model returns unexpected value
}
