// ── Smoke test: single brief through the full iteration loop ─────────────
// Run with: npx tsx src/smoke-test.ts

import 'dotenv/config';
import type { AdBrief } from './types.js';
import { iterateToQuality } from './iterate/loop.js';

const testBrief: AdBrief = {
  id: 'smoke-test-parents-awareness-question',
  audience: 'parents_anxious',
  goal: 'awareness',
  hookType: 'question',
  offer: 'free SAT score analysis',
  tone: 'curious, empathetic',
};

async function main() {
  console.log('=== Smoke Test: Single Brief End-to-End ===\n');
  console.log(`Brief: ${testBrief.id}`);
  console.log(`Audience: ${testBrief.audience}, Goal: ${testBrief.goal}, Hook: ${testBrief.hookType}\n`);

  const result = await iterateToQuality(testBrief, 3);

  console.log('\n=== Results ===');
  console.log(`Converged: ${result.converged}`);
  console.log(`Cycles run: ${result.cycles.length}`);
  console.log(`Final score: ${result.finalEvaluation?.aggregateScore}`);
  console.log(`Total tokens: ${result.totalInputTokens} in / ${result.totalOutputTokens} out`);
  console.log(`Estimated cost: $${result.estimatedCostUsd.toFixed(4)}`);

  console.log('\n--- Per-cycle breakdown ---');
  for (const cycle of result.cycles) {
    console.log(`  Cycle ${cycle.cycle}: aggregate=${cycle.evaluation.aggregateScore} delta=${cycle.improvementDelta}`);
    for (const s of cycle.evaluation.scores) {
      console.log(`    ${s.dimension}: ${s.score} (${s.confidence}) — ${s.rationale.slice(0, 80)}`);
    }
    if (cycle.interventionUsed) {
      console.log(`    Intervention: ${cycle.interventionUsed}`);
    }
  }

  if (result.finalAd) {
    console.log('\n--- Final Ad ---');
    console.log(`Primary: ${result.finalAd.primaryText}`);
    console.log(`Headline: ${result.finalAd.headline}`);
    console.log(`Description: ${result.finalAd.description}`);
    console.log(`CTA: ${result.finalAd.ctaButton}`);
  }
}

main().catch(console.error);
