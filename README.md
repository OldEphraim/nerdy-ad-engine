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

The v1 text pipeline costs approximately **$0.004–0.005 per ad** using Claude Haiku.

V2 adds a three-stage image pipeline after each text ad passes: **image prompt generation** (Claude Haiku derives a scene description from the ad copy) → **image generation** (fal.ai Flux Schnell, 2 variants with different seeds) → **visual evaluation** (Claude Sonnet vision scores each variant on 3 dimensions) → **A/B selection** (higher-scoring variant wins). The combined v2 cost is ~$0.033/ad across 4 models.

V3 adds four pipeline enhancements: a quality ratchet that feeds high-scoring ads as few-shot examples into subsequent generations; a competitive research agent (Vercel AI SDK + Zod schema) that injects market intelligence into the writer prompt; a coherence loop that triggers image regeneration when text-image alignment scores below 7.5; and a copy refinement loop that rewrites copy when visual feedback reveals a copy-side weakness. In the v3 production run, coherence triggered on 3/75 ads (4%) and copy refinement on 2/75 (3%), keeping average cost low at **$0.0107/ad**.

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
│   │   ├── briefs.ts           # 24 base briefs × 3 runs = 75 pipeline entries
│   │   ├── generator.ts        # Anthropic SDK, temperature=0.7
│   │   ├── prompts.ts          # Few-shot system prompt + buildImagePrompt()
│   │   └── image-generator.ts  # fal.ai Flux Schnell integration (v2)
│   ├── evaluate/
│   │   ├── evaluator.ts        # Anthropic SDK, temperature=0 (deterministic)
│   │   ├── dimensions.ts       # Rubric definitions with 4-level score anchors
│   │   └── visual-evaluator.ts # Claude Sonnet vision evaluation (v2)
│   ├── iterate/
│   │   ├── loop.ts             # Text iteration + runImagePipeline() (v2)
│   │   └── strategies.ts       # Per-dimension improvement prompts
│   ├── output/
│   │   ├── library.ts          # JSON + CSV persistence (incremental writes)
│   │   └── trends.ts           # Per-brief quality improvement trajectory
│   ├── index.ts                # Entry point: concurrency=5, cost tracking
│   └── types.ts                # Shared interfaces, constants, cost utilities
├── dashboard/
│   └── app/
│       ├── page.tsx            # Ad library with image thumbnails (v2)
│       ├── trends/page.tsx     # Quality trend visualization
│       └── api/
│           ├── ads/route.ts    # Ad data API with image stats (v2)
│           └── images/[id]/route.ts  # Serves local image files (v2)
├── data/
│   ├── ads.json             # Generated library (gitignored)
│   ├── images/              # Generated images (gitignored — run pnpm generate to recreate)
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
- fal.ai API key (v2 image generation) — get one at [fal.ai/dashboard](https://fal.ai/dashboard)

### Install

```bash
git clone https://github.com/OldEphraim/nerdy-ad-engine
cd ad-engine
pnpm install
```

### Configure

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY and FAL_KEY to .env
```

### Run

```bash
# Generate 75 ads through the full v3 pipeline
pnpm generate

# Start the dashboard
cd dashboard && pnpm dev
```

---

## Testing

```bash
pnpm test              # Run all 101 tests
pnpm test:coverage     # Run with coverage report
```

The test suite covers six layers across 8 test files:

- **Unit tests** — brief generation, cost estimation, quality trend calculation, JSON parsing edge cases (markdown fences, missing fields, malformed output)
- **Spec compliance** — reads from `data/ads.json` and asserts the library meets all spec requirements: ≥50 ads, all 5 dimensions scored, scores within 1–10, aggregate matches weighted sum, at least one multi-cycle ad, trend shows improvement
- **V2 image pipeline** — reads from `data/runs/v2-production.json` and validates: every combined entry has image results and 3 visual dimension scores, combined score = text × 0.6 + image × 0.4, selected variant is the higher-scoring of the two, weights sum to 1.0
- **Visual evaluator** — mocked Anthropic SDK tests for the visual evaluation module: score shape validation, aggregate computation, threshold boundary behavior, weakest dimension identification, JPEG/PNG media type detection from magic bytes
- **V3 pipeline** — coherence loop trigger/skip logic, variant 3 replacement rules, copy-side signal detection, copy refinement gating, graceful failure behavior; ratchet pool add/evict/cap/floor rules
- **Dashboard** — showcase filtering/sorting/truncation logic; `/api/generate` endpoint validation (invalid audience/goal/hookType → 400, subprocess error → 500, success → 200 with parsed entry), mocking `child_process.spawn` and `fs`

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
cd dashboard && pnpm dev
# Opens at http://localhost:3000
```

The dashboard is a Next.js app with four pages, all driven by the same `/api/ads` data route. A run selector in the header lets you switch between saved run archives (`v1-production`, `v2-production`, `v3-production`, `calibration-8.5`).

### Dashboard Features

**Ad Library** (`/`)
- Full sortable table of all generated ads with combined, text, and visual scores
- Column tooltips (ⓘ) explaining every metric
- Pagination — 25 ads per page
- V3 pipeline badges inline on the combined score cell when the coherence loop or copy refinement loop fired for that ad
- Click any row to expand a full ad detail panel showing per-dimension scores with evaluator rationale, iteration history, image thumbnail, and visual dimension breakdown

**Quality Trends** (`/trends`)
- Iteration quality chart: cumulative average score line (carry-forward for converged ads) + per-cohort trajectory
- Combined score distribution bar chart across the selected run
- Top hook types ranked by average combined score
- V3 pipeline activity stat cards: coherence loop activation rate, copy refinement activation rate, improvement rates for both

**Showcase** (`/showcase`)
- Top 12 ads from the selected run rendered as authentic Meta ad card previews — brand header, primary text with "See more" expansion at 125 characters, full-width 1.91:1 image, domain/headline/description, CTA button, and combined score badge
- Click the image or CTA button to open a full ad detail modal with a stats grid (combined/text/visual scores, three visual dimensions, audience/goal/hook, cost/cycles/brief ID)
- Print-ready: the modal injects a print stylesheet that isolates just the ad card — `window.print()` produces a clean standalone creative

**Coherence** (`/coherence`, secondary nav)
- Per-ad text-image coherence scores sorted ascending, flagging the weakest-coherence ads first
- Loop activation and improvement status badges per row

### Generate an Ad

Click **Generate Ad** on the Ad Library page to submit a custom brief. Select audience (Anxious Parents, Stressed Students, Comparison Shoppers), goal (Awareness, Conversion), and hook type (Question, Stat, Story, Fear). The full v3 pipeline runs — researcher → writer → editor with coherence loop and copy refinement — and the result appears in ~30–60 seconds. On success, the ad detail modal opens immediately showing the new ad's scores, image, and full copy. The generated ad is appended to `data/ads.json` and appears in the library on next load.

---

## Cost

All costs use Claude Haiku pricing: $0.80/1M input tokens, $4.00/1M output tokens.

| Run type | Briefs | Pass rate | Avg cycles/brief | Total cost | Cost/passing ad |
|---|---|---|---|---|---|
| Standard (threshold 7.0) | 75 | 100% | 1.03 | $0.34 | $0.0046 |
| Calibration (threshold 8.5) | 75 | 12% | 4.5 | $1.55 | $0.17 |
| V2 production (text+image) | 75 | 100% | 1.01 | $2.48 | $0.0331 |
| V3 production (full pipeline) | 75 | 100% | 1.01 | $0.80 | $0.0107 |

**What the numbers mean:**
- At threshold 7.0, the generator prompt is strong enough that nearly every ad passes on the first cycle. Each ad costs ~2 API calls (one generate, one evaluate) at ~$0.004 total.
- At threshold 8.5, most ads run the full 5-cycle loop. Cost per brief jumps ~5x ($0.023 vs $0.005) because each cycle adds 2 more API calls (regenerate + re-evaluate). Pass rate drops to 12% because `call_to_action` scores cap at 6-7 for awareness ads (the spec mandates "Learn More" as the CTA).
- The 8.5 run's value was not producing ads — it was stress-testing the iteration loop and generating multi-cycle data for the quality trend chart.

### V2 Cost Breakdown (per ad)

V2 adds an image layer after text passes. The cost breakdown per ad:

| Component | Model | Estimated | Actual |
|---|---|---|---|
| Text pipeline (generate + evaluate + iterate) | Claude Haiku | ~$0.005 | $0.0046 |
| Image generation (2 variants × $0.003) | fal.ai Flux Schnell | ~$0.006 | $0.006 |
| Visual evaluation (2 variants scored) | Claude Sonnet (vision) | ~$0.008 | $0.0225 |
| **V2 total** | | **~$0.019** | **$0.0331** |

V2 is approximately 7x the cost of v1 per ad. Visual evaluation (Claude Sonnet vision) is the largest cost component, accounting for 68% of the per-ad cost. See Decision 15 in `DECISION_LOG.md` for model choice rationale.

### V3 Cost Breakdown (per ad)

V3 adds coherence loop, copy refinement, quality ratchet, and competitive research — but loops only fire when triggered (4% and 3% of ads respectively), keeping the average cost below v2:

| Component | Model | Actual |
|---|---|---|
| Text pipeline (generate + evaluate + iterate) | Claude Haiku | $0.0046 |
| Image generation (2 variants + conditional variant 3) | fal.ai Flux Schnell | $0.006 |
| Visual evaluation | Claude Sonnet (vision) | $0.0225 |
| Coherence loop (3/75 ads triggered) | fal.ai + Claude Sonnet | $0.0006/ad amortized |
| Copy refinement (2/75 ads triggered) | Claude Haiku | $0.0002/ad amortized |
| Competitive research (1 call per run, cached) | Claude Sonnet | $0.0001/ad amortized |
| **V3 total** | | **$0.0107** |

V3 is cheaper than V2 per ad because the Sonnet visual evaluation cost in V2 was computed at a higher rate than the actual run showed. V3 total cost: $0.7981 across all 75 ads.

---

## GitHub

[github.com/OldEphraim/nerdy-ad-engine](https://github.com/OldEphraim/nerdy-ad-engine)