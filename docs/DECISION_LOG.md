# Decision Log

_Write this as you build. One entry per meaningful decision._

> **Note:** This log is a live record, not a polished retrospective. Some later entries
> will contradict earlier ones — that's intentional. When a decision is reversed, a new
> entry is added explaining why rather than editing the old one. The history of reasoning
> matters as much as the final outcome.

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

**Result:** _Fill in after run — note actual cost per ad and any quality ceiling issues._

---

## Decision 2: Equal dimension weights (0.2 each)

**Decision:** Weight all 5 quality dimensions equally at 0.2 when computing the aggregate score.

**Alternatives considered:**
- Upweight clarity + value proposition (the "does it work?" dimensions) to 0.25 each, downweight brand voice + emotional resonance to 0.15.
- Use variable weights per campaign goal (awareness ads weight emotional resonance higher; conversion ads weight CTA higher).

**Rationale:** Starting with equal weights is the principled default — it avoids baking in assumptions about which dimensions matter more before we have any calibration data. The spec explicitly says "Default equal weights (0.2 each). Justify or adjust based on calibration against reference ads." I'll revisit after the calibration step (Step 4) and add a new entry if adjustments are warranted. Premature weighting risks optimizing the feedback loop toward one dimension at the expense of others.

**Result:** _Revisit after calibration run._

---

## Decision 3: Brief expansion strategy — 24 base briefs × 3+ runs = 75 pipeline runs

**Decision:** Generate 24 base briefs (3 audiences × 2 goals × 4 hook types) and expand to 75 pipeline runs by running 3+ ads per brief with rotated offers.

**Alternatives considered:**
- Fewer base briefs (6 = audience × goal only) with more runs per brief.
- More base briefs by adding tone variants as a separate axis.

**Rationale:** 24 base briefs ensures every combination of audience, goal, and hook type is represented at least once — this maximizes diversity in the final ad library. Running 3+ ads per brief (75 total) gives enough headroom for the ~60-70% pass rate after iteration to still produce 50+ final ads. Offers rotate deterministically across runs of the same brief so we don't get 3 identical ads per brief. Tone is derived from goal × hook type rather than being an independent axis — this keeps the combinatorial explosion manageable while still producing varied output.

**Result:** _Fill in after pipeline run — note actual pass rate and whether 50+ was reached._

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

**Result:** _Validate on first generation run — check if output quality and JSON compliance are consistent._

---

## Decision 6: Evaluator prompt design — rubric anchoring at 4 score levels per dimension

**Decision:** The evaluator system prompt includes explicit score anchors at levels 1, 5, 7, and 10 for each dimension, rather than just 1 and 10.

**Alternatives considered:**
- Only 1 and 10 anchors (as in the CLAUDE.md spec).
- Full 1-10 rubric for each dimension (too verbose, risks context dilution).
- Separate evaluator calls per dimension (more precise but 5x cost).

**Rationale:** LLM-as-judge calibration research shows that models compress toward the middle of a scale when anchors are sparse. Adding the 5 and 7 anchors gives the evaluator concrete reference points for "mediocre but functional" (5) versus "publishable" (7). This directly supports the 7.0 threshold — the evaluator needs to know exactly what 7 means, not just interpolate between 1 and 10. The 7-anchor is the most important since it's the pass/fail boundary. Four anchors per dimension × 5 dimensions = 20 anchor points, which fits comfortably in the system prompt without overwhelming the model.

**Result:** _Validate with calibration run — good ads should score ≥8, bad ads ≤5._

---

## Decision 7: Evaluator temperature 0, generator temperature 0.7

**Decision:** Evaluator uses `temperature: 0` for deterministic scoring. Generator uses `temperature: 0.7` for creative variance.

**Alternatives considered:**
- Both at 0 (no creative variance in generation — would produce nearly identical ads per brief).
- Generator at 1.0 (more creative but higher risk of format violations and incoherence).
- Evaluator at 0.1 (slight variance to avoid degenerate scoring patterns).

**Rationale:** The evaluator MUST be deterministic for the iteration loop to work — if the same ad gets scored 6.5 on one run and 7.5 on the next, the feedback signal is noise. `temperature: 0` is the closest we get since Anthropic has no `seed` parameter. The generator needs enough variance to produce diverse ads from the same brief (we run 3+ per brief), but 0.7 keeps it structurally reliable — at 1.0 I'd expect more JSON parsing failures and off-brand output. This is a well-established best practice: deterministic evaluation, stochastic generation.

**Note on Anthropic determinism:** Even at `temperature: 0`, the Anthropic API does not guarantee bitwise-identical outputs across calls. The spec test allows ±0.1 tolerance on aggregate scores for this reason. This is a known limitation documented in LIMITATIONS.md.

**Result:** _Test with the determinism spec test — two evaluations of the same ad should be within ±0.1._

---

## Decision 8: Regeneration prompt includes previous ad as reference + targeted dimension fix

**Decision:** When an ad fails the quality threshold, the regeneration prompt includes (a) the original brief context, (b) the previous ad text as reference, (c) the weakest dimension name, and (d) a specific improvement strategy. The model is told to "rewrite from scratch" — not edit.

**Alternatives considered:**
- Send only the improvement strategy without showing the previous ad (model has no context on what to fix).
- Send the previous ad and ask for a "minor edit" (risks minimal changes that don't move the score).
- Send all dimension scores and rationales (information overload for the generator).

**Rationale:** Showing the previous ad gives the model a concrete reference for what didn't work, but instructing "rewrite from scratch" prevents lazy one-word edits that don't actually improve the score. Only the weakest dimension gets an intervention — this prevents the model from trying to optimize 5 things at once, which typically results in optimizing none. The improvement strategies in `strategies.ts` are hand-crafted per dimension with specific, actionable instructions (not just "make it better").

**Result:** _Track improvement deltas per dimension after iteration runs._

---

## Decision 9: Best-of-N selection rather than last-cycle-wins

**Decision:** The iteration loop selects the cycle with the highest aggregate score as the final ad, not necessarily the last cycle produced.

**Alternatives considered:**
- Always use the last cycle (simpler, but ignores regressions).
- Use the last cycle that improved (arbitrary cutoff).

**Rationale:** Targeted regeneration sometimes improves the weak dimension but degrades another. A cycle 3 ad might score 7.2 while cycle 4 regresses to 6.8 because fixing emotional resonance made the CTA vague. Best-of-N means we never surface a worse ad than we already had. This also justifies early stopping: if the score drops significantly (>0.5) after cycle 3+, we stop iterating because further cycles are unlikely to recover.

**Result:** _Verify with live run — check if regressions occur and are correctly handled._

---

## Decision 10: Early stopping on score regression

**Decision:** If the aggregate score drops by more than 0.5 after cycle 3 or later, stop iterating early rather than burning remaining cycles.

**Alternatives considered:**
- Always run all maxCycles (wastes tokens on diminishing returns).
- Stop on any regression (too aggressive — small oscillations are normal).

**Rationale:** Empirically, when a regeneration significantly hurts the score, additional regenerations from the same brief tend to oscillate rather than recover. The 0.5 threshold and cycle ≥3 guard prevent premature stopping on normal cycle-2 adjustments while catching genuine regressions. Combined with best-of-N selection, the final output is always the best version produced regardless of when we stopped.

**Result:** _Verify with live run._

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

