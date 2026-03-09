# CLAUDE.md — Nerdy Ad Engine v2

> **Hiring Partner:** Nerdy (Varsity Tutors) · **Stack:** TypeScript, Next.js, React, Node.js

---

## Project Context

This is v2 of the Nerdy Autonomous Ad Engine. **The v1 text pipeline is complete and working.**
Do not modify any v1 logic unless explicitly instructed. Only extend it.

v2 adds the image layer: generate a visual creative for each passing text ad, evaluate it
against brand and engagement criteria, and surface complete text+image ad packages.

The v1 codebase you're starting from includes:
- Full text generation pipeline (generator, evaluator, iteration loop, library, trends)
- 75 ads generated and passing at 7.0 threshold, saved in `data/ads.json`
- Two named runs in `data/runs/` (production-7.0 and calibration-8.5)
- Next.js dashboard with ad library, quality trends, run selector
- 41 passing tests across 4 test files
- Decision log with 17 entries, LIMITATIONS.md, README.md

---

## What v2 Adds

1. **Image generation** — For each passing text ad, generate a Facebook/Instagram-format
   visual using fal.ai (Flux Schnell). The image prompt is derived from the ad copy.
2. **Visual evaluation** — Evaluate each image on 3 new dimensions using Claude Sonnet's
   vision capability.
3. **A/B variant generation** — Generate 2 image variants per brief, surface the better one.
4. **Multi-model orchestration** — Claude Haiku (text), fal.ai Flux Schnell (images),
   Claude Sonnet (visual evaluation).
5. **Combined scoring** — Final score = text × 0.6 + image × 0.4. Only complete
   text+image packages surface in the final library.
6. **Extended dashboard** — Image thumbnail in ad detail, combined score column,
   dual-line trend chart.

---

## Multi-Model Architecture

| Task | Model | Why |
|---|---|---|
| Text generation | `claude-haiku-4-5` (temp 0.7) | Fast, cheap, strong creative writing — unchanged from v1 |
| Text evaluation | `claude-haiku-4-5` (temp 0) | Deterministic scoring — unchanged from v1 |
| Image generation | fal.ai Flux Schnell | Fast (~2s), cheap ($0.003/image), good UGC-style output |
| Visual evaluation | `claude-sonnet-4-5` (temp 0) | Vision-capable; Haiku vision is insufficient for brand assessment |

**Cost estimate per ad:**
- Text pipeline: ~$0.005 (same as v1)
- Image generation: ~$0.003/image × 2 variants = $0.006
- Visual evaluation: ~$0.008 (Sonnet is more expensive than Haiku)
- **Total: ~$0.019/ad** (~4x v1 cost, justified by the image layer)

---

## Brand Context: Varsity Tutors (Nerdy)

*(Carried from v1 — still applies to image generation and visual evaluation)*

**Voice:** Empowering, knowledgeable, approachable, results-focused.
- Lead with outcomes, not features
- Confident but not arrogant. Expert but not elitist.
- Meet people where they are

**Primary audience for this project:** SAT test prep
- Parents anxious about college admissions
- High school students stressed about scores
- Families comparing prep options (Princeton Review, Khan Academy, Chegg, Kaplan)

**What works on Meta right now:**
- Authentic > polished. UGC-style outperforms studio creative.
- Story-driven > feature-list. Pain point → solution → proof → CTA.
- Pattern interrupts. Scroll-stopping hooks in the first line.
- Social proof (reviews, testimonials, numbers) builds trust.

---

## Ad Anatomy (Meta Platform) — v2 Update

```
+----------------------------------+
| Varsity Tutors · Sponsored       |
|                                  |
| PRIMARY TEXT                     |  <- Text pipeline (v1, complete)
| (~125 chars visible before       |
|  "...See More")                  |
|                                  |
| +-----------IMAGE--------------+ |  <- NEW in v2: fal.ai Flux Schnell
| |  1200x628px (1.91:1 ratio)   | |     Generated from ad copy context
| +------------------------------+ |
|                                  |
| HEADLINE                         |  <- Text pipeline (v1, complete)
| Description text                 |
| [ Learn More / Sign Up ]         |
+----------------------------------+
```

---

## Quality Dimensions

### Text Dimensions (v1, complete — do not modify evaluator)

| # | Dimension | Score 1 | Score 10 |
|---|---|---|---|
| 1 | **Clarity** | Confusing, competing messages | Crystal clear in <3 seconds |
| 2 | **Value Proposition** | Generic ("we have tutors") | Specific ("200+ point improvement") |
| 3 | **Call to Action** | No CTA or vague | Specific, urgent, low-friction |
| 4 | **Brand Voice** | Generic, could be anyone | Distinctly Varsity Tutors |
| 5 | **Emotional Resonance** | Flat, purely rational | Taps real motivation |

### Visual Dimensions (v2, NEW)

| # | Dimension | What It Measures |
|---|---|---|
| 6 | **Brand Consistency** | Does the image feel like Varsity Tutors? Colors, tone, professionalism. |
| 7 | **Visual Engagement** | Would this stop a scroll? Composition, contrast, focal point. |
| 8 | **Text-Image Coherence** | Does the image reinforce the ad copy's message and emotional hook? |

Visual dimensions scored 1-10, equal weight (0.33 each).
Visual quality threshold: 7.0/10 (same as text).
Combined threshold: text_score × 0.6 + image_score × 0.4 ≥ 7.0

---

## Image Prompt Strategy

The image prompt is generated by Claude Haiku from the ad copy. Key constraints:
- **No text in the image** — Facebook renders ad copy as overlay
- SAT prep context: students studying, parent/child interactions, campus scenes
- Authentic over polished — UGC-style outperforms studio creative on Meta
- Avoid stock photo clichés (people staring at laptops, generic handshakes)
- Consistent style: warm, realistic, aspirational — not illustrated or abstract

Image dimensions: 1200×628px (Facebook link format, 1.91:1 ratio)

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

# v2 additions
FAL_KEY=                           # Get from fal.ai/dashboard
IMAGE_MODEL=fal-ai/flux/schnell    # Fast, cheap, good UGC-style output
VISUAL_EVALUATOR_MODEL=claude-sonnet-4-5
IMAGE_VARIANTS=2                   # A/B variants per passing ad
IMAGE_WIDTH=1200
IMAGE_HEIGHT=628
TEXT_SCORE_WEIGHT=0.6              # Text drives Meta performance more than visuals
IMAGE_SCORE_WEIGHT=0.4             # Must sum to 1.0 with TEXT_SCORE_WEIGHT
```

---

## Directory Structure

```
ad-engine-v2/
├── src/
│   ├── generate/
│   │   ├── briefs.ts           # COMPLETE — do not modify
│   │   ├── generator.ts        # COMPLETE — do not modify
│   │   ├── prompts.ts          # EXTEND: add buildImagePrompt(ad, brief)
│   │   └── image-generator.ts  # NEW: fal.ai Flux Schnell integration
│   ├── evaluate/
│   │   ├── evaluator.ts        # COMPLETE — do not modify
│   │   ├── dimensions.ts       # COMPLETE — do not modify
│   │   └── visual-evaluator.ts # NEW: Claude Sonnet vision evaluation
│   ├── iterate/
│   │   ├── loop.ts             # EXTEND: image pipeline after text pass
│   │   └── strategies.ts       # COMPLETE — do not modify
│   ├── output/
│   │   ├── library.ts          # EXTEND: store image URLs + visual scores
│   │   ├── trends.ts           # EXTEND: combined score trend
│   │   └── images.ts           # NEW: image download + local storage
│   ├── index.ts                # EXTEND: orchestrate full text+image pipeline
│   └── types.ts                # EXTEND: ImageResult, VisualEvaluation, CombinedAdEntry
├── dashboard/
│   └── app/
│       ├── page.tsx            # EXTEND: image thumbnail in expanded row
│       ├── trends/page.tsx     # EXTEND: dual-line chart (text + combined)
│       └── api/
│           ├── ads/route.ts    # EXTEND: serve combined entries
│           └── images/[id]/route.ts  # NEW: serve local image files
├── data/
│   ├── ads.json                # Production run data (gitignored)
│   ├── images/                 # NEW: downloaded images (gitignored)
│   └── runs/                   # Named run archives (committed)
├── docs/
│   ├── DECISION_LOG.md         # EXTEND: entries 13+ for v2 decisions
│   ├── LIMITATIONS.md          # EXTEND: add v2 limitations
│   └── v1-CLAUDE.md            # Archived v1 implementation guide
└── tests/
    ├── briefs.test.ts          # COMPLETE — no changes needed
    ├── library.test.ts         # EXTEND: test combined scoring
    ├── generator.test.ts       # EXTEND: test buildImagePrompt
    ├── spec-compliance.test.ts # EXTEND: image fields, visual scores
    └── visual-evaluator.test.ts # NEW: mock vision API tests
```

---

## Step-by-Step Implementation Guide

*Steps 1–9 from v1 are complete. Steps below are v2-only.*

### Step 1 — Extend types.ts

Add new interfaces without touching existing ones:

```typescript
export interface ImageResult {
  url: string;           // fal.ai CDN URL (expires ~1 hour)
  localPath: string;     // data/images/{uuid}.jpg (permanent)
  width: number;
  height: number;
  seed: number;
  generationTimeMs: number;
  costUsd: number;
}

export interface VisualDimensionScore {
  dimension: 'brand_consistency' | 'visual_engagement' | 'text_image_coherence';
  score: number;         // 1–10
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface VisualEvaluation {
  imageLocalPath: string;
  scores: VisualDimensionScore[];
  aggregateScore: number;
  passesThreshold: boolean;
  weakestDimension: VisualDimensionScore;
  evaluatedAt: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AdVariant {
  imageResult: ImageResult;
  visualEvaluation: VisualEvaluation;
}

export interface CombinedAdEntry extends AdLibraryEntry {
  selectedVariant: AdVariant;
  allVariants: AdVariant[];
  combinedScore: number;      // text * 0.6 + image * 0.4
  textScoreWeight: number;    // 0.6
  imageScoreWeight: number;   // 0.4
}

export const VISUAL_DIMENSION_NAMES = [
  'brand_consistency', 'visual_engagement', 'text_image_coherence'
] as const;
```

### Step 2 — Add buildImagePrompt() to prompts.ts

```typescript
export function buildImagePrompt(ad: GeneratedAd, brief: AdBrief): string
```

Calls Claude Haiku to generate a Flux-compatible image prompt from the ad copy.
Output: a single descriptive paragraph describing the scene — NOT JSON.

System prompt constraints to inject:
- No text, logos, or words in the image
- Authentic UGC style — looks like a real photo, not a stock image
- SAT prep context appropriate to the brief's audience
- Warm, realistic lighting; aspirational but not staged
- 1200x628px Facebook format (landscape)

### Step 3 — Implement src/generate/image-generator.ts

```typescript
import * as fal from '@fal-ai/client';

export async function generateImageVariants(
  prompt: string,
  count: number = parseInt(process.env.IMAGE_VARIANTS ?? '2')
): Promise<ImageResult[]>
```

- Install: `pnpm add @fal-ai/client`
- Use model: `process.env.IMAGE_MODEL ?? 'fal-ai/flux/schnell'`
- Generate each variant with a different seed for visual diversity
- **Download immediately** — fal.ai URLs expire in ~1 hour
- Save to `data/images/{uuid}.jpg`, populate `localPath`
- Track `generationTimeMs` and estimate `costUsd` ($0.003/image for Flux Schnell)
- Wrap in try/catch — image generation can fail silently

### Step 4 — Implement src/evaluate/visual-evaluator.ts

```typescript
export async function evaluateImage(
  localPath: string,
  ad: GeneratedAd,
  brief: AdBrief
): Promise<VisualEvaluation>
```

- Read image file from `localPath`, encode as base64
- Pass to Claude Sonnet as vision input (multimodal message)
- System prompt structure:
  - Expert visual creative director persona
  - 4-level rubric anchors (1, 5, 7, 10) for each of 3 visual dimensions
  - Independence instruction: score each dimension on its own merits
  - JSON-only output, no markdown fences
- temperature: 0 (deterministic, same principle as text evaluator)

### Step 5 — Extend src/iterate/loop.ts

After `iterateToQuality()` returns a passing text ad, extend the record:

```
1. buildImagePrompt(finalAd, brief) → imagePromptText
2. generateImageVariants(imagePromptText, 2) → [variantA, variantB]
3. evaluateImage(variantA.localPath, finalAd, brief) → evalA
4. evaluateImage(variantB.localPath, finalAd, brief) → evalB
5. selectedVariant = evalA.aggregateScore >= evalB.aggregateScore ? variantA+evalA : variantB+evalB
6. combinedScore = finalEval.aggregateScore * 0.6 + selectedVariant.visualEvaluation.aggregateScore * 0.4
7. Return CombinedAdEntry
```

If image generation fails (network error, fal.ai outage), log the error and return the
text-only result — don't let image failures kill the text pipeline.

### Step 6 — Extend src/output/library.ts and src/index.ts

- `appendToLibrary()` handles `CombinedAdEntry` (check for `selectedVariant` field)
- `getImageStats()`: returns pass rate for image layer, avg visual scores by dimension
- `index.ts` summary: add image stats — variants generated, image pass rate, avg visual score,
  total cost including image generation

### Step 7 — Extend dashboard

- `/api/images/[id]/route.ts` — serves local image files from `data/images/`
- `page.tsx` ad detail row — add image thumbnail above dimension scores
- Add `Combined Score` column to the table (alongside text score)
- Add visual dimension scores (brand consistency, visual engagement, text-image coherence)
  to the detail view
- `trends/page.tsx` — dual-line Recharts chart: text score (blue) + combined score (green)

### Step 8 — Update tests

**spec-compliance.test.ts** — add to existing suite:
```typescript
it('every library entry has an image result', () => { ... });
it('every library entry has a visual evaluation with 3 dimensions', () => { ... });
it('combinedScore = text * 0.6 + image * 0.4 within ±0.05', () => { ... });
it('selectedVariant is the higher-scoring of the two variants', () => { ... });
```

**visual-evaluator.test.ts** — new file:
- Mock fal.ai client and Claude Sonnet vision call
- Test score aggregation across 3 visual dimensions
- Test variant selection logic (picks higher score, not first)
- Test graceful failure when image generation throws

---

## Assessment Weights

*(Same as v1 — reproduced here for reference during build)*

| Area | Weight | Focus |
|---|---|---|
| Quality Measurement & Evaluation | 25% | Can the system tell good ads from bad? |
| System Design & Architecture | 20% | Is the system well-built and resilient? |
| Iteration & Improvement | 20% | Does ad quality measurably improve? |
| Speed of Optimization | 15% | How efficiently does the system iterate? |
| Documentation & Individual Thinking | 20% | Can we see YOUR mind at work? |

### Bonus Points Available

| Achievement | Bonus | Status |
|---|---|---|
| Self-healing / automatic quality improvement | +7 | Partial — best-of-N selection |
| Multi-model orchestration with clear rationale | +3 | **NEW in v2** |
| Performance-per-token tracking (ROI awareness) | +2 | Complete in v1 |
| Quality trend visualization | +2 | Complete in v1 |
| Competitive intelligence from Meta Ad Library | +10 | Complete in v1 |

---

## Competitive Intelligence

*(Complete from v1 — reproduced for reference. Do not re-run unless adding new competitor data.)*

Competitor ads from Princeton Review, Kaplan, Khan Academy, and Chegg are saved in
`data/reference-ads.json`. Key patterns documented in `DECISION_LOG.md`:
- Story hooks and stat hooks outperform question hooks for conversion
- "Free diagnostic test" is the dominant competitor CTA
- Emotional angle: fear of falling behind > aspiration for awareness; specific score
  improvement numbers for conversion

---

## Submission Checklist

### v1 — Complete
- [x] `pnpm generate` runs end-to-end without errors
- [x] `pnpm test` is fully green (41 tests)
- [x] 75 ads in `data/ads.json` with full evaluation scores
- [x] Quality trend shows measurable improvement across cycles
- [x] `DECISION_LOG.md` with 13 entries
- [x] `LIMITATIONS.md` with substantive limitations
- [x] Dashboard with ad library, quality trends, run selector
- [x] README with clear setup and usage instructions
- [x] Cost per ad estimated and documented

### v2 — In Progress
- [ ] Image generation working (`pnpm generate` produces images)
- [ ] Visual evaluation scoring 3 dimensions per image
- [ ] A/B variant selection choosing higher-scoring image
- [ ] Combined score column in dashboard
- [ ] Image thumbnails visible in ad detail view
- [ ] Dual-line trend chart (text + combined)
- [ ] `pnpm test` still fully green with v2 tests added
- [ ] DECISION_LOG.md entries 14–18 written
- [ ] LIMITATIONS.md updated with image-layer limitations
- [ ] README updated with v2 cost table and setup

---

## First Claude Code Prompt

```
Please read the following files before doing anything:
- CLAUDE.md (v2 implementation guide — this file)
- nerdy-docs/spec.md (original project specification — focus on v2 section)
- docs/DECISION_LOG.md (v1 decisions — continue numbering from Decision 13)

This is v2 of a complete, working v1 project. Do NOT modify any existing v1 logic.
Only extend it.

Start with Step 1 and Step 2:
1. Extend src/types.ts with the v2 interfaces (ImageResult, VisualDimensionScore,
   VisualEvaluation, AdVariant, CombinedAdEntry, VISUAL_DIMENSION_NAMES)
2. Add buildImagePrompt(ad, brief) to src/generate/prompts.ts

Show me both files before proceeding to Step 3 (image-generator.ts).
Add DECISION_LOG.md entries for any non-obvious choices as you go.
```

---

## Notes for Claude Code

- Never modify v1 files except `types.ts`, `prompts.ts`, `loop.ts`, `library.ts`,
  `trends.ts`, `index.ts`, and dashboard files — and only to extend, never to change
  existing behavior
- All new API calls need try/catch with descriptive errors
- Image failures must not crash the text pipeline — degrade gracefully
- `data/images/` must be added to `.gitignore`
- Add `FAL_KEY=` to `.env.example` with a comment
- DECISION_LOG.md entries for every non-obvious choice, continuing from Decision 18
- Do not regenerate the text pipeline data — reuse v1's `data/runs/production-7.0.json`
  for development and testing of the image layer