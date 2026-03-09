# Autonomous Ad Generation System — CLAUDE.md

> **Hiring Partner:** Nerdy (Varsity Tutors) · **Stack:** TypeScript, Next.js, React, Node.js

---

## Model Choice: Anthropic SDK

This project uses the **Anthropic SDK** (`@anthropic-ai/sdk`) for both generation and evaluation.
The spec recommends Gemini but is model-agnostic at its core — the decision to use Anthropic is
documented in `docs/DECISION_LOG.md` with rationale. Models used:

| Role | Model | Why |
|---|---|---|
| Ad copy generation | `claude-haiku-4-5` | Fast, cheap, strong creative writing |
| LLM-as-judge evaluation | `claude-haiku-4-5` | Same model fine for V1; consistent rubric application |
| Upgrade path if needed | `claude-sonnet-4-5` | For complex briefs or quality ceiling issues |

**Cost reference (for performance-per-token tracking):**
- Haiku input: $0.80 / 1M tokens · output: $4.00 / 1M tokens
- Expect ~$0.01–0.03 per ad through the full iterate loop

**Important note on determinism:** The Anthropic API does not expose a `seed` parameter like
OpenAI. Determinism is approximated by setting `temperature: 0` for the evaluator (scoring must
be consistent) and `temperature: 0.7` + fixed system prompt for the generator. Document this
tradeoff in `DECISION_LOG.md`.

---

## Project Overview

Build an autonomous pipeline that generates Facebook/Instagram ad copy for Varsity Tutors' SAT
prep product, evaluates each ad across 5 quality dimensions, iterates to improve weak ads, and
surfaces only publishable output (≥7.0/10). The north star is **quality per token spent**.

### What You're Building (V1 Scope)

| Layer | What it does |
|---|---|
| `generate/` | Creates ad copy (primary text, headline, description, CTA) from a brief |
| `evaluate/` | Scores each ad on 5 dimensions with LLM-as-judge + rationale |
| `iterate/` | Runs generate → evaluate → regenerate loops until ≥7.0 or max cycles |
| `output/` | Ad library (JSON/CSV), quality trend charts, evaluation reports |
| `dashboard/` | Next.js/React frontend showing ad library and quality trends |
| `docs/` | Decision log, limitations |

---

## Success Criteria Checklist (from spec)

These map directly to the final test suite in Step 11.

- [ ] 50+ ads generated with full evaluation scores
- [ ] 5 quality dimensions scored independently with rationale
- [ ] Quality threshold enforcement (7.0/10 minimum, auto-flag below)
- [ ] Measurable quality improvement across 3+ iteration cycles
- [ ] Evaluation coverage: 100% of generated ads have scores + rationale
- [ ] Decision log complete and honest
- [ ] One-command setup (`pnpm generate`)
- [ ] ≥10 unit/integration tests
- [ ] Deterministic evaluator behavior (temperature: 0)
- [ ] Explicit limitations documented

---

## Quality Dimensions

Every ad is scored 1–10 on each dimension. Aggregate must be ≥7.0 to pass.

| # | Dimension | Score 1 (Bad) | Score 10 (Excellent) |
|---|---|---|---|
| 1 | **Clarity** | Confusing, multiple competing messages | Crystal clear single takeaway in <3 seconds |
| 2 | **Value Proposition** | Generic/feature-focused ("we have tutors") | Specific, differentiated ("raise your SAT score 200+ points") |
| 3 | **Call to Action** | No CTA or vague ("learn more") | Specific, urgent, low-friction ("Start your free practice test") |
| 4 | **Brand Voice** | Generic, could be anyone | Distinctly on-brand: empowering, knowledgeable, approachable |
| 5 | **Emotional Resonance** | Flat, purely rational | Taps into real motivation (parent worry, student ambition, test anxiety) |

**Dimension weighting decision (document in decision log):** Default equal weights (0.2 each).
Justify or adjust based on your calibration against reference ads.

---

## Ad Anatomy (Meta Platform)

```
┌─────────────────────────────────┐
│ Varsity Tutors · Sponsored      │
│                                 │
│ PRIMARY TEXT                    │  ← Most important. First line stops the scroll.
│ (~125 chars visible before      │     Hook or lose them.
│  "...See More")                 │
│                                 │
│ ┌─────────────────────────────┐ │
│ │         IMAGE               │ │  ← Out of scope for V1
│ └─────────────────────────────┘ │
│                                 │
│ HEADLINE                        │  ← Bold, below image. 5–8 words. Benefit-driven.
│ Description text                │  ← Often truncated on mobile. Don't rely on it.
│ [ Learn More / Sign Up ]        │  ← Match funnel stage.
└─────────────────────────────────┘
```

### What Works on Meta Right Now
- **Authentic > polished.** UGC-style outperforms studio creative.
- **Story-driven > feature-list.** Pain point → solution → proof → CTA.
- **Pattern interrupts.** Scroll-stopping hooks in the first line.
- **Social proof** (reviews, testimonials, numbers) builds trust.
- **Emotional resonance > rational argument** for awareness; flip for conversion.

### Hook Patterns That Convert
| Hook Type | Example |
|---|---|
| Question | "Is your child's SAT score holding them back?" |
| Stat | "Students who prep score 200+ points higher on average." |
| Story | "My daughter went from a 1050 to a 1400 in 8 weeks." |
| Fear/Urgency | "The SAT is 3 months away. Is your student ready?" |

### Body Patterns
- Problem → agitate → solution → proof → CTA
- Testimonial → benefit → CTA
- Stat → context → offer → CTA

---

## Brand Context: Varsity Tutors (Nerdy)

**Voice:** Empowering, knowledgeable, approachable, results-focused.
- Lead with outcomes, not features
- Confident but not arrogant. Expert but not elitist
- Meet people where they are

**Primary audience for this project:** SAT test prep
- Parents anxious about college admissions
- High school students stressed about scores
- Families comparing prep options (Princeton Review, Khan Academy, Chegg, Kaplan)

---

## Evaluation Framework (Iteration Loop)

```
Brief → Generate Ad → Score (5 dimensions) → Aggregate ≥ 7.0?
           │                                      │
           │                                    YES → Add to library
           │                                      │
           │                                    NO  → Identify weakest dimension
           │                                          → Targeted regeneration with weakness context
           │                                          → Re-score
           │                                          → Track improvement delta
           └──────────────────────── Max cycles (3–5) → Flag as failed, log reason
```

---

## Scoring Rubric Summary

| Score | Grade | Description |
|---|---|---|
| 90–100 | Excellent | Exceptional work, exceeds expectations |
| 80–89 | Good | Strong work, meets all core requirements well |
| 70–79 | Acceptable | Satisfactory work, meets basic requirements |
| 60–69 | Needs Work | Partially complete, missing key elements |
| <60 | Incomplete | Does not meet minimum requirements |

### Automatic Deductions
| Condition | Deduction |
|---|---|
| No working demo | -10 |
| Cannot run with provided instructions | -10 |
| Fewer than 50 ads generated | -5 |
| No evaluation scores on generated ads | -15 |
| No iteration/improvement attempted | -10 |
| No decision log | -10 |

### Bonus Points (up to 10)
| Achievement | Bonus |
|---|---|
| Self-healing / automatic quality improvement | +7 |
| Multi-model orchestration with clear rationale | +3 |
| Performance-per-token tracking (ROI awareness) | +2 |
| Quality trend visualization | +2 |
| Competitive intelligence from Meta Ad Library | +10 |

---

## Assessment Weights

| Area | Weight | Focus |
|---|---|---|
| Quality Measurement & Evaluation | 25% | Can the system tell good ads from bad? |
| System Design & Architecture | 20% | Is the system well-built and resilient? |
| Iteration & Improvement | 20% | Does ad quality measurably improve? |
| Speed of Optimization | 15% | How efficiently does the system iterate? |
| Documentation & Individual Thinking | 20% | Can we see YOUR mind at work? |

---

## Setup Instructions

### Prerequisites
- Node.js ≥20
- `pnpm`
- Anthropic API key (`ANTHROPIC_API_KEY`)

### Install Dependencies

```bash
# Root: core pipeline
pnpm add @anthropic-ai/sdk dotenv zod csv-writer uuid
pnpm add -D typescript tsx @types/node vitest @vitest/coverage-v8

# Dashboard: Next.js + React (already created)
cd dashboard && pnpm add recharts lucide-react && cd ..
```

### Environment Setup

```bash
cp .env.example .env
# Only one value to fill in:
#   ANTHROPIC_API_KEY=your_key_here
```

All other values have working defaults. See `.env.example` for the full list.

### Directory Structure

```
ad-engine/
├── src/
│   ├── generate/
│   │   ├── generator.ts        # Core ad copy generation (Anthropic SDK)
│   │   ├── prompts.ts          # Generation prompt templates
│   │   └── briefs.ts           # Ad brief definitions (audiences × goals)
│   ├── evaluate/
│   │   ├── evaluator.ts        # LLM-as-judge scoring (Anthropic SDK, temp=0)
│   │   ├── dimensions.ts       # Dimension definitions + rubrics
│   │   └── calibration.ts      # Calibrate against reference/competitor ads
│   ├── iterate/
│   │   ├── loop.ts             # Generate → evaluate → regenerate loop
│   │   └── strategies.ts       # Per-dimension improvement strategies
│   ├── output/
│   │   ├── library.ts          # Ad library management (JSON + CSV)
│   │   ├── report.ts           # Evaluation report generation
│   │   └── trends.ts           # Quality trend calculation
│   ├── types.ts                # Shared TypeScript interfaces
│   └── index.ts                # Entry point (one-command run)
├── dashboard/                  # Next.js app (its own package.json)
│   └── app/
│       ├── page.tsx            # Ad library view
│       ├── trends/page.tsx     # Quality trend charts (Recharts)
│       └── api/ads/route.ts    # Reads from data/ads.json
├── data/
│   ├── reference-ads.json      # Competitor ads from Meta Ad Library
│   └── ads.json                # Generated ad library
├── docs/
│   ├── DECISION_LOG.md
│   └── LIMITATIONS.md
├── nerdy-docs/
│   └── spec.md
├── tests/
│   ├── generator.test.ts
│   ├── evaluator.test.ts
│   ├── iterate.test.ts
│   ├── library.test.ts
│   └── spec-compliance.test.ts
├── examples/
│   └── evaluation-sample.json
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### package.json Scripts

```json
"scripts": {
  "generate": "tsx src/index.ts",
  "calibrate": "tsx src/evaluate/calibration.ts",
  "dashboard": "cd dashboard && pnpm dev",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:watch": "vitest"
}
```

---

## Step-by-Step Implementation Guide

### Step 1 — Define Types and Shared Interfaces (`src/types.ts`)

Define core data structures before writing any logic. Everything in the system communicates
through these types.

```typescript
export interface AdBrief {
  id: string;
  audience: 'parents_anxious' | 'students_stressed' | 'comparison_shoppers';
  goal: 'awareness' | 'conversion';
  offer?: string;      // e.g. "free diagnostic test"
  tone?: string;       // e.g. "urgent", "empathetic", "aspirational"
  hookType?: 'question' | 'stat' | 'story' | 'fear';
}

export interface GeneratedAd {
  id: string;
  briefId: string;
  primaryText: string;
  headline: string;
  description: string;
  ctaButton: string;
  generatedAt: string;   // ISO timestamp
  modelUsed: string;     // e.g. "claude-haiku-4-5"
  iterationCycle: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DimensionScore {
  dimension: 'clarity' | 'value_proposition' | 'call_to_action' | 'brand_voice' | 'emotional_resonance';
  score: number;         // 1–10
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface EvaluationResult {
  adId: string;
  scores: DimensionScore[];
  aggregateScore: number;
  passesThreshold: boolean;  // >= QUALITY_THRESHOLD (7.0)
  weakestDimension: DimensionScore;
  evaluatedAt: string;
  inputTokens: number;
  outputTokens: number;
}

export interface IterationCycle {
  cycle: number;
  ad: GeneratedAd;
  evaluation: EvaluationResult;
  improvementDelta: number;   // 0 for cycle 1
  interventionUsed?: string;
}

export interface IterationRecord {
  briefId: string;
  cycles: IterationCycle[];
  finalAd: GeneratedAd | null;
  finalEvaluation: EvaluationResult | null;
  converged: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface AdLibraryEntry {
  ad: GeneratedAd;
  evaluation: EvaluationResult;
  iterationHistory: IterationRecord;
}

export const QUALITY_THRESHOLD = 7.0;
export const DIMENSION_NAMES = [
  'clarity', 'value_proposition', 'call_to_action', 'brand_voice', 'emotional_resonance'
] as const;
```

---

### Step 2 — Define Ad Briefs (`src/generate/briefs.ts`)

Create at least 3 audience × 2 goal combinations = 6 base templates. The pipeline expands
these to 50+ ads by varying `hookType` and `offer` across runs.

**Audiences:**
- `parents_anxious` — Parents worried about college admissions, comparing options
- `students_stressed` — High school students stressed about SAT scores
- `comparison_shoppers` — Families evaluating Princeton Review, Khan Academy, Chegg, Kaplan

**Goals:**
- `awareness` — Emotional hooks, problem agitation, brand introduction
- `conversion` — Specific offer, urgency, free trial/diagnostic as first step

**Hook rotation:** Cycle through `question`, `stat`, `story`, `fear` across ads from the same
brief to ensure variety. Document this in `DECISION_LOG.md`.

---

### Step 3 — Build the Generator (`src/generate/generator.ts`)

Use the Anthropic SDK to produce a `GeneratedAd` from an `AdBrief`.

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

export async function generateAd(brief: AdBrief): Promise<GeneratedAd> {
  const response = await client.messages.create({
    model: process.env.GENERATOR_MODEL ?? 'claude-haiku-4-5',
    max_tokens: 512,
    temperature: 0.7,   // some creativity; evaluator uses 0
    system: GENERATOR_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildGenerationPrompt(brief) }
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const parsed = JSON.parse(text);

  return {
    id: generateId(),
    briefId: brief.id,
    ...parsed,
    generatedAt: new Date().toISOString(),
    modelUsed: response.model,
    iterationCycle: 1,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
```

**Generator system prompt structure:**
```
You are an expert Meta ad copywriter for Varsity Tutors, the SAT prep brand.

BRAND VOICE: Empowering, knowledgeable, approachable, results-focused.
Lead with outcomes. Specific numbers beat vague promises.
Authentic > polished. Story-driven > feature-list.

[2–3 few-shot positive examples]
[1 negative example with annotation explaining why it fails]

Respond ONLY with valid JSON — no preamble, no markdown fences.
Schema: { primaryText, headline, description, ctaButton }
```

**Key decisions to document in `DECISION_LOG.md`:**
- Why few-shot examples: anchor the model's quality understanding before it writes
- Hook type injection via brief: ensures variety across the 50+ ad library
- `temperature: 0.7`: enough creative variance, still structurally reliable
- JSON-only output with no markdown: prevents parsing failures in the pipeline

---

### Step 4 — Build the Evaluator (`src/evaluate/evaluator.ts`)

**This is the most important piece.** If the evaluator can't reliably distinguish good from bad,
the feedback loop optimizes toward garbage. Spend the most time here.

```typescript
export async function evaluateAd(ad: GeneratedAd): Promise<EvaluationResult> {
  const response = await client.messages.create({
    model: process.env.EVALUATOR_MODEL ?? 'claude-haiku-4-5',
    max_tokens: 1024,
    temperature: 0,   // MUST be 0 — evaluator must be deterministic
    system: EVALUATOR_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildEvaluationPrompt(ad) }
    ],
  });
  // parse JSON, compute weighted aggregate, identify weakest dimension
}
```

**Evaluator system prompt structure:**
```
You are a senior performance marketing expert evaluating Facebook/Instagram ad copy
for Varsity Tutors' SAT prep product.

Score this ad on each of 5 dimensions from 1–10.
Be calibrated: reserve 9–10 for genuinely exceptional ads. Most ads score 4–7.
A score of 7+ means the ad is publishable as-is.

DIMENSIONS:
1. Clarity (1=confusing/competing messages, 10=crystal clear in <3 seconds)
2. Value Proposition (1=generic "we have tutors", 10=specific "200+ point improvement")
3. Call to Action (1=no CTA or vague, 10=specific + urgent + low-friction)
4. Brand Voice (1=generic could-be-anyone, 10=distinctly empowering/knowledgeable)
5. Emotional Resonance (1=flat/rational, 10=taps parent worry or student ambition)

Respond ONLY with valid JSON — no preamble, no markdown fences.
Schema: { scores: [{ dimension, score, rationale, confidence }] }
```

**Calibration (run before generating any new ads):**

Run `pnpm calibrate` after loading competitor ads into `data/reference-ads.json`. The
calibration script evaluates a "known good" and "known bad" ad and logs the scores.
Target: best ad ≥8.0, weakest ad ≤5.0. If not met, tighten rubric language and re-run.
Document results in `DECISION_LOG.md`.

---

### Step 5 — Build the Iteration Loop (`src/iterate/loop.ts`)

```typescript
export async function iterateToQuality(
  brief: AdBrief,
  maxCycles = parseInt(process.env.MAX_ITERATIONS ?? '5')
): Promise<IterationRecord>
```

1. Generate initial ad
2. Evaluate → if aggregate ≥ `QUALITY_THRESHOLD`, done (`converged: true`)
3. Identify weakest dimension
4. Look up targeted improvement strategy from `strategies.ts`
5. Regenerate with weakness context injected into the prompt
6. Re-evaluate → track delta
7. Repeat until threshold met or `maxCycles` reached

**Per-dimension improvement strategies (`src/iterate/strategies.ts`):**

| Weak Dimension | Strategy injected into regeneration prompt |
|---|---|
| `clarity` | "The previous version had competing messages. Rewrite with ONE clear takeaway. Every sentence must serve the same point." |
| `value_proposition` | "The benefit was too vague. Add a specific number or measurable outcome (e.g. '200+ point improvement', 'in 8 weeks')." |
| `call_to_action` | "The CTA was weak or missing. Make the next step specific, urgent, and low-friction. A free diagnostic test is a strong offer." |
| `brand_voice` | "The tone felt generic. Rewrite to sound empowering and approachable — like a knowledgeable friend, not a corporate ad." |
| `emotional_resonance` | "The ad was too rational. Open with the emotional reality: parent anxiety about college, student stress about test day, fear of falling behind." |

**Document in `DECISION_LOG.md`:**
- How many cycles before diminishing returns?
- Does regenerating the full ad vs. targeting only the weak section perform better?
- What happens when an ad never reaches 7.0? (Flag, move on, log reason)

---

### Step 6 — Build the Ad Library (`src/output/library.ts`)

Persist all ads, evaluations, and iteration records to `data/ads.json` and `data/ads.csv`.

**CSV columns:**
```
id, briefId, primaryText, headline, description, ctaButton,
clarity, value_proposition, call_to_action, brand_voice, emotional_resonance,
aggregate, passes_threshold, iteration_cycles,
total_input_tokens, total_output_tokens, estimated_cost_usd
```

Export a `getQualityTrend()` function returning:
```typescript
[{ cycle: 1, avgScore: number }, { cycle: 2, avgScore: number }, ...]
```
This is what the spec compliance test uses to prove measurable improvement.

---

### Step 7 — Scale to 50+ Ads (`src/index.ts`)

Expect ~60–70% pass rate after iteration, so target ~75 total runs.

**Strategy:**
- Define ~15–20 distinct briefs (3 audiences × 2 goals × varying hook types + offers)
- Run 4–5 ads per brief
- Use `Promise.allSettled` with a concurrency limit of 5 to batch without hitting rate limits
- Cost formula: `(inputTokens * 0.0000008) + (outputTokens * 0.000004)`
- Log summary at end: total ads, passing rate, total cost, cost per passing ad

---

### Step 8 — Build the Dashboard (`dashboard/`)

Next.js/React — Nerdy's stack. Keep it clean and data-driven.

**Pages:**
- `/` — Ad library table: sortable by score, filterable by audience/goal/pass status
- `/trends` — Quality trend line chart (Recharts) showing avg score by iteration cycle
- `/ad/[id]` — Ad detail: full copy, per-dimension bar chart, iteration history, cost

**Data flow:** Dashboard reads `data/ads.json` via `/api/ads` Next.js API route. No database.

**Visualization note:** Use **blue** for passing ads (≥7.0) and **orange** for failing (<7.0).
Avoid red/green (colorblind accessibility).

---

### Step 9 — Write the Decision Log (`docs/DECISION_LOG.md`)

**Worth 20% of your score.** Write it during the build, not after. Required sections:

1. **Model choice** — Why Anthropic/Haiku instead of Gemini? What tradeoffs?
2. **Determinism approach** — No seed in Anthropic API; `temperature: 0` for evaluator,
   `0.7` for generator. What does this mean for reproducibility?
3. **Dimension weighting** — Why equal weights? Did you adjust? Why?
4. **Calibration results** — Evaluator scores before and after prompt tuning
5. **Improvement strategies** — Which interventions worked? Which didn't?
6. **Failure handling** — What happens when an ad never reaches 7.0?
7. **Context management** — What does each API call see?
8. **Failed approaches** — Be honest about what didn't work
9. **Cost analysis** — Cost per ad, per passing ad, total run cost

---

### Step 10 — Write Limitations (`docs/LIMITATIONS.md`)

Suggested topics:
- Anthropic API has no seed parameter; even at `temperature: 0` evaluator scores may vary
  slightly across API versions (document measured variance)
- LLM-as-judge optimizes for evaluator approval, not actual CTR/conversion (Goodhart's Law)
- Brand voice is the hardest dimension to calibrate objectively
- 50-ad library is too small for statistically significant trend analysis
- No official Varsity Tutors reference ads available at build time; calibrated against
  competitor ads from Meta Ad Library instead

---

### Step 11 — Final Test Suite (`tests/spec-compliance.test.ts`)

Every spec requirement gets a test. Green `pnpm test` = safe to submit.

```typescript
import { describe, it, expect } from 'vitest';
import { readAdLibrary } from '../src/output/library';
import { getQualityTrend } from '../src/output/trends';
import { evaluateAd } from '../src/evaluate/evaluator';
import { QUALITY_THRESHOLD, DIMENSION_NAMES } from '../src/types';
import * as fs from 'fs';

const library = readAdLibrary();

// ── COVERAGE ──────────────────────────────────────────────────────────────
describe('Coverage', () => {
  it('has 50+ ads with full evaluation scores', () => {
    expect(library.length).toBeGreaterThanOrEqual(50);
  });

  it('every ad has a non-empty evaluation', () => {
    for (const entry of library) {
      expect(entry.evaluation).toBeDefined();
      expect(entry.evaluation.scores.length).toBe(5);
    }
  });

  it('every evaluation score has a non-empty rationale', () => {
    for (const entry of library) {
      for (const score of entry.evaluation.scores) {
        expect(score.rationale.length).toBeGreaterThan(10);
      }
    }
  });
});

// ── QUALITY DIMENSIONS ─────────────────────────────────────────────────────
describe('Quality Dimensions', () => {
  it('all 5 required dimensions are scored on every ad', () => {
    for (const entry of library) {
      const dims = entry.evaluation.scores.map(s => s.dimension);
      for (const required of DIMENSION_NAMES) {
        expect(dims).toContain(required);
      }
    }
  });

  it('all dimension scores are in valid 1–10 range', () => {
    for (const entry of library) {
      for (const score of entry.evaluation.scores) {
        expect(score.score).toBeGreaterThanOrEqual(1);
        expect(score.score).toBeLessThanOrEqual(10);
      }
    }
  });
});

// ── QUALITY THRESHOLD ──────────────────────────────────────────────────────
describe('Quality Threshold', () => {
  it('majority of final library ads meet 7.0/10 threshold', () => {
    const passing = library.filter(e => e.evaluation.passesThreshold);
    expect(passing.length / library.length).toBeGreaterThan(0.5);
  });

  it('passesThreshold flag correctly reflects 7.0 aggregate', () => {
    for (const entry of library) {
      const expected = entry.evaluation.aggregateScore >= QUALITY_THRESHOLD;
      expect(entry.evaluation.passesThreshold).toBe(expected);
    }
  });

  it('sub-threshold ads are marked as not converged', () => {
    for (const entry of library.filter(e => !e.evaluation.passesThreshold)) {
      expect(entry.iterationHistory.converged).toBe(false);
    }
  });
});

// ── ITERATION & IMPROVEMENT ────────────────────────────────────────────────
describe('Iteration', () => {
  it('quality trend shows improvement across 3+ cycles', () => {
    const trend = getQualityTrend();
    expect(trend.length).toBeGreaterThanOrEqual(3);
    expect(trend[trend.length - 1].avgScore).toBeGreaterThan(trend[0].avgScore);
  });

  it('each iteration record tracks improvement delta per cycle', () => {
    for (const entry of library) {
      for (const cycle of entry.iterationHistory.cycles) {
        expect(typeof cycle.improvementDelta).toBe('number');
      }
    }
  });

  it('multi-cycle ads record the intervention used', () => {
    const multiCycle = library.filter(e => e.iterationHistory.cycles.length > 1);
    expect(multiCycle.length).toBeGreaterThan(0);
    for (const entry of multiCycle) {
      for (const cycle of entry.iterationHistory.cycles.slice(1)) {
        expect(cycle.interventionUsed).toBeDefined();
        expect(cycle.interventionUsed!.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── AD STRUCTURE ───────────────────────────────────────────────────────────
describe('Ad Structure', () => {
  it('every ad has all required fields populated', () => {
    for (const { ad } of library) {
      expect(ad.primaryText.length).toBeGreaterThan(0);
      expect(ad.headline.length).toBeGreaterThan(0);
      expect(ad.description.length).toBeGreaterThan(0);
      expect(ad.ctaButton.length).toBeGreaterThan(0);
    }
  });

  it('modelUsed field references an Anthropic model', () => {
    for (const { ad } of library) {
      expect(ad.modelUsed).toMatch(/^claude-/);
    }
  });
});

// ── OUTPUT FILES ───────────────────────────────────────────────────────────
describe('Output Files', () => {
  it('data/ads.json exists and is valid JSON', () => {
    expect(fs.existsSync('data/ads.json')).toBe(true);
    expect(() => JSON.parse(fs.readFileSync('data/ads.json', 'utf-8'))).not.toThrow();
  });

  it('data/ads.csv exists', () => {
    expect(fs.existsSync('data/ads.csv')).toBe(true);
  });

  it('DECISION_LOG.md exists and is substantive (>500 chars)', () => {
    expect(fs.existsSync('docs/DECISION_LOG.md')).toBe(true);
    expect(fs.readFileSync('docs/DECISION_LOG.md', 'utf-8').length).toBeGreaterThan(500);
  });

  it('LIMITATIONS.md exists and is substantive (>200 chars)', () => {
    expect(fs.existsSync('docs/LIMITATIONS.md')).toBe(true);
    expect(fs.readFileSync('docs/LIMITATIONS.md', 'utf-8').length).toBeGreaterThan(200);
  });
});

// ── EVALUATOR DETERMINISM ──────────────────────────────────────────────────
describe('Evaluator Determinism', () => {
  it('returns same aggregate score for same ad on two consecutive runs', async () => {
    const sampleAd = library[0].ad;
    const [a, b] = await Promise.all([evaluateAd(sampleAd), evaluateAd(sampleAd)]);
    // temperature=0 should be identical; allow ±0.1 tolerance for any API variance
    expect(Math.abs(a.aggregateScore - b.aggregateScore)).toBeLessThanOrEqual(0.1);
  });
});

// ── PERFORMANCE PER TOKEN (BONUS) ──────────────────────────────────────────
describe('Performance Per Token', () => {
  it('every iteration record tracks token usage and estimated cost', () => {
    for (const entry of library) {
      expect(entry.iterationHistory.totalInputTokens).toBeGreaterThan(0);
      expect(entry.iterationHistory.totalOutputTokens).toBeGreaterThan(0);
      expect(entry.iterationHistory.estimatedCostUsd).toBeGreaterThan(0);
    }
  });
});
```

---

## Competitive Intelligence (Bonus: +10 points)

No official Varsity Tutors reference ads are available at build time. Use competitor ads
from the Meta Ad Library — this doubles as calibration material and earns the bonus.

1. Go to [facebook.com/ads/library](https://facebook.com/ads/library)
2. Search: `Princeton Review`, `Kaplan`, `Khan Academy`, `Chegg`
3. Filter: Active ads, US
4. Save examples into `data/reference-ads.json`
5. Document patterns in `DECISION_LOG.md`:
   - Recurring copy patterns across competitors
   - Most common CTAs
   - Emotional angles (fear vs. aspiration vs. urgency)
   - How they handle specificity (numbers, timeframes, guarantees)

---

## Submission Checklist

- [ ] `pnpm generate` runs end-to-end without errors
- [ ] `pnpm test` is fully green
- [ ] 50+ ads in `data/ads.json` with full evaluation scores
- [ ] Quality trend shows measurable improvement across 3+ cycles
- [ ] `DECISION_LOG.md` documents major choices with YOUR reasoning
- [ ] `LIMITATIONS.md` is honest and specific
- [ ] Dashboard shows ad library and quality trend chart
- [ ] README has clear setup and usage instructions
- [ ] Demo video or live walkthrough recorded
- [ ] Cost per ad estimated and documented in decision log