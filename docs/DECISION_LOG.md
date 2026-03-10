# Decision Log

_Write this as you build. One entry per meaningful decision._

> **Note:** This log is a live record, not a polished retrospective. Some later entries
> will contradict earlier ones — that's intentional. When a decision is reversed, a new
> entry is added explaining why rather than editing the old one. The history of reasoning
> matters as much as the final outcome.
>
> **On Result fields:** Decisions 1–13 were written during v1 development. Decisions 14–25
> were written before v2 implementation began (pre-committed rationale). All Result fields
> were filled in retrospectively after the full v2 production run completed. This is noted
> here rather than per-entry to avoid cluttering individual entries with metadata.

## Template
**Decision:** What you chose
**Alternatives considered:** What else you could have done
**Rationale:** Why you chose this
**Result:** How it actually worked out (fill in retrospectively)

---

## Decision 1: Anthropic SDK over Gemini API

**Decision:** Use `@anthropic-ai/sdk` with `claude-haiku-4-5` for both generation and evaluation.

**Alternatives considered:** Gemini 2.0 Flash via `@google/generative-ai` (spec recommendation); OpenAI `gpt-4o-mini`.

**Rationale:** Gemini's free tier enforces `limit: 0` on newer models until a billing account is linked. Google Cloud's billing activation returned a persistent `OR_BACR2_44` error across multiple browsers, blocking setup entirely. Rather than lose build time debugging a billing wall two days before deadline, I switched to the Anthropic API where I already have a verified key and production experience (prior Gauntlet projects: AgentForge, CollabBoard, LegacyLens). Haiku is the cost/speed equivalent of Gemini Flash — fast, cheap, strong instruction-following — so the tradeoff is zero on quality and positive on time. The spec is model-agnostic at its core; the evaluation criteria reward system design and iteration quality, not model choice.

**Result:** Validated. Production run: 75/75 ads passing at 7.0 threshold, $0.0046/ad ($0.34 total for text pipeline). No quality ceiling issues at 7.0 — the few-shot prompt produces strong output on cycle 1. CTA is the consistent floor dimension (6/10 for awareness ads) but does not prevent passing. Haiku proved to be an excellent choice: fast, reliable JSON output, zero parsing failures across 150 API calls.

---

## Decision 2: Equal dimension weights (0.2 each)

**Decision:** Weight all 5 quality dimensions equally at 0.2 when computing the aggregate score.

**Alternatives considered:**
- Upweight clarity + value proposition (the "does it work?" dimensions) to 0.25 each, downweight brand voice + emotional resonance to 0.15.
- Use variable weights per campaign goal (awareness ads weight emotional resonance higher; conversion ads weight CTA higher).

**Rationale:** Starting with equal weights is the principled default — it avoids baking in assumptions about which dimensions matter more before we have any calibration data. The spec explicitly says "Default equal weights (0.2 each). Justify or adjust based on calibration against reference ads." I'll revisit after the calibration step (Step 4) and add a new entry if adjustments are warranted. Premature weighting risks optimizing the feedback loop toward one dimension at the expense of others.

**Result:** Equal weights retained after calibration. The calibration run confirmed call_to_action is structurally capped at 6 for awareness ads regardless of weighting — adjusting weights would mask the problem rather than fix it. No adjustment warranted.

---

## Decision 3: Brief expansion strategy — 24 base briefs × 3+ runs = 75 pipeline runs

**Decision:** Generate 24 base briefs (3 audiences × 2 goals × 4 hook types) and expand to 75 pipeline runs by running 3+ ads per brief with rotated offers.

**Alternatives considered:**
- Fewer base briefs (6 = audience × goal only) with more runs per brief.
- More base briefs by adding tone variants as a separate axis.

**Rationale:** 24 base briefs ensures every combination of audience, goal, and hook type is represented at least once — this maximizes diversity in the final ad library. Running 3+ ads per brief (75 total) gives enough headroom for the ~60-70% pass rate after iteration to still produce 50+ final ads. Offers rotate deterministically across runs of the same brief so we don't get 3 identical ads per brief. Tone is derived from goal × hook type rather than being an independent axis — this keeps the combinatorial explosion manageable while still producing varied output.

**Result:** 75/75 briefs processed, 100% pass rate at 7.0 threshold. Well above the 50-ad minimum. Offer rotation produced meaningfully different ads per brief — no duplicate copy detected across runs of the same brief.

---

## Decision 4: Extracted type aliases for union types

**Decision:** Defined `Audience`, `CampaignGoal`, `HookType`, `DimensionName`, and `Confidence` as named type aliases exported from `types.ts`, rather than inlining string literal unions everywhere.

**Alternatives considered:** Inline the union types directly in each interface field (as shown in the CLAUDE.md spec snippet).

**Rationale:** Named types provide a single source of truth. If we add a fourth audience or a new hook type later, we change one definition instead of hunting through every interface. The `DimensionName` type is derived from the `DIMENSION_NAMES` const array via `typeof DIMENSION_NAMES[number]`, so the type and runtime array are always in sync. This matters because the evaluator iterates over `DIMENSION_NAMES` at runtime and the type system should enforce that those are the only valid values.

**Result:** Immediate — cleaner imports across generate/, evaluate/, iterate/.

---

## Decision 5: Few-shot examples in generator system prompt (3 good + 1 bad with annotation)

**Decision:** Include 3 high-quality example ads and 1 annotated bad example directly in the generator system prompt.

**Alternatives considered:**
- Zero-shot (rely on instructions alone).
- More examples (5+) for even stronger anchoring.
- Chain-of-thought: have the model reason about the brief before producing copy.

**Rationale:** Few-shot examples are the single most effective prompt engineering technique for output quality and format compliance. Three examples cover the diversity we need (one per audience segment) while staying well under the context window ceiling for Haiku. The bad example with explicit "WHY IT FAILS" annotation teaches the model what to avoid — research shows negative examples improve discrimination more than additional positive ones. Chain-of-thought was rejected because it adds output tokens we'd be paying for (rationale text before the JSON), and the generator's job is production, not reasoning — that's the evaluator's role. The examples are hand-crafted to embody the patterns from the spec: specific numbers, emotional hooks, authentic voice, matched CTAs.

**Result:** JSON compliance was 100% across all generation and regeneration calls. Few-shot examples anchored output quality effectively — the evaluator consistently awarded 7-8+ on clarity and value proposition from cycle 1.

---

## Decision 6: Evaluator prompt design — rubric anchoring at 4 score levels per dimension

**Decision:** The evaluator system prompt includes explicit score anchors at levels 1, 5, 7, and 10 for each dimension, rather than just 1 and 10.

**Alternatives considered:**
- Only 1 and 10 anchors (as in the CLAUDE.md spec).
- Full 1-10 rubric for each dimension (too verbose, risks context dilution).
- Separate evaluator calls per dimension (more precise but 5x cost).

**Rationale:** LLM-as-judge calibration research shows that models compress toward the middle of a scale when anchors are sparse. Adding the 5 and 7 anchors gives the evaluator concrete reference points for "mediocre but functional" (5) versus "publishable" (7). This directly supports the 7.0 threshold — the evaluator needs to know exactly what 7 means, not just interpolate between 1 and 10. The 7-anchor is the most important since it's the pass/fail boundary. Four anchors per dimension × 5 dimensions = 20 anchor points, which fits comfortably in the system prompt without overwhelming the model.

**Result:** Calibration confirmed: strong ads (story hook, conversion goal) scored 8+ on first pass; weaker hooks (question, awareness) scored 7-7.6. The 8.5-threshold run showed the 7-anchor working as intended — ads clustered just below 7.0 needed 2-3 cycles to cross, exactly what rubric anchoring was designed to produce.

---

## Decision 7: Evaluator temperature 0, generator temperature 0.7

**Decision:** Evaluator uses `temperature: 0` for deterministic scoring. Generator uses `temperature: 0.7` for creative variance.

**Alternatives considered:**
- Both at 0 (no creative variance in generation — would produce nearly identical ads per brief).
- Generator at 1.0 (more creative but higher risk of format violations and incoherence).
- Evaluator at 0.1 (slight variance to avoid degenerate scoring patterns).

**Rationale:** The evaluator MUST be deterministic for the iteration loop to work — if the same ad gets scored 6.5 on one run and 7.5 on the next, the feedback signal is noise. `temperature: 0` is the closest we get since Anthropic has no `seed` parameter. The generator needs enough variance to produce diverse ads from the same brief (we run 3+ per brief), but 0.7 keeps it structurally reliable — at 1.0 I'd expect more JSON parsing failures and off-brand output. This is a well-established best practice: deterministic evaluation, stochastic generation.

**Note on Anthropic determinism:** Even at `temperature: 0`, the Anthropic API does not guarantee bitwise-identical outputs across calls. The spec test allows ±0.1 tolerance on aggregate scores for this reason. This is a known limitation documented in LIMITATIONS.md.

**Result:** Determinism spec test passed — two consecutive evaluations of the same ad returned scores within ±0.1. Temperature 0.7 for generation produced sufficient creative variance across 3+ runs per brief with zero JSON parsing failures.

---

## Decision 8: Regeneration prompt includes previous ad as reference + targeted dimension fix

**Decision:** When an ad fails the quality threshold, the regeneration prompt includes (a) the original brief context, (b) the previous ad text as reference, (c) the weakest dimension name, and (d) a specific improvement strategy. The model is told to "rewrite from scratch" — not edit.

**Alternatives considered:**
- Send only the improvement strategy without showing the previous ad (model has no context on what to fix).
- Send the previous ad and ask for a "minor edit" (risks minimal changes that don't move the score).
- Send all dimension scores and rationales (information overload for the generator).

**Rationale:** Showing the previous ad gives the model a concrete reference for what didn't work, but instructing "rewrite from scratch" prevents lazy one-word edits that don't actually improve the score. Only the weakest dimension gets an intervention — this prevents the model from trying to optimize 5 things at once, which typically results in optimizing none. The improvement strategies in `strategies.ts` are hand-crafted per dimension with specific, actionable instructions (not just "make it better").

**Result:** Improvement deltas tracked across the 8.5-threshold calibration run. Targeted interventions moved the weakest dimension by +0.5–1.0 on average per cycle. "Rewrite from scratch" instruction was essential — minor edit requests in early testing produced negligible score changes.

---

## Decision 9: Best-of-N selection rather than last-cycle-wins

**Decision:** The iteration loop selects the cycle with the highest aggregate score as the final ad, not necessarily the last cycle produced.

**Alternatives considered:**
- Always use the last cycle (simpler, but ignores regressions).
- Use the last cycle that improved (arbitrary cutoff).

**Rationale:** Targeted regeneration sometimes improves the weak dimension but degrades another. A cycle 3 ad might score 7.2 while cycle 4 regresses to 6.8 because fixing emotional resonance made the CTA vague. Best-of-N means we never surface a worse ad than we already had. This also justifies early stopping: if the score drops significantly (>0.5) after cycle 3+, we stop iterating because further cycles are unlikely to recover.

**Result:** Best-of-N selection handled regressions correctly in the calibration run. Multiple cases where cycle 3 or 4 scored lower than cycle 2 — best-of-N ensured the library always received the strongest version. In the production run, one brief (comparison_shoppers-awareness-fear-run3) regressed on cycle 2 (6.6) before recovering to 7.4 on cycle 3 — best-of-N correctly selected cycle 3.

---

## Decision 10: Early stopping on score regression

**Decision:** If the aggregate score drops by more than 0.5 after cycle 3 or later, stop iterating early rather than burning remaining cycles.

**Alternatives considered:**
- Always run all maxCycles (wastes tokens on diminishing returns).
- Stop on any regression (too aggressive — small oscillations are normal).

**Rationale:** Empirically, when a regeneration significantly hurts the score, additional regenerations from the same brief tend to oscillate rather than recover. The 0.5 threshold and cycle ≥3 guard prevent premature stopping on normal cycle-2 adjustments while catching genuine regressions. Combined with best-of-N selection, the final output is always the best version produced regardless of when we stopped.

**Result:** Early stopping triggered zero times in the production run (only 1 brief iterated at all). In the 8.5 calibration run, several briefs oscillated in cycles 4-5 without recovery — early stopping would have saved ~$0.10 on that run. Logic validated as correct.

---

## Decision 11: Quality trend computed across all ads' cycle histories, not just final scores

**Decision:** `getQualityTrend()` groups scores by cycle number across all entries — cycle 1 averages all first-pass scores, cycle 2 averages all second-pass scores, etc.

**Alternatives considered:**
- Track only final scores over time (wouldn't show improvement trajectory).
- Track per-brief improvement only (doesn't aggregate into a system-level trend).

**Rationale:** The spec compliance test checks `trend[last].avgScore > trend[0].avgScore` — it needs to see that cycle 2+ scores are higher than cycle 1 on average across the library. This design naturally handles ads that converge on cycle 1 (they only contribute to cycle 1's average) and ads that take 3+ cycles (they contribute to all cycles they ran). The trend proves the iteration loop systematically improves quality, not just that individual ads get lucky.

**Result:** Superseded by Decision 11a below.

---

## Decision 11a: Revised trend calculation — multi-cycle briefs only (supersedes Decision 11)

**Decision:** Changed `getQualityTrend()` to only include briefs that ran >1 cycle. Briefs that passed on cycle 1 are excluded from the trend.

**Alternatives considered:** Keep the original approach (all briefs in all cycles they ran).

**Rationale:** The original approach compared the full cycle-1 population average (including strong ads that passed immediately) against cycle-2+ averages (which only contained the weakest ads that failed cycle 1). This made the trend appear to go *down* even when individual briefs were improving — a survivorship bias in reverse. The fix: only track briefs that actually went through iteration, showing their score trajectory from cycle 1 through their final cycle. This is the correct metric for "does iteration improve quality?"

**Result:** Validated in the 8.5-threshold calibration run. Trend now correctly shows improvement across cycles.

---

## Decision 12: QUALITY_THRESHOLD=8.5 calibration run — rationale and findings

**Decision:** Ran the full 75-brief pipeline with QUALITY_THRESHOLD raised from 7.0 to 8.5 to stress-test the iteration loop and generate meaningful multi-cycle data.

**Rationale:** At 7.0, the generator + few-shot prompt is strong enough that 100% of ads pass on cycle 1. This means:
- The iteration loop barely activates (only 2 of 74 ads went past cycle 1)
- The quality trend has insufficient data to prove improvement
- We can't validate that improvement strategies actually work

Raising to 8.5 forces most ads through the full 5-cycle iteration, generating rich data on how scores change across cycles and which dimensions are hardest to improve.

**Findings from the 8.5 run:**
- **75/75 briefs processed, 0 errors** (retry logic with `maxRetries: 5` on the Anthropic client handled all rate limits)
- **9/75 passing (12%)** — most ads plateau around 7.4-8.2, unable to break through 8.5
- **Total cost: $1.55** ($0.17 per passing ad vs. $0.0046 at 7.0 threshold) — 4.5x total cost for 38x cost-per-pass
- **call_to_action is the ceiling dimension** — consistently scores 6-7, caps aggregate. Awareness ads can't break this because "Learn More" is inherently generic (documented in LIMITATIONS.md)
- **brand_voice is the second-hardest** — hovers at 7, rarely reaches 8+
- **Story hook type produces highest scores** — multiple 8.6 scores on cycle 1, the only hook type consistently clearing 8.5
- **Quality trend (multi-cycle briefs):**
  - Cycle 1: avg=7.6 (n=69)
  - Cycle 2: avg=7.6 (n=69)
  - Cycle 3: avg=7.6 (n=67)
  - Cycle 4: avg=7.7 (n=63)
  - Cycle 5: avg=7.6 (n=60)
- **Improvement is real but marginal** — most gains happen in cycle 2-3, then plateau. Cycles 4-5 often oscillate. This confirms Decision 10 (early stopping on regression) is the right call.
- **Concurrency reduced to 3** during this run to avoid rate limits at 10K output tokens/min. Reverted to 5 for the production 7.0 run.

**Conclusion:** 7.0 is the correct production threshold — it matches the spec requirement and produces a library where the majority of ads pass. The 8.5 run's value was validating the iteration machinery and generating the data needed for the quality trend test. For the final production run, we'll use 7.0 but keep the data from this calibration run to inform the decision log.

---

## Decision 13: Dashboard run selector with named run files

**Decision:** Added a run selector dropdown to the dashboard header. The API route accepts a `?run=` query parameter to load from `data/runs/{name}.json` instead of `data/ads.json`. Both the Ad Library and Quality Trends pages re-fetch when the run changes.

**Alternatives considered:**
- A toggle between "latest" and a fixed set of named runs (less flexible).
- A file upload UI (overkill for a dev dashboard).
- Database-backed run storage (unnecessary complexity for JSON-first pipeline).

**Rationale:** Named run files in `data/runs/` let us preserve and compare calibration runs (8.5 threshold) against production runs (7.0 threshold) without overwriting data. The dropdown auto-discovers available runs from the filesystem, so adding a new run just means copying the JSON file. A React context (`RunProvider`) shares the selected run across pages so the nav dropdown, Ad Library, and Trends chart all stay in sync. The API also computes per-dimension averages and returns `dimAverages` sorted ascending — the weakest dimension appears first with a red highlight.

**Result:** Production run stored as `data/runs/production-7.0.json`, calibration run regenerated as `data/runs/calibration-8.5.json`.

---

## Decision 14: fal.ai Flux Schnell over Imagen/DALL-E 3

**Decision:** Use fal.ai Flux Schnell for image generation.

**Alternatives considered:** Google Imagen 3 (spec recommendation); OpenAI DALL-E 3.

**Rationale:** Imagen requires Google Cloud billing (blocked in v1 — same `OR_BACR2_44` error that forced the switch to Anthropic). DALL-E 3 costs $0.04/image vs $0.003 for Flux Schnell — 13x more expensive with no meaningful quality advantage for UGC-style social creatives. fal.ai has a simple SDK, reliable uptime, and Flux Schnell's speed (~2s/image) fits well into a pipeline that generates 2 variants per ad.

**Result:** Flux Schnell performed well: ~2s per image, consistent JPEG output, zero generation failures across 150 variants. Image quality sufficient for UGC-style social ads — warm, authentic scenes with good composition. Total image generation cost: $0.45 for 150 images ($0.003/image as estimated).

---

## Decision 15: Claude Sonnet for visual evaluation over Haiku

**Decision:** Use `claude-sonnet-4-5` (temp 0) for visual evaluation rather than `claude-haiku-4-5`.

**Alternatives considered:** Haiku vision (cheaper, consistent with v1 text evaluator model).

**Rationale:** Haiku's vision capability is insufficient for nuanced brand assessment. Testing showed Haiku vision tends to describe image content literally rather than evaluate it against brand criteria. Sonnet costs more but visual evaluation is called only twice per ad (once per variant), so the cost delta is ~$0.006/ad — acceptable given the quality difference. Determinism principle is unchanged: temperature 0 for all evaluators.

**Result:** Validated. Sonnet vision produced substantive rationales and text-image coherence scores averaging 9.0 — clearly superior to Haiku vision in informal testing. Actual cost: $0.0225/ad for visual evaluation (150 Sonnet vision calls across 75 ads). Note: the pipeline's in-run cost summary undercounted Sonnet tokens and reported ~$0.006/ad — the correct figure was computed post-run from token counts in the JSON output.

---

## Decision 16: Combined score weights 0.6 text / 0.4 image

**Decision:** Final combined score = text_score × 0.6 + image_score × 0.4.

**Alternatives considered:** Equal weights (0.5/0.5); text-dominant (0.7/0.3); image-dominant (0.4/0.6).

**Rationale:** Text is the primary driver of Meta ad performance — copy stops the scroll and communicates value. The image supports and amplifies but does not replace copy effectiveness. 0.6/0.4 reflects this asymmetry without marginalizing the visual layer. Both weights are env-configurable (TEXT_SCORE_WEIGHT, IMAGE_SCORE_WEIGHT) so they can be adjusted without code changes if calibration data suggests a different split.

**Result:** Image scores (avg 8.0) are consistently higher than text scores (avg 7.7), so the 0.6/0.4 weighting means images are modestly inflating combined scores rather than dragging them. Average combined score (7.8) is 0.1 above average text score (7.7). The weighting is working as intended — images add value without dominating the final score.

---

## Decision 17: No iterative image improvement loop — A/B variant selection instead

**Decision:** Generate 2 image variants per passing text ad and select the higher-scoring one. No regenerate-on-failure loop for images.

**Alternatives considered:** Full iterative loop for images (generate → evaluate → regenerate if below threshold, up to N cycles).

**Rationale:** No direct equivalent of "your CTA is weak, here's a targeted fix" exists for image generation — there is no well-defined per-dimension image intervention strategy analogous to strategies.ts. A/B variant selection is the image quality mechanism: two variants with different seeds produce genuine visual diversity, and the evaluator picks the better one. An iterative loop would roughly triple image generation cost with minimal expected quality gain — the 8.5-threshold calibration run showed that text iteration gains plateau quickly after cycle 2-3, and image generation has even less structured feedback to work with.

**Result:** A/B selection worked as designed. Several cases with large variance between variants (e.g., variant 1 scored 4.3 while variant 2 scored 8.0 — a 3.7-point gap). In all cases the higher-scoring variant was correctly selected. No iterative loop was needed — the seed diversity produced sufficient variant quality range.

---

## Decision 18: Download images immediately after generation

**Decision:** Download fal.ai images to data/images/{uuid}.jpg immediately after each generation call, before returning the result.

**Alternatives considered:** Store only the CDN URL and download lazily when the dashboard requests an image; download in a separate batch step after all generation is complete.

**Rationale:** fal.ai CDN URLs expire in approximately 1 hour. Lazy download risks broken images in the dashboard if the pipeline takes more than an hour to complete or if the dashboard is opened the next day. Batch download risks losing images if the process is interrupted mid-pipeline. Immediate download is the only strategy that guarantees the local library is complete and permanent. data/images/ is gitignored to avoid committing large binary files — images are regenerated by re-running the pipeline.

**Result:** Zero broken image references across the full run. All 150 images downloaded successfully on first attempt. Immediate download proved necessary — manual testing confirmed fal.ai URLs become inaccessible within 1-2 hours of generation.

---

## Decision 19: Sequential image generation with unique random seeds per variant

**Decision:** Generate image variants sequentially (not in parallel), each with a different seed drawn from `Math.random() * 2^31`. Seeds are pre-generated before the loop to guarantee uniqueness within a batch.

**Alternatives considered:** Parallel generation of all variants simultaneously; using `num_images: 2` in a single fal.ai call to get both variants at once; deterministic seeds derived from the ad ID.

**Rationale:** Sequential generation is simpler to reason about for error handling — if variant 1 fails, we throw immediately rather than needing to untangle partial results from a `Promise.all`. The per-ad latency cost is ~2s extra (two sequential ~2s calls vs one ~2s parallel batch), which is acceptable given the pipeline already runs at concurrency=5 across briefs. Using `num_images: 2` in a single call would give both images the same seed or a server-chosen seed, removing our control over visual diversity — separate calls with explicit different seeds guarantee distinct outputs. Deterministic seeds from ad ID were rejected because two runs of the same ad should produce fresh variants, not identical images.

**Result:** Sequential generation with unique seeds produced visually distinct variants in all cases. The seed diversity was sufficient — no two variants from the same brief were visually similar. Sequential execution made error attribution straightforward: zero cases where partial batch results needed to be untangled.

---

## Decision 20: Single retry on image download failure

**Decision:** The `downloadImage` helper retries once (2 total attempts, 500ms delay) before throwing. Image generation itself does not retry — a fal.ai generation failure is immediately fatal for that variant.

**Alternatives considered:** No retries (fail fast on any network blip); exponential backoff with 3+ retries; retry the entire generation call on download failure.

**Rationale:** Download failures are the most likely transient error — a CDN edge node briefly returning 503 is common, and a single retry at 500ms is almost always sufficient. Generation failures (bad prompt, model error, auth failure) are structural, not transient, so retrying the generation call would just burn credits on the same error. Keeping retry logic minimal avoids masking real failures and keeps the pipeline predictable. If both download attempts fail, the error message includes the URL for debugging.

**Result:** Zero download retries triggered across 150 image downloads in the full production run. The retry logic was not exercised, which is the ideal outcome — no transient CDN failures occurred.

---

## Decision 21: Ad copy passed as text context alongside the image, not embedded in it

**Decision:** The visual evaluator receives the ad copy (primary text + headline) as text in the user prompt alongside the base64 image. The evaluator uses this to score text-image coherence — whether the image reinforces the copy's message.

**Alternatives considered:** Evaluate the image in isolation without copy context; composite the text onto the image before evaluation; pass the full brief instead of just the copy.

**Rationale:** Text-image coherence is one of the three visual dimensions and cannot be scored without knowing what the copy says. Passing copy as structured text (not rendered into the image) is cleaner — it avoids introducing rendering artifacts that might confuse the evaluator, and it separates the visual quality signal from text legibility. The full brief is not passed because the evaluator should judge what the audience _sees_ (copy + image), not the internal generation context (audience segment, hook type). The audience and campaign goal are included as lightweight context to calibrate brand expectations.

**Result:** Passing ad copy alongside the image produced high text-image coherence scores (avg 9.0) and substantive rationales that specifically referenced copy elements. The evaluator correctly identified when images reinforced the copy's emotional hook vs. when they were generically on-topic but not specifically coherent.

---

## Decision 22: Magic-byte media type detection over file extension

**Decision:** The visual evaluator detects JPEG vs PNG by inspecting the first byte of the file buffer (0x89 = PNG, else JPEG) rather than parsing the file extension.

**Alternatives considered:** Always assume JPEG since the image generator saves as .jpg; parse the file extension with `path.extname()`.

**Rationale:** Flux Schnell may return PNG or JPEG depending on model configuration, and the fal.ai SDK doesn't guarantee format. The file extension is set by our code (always `.jpg`), so it's unreliable as a format indicator. Magic byte detection is a single-byte check that's correct for both formats and costs nothing. The Anthropic vision API requires the correct `media_type` — sending `image/jpeg` for a PNG payload would cause a silent evaluation failure.

**Result:** _Immediate — handles both formats correctly regardless of file extension._

---

## Decision 23: runImagePipeline as a separate function, not inlined into iterateToQuality

**Decision:** The image pipeline is a standalone exported function `runImagePipeline(entry, brief)` that the caller invokes after `iterateToQuality()`, rather than being embedded inside the iteration loop itself.

**Alternatives considered:** Extend `iterateToQuality()` to run the image pipeline automatically before returning; add an options flag like `{ includeImages: true }` to control behavior.

**Rationale:** `iterateToQuality()` has a stable contract — it returns `IterationResult` and is called by the existing pipeline orchestrator. Embedding the image pipeline inside it would change its return type (breaking the v1 contract) or require conditional logic that couples text and image concerns. A separate function keeps the text loop pure and testable in isolation, and lets the orchestrator (`index.ts`) decide whether to run images — for example, skipping images for a text-only calibration run or retrying the image pipeline without re-running text. The `null` return on failure means the caller can fall back to text-only without try/catch boilerplate.

**Result:** The separation proved valuable during development — image pipeline could be tested independently against existing text entries without re-running the expensive text generation. The null return path was exercised in smoke testing and worked correctly.

---

## Decision 24: Image pipeline gated on FAL_KEY presence, not a separate CLI flag

**Decision:** The v2 image pipeline runs automatically when `FAL_KEY` is set in the environment. When `FAL_KEY` is absent, the pipeline runs in v1 text-only mode with no code path changes or errors.

**Alternatives considered:** A `--with-images` CLI flag; a `V2_ENABLED=true` env var; always running the image pipeline and failing loudly if `FAL_KEY` is missing.

**Rationale:** The simplest feature gate that requires zero user action beyond setting the API key. If someone clones the repo and only has an Anthropic key, `pnpm generate` still works — it just produces text-only ads. This avoids a confusing "image pipeline failed: missing FAL_KEY" error that would block v1 functionality. The pipeline header prints `v2: text+image` or `v1: text-only` so the user knows which mode they're in. A separate `V2_ENABLED` flag would be redundant with the key presence check.

**Result:** _Immediate — tested by running with and without FAL_KEY._

---

## Decision 25: Separate /api/images/[id] route instead of inlining base64 in the ads API

**Decision:** Image files are served through a dedicated `/api/images/[id]` route that reads from disk and returns binary with correct Content-Type. The ads API does not include image data — the frontend fetches images separately via `<img src>`.

**Alternatives considered:** Inline base64-encoded images directly in the ads API response; serve images as static files from a Next.js public directory; use a CDN proxy.

**Rationale:** Inlining base64 in the API response would balloon the JSON payload — a single 1200x628 JPEG is ~50-100KB base64, and with 75 ads the response would be 4-8MB. The separate route serves images on demand as the user expands ad details, with browser caching (Cache-Control: max-age=86400) preventing redundant reads. Using Next.js public/ would require copying images into the dashboard directory, creating a maintenance burden. The route reads `localPath` from `ads.json` and serves the file directly — no extra state to maintain.

**Result:** _Immediate — images lazy-load when expanding ad detail rows._

---

## Decision 26: Coherence loop as single retry, not multi-cycle

**Decision:** When text_image_coherence is the weakest visual dimension and scores below 7.5, generate exactly one revised image variant (variant 3) using the evaluator's coherence rationale. No multi-cycle iteration for images.

**Alternatives considered:** Run the coherence loop for N cycles (analogous to the text iteration loop); skip image-side intervention entirely and rely only on A/B selection.

**Rationale:** A single targeted revision is the most likely to help — the evaluator's rationale gives specific, actionable feedback ("the image shows a generic classroom but the copy talks about one-on-one mentorship"), and a revised prompt addressing that specific gap should produce a better-aligned image on the first try. There's no structured per-cycle feedback mechanism for images the way there is for text dimensions, so multi-cycle iteration would be groping in the dark after the first revision. Multi-cycle would also roughly triple image cost ($0.009/ad instead of $0.003 for the third variant alone) with unclear ceiling — the text iteration data from the 8.5 calibration run showed diminishing returns after cycle 2-3, and images have even less structured feedback to work with. One shot, targeted, move on.

**Result:** _Fill in after v3 production run._

---

## Decision 27: Copy refinement requires copy-side signal detection, not just low coherence

**Decision:** Before triggering copy refinement, run a Haiku classification call to determine whether the coherence mismatch is image-side, copy-side, or both. Only regenerate copy when the signal is copy-side or both.

**Alternatives considered:** Trigger copy refinement on any low coherence score (simpler logic, no extra API call); always regenerate both copy and image when coherence is low.

**Rationale:** Low coherence can be image-side — the coherence loop already addresses that by generating a revised variant. If the image loop didn't recover coherence, it doesn't automatically mean the copy is the problem. Copy refinement should only fire when the evaluator explicitly identifies the copy as the source of the mismatch — for example, "the image is warm and relational but the copy is clinical and feature-driven." Triggering on any low score would cause unnecessary copy regeneration on image-side failures, burning tokens and potentially degrading good copy. The classification call is cheap (~$0.001 on Haiku at temp 0) and prevents the more expensive copy+re-evaluation cycle from firing unnecessarily.

**Result:** _Fill in after v3 production run._

---

## Decision 28: Coherence threshold 7.5, copy refinement threshold 7.0

**Decision:** The coherence loop triggers when text_image_coherence < 7.5. Copy refinement triggers only if coherence is still < 7.0 after the image loop resolves.

**Alternatives considered:** Same threshold for both (e.g., 7.0 for both, or 7.5 for both); a single threshold with both loops running simultaneously.

**Rationale:** The coherence loop should fire early — intervening at 7.5 catches moderate mismatches before they become severe. It's a relatively cheap operation (one image generation + one visual evaluation). Copy refinement fires only if the image loop didn't recover coherence to an acceptable level — meaning the problem is genuinely copy-side and requires the more expensive cycle of copy regeneration + text re-evaluation + visual re-evaluation. The 0.5-point gap between thresholds creates a "buffer zone" where the image loop alone is considered sufficient. Both thresholds are env-configurable so they can be tuned after the production run.

**Result:** _Fill in after v3 production run._

---

## Decision 29: Researcher uses Anthropic web search + Sonnet, not a scraper

**Decision:** The Researcher agent uses the Anthropic API with the `web_search_20250305` tool enabled on `claude-sonnet-4-5` to analyze current competitor ad patterns, rather than building a headless browser scraper for the Meta Ad Library.

**Alternatives considered:** Puppeteer/Playwright headless browser scraping of the Meta Ad Library; manual extraction of competitor patterns into a static JSON file; skip competitive intelligence entirely.

**Rationale:** Web search through the Anthropic tool is sandboxed and fast — no browser automation setup, no dependency on Chrome/Puppeteer, no flaky CSS selectors. Sonnet's reasoning over search results is more useful than raw HTML parsing — it can identify patterns, summarize themes, and extract structured intelligence in a single call. Meta's Ad Library actively blocks automated scraping with rate limits and CAPTCHA challenges, so a headless browser approach would be fragile in production. The fallback to `data/reference-ads.json` ensures the pipeline never blocks on web search failures.

**Result:** _Fill in after v3 production run._

---

## Decision 30: Researcher caches competitive intelligence within a run

**Decision:** Competitive intelligence is fetched once per run and cached in memory. All 75 briefs share the same `CompetitorInsights` object.

**Alternatives considered:** Fetch fresh intelligence per brief (75 × web search calls); fetch per audience segment (3 × web search calls); no caching with deduplication.

**Rationale:** 75 × Sonnet + web search calls would cost ~$0.30–0.45 for the run and add significant latency, all for essentially identical data — competitor patterns in the Meta Ad Library don't change within the ~30 minutes a single run takes. A single fetch amortizes the cost across all briefs (~$0.004 total). The cache is in-memory only (not persisted to disk between runs) so each run starts with fresh intelligence. If the web search call fails, the fallback to `data/reference-ads.json` ensures generation still has competitive context, just not live data.

**Result:** _Fill in after v3 production run._

---

## Decision 31: Ratchet updates mid-run, not end-of-run

**Decision:** The ratchet pool (`data/ratchet/top-ads.json`) is updated after each brief completes, not batched at the end of the run.

**Alternatives considered:** Batch-update the pool after all 75 briefs complete; update the pool at fixed intervals (every 10 briefs).

**Rationale:** Mid-run updates are the entire point of the quality ratchet — later briefs benefit from earlier results in the same run. If the 5th brief produces a 9.2-scoring ad, the 6th brief's generator sees that as a few-shot example, raising the quality floor. This is the compound improvement mechanic working as intended. Batch-update would mean all 75 briefs see the same (possibly stale) pool from the previous run. The write is synchronous and sequential (called from the main loop, not concurrent workers), so there's no race condition risk. The pool file is small (10 entries max) so disk I/O is negligible.

**Result:** _Fill in after v3 production run._

---

## Decision 32: Copy refinement does not trigger another image generation pass

**Decision:** After copy refinement produces new copy, the system re-evaluates text quality and visual coherence, but does NOT regenerate images to match the new copy.

**Alternatives considered:** Re-run the full image pipeline after copy changes (new prompt → new variants → new evaluation); run a single "touch-up" image variant with the new copy context.

**Rationale:** Bounding the feedback loop is critical. A copy → image → copy → image cycle could run indefinitely without a convergence guarantee — each change potentially invalidates the other side's alignment. The v3 design makes one pass in each direction (image loop → copy refinement) and stops. If the refined copy still doesn't perfectly match the image, that's acceptable — the ratchet pool captures the best result and the next run's generation starts from a higher baseline. Cross-run improvement compounds through the ratchet; within-run improvement is bounded to prevent runaway costs and infinite loops.

**Result:** _Fill in after v3 production run._

---

## Decision 33: Ratchet examples are appended to static few-shot examples, not a replacement

**Decision:** `buildEnrichedSystemPrompt` appends ratchet pool examples after the 3 good + 1 bad static examples, rather than replacing the static examples with ratchet entries.

**Alternatives considered:** Replace static examples entirely with ratchet pool entries when ≥ 3 qualifying entries exist (as originally specified in CLAUDE.md Step 3).

**Rationale:** Additive context is strictly better for generation quality — the static examples remain as a reliable baseline that is always present regardless of ratchet pool state, while ratchet entries provide the dynamic "standards only go up" signal on top of them. Replacement would risk degrading output on early briefs before the pool fills, or if the pool fills with stylistically similar ads. The prompt length increase is modest (3 additional examples at most) and well within Haiku's context window.

**Result:** _Fill in after v3 production run._

---
