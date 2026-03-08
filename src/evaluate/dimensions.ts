// ── Dimension definitions and evaluator system prompt ─────────────────────
// The evaluator is the most critical piece of the pipeline. If it can't
// reliably distinguish good from bad, the iteration loop optimizes garbage.

import type { DimensionName } from '../types.js';

export interface DimensionDefinition {
  name: DimensionName;
  label: string;
  description: string;
  score1: string;
  score5: string;
  score7: string;
  score10: string;
}

export const DIMENSIONS: DimensionDefinition[] = [
  {
    name: 'clarity',
    label: 'Clarity',
    description: 'Is the core message immediately understandable? Can you get the point in under 3 seconds?',
    score1: 'Multiple competing messages, confusing structure, unclear what the ad is about',
    score5: 'Message is understandable but requires re-reading, some competing ideas',
    score7: 'Clear single message, easy to understand on first read, minor distractions',
    score10: 'Crystal clear single takeaway in under 3 seconds, every word serves the message',
  },
  {
    name: 'value_proposition',
    label: 'Value Proposition',
    description: 'Does it communicate a specific, compelling, differentiated benefit?',
    score1: 'Generic feature-focused ("we have tutors"), no specific outcome promised',
    score5: 'Some benefit stated but vague ("better scores"), not differentiated from competitors',
    score7: 'Specific benefit with some proof ("200+ point improvement"), clear why Varsity Tutors',
    score10: 'Highly specific, differentiated, with proof point ("40,000 students averaged 200+ point gains in 8 weeks")',
  },
  {
    name: 'call_to_action',
    label: 'Call to Action',
    description: 'Is the next step clear, compelling, and low-friction?',
    score1: 'No CTA, or completely vague ("learn more about opportunities")',
    score5: 'CTA exists but is generic ("sign up today") with no urgency or specificity',
    score7: 'Clear CTA matched to funnel stage, some urgency or specificity ("Start your free practice test")',
    score10: 'Specific, urgent, low-friction CTA with clear value ("Get your free diagnostic — see exactly where to improve")',
  },
  {
    name: 'brand_voice',
    label: 'Brand Voice',
    description: 'Does it sound distinctly like Varsity Tutors? Empowering, knowledgeable, approachable, results-focused.',
    score1: 'Generic corporate tone, could be any company, no personality',
    score5: 'Somewhat warm but still generic, not distinctly Varsity Tutors',
    score7: 'Clearly empowering and approachable, reads like a knowledgeable friend giving advice',
    score10: 'Unmistakably Varsity Tutors: expert but not elitist, confident but warm, leads with outcomes',
  },
  {
    name: 'emotional_resonance',
    label: 'Emotional Resonance',
    description: 'Does it connect emotionally with the target audience? Does it tap into real motivation?',
    score1: 'Flat, purely rational, no emotional connection, reads like a textbook description',
    score5: 'Some emotional element but surface-level, doesn\'t tap into real anxieties or aspirations',
    score7: 'Connects to a real emotion (parent worry, student ambition, deadline anxiety) authentically',
    score10: 'Deeply resonant — the reader feels understood, the ad speaks to their specific situation and fears/hopes',
  },
];

export const EVALUATOR_SYSTEM_PROMPT = `You are a senior performance marketing expert with 10+ years of experience evaluating Facebook/Instagram ad copy. You are evaluating ads for Varsity Tutors, a leading SAT prep brand.

YOUR TASK: Score the given ad on each of 5 quality dimensions from 1-10, with a written rationale for each score.

CALIBRATION GUIDELINES:
- Be rigorous. Most ads score 4-7. Reserve 9-10 for genuinely exceptional work.
- A score of 7+ means the ad is publishable as-is on Meta platforms.
- A score of 3 or below means the ad actively hurts the brand.
- Scores should be independent — a great CTA doesn't make up for poor clarity.
- Compare against what you know works on Meta: specific numbers, emotional hooks, social proof, authentic voice.

SCORING RUBRIC:

1. CLARITY (Is the message immediately understandable?)
   1 = Multiple competing messages, confusing structure
   5 = Understandable but requires re-reading
   7 = Clear single message on first read
   10 = Crystal clear takeaway in under 3 seconds

2. VALUE PROPOSITION (Is the benefit specific and compelling?)
   1 = Generic features only ("we have tutors")
   5 = Vague benefit ("better scores"), not differentiated
   7 = Specific benefit with proof ("200+ point improvement")
   10 = Highly specific, differentiated, with proof point

3. CALL TO ACTION (Is the next step clear and low-friction?)
   1 = No CTA or completely vague
   5 = Generic CTA ("sign up today"), no urgency
   7 = Clear CTA matched to funnel, some urgency
   10 = Specific, urgent, low-friction with clear value

4. BRAND VOICE (Does it sound like Varsity Tutors?)
   1 = Generic corporate, could be anyone
   5 = Somewhat warm but not distinctive
   7 = Empowering and approachable, knowledgeable friend
   10 = Unmistakably Varsity Tutors

5. EMOTIONAL RESONANCE (Does it connect emotionally?)
   1 = Flat, purely rational
   5 = Surface-level emotion
   7 = Connects to real anxiety or aspiration authentically
   10 = Deeply resonant, reader feels understood

IMPORTANT:
- Score each dimension independently. Do not let one dimension influence another.
- Write 1-2 sentence rationale for each score explaining WHY, not just restating the rubric.
- Set confidence to "high" when you're certain, "medium" when the score could go ±1, "low" when the ad is ambiguous.

Respond ONLY with valid JSON — no preamble, no markdown fences, no explanation outside the JSON.
Schema:
{
  "scores": [
    { "dimension": "clarity", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" },
    { "dimension": "value_proposition", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" },
    { "dimension": "call_to_action", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" },
    { "dimension": "brand_voice", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" },
    { "dimension": "emotional_resonance", "score": <1-10>, "rationale": "<why>", "confidence": "high"|"medium"|"low" }
  ]
}`;

export function buildEvaluationPrompt(ad: {
  primaryText: string;
  headline: string;
  description: string;
  ctaButton: string;
}): string {
  return `Evaluate this Facebook/Instagram ad for Varsity Tutors SAT prep:

PRIMARY TEXT:
${ad.primaryText}

HEADLINE:
${ad.headline}

DESCRIPTION:
${ad.description}

CTA BUTTON:
${ad.ctaButton}

Score all 5 dimensions. JSON only.`;
}
