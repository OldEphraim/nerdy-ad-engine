# CLAUDE.md — Nerdy Ad Engine v3

> **Hiring Partner:** Nerdy (Varsity Tutors) · **Stack:** TypeScript, Next.js, React, Node.js

---

## Project Context

This is v3 of the Nerdy Autonomous Ad Engine. **The v2 text+image pipeline is complete and working.**
Do not modify any v1 or v2 logic unless explicitly instructed. Only extend it.

The v2 codebase you're starting from includes:
- Full text generation pipeline (generator, evaluator, iteration loop, library, trends)
- Image generation (fal.ai Flux Schnell, 2 variants per ad, A/B selection)
- Visual evaluation (Claude Sonnet vision, 3 dimensions: brand_consistency, visual_engagement, text_image_coherence)
- 75 complete text+image ad packages in `data/runs/v2-production.json`
- Three named runs in `data/runs/` (v2-production, production-7.0, calibration-8.5)
- Next.js dashboard with ad library, image thumbnails, combined scores, quality trends, run selector
- 55 passing tests across 5 test files
- Decision log with 25 entries, LIMITATIONS.md, README.md, TECHNICAL_WRITEUP.md, EVALUATION_REPORT.md

---

## What v3 Adds

v3 closes the gaps in v2's pipeline and makes the system genuinely autonomous:

1. **Bidirectional coherence loop** — After visual evaluation, if `text_image_coherence`
   is the weakest visual dimension, the system generates a third image variant using a
   revised prompt that incorporates the evaluator's specific rationale. The image-side
   analog of the text iteration loop.

2. **Copy refinement from visual feedback** — If visual evaluation reveals a systematic
   mismatch between image and copy (e.g., the image is warm and relational but the copy
   is clinical and feature-driven), the system regenerates the copy with explicit visual
   context injected, then re-evaluates the full text+image package. This closes the
   bidirectional loop: text can now respond to images, not just vice versa.

3. **Quality ratchet** — The Researcher agent pulls the top-scoring ads from the library
   as dynamic few-shot examples for the Writer. Standards only go up: the library's best
   ads become the new floor for generation quality.

4. **Agentic orchestration with competitive intelligence** — The pipeline is restructured
   as four named agents. The Researcher agent makes live API calls to analyze current
   competitor patterns from the Meta Ad Library before each generation run, injecting
   fresh competitive intelligence into the brief.

5. **Extended dashboard** — New "Coherence Analysis" view showing text-image coherence
   distribution, flagged mismatches, and before/after comparison for ads that went
   through the coherence improvement loop.

---

## Multi-Model Architecture

| Task | Model | Why |
|---|---|---|
| Text generation | `claude-haiku-4-5` (temp 0.7) | Unchanged from v1/v2 |
| Text evaluation | `claude-haiku-4-5` (temp 0) | Unchanged from v1/v2 |
| Image prompt generation | `claude-haiku-4-5` (temp 0.7) | Unchanged from v2 |
| Image generation | fal.ai Flux Schnell | Unchanged from v2 |
| Visual evaluation | `claude-sonnet-4-5` (temp 0) | Unchanged from v2 |
| Coherence revision prompt | `claude-haiku-4-5` (temp 0.7) | NEW: revised image prompt from evaluator rationale |
| Copy-side signal detection | `claude-haiku-4-5` (temp 0) | NEW: classifies whether mismatch is copy-side or image-side |
| Copy refinement | `claude-haiku-4-5` (temp 0.7) | NEW: copy regeneration with image as visual context |
| Competitive intelligence | `claude-sonnet-4-5` (temp 0) + web search | NEW: Researcher agent pattern analysis |
| Quality ratchet examples | Library best-of (no API call) | NEW: top library ads as dynamic few-shot |

**Cost estimate per ad (v3):**
- Text pipeline: ~$0.0046 base (same as v2)
- Image generation: ~$0.006 base; up to ~$0.009 if coherence loop triggers a third variant
- Visual evaluation: ~$0.0225 base; up to ~$0.034 if copy refinement triggers re-evaluation
- Copy-side signal detection: ~$0.001/ad (small Haiku classification call, only when coherence is weak)
- Competitive intelligence: ~$0.003–0.006 per run total (Sonnet + web search, cached across all 75 briefs)
- **Estimated total: ~$0.036–0.055/ad** depending on how often loops activate

These estimates will be updated with actuals after the v3 production run completes (Step 12).

---

## The Core New Mechanics

### Bidirectional Coherence Loop

In v2, the image pipeline ends at A/B selection. In v3:

```
text passes → generate image prompt → generate 2 variants → evaluate both → pick winner
                                                                  │
                                          text_image_coherence weakest AND < 7.5?
                                                                  │YES
                                          extract evaluator rationale
                                                                  │
                                          build revised image prompt
                                          (inject: "Previous failed coherence because X.
                                           Copy says Y. Visualize Y directly.")
                                                                  │
                                          generate variant 3 → evaluate
                                          if variant 3 > winner → replace winner
```

### Copy Refinement from Visual Feedback

After the coherence loop resolves, if the winning image's `text_image_coherence` score
is still below 7.0, the system classifies whether the remaining mismatch is copy-side
or image-side. If copy-side, the Writer regenerates the copy with the image as context:

```
coherence still < 7.0 after image loop?
          │YES
          │
          classify rationale: image-side or copy-side? (Haiku, temp 0)
          │COPY-SIDE
          │
          regenerate copy with image as visual context:
          "This image shows [scene description]. Write ad copy that emotionally
           matches and reinforces what this image communicates to [audience]."
          │
          re-evaluate text (Haiku, temp 0)
          if new text passes AND combined score improves → replace copy
          re-evaluate visual coherence (Sonnet vision)
          update combined score
```

Bounded: copy refinement fires at most once per ad. Does not trigger another image
generation pass. Final package is always the highest combined-score version seen.

### Quality Ratchet

After each brief completes, ads with combined score ≥ 8.0 enter `data/ratchet/top-ads.json`.
Later briefs in the same run use these as dynamic few-shot examples via the Writer agent —
pool updated mid-run so later briefs benefit from earlier results.
Pool is capped at 10 ads; lowest scorer is evicted when full.

---

## Agentic Orchestration

```
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE ORCHESTRATOR                        │
│                     (src/index.ts)                               │
└──────────┬──────────────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────────────────┐
    │  RESEARCHER AGENT (src/agents/researcher.ts)             │
    │  Input: AdBrief + insights cache                         │
    │  Makes API calls: Sonnet + web search (cached per run)   │
    │  Fetches: current Meta Ad Library competitor patterns    │
    │  Assembles: ratchet examples + competitive intelligence  │
    │  Output: EnrichedBrief                                   │
    └──────┬──────────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────────────────┐
    │  WRITER AGENT (src/agents/writer.ts)                     │
    │  Input: EnrichedBrief                                    │
    │  Output: GeneratedAd                                     │
    │  Injects: ratchet few-shot examples + competitor context │
    └──────┬──────────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────────────────┐
    │  EDITOR AGENT (src/agents/editor.ts)                     │
    │  Input: GeneratedAd + EnrichedBrief                      │
    │  Output: CombinedAdEntryV3                               │
    │  Runs: text iteration → image pipeline →                 │
    │        coherence loop → copy refinement loop             │
    └──────┬──────────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────────────────┐
    │  EVALUATOR AGENT (evaluator.ts + visual-evaluator.ts)   │
    │  Called by Editor at each stage — unchanged from v2      │
    └─────────────────────────────────────────────────────────┘
```

---

## Researcher Agent: Competitive Intelligence

The Researcher agent uses the Anthropic API with the `web_search_20250305` tool enabled,
calling Sonnet to analyze current competitor ad patterns from the Meta Ad Library.

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 1024,
  temperature: 0,
  tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  system: RESEARCHER_SYSTEM_PROMPT,
  messages: [{
    role: 'user',
    content: `Search the Meta Ad Library for current active ads from Princeton Review,
              Kaplan, Khan Academy, and Chegg targeting SAT prep audiences.
              Identify: dominant hook types, CTA patterns, emotional angles, and any
              new creative formats active in the last 30 days.
              Return ONLY valid JSON — no preamble, no markdown fences.
              Schema: { dominantHooks, ctaPatterns, emotionalAngles, freshInsights }`
  }]
});
```

**Researcher system prompt:**
```
You are a competitive intelligence analyst for Varsity Tutors' paid social team.
Your job is to identify patterns in competitor SAT prep ads currently running on Meta.

Focus on: hook types performing well, CTA patterns, emotional angles, new creative
formats appearing across multiple competitors.

Return ONLY valid JSON: { dominantHooks: string[], ctaPatterns: string[],
emotionalAngles: string[], freshInsights: string[] }
```

Results are cached for the entire run (one fetch, amortized across all 75 briefs).
If web search fails, fall back to patterns in `data/reference-ads.json` and log a warning.

---

## Environment Variables

```bash
# v1 (unchanged)
ANTHROPIC_API_KEY=
GENERATOR_MODEL=claude-haiku-4-5
EVALUATOR_MODEL=claude-haiku-4-5
MAX_ITERATIONS=5
QUALITY_THRESHOLD=7.0
CONCURRENCY_LIMIT=5

# v2 (unchanged)
FAL_KEY=
IMAGE_MODEL=fal-ai/flux/schnell
VISUAL_EVALUATOR_MODEL=claude-sonnet-4-5
IMAGE_VARIANTS=2
IMAGE_WIDTH=1200
IMAGE_HEIGHT=628
TEXT_SCORE_WEIGHT=0.6
IMAGE_SCORE_WEIGHT=0.4

# v3 additions
COHERENCE_LOOP_ENABLED=true           # Set false to disable third-variant generation
COHERENCE_THRESHOLD=7.5               # Trigger coherence loop if text_image_coherence < this
COPY_REFINEMENT_ENABLED=true          # Set false to disable copy-side refinement
COPY_REFINEMENT_THRESHOLD=7.0         # Trigger copy refinement if coherence still < this after image loop
RATCHET_ENABLED=true                  # Set false to use static few-shot examples only
RATCHET_MIN_SCORE=8.0                 # Minimum combined score to enter ratchet pool
RATCHET_POOL_SIZE=10                  # Max ads in the ratchet pool
RESEARCHER_MODEL=claude-sonnet-4-5    # Model for competitive intelligence (needs web search)
RESEARCHER_CACHE=true                 # Cache competitive intelligence within a run
```

---

## Directory Structure

```
ad-engine/  (v3 branch)
├── src/
│   ├── agents/                          # NEW: agent wrappers
│   │   ├── researcher.ts                # NEW: competitive intelligence + ratchet assembly
│   │   ├── writer.ts                    # NEW: wraps generator + ratchet/competitor inject
│   │   └── editor.ts                    # NEW: wraps loop + image pipeline + coherence + copy refinement
│   ├── generate/
│   │   ├── briefs.ts                    # COMPLETE — do not modify
│   │   ├── generator.ts                 # COMPLETE — do not modify
│   │   ├── prompts.ts                   # EXTEND: buildCoherenceRevisionPrompt(),
│   │   │                                #          buildCopyRefinementPrompt()
│   │   └── image-generator.ts           # COMPLETE — do not modify
│   ├── evaluate/
│   │   ├── evaluator.ts                 # COMPLETE — do not modify
│   │   ├── dimensions.ts                # COMPLETE — do not modify
│   │   └── visual-evaluator.ts          # COMPLETE — do not modify
│   ├── iterate/
│   │   ├── loop.ts                      # EXTEND: coherence loop + copy refinement loop
│   │   └── strategies.ts                # COMPLETE — do not modify
│   ├── output/
│   │   ├── library.ts                   # EXTEND: ratchet pool management
│   │   ├── trends.ts                    # EXTEND: coherence + copy refinement stats
│   │   └── images.ts                    # COMPLETE — do not modify
│   ├── index.ts                         # EXTEND: use agents, cache insights, log v3 stats
│   └── types.ts                         # EXTEND: EnrichedBrief, CoherenceLoopResult,
│                                        #          CopyRefinementResult, RatchetEntry,
│                                        #          CompetitorInsights, CombinedAdEntryV3
├── dashboard/
│   └── app/
│       ├── page.tsx                     # EXTEND: coherence flag + copy refinement badge
│       ├── trends/page.tsx              # EXTEND: coherence loop activation rate chart
│       ├── coherence/page.tsx           # NEW: coherence analysis view with before/after
│       └── api/
│           ├── ads/route.ts             # EXTEND: v3 metadata
│           └── images/[id]/route.ts     # COMPLETE — do not modify
├── data/
│   ├── ads.json                         # Generated library (gitignored)
│   ├── images/                          # Generated images (gitignored)
│   ├── runs/                            # Named run archives
│   └── ratchet/
│       └── top-ads.json                 # NEW: quality ratchet pool (committed)
├── docs/
│   ├── DECISION_LOG.md                  # EXTEND: entries 26–32 for v3 decisions
│   ├── LIMITATIONS.md                   # EXTEND: v3 limitations
│   ├── TECHNICAL_WRITEUP.md             # UPDATE: v3 architecture section (Step 12)
│   ├── EVALUATION_REPORT.md             # UPDATE: v3 run data (Step 12)
│   ├── v1-CLAUDE.md                     # Archived — do not modify
│   └── v2-CLAUDE.md                     # Archived — do not modify
└── tests/
    ├── briefs.test.ts                   # COMPLETE — no changes needed
    ├── library.test.ts                  # EXTEND: ratchet pool tests
    ├── generator.test.ts                # EXTEND: ratchet + competitor injection tests
    ├── spec-compliance.test.ts          # EXTEND: v3 fields
    ├── visual-evaluator.test.ts         # COMPLETE — no changes needed
    └── coherence-loop.test.ts           # NEW: coherence loop + copy refinement tests
```

---

## Step-by-Step Implementation Guide

*Steps 1–8 from v2 are complete. Steps below are v3-only.*

### Step 1 — Extend types.ts

Add new interfaces without touching existing ones:

```typescript
export interface CompetitorInsights {
  dominantHooks: string[];
  ctaPatterns: string[];
  emotionalAngles: string[];
  freshInsights: string[];
  fetchedAt: string;   // ISO timestamp
}

export interface EnrichedBrief extends AdBrief {
  ratchetExamples: RatchetEntry[];
  competitorInsights: CompetitorInsights;
}

export interface RatchetEntry {
  ad: GeneratedAd;
  evaluation: EvaluationResult;
  combinedScore: number;
  selectedAt: string;
}

export interface CoherenceLoopResult {
  triggered: boolean;
  triggerScore: number;
  triggerRationale: string;
  revisedPrompt: string;
  variant3: AdVariant | null;
  variant3Score: number | null;
  improved: boolean;
  costUsd: number;
}

export interface CopyRefinementResult {
  triggered: boolean;
  copySideSignal: string | null;
  originalCopy: string;
  refinedAd: GeneratedAd | null;
  refinedTextScore: number | null;
  refinedCombinedScore: number | null;
  improved: boolean;
  costUsd: number;
}

export interface CombinedAdEntryV3 extends CombinedAdEntry {
  coherenceLoop: CoherenceLoopResult;
  copyRefinement: CopyRefinementResult;
  ratchetExamplesUsed: number;
  competitorInsightsUsed: boolean;
  agentTrace: {
    researcherMs: number;
    writerMs: number;
    editorMs: number;
  };
}
```

### Step 2 — Implement src/agents/researcher.ts

```typescript
export async function research(
  brief: AdBrief,
  insightsCache: CompetitorInsights | null
): Promise<EnrichedBrief>
```

Two responsibilities:

**A. Competitive intelligence (with caching):**
- If `insightsCache` is provided, use it (skip API call)
- Otherwise: call Sonnet with `web_search_20250305` tool, fetch current Meta Ad Library patterns
- Parse JSON response into `CompetitorInsights`
- On failure: log warning and fall back to patterns extracted from `data/reference-ads.json`

**B. Ratchet pool assembly:**
- Load `data/ratchet/top-ads.json` (empty array if absent)
- Filter to ads matching brief's audience/goal; fall back to same audience, then any
- Select up to 3 examples; pad with static v1/v2 examples if pool has < 3 qualifying ads

Return `EnrichedBrief` with both fields populated.

### Step 3 — Implement src/agents/writer.ts

```typescript
export async function write(enrichedBrief: EnrichedBrief): Promise<GeneratedAd>
```

Wraps `generateAd()` with an enriched system prompt that injects:

1. **Ratchet examples** — replace static few-shot examples with top library ads,
   formatted identically to the static examples so generator sees no structural change
2. **Competitor insights** — append to system prompt:
   ```
   CURRENT COMPETITOR PATTERNS (live Meta Ad Library analysis):
   - Dominant hooks right now: [dominantHooks]
   - Leading CTAs: [ctaPatterns]
   - Emotional angles performing well: [emotionalAngles]
   - Fresh insights: [freshInsights]

   Use these as inspiration. Fit the Varsity Tutors brand into proven shapes — don't copy.
   ```

Fall back to static examples if `RATCHET_ENABLED=false` or pool is empty.

### Step 4 — Add buildCoherenceRevisionPrompt() and buildCopyRefinementPrompt() to prompts.ts

```typescript
export function buildCoherenceRevisionPrompt(
  ad: GeneratedAd,
  brief: AdBrief,
  originalPrompt: string,
  coherenceRationale: string
): string
```

Generates a revised Flux image prompt addressing the coherence failure. Includes:
- The original prompt (what was tried)
- The evaluator's coherence rationale (why it failed)
- The ad copy (what the image must reinforce)
- Instruction: directly visualize the copy's core message, not just a thematically related scene

```typescript
export function buildCopyRefinementPrompt(
  ad: GeneratedAd,
  brief: AdBrief,
  imageDescription: string,
  copySideSignal: string
): string
```

Generates a revised copy prompt written to match the image. Includes:
- Description of the winning image scene (derived from the image prompt used)
- The specific copy-side mismatch signal
- Instruction: rewrite copy to emotionally match and reinforce what the image communicates
- All v1/v2 generation constraints still apply (brand voice, CTA rules, JSON output)

### Step 5 — Add detectCopySideSignal() to iterate/loop.ts

```typescript
async function detectCopySideSignal(coherenceRationale: string): Promise<string | null>
```

Haiku classification call (temp 0) to determine whether the coherence mismatch is
copy-side or image-side:

```
Classify whether this text-image coherence failure is:
A) Image-side: the image fails to visualize what the copy says
B) Copy-side: the copy fails to match the emotional register of the image
C) Both

If B or C: extract the specific copy-side signal in one sentence.
Return ONLY valid JSON: { side: "image" | "copy" | "both", copySideSignal: string | null }
```

Only trigger copy refinement when `side === "copy"` or `side === "both"`.

### Step 6 — Extend src/iterate/loop.ts: coherence loop + copy refinement

After A/B selection in `runImagePipeline()`, run both loops in sequence:

**Coherence loop:**
```typescript
const coherenceScore = winner.visualEvaluation.scores
  .find(s => s.dimension === 'text_image_coherence')?.score ?? 10;

if (COHERENCE_LOOP_ENABLED && coherenceScore < COHERENCE_THRESHOLD) {
  const revisedPrompt = buildCoherenceRevisionPrompt(
    finalAd, brief, originalImagePrompt, coherenceRationale
  );
  const [variant3] = await generateImageVariants(revisedPrompt, 1);
  const variant3Eval = await evaluateImage(variant3.localPath, finalAd, brief);
  if (variant3Eval.aggregateScore > winner.visualEvaluation.aggregateScore) {
    winner = { imageResult: variant3, visualEvaluation: variant3Eval };
    coherenceLoop.improved = true;
  }
  // record CoherenceLoopResult regardless of improvement
}
```

**Copy refinement loop (runs after coherence loop resolves):**
```typescript
const finalCoherenceScore = winner.visualEvaluation.scores
  .find(s => s.dimension === 'text_image_coherence')?.score ?? 10;

if (COPY_REFINEMENT_ENABLED && finalCoherenceScore < COPY_REFINEMENT_THRESHOLD) {
  const signal = await detectCopySideSignal(coherenceRationale);
  if (signal) {
    const refinedAd = await generateAd(
      brief, buildCopyRefinementPrompt(finalAd, brief, imageDescription, signal)
    );
    const refinedEval = await evaluateAd(refinedAd);
    if (refinedEval.passesThreshold) {
      const newCombined = refinedEval.aggregateScore * TEXT_SCORE_WEIGHT
                        + winner.visualEvaluation.aggregateScore * IMAGE_SCORE_WEIGHT;
      if (newCombined > combinedScore) {
        finalAd = refinedAd;
        combinedScore = newCombined;
        winner.visualEvaluation = await evaluateImage(
          winner.imageResult.localPath, refinedAd, brief
        );
        copyRefinement.improved = true;
      }
    }
  }
  // record CopyRefinementResult regardless of improvement
}
```

Both loops must fail gracefully — log errors and return `triggered: true, improved: false`.
Neither loop should ever crash the pipeline.

### Step 7 — Implement src/agents/editor.ts

```typescript
export async function edit(
  enrichedBrief: EnrichedBrief,
  startTime: number
): Promise<CombinedAdEntryV3 | null>
```

Wraps the complete v3 pipeline and assembles `CombinedAdEntryV3` with timing.
Returns null only if text never passes threshold. Image/coherence/refinement failures
return partial results with `improved: false`, never null.

### Step 8 — Extend src/output/library.ts: ratchet pool management

```typescript
export function updateRatchetPool(entry: CombinedAdEntryV3): void
```

- Load `data/ratchet/top-ads.json` (create empty array if absent)
- If `entry.combinedScore >= RATCHET_MIN_SCORE`, add to pool
- If pool > `RATCHET_POOL_SIZE`, evict lowest-scoring entry
- Write back synchronously (called sequentially from index.ts — no concurrency issues)
- Never evict if pool would drop below 3 entries

### Step 9 — Extend src/index.ts

```typescript
let insightsCache: CompetitorInsights | null = null;

for (const brief of briefs) {
  const enrichedBrief = await research(brief, insightsCache);
  if (!insightsCache) insightsCache = enrichedBrief.competitorInsights;
  const entry = await edit(enrichedBrief, Date.now());
  if (entry) {
    appendToLibrary(entry);
    updateRatchetPool(entry);
  }
}
```

End-of-run summary stats to add:
- Coherence loop: triggered X/75, improved Y%
- Copy refinement: triggered X/75, improved Y%
- Ratchet pool: N ads at end of run, avg score of pool entries
- Competitor insights: fetched fresh or served from cache

### Step 10 — Dashboard: coherence analysis view

New page at `/coherence`:
- Table of all ads sorted by text_image_coherence score ascending
- Badges per row: "Image loop triggered", "Image loop improved", "Copy refined", "Copy improved"
- Detail view: before/after image thumbnails if coherence loop triggered;
  before/after copy text if copy refinement triggered

Extend `/trends`:
- Add stat cards: coherence loop activation rate, copy refinement activation rate,
  improvement rates for both
- Add third trend line: coherence score by cycle

### Step 11 — Tests

**coherence-loop.test.ts** — new file:
- Mock Haiku and Sonnet; test coherence loop triggers when score < threshold
- Test loop does NOT trigger when score >= threshold
- Test variant 3 replaces winner only when variant3Score > winnerScore
- Test graceful failure when variant 3 generation throws
- Test `buildCoherenceRevisionPrompt` includes rationale and ad copy
- Test `detectCopySideSignal` returns signal on copy-side rationale, null on image-side
- Test copy refinement triggers on copy-side signal, not image-side signal
- Test copy refinement does not trigger another image generation pass
- Test copy refinement does not fire when coherence loop already improved score above threshold

**spec-compliance.test.ts** — extend:
```typescript
it('every v3 entry has coherenceLoop and copyRefinement fields', () => { ... });
it('coherenceLoop.triggered is false when coherence score >= COHERENCE_THRESHOLD', () => { ... });
it('copyRefinement.triggered is false when coherenceLoop improved score above threshold', () => { ... });
it('ratchetExamplesUsed is a non-negative integer', () => { ... });
it('agentTrace has positive ms values for all three agents', () => { ... });
```

**library.test.ts** — extend:
```typescript
it('updateRatchetPool adds entries with combinedScore >= 8.0', () => { ... });
it('updateRatchetPool does not add entries below threshold', () => { ... });
it('ratchet pool never exceeds RATCHET_POOL_SIZE', () => { ... });
it('ratchet pool never drops below 3 entries', () => { ... });
```

After all tests written, run `pnpm test`. All 55 existing tests must still pass.
Target: 80+ tests total.

### Step 12 — Update cost documentation and run the full pipeline

After the full v3 production run completes:

1. **Save run output:**
   ```bash
   cp data/ads.json data/runs/v3-production.json
   ```

2. **Compute actual costs** using the token aggregation script (same approach as v2):
   ```bash
   node -e "
   const data = require('./data/runs/v3-production.json');
   // aggregate text, image, visual, coherence loop, copy refinement costs
   // print breakdown per component and per ad
   "
   ```

3. **Update README.md** — add v3 row to cost table; update v3 cost breakdown table
   with Estimated vs Actual columns

4. **Update docs/TECHNICAL_WRITEUP.md** — add v3 architecture section covering the
   bidirectional coherence loop, copy refinement, agentic structure, and quality ratchet;
   update Results section with v3 run data

5. **Update docs/EVALUATION_REPORT.md** — add v3 run to Run Inventory; add v3 quality
   distribution, coherence loop activation analysis, copy refinement analysis

6. **Update docs/DECISION_LOG.md** — fill in Result fields for Decisions 26–32
   based on what the production run actually showed:
   - How often did the coherence loop trigger? Did it improve scores?
   - How often did copy refinement trigger? Did the copy-side signal detector work?
   - Did the ratchet pool improve generation quality over the course of the run?
   - How accurate was the Researcher's competitive intelligence?

7. **Update docs/LIMITATIONS.md** — add v3 limitations section

---

## Decision Log Guidance

Write entries in `docs/DECISION_LOG.md` (continuing from Decision 25) **before** implementing
each corresponding step — same pre-committed rationale approach as v2:

- **Decision 26: Coherence loop as single retry, not multi-cycle** — Why not run the
  coherence loop for N cycles? (Single targeted revision is most likely to help; no
  structured per-cycle feedback mechanism for images; multi-cycle would roughly triple
  image cost with unclear ceiling)

- **Decision 27: Copy refinement requires copy-side signal detection, not just low
  coherence** — Why parse for a copy-side signal rather than triggering on any low
  coherence score? (Low coherence can be image-side — already addressed by the coherence
  loop; copy refinement should only fire when the evaluator explicitly identifies the copy
  as the problem; avoids unnecessary copy regeneration on image-side failures)

- **Decision 28: Coherence threshold 7.5, copy refinement threshold 7.0** — Why
  different thresholds? (Coherence loop fires early — intervene before hitting floor.
  Copy refinement fires only if image loop didn't recover coherence — meaning the problem
  is genuinely copy-side and requires the more expensive copy+re-evaluation cycle.)

- **Decision 29: Researcher uses Anthropic web search + Sonnet, not a scraper** — Why
  use the web search tool rather than headless browser scraping of the Meta Ad Library?
  (Web search is sandboxed and fast; requires no browser automation setup; Sonnet's
  reasoning over search results is more useful than raw HTML; Meta's Ad Library
  actively blocks automated scraping)

- **Decision 30: Researcher caches competitive intelligence within a run** — Why not
  fetch fresh intel per brief? (75 × Sonnet + web search = significant cost for
  essentially identical data; competitor patterns don't change within a single run;
  single fetch amortizes cost across all briefs; fall back to reference-ads.json on failure)

- **Decision 31: Ratchet updates mid-run, not end-of-run** — Why update the pool
  after each brief rather than batching at the end? (Later briefs benefit from earlier
  results in the same run — this is the compound improvement mechanic working as intended.
  The 50th brief sees a richer pool than the 1st.)

- **Decision 32: Copy refinement does not trigger another image generation pass** —
  Why not re-run the image pipeline after copy changes? (Bounding the feedback loop:
  copy → image → copy → image could cycle indefinitely without a convergence guarantee.
  The refined copy becomes the new baseline for the next run's generation — the ratchet
  is where cross-run improvement compounds.)

---

## Known Limitations to Add to LIMITATIONS.md

- **Ratchet pool diversity may degrade** if one audience/hook combination consistently
  scores highest. The pool could fill with stylistically similar ads. A future improvement
  would enforce audience/goal diversity in pool selection.
- **Copy refinement is bounded at one pass.** A genuinely misaligned brief might need
  multiple copy-image negotiation cycles to converge. The current design prevents
  unbounded cycling at the cost of leaving some mismatches unresolved.
- **Competitive intelligence is search-based, not a systematic scrape.** The Meta Ad
  Library is partially indexed and Sonnet's analysis reflects whatever surfaces in
  search results — not a comprehensive view of all active ads.
- **Runs are not fully reproducible.** The ratchet pool evolves during a run, so the
  50th brief's generator sees different context than the 1st brief's. This is by design
  (compound improvement), but means two runs with identical briefs will not produce
  identical output.

---

## Assessment Notes for v3

The spec's v3 criteria map to these implementations:

| Spec Requirement | Implementation | Status |
|---|---|---|
| Self-healing feedback loops | Coherence loop + copy refinement: detect, diagnose, auto-fix | New in v3 |
| Quality ratchet: standards only go UP | Ratchet pool: best-of-library as dynamic few-shot, updated mid-run | New in v3 |
| Performance-per-token tracking | Already complete from v1/v2 — extend with v3 loop costs in Step 12 | Extend |
| Agentic orchestration | Researcher / Writer / Editor agents with explicit contracts | New in v3 |
| Competitive intelligence | Researcher agent: live Sonnet + web search analysis of Meta Ad Library | New in v3 |

---

## Notes for Claude Code

- Never modify any file marked COMPLETE above
- All new agent files go in `src/agents/` — do not add agent logic to existing files
- Coherence loop and copy refinement must fail gracefully: return
  `triggered: true, improved: false` on any error — never crash the pipeline
- `data/ratchet/top-ads.json` should be committed (unlike `data/ads.json`) — it's
  small and represents accumulated quality signal across runs
- Add all v3 env vars to `.env.example` with explanatory comments (already done manually)
- Write DECISION_LOG.md entries 26–32 before implementing the corresponding steps
- Do not regenerate the text or image pipeline data — reuse `data/runs/v2-production.json`
  for development and unit testing; only run the full pipeline when all steps are complete
- When the full pipeline run completes, save output to `data/runs/v3-production.json`