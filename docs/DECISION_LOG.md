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

