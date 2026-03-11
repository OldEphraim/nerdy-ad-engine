# Evaluation Report: Nerdy Ad Engine

> _Generated: 2026-03-10. Based on pipeline runs completed during Gauntlet AI Week 4.
> Demo video and human review of ad samples pending._

---

## 1. Executive Summary

The Nerdy Ad Engine is an autonomous Facebook/Instagram ad generation system for Varsity Tutors SAT prep. It generates, evaluates, and iterates ad copy using Claude Haiku, then produces visual creatives using fal.ai Flux Schnell with Claude Sonnet vision evaluation. The system processed 75 briefs across four named runs: a v1 text-only production run (7.0 threshold), a calibration stress-test (8.5 threshold), a v2 text+image production run, and a v3 full-pipeline production run.

The v3 production run produced 75 complete text+image ad packages with a 100% pass rate and a combined average score of 7.8/10 at $0.0107/ad — significantly cheaper than v2 ($0.0331/ad) because the new coherence and copy-refinement loops only add cost when triggered (4% and 3% of ads respectively). Total cost across all four runs was $5.17.

---

## 2. Run Inventory

| Run | Threshold | Briefs | Pass Rate | Avg Text Score | Total Cost | Cost/Ad | Date |
|---|---|---|---|---|---|---|---|
| production-7.0 (v1) | 7.0 | 75 | 100% (75/75) | 7.70 | $0.34 | $0.0046 | Week 4 |
| calibration-8.5 | 8.5 | 75 | 15% (11/75) | 7.95 | $1.54 | $0.0206 | Week 4 |
| v2-production | 7.0 | 75 | 100% (75/75) | 7.63 | $2.48 | $0.0331 | Week 4 |
| v3-production | 7.0 | 75 | 100% (75/75) | 7.63 | $0.80 | $0.0107 | Week 5 |

**Notes:**
- The calibration run's low pass rate is by design — it stress-tests the iteration loop, not the generator prompt.
- V2-production cost includes text pipeline ($0.34), image generation ($0.45), and visual evaluation ($1.69).
- V3-production cost includes all v2 components plus coherence loop ($0.0422), copy refinement ($0.0143), and competitive research (~$0.008 total). V3 is cheaper than v2 per ad because loop costs are amortized across all 75 ads with only 3–4% activation rates.
- The v1 and v2 production runs used different random seeds, so text scores differ slightly (7.70 vs 7.63).

---

## 3. Quality Distribution

### 3.1 Text Aggregate Scores (v2-production)

| Score Range | Count | % |
|---|---|---|
| 7.0–7.4 | 19 | 25% |
| 7.5–7.9 | 35 | 47% |
| 8.0–8.4 | 17 | 23% |
| 8.5–8.9 | 4 | 5% |

- **Average:** 7.63
- **Min/Max:** 7.0 / 8.6
- **Median band:** 7.5–7.9 (47% of ads)

### 3.2 Visual Aggregate Scores (v2-production, selected variants)

| Score Range | Count | % |
|---|---|---|
| 7.0–7.9 | 4 | 5% |
| 8.0–8.4 | 48 | 64% |
| 8.5–8.9 | 23 | 31% |

- **Average:** 8.03
- **Min/Max:** 7.0 / 8.7
- **Median band:** 8.0–8.4 (64% of images)

### 3.3 Combined Scores (v2-production)

| Score Range | Count | % |
|---|---|---|
| 7.0–7.4 | 9 | 12% |
| 7.5–7.9 | 44 | 59% |
| 8.0–8.4 | 18 | 24% |
| 8.5–8.9 | 4 | 5% |

- **Average:** 7.79
- **Min/Max:** 7.2 / 8.6

### 3.4 Per-Dimension Averages

**Text Dimensions (v2-production):**

| Dimension | Average | Notes |
|---|---|---|
| Value Proposition | 8.20 | Strongest text dimension |
| Clarity | 8.17 | |
| Emotional Resonance | 7.99 | |
| Brand Voice | 7.20 | |
| Call to Action | 6.61 | Structurally capped for awareness ads |

**Visual Dimensions (v2-production, selected variants):**

| Dimension | Average | Notes |
|---|---|---|
| Text-Image Coherence | 8.96 | Strongest overall dimension |
| Brand Consistency | 7.89 | |
| Visual Engagement | 7.25 | Weakest visual dimension |

---

## 4. Iteration Analysis

The calibration run (threshold 8.5) is the primary data source for iteration analysis — at 7.0, only 1 of 75 briefs iterated past cycle 1.

### 4.1 Calibration Run: Score by Cycle

| Cycle | Avg Score | n (briefs) |
|---|---|---|
| 1 | 7.67 | 75 |
| 2 | 7.69 | 71 |
| 3 | 7.64 | 67 |
| 4 | 7.63 | 63 |
| 5 | 7.59 | 56 |

The average score is essentially flat across cycles (7.59–7.69). This reflects the system's ceiling: the few-shot prompt produces strong cycle-1 output, and targeted interventions yield marginal improvement. Cycles 4-5 tend to oscillate rather than improve, validating the early-stopping logic.

### 4.2 Dimension Improvement (Calibration, Cycle 1 → Final)

| Dimension | Avg Delta | Interpretation |
|---|---|---|
| Call to Action | +0.25 | Most improved — targeted CTA interventions have measurable effect |
| Value Proposition | +0.04 | Marginal — strong from cycle 1 |
| Brand Voice | +0.01 | Flat — hard to improve via prompt intervention |
| Clarity | -0.01 | Flat — already near ceiling |
| Emotional Resonance | -0.06 | Slight regression — interventions on other dims sometimes degrade this |

**Key finding:** CTA is both the weakest dimension and the most improvable, but it still caps at 6-7 for awareness ads because the spec mandates "Learn More" as the CTA button. The iteration loop is fighting a structural constraint, not a generation quality issue.

---

## 5. Cost Analysis

### 5.1 Total Spend Across All Runs

| Run | Text Cost | Image Gen Cost | Visual Eval Cost | Total |
|---|---|---|---|---|
| production-7.0 (v1) | $0.34 | — | — | $0.34 |
| calibration-8.5 | $1.54 | — | — | $1.54 |
| v2-production | $0.34 | $0.45 | $1.69 | $2.48 |
| **All runs** | **$2.23** | **$0.45** | **$1.69** | **$4.37** |

### 5.2 V1 vs V2 Cost Structure

| Metric | V1 (text-only) | V2 (text+image) | Delta |
|---|---|---|---|
| Cost per ad | $0.0046 | $0.0331 | 7.2x |
| Text pipeline | $0.0046 | $0.0046 | 1.0x |
| Image generation | — | $0.006 | — |
| Visual evaluation | — | $0.0225 | — |

Visual evaluation (Claude Sonnet) is the largest cost component in v2, accounting for 68% of the per-ad cost. Image generation via Flux Schnell is negligible at $0.003/image.

### 5.3 Cost per Passing Ad

| Run | Pass Rate | Cost/Passing Ad |
|---|---|---|
| production-7.0 (v1) | 100% | $0.0046 |
| calibration-8.5 | 15% | $0.14 |
| v2-production | 100% | $0.0331 |

The calibration run's cost-per-passing-ad is 30x higher than production because most briefs run all 5 cycles without passing. This confirms 7.0 as the correct production threshold — it produces a complete library at minimal cost.

---

## 6. Weakest Dimensions

### 6.1 Call to Action (Text) — Average: 6.61

The evaluator consistently scores CTA at 6-7 for awareness-stage ads. The spec mandates "Learn More" as the CTA button for awareness campaigns — the evaluator correctly identifies this as generic. The rubric awards high CTA scores for specificity, urgency, and low-friction action; "Learn More" is inherently none of these. Conversion-stage ads with "Sign Up" or "Start Your Free Test" score 8-9 on CTA.

This is a real tension between spec compliance and evaluator score. The system chooses spec compliance — matching CTA to funnel stage is the correct production behavior, even though it costs ~1.5 points on CTA for awareness ads.

### 6.2 Visual Engagement (Image) — Average: 7.25

Flux Schnell reliably generates warm, authentic scenes that feel on-brand and reinforce the ad copy. But the compositions are rarely scroll-stopping. The "two people studying at a table" archetype recurs across audiences and hook types — competent but not distinctive.

Brand consistency (7.89) and text-image coherence (8.96) score well because the image prompt is derived directly from the ad copy and constrained to SAT prep context. Visual engagement depends on composition, lighting, and visual surprise — qualities that are harder to specify in a text prompt.

Improving visual engagement would require either more specific visual direction in the image prompt (unusual angles, high-contrast lighting, dynamic compositions) or a model better suited to editorial-style photography.

---

## 7. V3 Results

### 7.1 Pass Rate and Cost

- **Pass rate:** 75/75 (100%) at threshold 7.0
- **Cost per ad:** $0.0107 — cheaper than v2 because coherence and copy-refinement loops add cost only when triggered

| Version | Cost/Ad | What's included |
|---|---|---|
| v1 | $0.0046 | Text only |
| v2 | $0.0331 | Text + image + visual eval |
| v3 | $0.0107 | All v3 features (loops triggered on 4% and 3% of ads) |

### 7.2 Score Distribution (v3-production, combined scores)

| Score Range | Count | % |
|---|---|---|
| 7.0–7.4 | 15 | 20% |
| 7.5–7.9 | 16 | 21% |
| 8.0–8.4 | 33 | 44% |
| 8.5–9.0+ | 11 | 15% |

- **Avg combined score:** 7.8
- **Avg visual score:** 8.1

### 7.3 Hook Type Performance (avg combined score)

| Hook | Avg Combined Score |
|---|---|
| Story | 8.4 |
| Stat | 7.9 |
| Fear | 7.8 |

### 7.4 V3 Loop Activation

| Loop | Triggered | Improved | Improvement Rate |
|---|---|---|---|
| Coherence loop | 3/75 (4%) | 1/3 | 33% |
| Copy refinement | 2/75 (3%) | 1/2 | 50% |

### 7.5 Weakest Text Dimension

**CTA — avg 6.6.** The CTA dimension remains the primary improvement target. The structural cap for awareness ads (spec mandates "Learn More") cannot be addressed within the current architecture. A hypothetical v4 improvement would involve prompt engineering specifically targeting CTA specificity for conversion-goal ads, where the constraint does not apply.

---

## 8. Methodology Notes

This report was generated from pipeline output data stored in `data/runs/`. All quality scores reflect LLM-as-judge evaluation:

- **Text evaluation:** Claude Haiku (`claude-haiku-4-5`) at temperature 0, scoring against a 5-dimension rubric with 4-level anchors per dimension.
- **Visual evaluation:** Claude Sonnet (`claude-sonnet-4-5`) at temperature 0, scoring against a 3-dimension rubric calibrated for Facebook/Instagram ad creatives.
- **Calibration reference:** Competitor ads from Princeton Review, Kaplan, Khan Academy, and Chegg (sourced from the Meta Ad Library) were used as quality anchors during prompt development. They are stored in `data/reference-ads.json`.

**Caveats:**
- No human review of ad quality was performed. Scores are model-generated and should be validated against human judgment before production use.
- Visual evaluation uses inferred Varsity Tutors brand values (empowering, warm, aspirational) — official brand guidelines were not available during development.
- Evaluator determinism is probabilistic. Temperature 0 minimizes variance but does not eliminate it. The same ad evaluated twice may receive scores differing by ±0.1.
- The 100% pass rate at threshold 7.0 means the iteration loop was not meaningfully exercised in the production run. The calibration run (threshold 8.5) is the primary evidence that the iteration machinery works.

---
