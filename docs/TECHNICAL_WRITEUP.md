# Technical Writeup: Nerdy Ad Engine v2

## Problem and Approach

The Nerdy Ad Engine generates Facebook/Instagram ad packages for Varsity Tutors SAT prep — complete text+image creatives that meet a publishable quality threshold without human review. The system produces 75 ads from 24 brief combinations (3 audiences × 2 goals × 4 hook types), evaluates each one against a rubric, iterates on failing ads, and surfaces only those scoring 7.0+ out of 10.

The core design choice is a pipeline over a single prompt. A monolithic "generate a great ad" prompt has no quality feedback loop — you get whatever the model gives you, with no way to systematically improve weak dimensions or reject bad output. The pipeline decomposes the problem: generation is optimized for creative variance (temperature 0.7), evaluation is optimized for consistency (temperature 0), and iteration targets the specific dimension that's holding each ad back. This separation lets each stage be independently tuned, tested, and cost-tracked.

V2 extends this pipeline with an image layer: after a text ad passes, the system generates a visual creative, evaluates it against brand and engagement criteria, and packages the strongest text+image combination as the final output.

## Architecture

The pipeline orchestrates four models across five stages:

```
Brief → [Claude Haiku, temp 0.7] → Ad Copy
                                      ↓
                              [Claude Haiku, temp 0] → Evaluation (5 text dimensions)
                                      ↓
                              Pass? ──→ No → [identify weakest dim] → Regenerate (up to 5 cycles)
                                      ↓
                                     Yes
                                      ↓
                              [Claude Haiku, temp 0.7] → Image Prompt (scene description)
                                      ↓
                              [fal.ai Flux Schnell] → 2 Image Variants (different seeds)
                                      ↓
                              [Claude Sonnet, temp 0] → Visual Evaluation (3 dimensions per variant)
                                      ↓
                              Select higher-scoring variant
                                      ↓
                              Combined Score = text × 0.6 + image × 0.4
```

**Claude Haiku** handles text generation, text evaluation, and image prompt generation — three roles where speed and cost matter more than raw capability. The generator uses few-shot prompting (3 positive examples + 1 annotated negative) to anchor output quality. The evaluator uses a structured rubric with 4-level score anchors per dimension.

**fal.ai Flux Schnell** generates the visual creative. At $0.003/image and ~2 seconds per generation, it's the cheapest viable option for UGC-style social imagery. Two variants are generated per ad with different random seeds — this is the image quality mechanism, since there's no well-defined intervention strategy for "your composition is weak" the way there is for "your CTA is vague."

**Claude Sonnet** evaluates images using its vision capability. Haiku's vision was tested and found insufficient for nuanced brand assessment — it tends to describe image content literally rather than evaluate against brand criteria. Sonnet costs more but is called only twice per ad (once per variant), keeping the cost impact manageable.

The entire pipeline runs with concurrency=5 across briefs, writes results incrementally (crash at brief 60 preserves the first 59), and degrades gracefully — image failures never crash the text pipeline.

## Key Design Decisions

**The evaluator's rubric anchors are the most important prompt engineering in the system.** An LLM scoring on a 1-10 scale with only endpoint anchors will compress toward the middle — everything becomes a 5-7. The evaluator prompt includes explicit anchors at levels 1, 5, 7, and 10 for each dimension, with the 7-anchor being the most detailed because it defines the pass/fail boundary. This is what makes the threshold meaningful: a 7.0 ad is one that's "publishable but not exceptional" by specific, concrete criteria, not just "above average" on a vague scale.

**Best-of-N cycle selection protects against regressions.** When the iteration loop targets a weak dimension (say, emotional resonance), the regenerated ad sometimes improves that dimension but degrades another (say, clarity). Rather than always surfacing the last cycle, the pipeline selects whichever cycle produced the highest aggregate score. This means the library never contains an ad worse than what the system already generated — regressions are invisible to the final output.

**The image pipeline uses A/B variant selection instead of iterative improvement.** For text, there's a clear intervention strategy per dimension: "your CTA is vague" maps to a specific regeneration prompt. For images, there's no equivalent — "your composition is boring" doesn't translate into a prompt modification that reliably produces a better image. Generating two variants with different seeds and picking the winner is cheaper and more reliable than an iterative loop that would triple image generation cost with minimal expected quality gain.

**Temperature discipline is non-negotiable.** Generators use 0.7 (enough variance to produce diverse ads from the same brief, not so much that output becomes unreliable). Evaluators use 0 (the feedback signal must be stable for the iteration loop to function — if the same ad scores 6.5 on one evaluation and 7.5 on the next, the loop is chasing noise). This applies to both the text evaluator (Haiku) and the visual evaluator (Sonnet).

**The FAL_KEY feature gate makes v2 opt-in without a code change.** When `FAL_KEY` is set, the pipeline runs in v2 mode (text+image). When it's absent, the pipeline runs as v1 (text-only) with zero errors or degraded behavior. This means anyone with just an Anthropic key can run the text pipeline immediately, and adding the image layer is a single environment variable.

**Combined scoring weights text at 0.6 and image at 0.4.** Text is the primary driver of Meta ad performance — copy stops the scroll and communicates value. The image supports and amplifies but doesn't replace copy effectiveness. In practice, image scores (avg 8.0) came in consistently higher than text scores (avg 7.6), so the weighting prevents images from inflating the combined score and masking text weakness.

## Evaluation Methodology

Both evaluators (text and visual) follow the LLM-as-judge pattern: a model with a structured rubric scores output on defined dimensions, with temperature 0 for deterministic feedback.

The text evaluator scores 5 dimensions (clarity, value proposition, CTA, brand voice, emotional resonance) with equal weight (0.2 each). Each dimension has a 4-level rubric with specific anchors. The 7-anchor is the most critical — it defines what "publishable" means for each dimension. Scores are integers 1-10, clamped and validated. The aggregate is a weighted sum rounded to one decimal place.

The visual evaluator scores 3 dimensions (brand consistency, visual engagement, text-image coherence) with equal weight (0.33 each). It receives the image as base64 alongside the ad copy text, so it can assess whether the image reinforces the copy's message. The same rubric anchoring strategy applies: concrete descriptions at 1, 5, 7, and 10 prevent score compression.

**The calibration run at threshold 8.5 revealed the system's ceiling.** At 7.0, 100% of ads pass on cycle 1 — the few-shot prompt is strong enough that the iteration loop barely activates. Raising the threshold to 8.5 forced 71/75 briefs through multi-cycle iteration, generating the data needed to validate the improvement loop. Key findings: call_to_action is the ceiling dimension (structurally capped at 6-7 for awareness ads because the spec mandates "Learn More" as the CTA), improvement is real but marginal after cycle 2-3 (avg +0.25 on CTA, near-zero on other dimensions), and cycles 4-5 tend to oscillate rather than improve. The 8.5 run's pass rate was 15% (11/75) — stress-testing the iteration machinery, not producing a usable library.

## Results

The v2 production run processed 75 briefs with 100% text pass rate and 100% image generation success:

- **75/75 text ads passing** at 7.0 threshold
- **150 image variants generated** (2 per ad), zero generation failures
- **75 combined text+image packages** in the final library

**Score distributions:**
- Text aggregate: avg 7.6, range 7.0–8.6 (72% in 7.0–7.9, 28% in 8.0–8.9)
- Visual aggregate: avg 8.0, range 7.0–8.7 (95% in 8.0–8.9)
- Combined score: avg 7.8, range 7.2–8.6

**Per-dimension averages (text):** clarity 8.2, value proposition 8.2, emotional resonance 8.0, brand voice 7.2, call to action 6.6. CTA is the consistent floor, as expected from the awareness-ad constraint.

**Per-dimension averages (visual):** text-image coherence 9.0, brand consistency 7.9, visual engagement 7.3. Visual engagement is the weakest visual dimension — Flux Schnell produces competent but not scroll-stopping compositions (the "two people studying at a table" archetype recurs).

**Cost breakdown:**
- Text pipeline: $0.34 (75 ads × ~$0.0046 each)
- Image generation: $0.45 (150 variants × $0.003 each)
- Visual evaluation: $1.69 (150 Sonnet vision calls)
- **Total: $2.48** (~$0.033/ad across all models)

## Limitations and Next Steps

**CTA is structurally capped for awareness ads.** The spec mandates "Learn More" as the CTA for awareness campaigns. The evaluator correctly identifies this as generic (scoring 6/10), creating a ceiling on aggregate scores that iteration cannot fix. This is a spec constraint, not a generation failure — matching CTA to funnel stage is the right production behavior.

**Visual engagement is the consistent ceiling for images.** Brand consistency and text-image coherence score well (7.9 and 9.0), but visual engagement averages 7.3. Flux Schnell reliably generates warm, authentic scenes that feel on-brand and reinforce the copy, but the compositions are rarely scroll-stopping. Improving this would require more specific visual direction in the image prompt (unusual angles, high-contrast lighting) or a model better suited to editorial photography.

**No iterative image improvement.** Unlike text, where the evaluator provides actionable feedback per dimension, there's no clear mapping from "your composition is boring" to a prompt modification. A/B variant selection is the quality mechanism, but it's a sampling strategy, not an optimization loop.

**Visual evaluation is inherently subjective.** We don't have official Varsity Tutors brand guidelines for the image layer. The evaluator uses inferred brand values (empowering, warm, aspirational) that may not match actual brand standards. Scores should be treated as directional rather than absolute.

**What v3 adds:** See V3 Architecture section below.

## V3 Architecture

V3 restructures the pipeline as four named agents and adds three new feedback loops.

### Agent Structure

```
PIPELINE ORCHESTRATOR (src/index.ts)
  │
  ├── RESEARCHER AGENT (src/agents/researcher.ts)
  │     Input: AdBrief + insights cache
  │     Output: EnrichedBrief (brief + ratchet examples + competitor insights)
  │     Uses: Vercel AI SDK generateObject + Zod schema → CompetitorInsights
  │     Cache: one fetch per run, reused across all 75 briefs
  │     Fallback: data/reference-ads.json on any API failure
  │
  ├── WRITER AGENT (src/agents/writer.ts)
  │     Input: EnrichedBrief
  │     Output: GeneratedAd
  │     Injects: ratchet few-shot examples (appended after static examples)
  │              + competitor context block into system prompt
  │
  └── EDITOR AGENT (src/agents/editor.ts)
        Input: EnrichedBrief
        Output: CombinedAdEntryV3
        Runs:  text iteration loop (unchanged from v2)
               → image pipeline (unchanged from v2)
               → coherence loop (NEW)
               → copy refinement loop (NEW)
```

### New Types (src/types.ts)

- **`CompetitorInsights`** — `{ dominantHooks, ctaPatterns, emotionalAngles, freshInsights, fetchedAt }`
- **`EnrichedBrief`** — extends `AdBrief` with `ratchetExamples: RatchetEntry[]` and `competitorInsights: CompetitorInsights`
- **`RatchetEntry`** — `{ ad: GeneratedAd, evaluation: EvaluationResult, combinedScore: number, selectedAt: string }`
- **`CoherenceLoopResult`** — `{ triggered, triggerScore, triggerRationale, revisedPrompt, variant3, variant3Score, improved, costUsd }`
- **`CopyRefinementResult`** — `{ triggered, copySideSignal, originalCopy, refinedAd, refinedTextScore, refinedCombinedScore, improved, costUsd }`
- **`CombinedAdEntryV3`** — extends `CombinedAdEntry` with `coherenceLoop`, `copyRefinement`, `ratchetExamplesUsed`, `competitorInsightsUsed`, `agentTrace`

### Coherence Loop

When `text_image_coherence` is the weakest visual dimension and scores below 7.5, the system generates a third image variant using a revised prompt derived from the evaluator's specific coherence rationale. If variant 3 scores higher than the A/B winner, it replaces the winner. One retry only (see Decision 26).

### Copy Refinement Loop

If coherence is still below 7.0 after the image loop, a Haiku classification call determines whether the mismatch is image-side or copy-side. If copy-side, the Writer regenerates copy using the image prompt as visual context. Text is re-evaluated; if it passes and the combined score improves, the new copy replaces the original. Copy refinement fires at most once per ad and does not trigger another image generation pass (see Decision 32).

### Quality Ratchet

After each brief completes, ads with combined score ≥ 8.0 enter `data/ratchet/top-ads.json` (max 10 entries, lowest score evicted when full). Later briefs in the same run use these as dynamic few-shot examples via the Writer agent — the pool updates mid-run so later briefs benefit from earlier results.

### V3 Production Run Results

- **75/75 briefs passing** (100%) at 7.0 threshold
- **Total cost: $0.7981** ($0.0107/ad)
  - Text pipeline: $0.3391 | Image generation: $0.4590
  - Coherence loop: $0.0422 total (3 triggers) | Copy refinement: $0.0143 total (2 triggers)
- **Coherence loop:** triggered 3/75 (4%), improved 1/3 (33%)
- **Copy refinement:** triggered 2/75 (3%), improved 1/2 (50%)
- **Ratchet pool:** reached capacity at 10 ads, avg score 8.4
- **Avg visual score:** 8.1 | **Avg combined score:** 7.8
- **Weakest visual dimension:** visual_engagement (7.3, unchanged from v2)
- **Agent timing (avg per ad):** Researcher 173ms (cache hit after brief 1), Writer 20,794ms, Editor 60,247ms

## Dashboard & Frontend Architecture

The dashboard is a Next.js 14 app-router application using Tailwind CSS for styling and Recharts for all chart visualizations. It lives in `dashboard/` as a separate package with its own `node_modules`, decoupled from the pipeline's dependencies.

### Pages

**Ad Library (`/`)** is the primary view. It fetches `/api/ads`, renders a paginated sortable table (25 ads per page), and shows inline V3 badges on the combined score cell when the coherence loop or copy refinement loop fired. A column tooltip system (ⓘ icons) explains every metric without cluttering the table. Clicking a row opens an inline detail panel with per-dimension scores, evaluator rationale, iteration history, image thumbnail, and visual dimension breakdown.

**Quality Trends (`/trends`)** renders four stat blocks above two Recharts charts: a line chart showing iteration cycle quality (cumulative average with carry-forward for converged ads) and a bar chart showing combined score distribution across the run. A hook-type leaderboard and V3 pipeline activity stats (coherence loop rate, copy refinement rate, improvement rates) round out the view.

**Showcase (`/showcase`)** renders the top 12 ads from any run as faithful reproductions of the Meta ad card format — 1.91:1 image ratio, brand header with logo placeholder, primary text with "See more" expansion at 125 characters, domain/headline/description footer, CTA button, and colored combined score badge. Clicking the image or CTA opens the `AdDetailModal`.

**Coherence (`/coherence`)** lists all ads sorted by `text_image_coherence` score ascending, surfacing the weakest-coherence ads first with loop activation and improvement status badges.

### Run Selector

A `RunContext` provider wraps the app. The header run selector reads `data/runs/*.json` via the `/api/runs` endpoint and allows switching between saved runs (`v2-production`, `v3-production`, `calibration-8.5`, etc.). All data routes accept a `?run=` query parameter and return data from the appropriate archive file rather than `data/ads.json`.

### API Routes

**`/api/ads`** reads `data/ads.json` (or a named run archive) and calls `ensureImages()` before returning — a utility that checks whether each ad's local image file still exists and, if not, downloads it from the fal.ai CDN URL stored in the entry, writing a stable fallback path (`data/images/{id}-selected.jpg`). This keeps Showcase and Ad Library functional even after the CDN URL expires (~1 hour after generation).

**`/api/images/[id]`** serves image files from disk. It searches `data/ads.json` first, then walks all `data/runs/*.json` archives to find the entry, and falls back to the stable `{id}-selected.jpg` path. This makes images work correctly whether the selected run is the live library or a named archive.

**`/api/generate`** accepts a POST body of `{ audience, goal, hookType }`, validates all three fields against their allowed values, constructs a brief, and spawns `scripts/generate-one.ts` as a child process via `tsx`. The brief is written to the child's stdin as JSON; the completed `CombinedAdEntryV3` is returned via stdout. The route sets `maxDuration = 180` and enforces its own 180-second hard timeout. Using a child process rather than direct imports avoids the module resolution mismatch between the dashboard's `node_modules` and the pipeline's `node_modules` (the pipeline depends on `@anthropic-ai/sdk`, `@fal-ai/client`, etc., which are not installed in the dashboard package).

### Shared Components

**`AdDetailModal`** is a shared component (`dashboard/components/AdDetailModal.tsx`) used by both Showcase and the post-generation flow on the Ad Library page. It renders a full-size `FullMetaCard` (no text truncation) followed by a 4-row × 3-column stats grid: combined/text/visual scores, three visual dimension scores, audience/goal/hook parsed from the brief ID, and estimated cost/cycle count/brief ID. A `useEffect` injects a print stylesheet into `<head>` while the modal is open — `* { visibility: hidden }` with `.print-ad-card { visibility: visible; position: fixed }` — so `window.print()` produces a clean standalone creative without interface chrome. The stylesheet is removed on close.

### Test Coverage

The test suite covers 101 tests across 8 files. The two dashboard-specific files are:

- **`tests/showcase.test.ts`** — 10 tests for pure data transformation logic: `filterImageAds` (excludes entries missing `isCombinedEntry`, `selectedVariant`, or `combinedScore`), `getTopAds` (sorts descending, caps at 12), primary text truncation at 125 characters, and `combinedScoreBadge` color thresholds.
- **`tests/generate-endpoint.test.ts`** — 8 tests for the generate route handler: 400 responses for each invalid input field and for malformed JSON, brief ID format verification (audience/goal/hookType/timestamp all present in stdin payload), 500 on subprocess stderr-only output, 500 on non-JSON stdout, and 200 with correct parsed result on success. Mocks `child_process.spawn` with a real `EventEmitter`-based child process mock; uses the real `NextResponse` from `dashboard/node_modules` and inspects responses via `.status` and `.json()`.
