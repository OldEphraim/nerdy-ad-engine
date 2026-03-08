// ── Per-dimension improvement strategies for the iteration loop ───────────
// Each strategy is a specific, actionable instruction injected into the
// regeneration prompt when that dimension is the weakest.

import type { DimensionName } from '../types.js';

export const IMPROVEMENT_STRATEGIES: Record<DimensionName, string> = {
  clarity:
    'The previous version had competing messages or was hard to parse quickly. ' +
    'Rewrite with ONE clear takeaway. Every sentence must serve the same point. ' +
    'A reader scrolling on their phone should get the message in under 3 seconds. ' +
    'Cut any sentence that doesn\'t directly support the core message.',

  value_proposition:
    'The benefit was too vague or generic — it could apply to any tutoring company. ' +
    'Add a specific, measurable outcome (e.g. "200+ point improvement", "in 8 weeks", ' +
    '"40,000+ students helped"). Differentiate from competitors like Princeton Review ' +
    'or Khan Academy by emphasizing what makes Varsity Tutors unique: personalized 1-on-1 matching.',

  call_to_action:
    'The CTA was weak, vague, or missing. Make the next step specific, urgent, and low-friction. ' +
    'For awareness: "See how your student\'s score compares — take a free 5-minute assessment." ' +
    'For conversion: "Start your free practice test — no credit card needed." ' +
    'The CTA should feel like a natural next step, not a sales push.',

  brand_voice:
    'The tone felt generic or corporate — it could be any tutoring company. ' +
    'Rewrite to sound like an empowering, knowledgeable friend giving advice. ' +
    'Varsity Tutors is confident but not arrogant, expert but not elitist. ' +
    'Lead with empathy for the student/parent situation, then offer expertise as the solution.',

  emotional_resonance:
    'The ad was too rational and informational — it read like a product listing. ' +
    'Open with the emotional reality the audience lives in: parent anxiety about ' +
    'college admissions, student stress on test day, fear of falling behind peers. ' +
    'Make the reader feel seen before you offer the solution. Use concrete scenarios, not abstractions.',
};

export function getStrategy(dimension: DimensionName): string {
  return IMPROVEMENT_STRATEGIES[dimension];
}
