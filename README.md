# Nerdy Ad Engine

Autonomous Facebook/Instagram ad generation for Varsity Tutors SAT prep. Generates, evaluates, and iterates ad copy until quality meets a publishable threshold — surfacing only the strongest ads from a library of 75+ candidates.

Built for the Nerdy hiring partner project at Gauntlet AI.

---

## What It Does

1. **Generates** ad copy across 24 brief combinations (3 audiences × 2 campaign goals × 4 hook types), expanded to 75 pipeline runs with rotated offers
2. **Evaluates** each ad on 5 dimensions using an LLM-as-judge at temperature 0 (deterministic scoring)
3. **Iterates** on failing ads — identifies the weakest dimension, applies a targeted improvement strategy, and regenerates from scratch up to 5 cycles
4. **Selects** the best-scoring cycle (not the last), so regressions never surface as final output
5. **Surfaces** only ads scoring ≥ 7.0/10 aggregate as publishable

The pipeline costs approximately **$0.004–0.005 per ad** using Claude Haiku.

---

## Quality Dimensions

Each ad is scored 1–10 on five dimensions with equal weight (0.2 each):

| Dimension | What It Measures |
|---|---|
| **Clarity** | Is the message immediately understandable? |
| **Value Proposition** | Is the offer specific, differentiated, and credible? |
| **Call to Action** | Does the CTA match the funnel stage and drive action? |
| **Brand Voice** | Does the copy feel like Varsity Tutors, not a generic tutoring ad? |
| **Emotional Resonance** | Does it connect with the audience's real anxieties and aspirations? |

Rubric anchors at 1, 5, 7, and 10 calibrate the evaluator — the 7-anchor is the most important since it defines the pass/fail boundary.

---

## Architecture

```
ad-engine/
├── src/
│   ├── generate/
│   │   ├── briefs.ts        # 24 base briefs × 3 runs = 75 pipeline entries
│   │   ├── generator.ts     # Anthropic SDK, temperature=0.7
│   │   └── prompts.ts       # Few-shot system prompt + brief injection
│   ├── evaluate/
│   │   ├── evaluator.ts     # Anthropic SDK, temperature=0 (deterministic)
│   │   └── dimensions.ts    # Rubric definitions with 4-level score anchors
│   ├── iterate/
│   │   ├── loop.ts          # generate → evaluate → regenerate cycle
│   │   └── strategies.ts    # Per-dimension improvement prompts
│   ├── output/
│   │   ├── library.ts       # JSON + CSV persistence (incremental writes)
│   │   └── trends.ts        # Per-brief quality improvement trajectory
│   ├── index.ts             # Entry point: concurrency=5, cost tracking
│   └── types.ts             # Shared interfaces, constants, cost utilities
├── dashboard/               # Next.js app: ad library + trend visualization
├── data/
│   ├── ads.json             # Generated library (gitignored)
│   └── reference-ads.json  # Competitor ads from Meta Ad Library
└── docs/
    ├── DECISION_LOG.md      # Live engineering decisions (12+ entries)
    └── LIMITATIONS.md       # Honest assessment of what doesn't work
```

---

## Setup

### Prerequisites

- Node.js 18+
- pnpm
- Anthropic API key with credits

### Install

```bash
git clone https://github.com/OldEphraim/nerdy-ad-engine
cd ad-engine
pnpm install
```

### Configure

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

### Run

```bash
# Generate 75 ads through the full iteration pipeline
pnpm generate

# Start the dashboard
pnpm dashboard

# Run tests
pnpm test
```

---

## Key Design Decisions

**Model choice:** Claude Haiku for both generator (temperature 0.7) and evaluator (temperature 0). Haiku's speed and cost profile (~$0.80/1M input tokens) made it practical to run 75 briefs × up to 5 cycles without meaningful cost pressure.

**Few-shot prompting:** The generator system prompt includes 3 positive examples (one per audience) and 1 annotated negative example. Research shows negative examples with explicit failure rationale improve output discrimination more than additional positive examples.

**Best-of-N selection:** The iteration loop selects the highest-scoring cycle as final output, not the last one. This handles the common case where fixing one weak dimension degrades another — the pipeline never surfaces a worse ad than it already produced.

**Deterministic evaluation:** The evaluator uses `temperature: 0` to ensure the feedback signal is stable across cycles. Anthropic provides no `seed` parameter, so true bitwise determinism isn't guaranteed, but scores are consistent within ±0.1 in practice.

**Incremental writes:** `ads.json` and `ads.csv` are written after each brief completes, not at the end of the run. A crash at brief 60 preserves the first 59 results.

Full rationale for all decisions is in [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md).

---

## Known Limitations

**CTA scores are structurally capped for awareness ads.** The spec mandates "Learn More" as the CTA for awareness-stage campaigns, but the evaluator correctly identifies it as generic (scoring ~6/10). This creates a ceiling on aggregate scores for awareness ads that iteration cannot fix — it's a spec constraint, not a generation failure.

**Evaluator determinism is probabilistic.** `temperature: 0` minimizes variance but doesn't eliminate it. The same ad evaluated twice may receive scores differing by ±0.1. Spec compliance tests allow this tolerance.

**The 8.5 calibration run shows the loop's real behavior.** At threshold 7.0, ~100% of first-pass ads pass immediately because the generator prompts are strong. Running at 8.5 forces multi-cycle iteration, revealing the loop's improvement mechanics and its ceiling (CTA is nearly impossible to push past 7 for awareness ads given the spec constraint).

**No human-verified reference ads.** Official Varsity Tutors creative assets were unavailable during development. Calibration used competitor ads from the Meta Ad Library (Princeton Review, Kaplan, Khan Academy) as proxies for quality anchoring.

---

## Dashboard

```bash
pnpm dashboard
# Opens at http://localhost:3000
```

- **Ad Library** (`/`): Full table of passing ads, sortable by score. Blue for ≥8.0, orange for 7.0–7.9.
- **Trends** (`/trends`): Line chart showing average score by iteration cycle — visual proof the loop improves quality.
- **Ad Detail**: Click any row for full copy, per-dimension scores with evaluator rationale, and intervention history.

---

## Cost

| Run type | Briefs | Avg cycles | Total cost |
|---|---|---|---|
| Standard (threshold 7.0) | 74 | 1.03 | ~$0.34 |
| Calibration (threshold 8.5) | 75 | ~4.2 | ~$1.80 |

Cost per passing ad at threshold 7.0: **~$0.0046**

---

## GitHub

[github.com/OldEphraim/nerdy-ad-engine](https://github.com/OldEphraim/nerdy-ad-engine)