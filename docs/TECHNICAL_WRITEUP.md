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

**What v3 would add:** Human-in-the-loop validation of a sample of generated ads against actual brand guidelines. More specific image prompt engineering (camera angles, lighting directions, composition rules) to push visual engagement scores. A/B testing integration to validate whether LLM-evaluated quality correlates with actual Meta ad performance metrics (CTR, conversion rate). Competitive intelligence refresh with current Meta Ad Library data.
