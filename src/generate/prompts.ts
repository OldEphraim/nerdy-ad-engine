// ── Prompt templates for ad copy generation ──────────────────────────────
// System prompt uses few-shot examples to anchor quality expectations.
// User prompt injects brief-specific context (audience, goal, hook type).

import Anthropic from '@anthropic-ai/sdk';
import type { AdBrief, GeneratedAd } from '../types.js';
import { AUDIENCE_DESCRIPTIONS } from './briefs.js';

export const GENERATOR_SYSTEM_PROMPT = `You are an expert Facebook/Instagram ad copywriter for Varsity Tutors, the leading SAT prep brand by Nerdy.

BRAND VOICE: Empowering, knowledgeable, approachable, results-focused.
- Lead with outcomes, not features. Specific numbers beat vague promises.
- Confident but not arrogant. Expert but not elitist.
- Authentic > polished. Story-driven > feature-list.
- Meet people where they are emotionally.

AD STRUCTURE:
- primaryText: The main copy above the image. First line MUST stop the scroll — this is a pattern interrupt. ~125 chars visible before "...See More". Can be 2-4 sentences total.
- headline: Bold text below the image. 5-8 words max. Benefit-driven, not feature-driven.
- description: Secondary text below headline. One short sentence reinforcing the value prop. Often truncated on mobile, so don't put critical info here.
- ctaButton: One of "Learn More", "Sign Up", "Get Started", "Book Now", "Get Offer".

RULES:
- Never use generic filler ("unlock your potential", "take the first step")
- Include specific numbers when possible (score improvements, timeframes, percentages)
- Match the CTA to the funnel stage: awareness = "Learn More"; conversion = "Sign Up" or "Get Started"
- No hashtags, no emojis, no ALL CAPS for emphasis
- Primary text should follow one of these patterns:
  • Question hook → pain point → solution → proof → CTA
  • Stat hook → context → benefit → CTA
  • Story hook → transformation → how → CTA
  • Fear/urgency hook → consequence → solution → CTA

GOOD EXAMPLE 1 (parent audience, question hook, awareness):
{
  "primaryText": "Is your child spending hours studying for the SAT with nothing to show for it? Our expert tutors have helped 40,000+ students boost their scores by an average of 200 points. Personalized 1-on-1 prep that targets exactly where they need help.",
  "headline": "SAT Scores Up 200+ Points on Average",
  "description": "Expert 1-on-1 tutoring matched to your student's weak areas.",
  "ctaButton": "Learn More"
}

GOOD EXAMPLE 2 (student audience, story hook, conversion):
{
  "primaryText": "I went from a 1080 to a 1360 in just 6 weeks. My Varsity Tutors instructor figured out I was losing points on reading comprehension and built every session around fixing that. Best decision I made junior year.",
  "headline": "Real Students. Real Score Jumps.",
  "description": "Get matched with a top-rated SAT tutor today.",
  "ctaButton": "Get Started"
}

GOOD EXAMPLE 3 (comparison shopper, stat hook, conversion):
{
  "primaryText": "Students who use 1-on-1 SAT tutoring score 200+ points higher than self-study alone. Unlike one-size-fits-all courses, Varsity Tutors matches you with an expert who builds a plan around YOUR weak areas. Try it free — no commitment.",
  "headline": "Why 1-on-1 Beats Every Prep Course",
  "description": "Personalized SAT prep. First session free.",
  "ctaButton": "Sign Up"
}

BAD EXAMPLE (generic, no specifics, weak CTA):
{
  "primaryText": "Looking to improve your SAT scores? We offer great tutoring services that can help you succeed. Our tutors are experienced and ready to help you reach your goals.",
  "headline": "Improve Your SAT Score Today",
  "description": "Quality tutoring for better results.",
  "ctaButton": "Learn More"
}
WHY IT FAILS: No specific numbers, no emotional hook, reads like every other tutoring ad. "Great tutoring services" is a feature, not a benefit. The headline is generic. No social proof, no urgency.

Respond ONLY with valid JSON matching this exact schema — no preamble, no markdown fences, no explanation:
{ "primaryText": string, "headline": string, "description": string, "ctaButton": string }`;

export function buildGenerationPrompt(brief: AdBrief): string {
  const audienceDesc = AUDIENCE_DESCRIPTIONS[brief.audience];
  const hookInstruction = brief.hookType ? HOOK_INSTRUCTIONS[brief.hookType] : '';

  return `Write a Facebook/Instagram ad for Varsity Tutors SAT prep.

AUDIENCE: ${brief.audience.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
${audienceDesc}

CAMPAIGN GOAL: ${brief.goal}
${brief.goal === 'awareness' ? 'Focus on emotional connection and problem awareness. CTA should be low-commitment (Learn More).' : 'Focus on driving action. Include the specific offer. CTA should be action-oriented (Sign Up, Get Started).'}

${brief.offer ? `OFFER: ${brief.offer}` : ''}
${brief.tone ? `TONE: ${brief.tone}` : ''}

${hookInstruction}

Generate the ad now. JSON only.`;
}

const HOOK_INSTRUCTIONS: Record<string, string> = {
  question:
    'HOOK TYPE: Question — Open with a provocative question that makes the reader stop scrolling. ' +
    'Target a specific pain point the audience feels RIGHT NOW. Follow with the answer/solution.',
  stat:
    'HOOK TYPE: Statistic — Lead with a compelling, specific number that creates an "I didn\'t know that" moment. ' +
    'Use real-feeling stats about SAT score improvements, acceptance rates, or prep effectiveness.',
  story:
    'HOOK TYPE: Story/Testimonial — Write in first person as a student or parent sharing a real-feeling transformation. ' +
    'Include specific before/after scores and a concrete timeframe. Make it feel authentic, not scripted.',
  fear:
    'HOOK TYPE: Fear/Urgency — Create urgency around test deadlines, score cutoffs, or competitive admissions. ' +
    'Don\'t be alarmist — be honest about what\'s at stake. Then provide the solution.',
};

export function buildRegenerationPrompt(
  brief: AdBrief,
  previousAd: { primaryText: string; headline: string; description: string; ctaButton: string },
  weakestDimension: string,
  interventionStrategy: string,
): string {
  const basePrompt = buildGenerationPrompt(brief);

  return `${basePrompt}

IMPROVEMENT CONTEXT:
The previous version of this ad scored poorly on "${weakestDimension.replace(/_/g, ' ')}".

Previous ad for reference (DO NOT copy — rewrite from scratch):
- Primary text: "${previousAd.primaryText}"
- Headline: "${previousAd.headline}"

SPECIFIC INSTRUCTION: ${interventionStrategy}

Generate an improved version. Rewrite completely — the previous version is reference only, not a starting point. JSON only.`;
}

// ── V3: Coherence Revision + Copy Refinement Prompts ────────────────────────

/**
 * Build a revised Flux image prompt addressing a specific coherence failure.
 * Used by the coherence loop when text_image_coherence is the weakest dimension.
 */
export function buildCoherenceRevisionPrompt(
  ad: GeneratedAd,
  brief: AdBrief,
  originalPrompt: string,
  coherenceRationale: string,
): string {
  const audienceDesc = AUDIENCE_DESCRIPTIONS[brief.audience];

  return `REVISION NEEDED — the previous image failed to visually reinforce the ad copy.

ORIGINAL IMAGE PROMPT (what was tried):
${originalPrompt}

WHY IT FAILED (evaluator's coherence rationale):
${coherenceRationale}

AD COPY (what the image MUST reinforce):
- Primary text: "${ad.primaryText}"
- Headline: "${ad.headline}"

AUDIENCE: ${brief.audience.replace(/_/g, ' ')} — ${audienceDesc}

YOUR TASK: Write a NEW image prompt that directly visualizes the copy's core message.
Do not repeat the original prompt. Address the specific coherence failure above.
The image should make a viewer FEEL what the copy is saying — not just be thematically related.

Remember: NO text, logos, words, or numbers in the scene. Describe a candid photograph.
Landscape composition (1.91:1 ratio). Warm, authentic UGC style.

Write the revised scene description now. Single paragraph, no JSON.`;
}

/**
 * Build a copy refinement prompt that rewrites ad copy to emotionally match the image.
 * Used when the coherence mismatch is classified as copy-side.
 */
export function buildCopyRefinementPrompt(
  ad: GeneratedAd,
  brief: AdBrief,
  imageDescription: string,
  copySideSignal: string,
): string {
  const audienceDesc = AUDIENCE_DESCRIPTIONS[brief.audience];
  const hookInstruction = brief.hookType ? HOOK_INSTRUCTIONS[brief.hookType] : '';

  return `COPY REFINEMENT — the current ad copy does not emotionally match its image.

IMAGE SCENE: ${imageDescription}

COPY-SIDE MISMATCH: ${copySideSignal}

CURRENT COPY (what needs to change):
- Primary text: "${ad.primaryText}"
- Headline: "${ad.headline}"
- Description: "${ad.description}"
- CTA: "${ad.ctaButton}"

AUDIENCE: ${brief.audience.replace(/_/g, ' ')} — ${audienceDesc}
CAMPAIGN GOAL: ${brief.goal}
${brief.goal === 'awareness' ? 'Focus on emotional connection and problem awareness. CTA should be low-commitment (Learn More).' : 'Focus on driving action. Include the specific offer. CTA should be action-oriented (Sign Up, Get Started).'}
${brief.offer ? `OFFER: ${brief.offer}` : ''}
${brief.tone ? `TONE: ${brief.tone}` : ''}
${hookInstruction}

YOUR TASK: Rewrite the ad copy so it emotionally matches and reinforces what this image communicates to the ${brief.audience.replace(/_/g, ' ')} audience. Keep the same hook type and campaign goal. The image is fixed — adapt the copy to it.

Respond ONLY with valid JSON: { "primaryText": string, "headline": string, "description": string, "ctaButton": string }`;
}

// ── V2: Image Prompt Generation ─────────────────────────────────────────────

const IMAGE_PROMPT_SYSTEM = `You are an expert visual creative director specializing in Facebook/Instagram ad photography for Varsity Tutors, a premium SAT prep brand.

Your job: Given ad copy and audience context, write a single descriptive paragraph that will be used as a prompt for an AI image generator (Flux Schnell). The output image will appear as the creative in a Facebook ad at 1200x628px (landscape, 1.91:1 ratio).

VISUAL STYLE — PHOTOREALISTIC UGC:
Generate a Flux Schnell image prompt for a naturalistic, photorealistic scene. The image must look like a candid photo taken on a good smartphone — authentic, warm, unstaged, real. Think UGC (user-generated content) aesthetic.

Requirements:
- Real people in real, recognizable situations (a student at a kitchen table, a parent looking at a laptop, a teenager studying in a library)
- Natural lighting — window light, soft indoor light, nothing studio-lit
- Genuine emotional expressions — relief, focus, quiet confidence, encouragement — not posed stock-photo smiles
- Shallow depth of field where appropriate
- Warm color palette that feels domestic and approachable
- The scene should evoke the EMOTION of the ad copy — if the copy is about anxiety, show tension; if about success, show quiet celebration
- Describe specific visual details: lighting direction, depth of field, color palette, subject positioning
- Landscape composition (wider than tall) — important for 1.91:1 ratio
- Avoid stock photo clichés: no generic handshakes, no people staring blankly at laptops, no staged group high-fives

HARD PROHIBITIONS — never include any of the following in the scene description:
- Text, words, numbers, or scores anywhere in the scene
- Split panels or before/after layouts
- Illustrated or cartoon elements
- Charts, graphs, or data visualizations
- Score reports, documents held up to camera, or paper props
- Studio lighting, white backgrounds, or commercial photography aesthetic
- Logos, branding, or watermarks

COMPETITOR VISUAL STYLES — OVERRIDE:
Regardless of any competitor ad formats that may appear in your context (illustrated creatives, typography-only ads, split-panel graphics, infographic-style layouts), always generate a photographic, naturalistic scene. Never adopt a non-photographic format. The UGC photograph style above is the only acceptable output.

OUTPUT: A single descriptive paragraph. No JSON, no bullet points, no preamble. Just the scene description.`;

export async function buildImagePrompt(ad: GeneratedAd, brief: AdBrief): Promise<string> {
  const client = new Anthropic();
  const model = process.env['GENERATOR_MODEL'] ?? 'claude-haiku-4-5';
  const audienceDesc = AUDIENCE_DESCRIPTIONS[brief.audience];

  const userPrompt = `Write an image prompt for this Facebook ad:

AD COPY:
- Primary text: "${ad.primaryText}"
- Headline: "${ad.headline}"

AUDIENCE: ${brief.audience.replace(/_/g, ' ')} — ${audienceDesc}
CAMPAIGN GOAL: ${brief.goal}
HOOK TYPE: ${brief.hookType ?? 'general'}

Describe the photo scene now.`;

  const response = await client.messages.create({
    model,
    max_tokens: 300,
    temperature: 0.7,
    system: IMAGE_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Unexpected response type from image prompt generation');
  }

  return block.text.trim();
}
