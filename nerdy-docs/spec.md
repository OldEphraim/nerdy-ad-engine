# Autonomous Content Generation System

> **Build an Autonomous Ad Engine for Facebook & Instagram That Gets Measurably Better Per Token Spent**

---

## The Challenge

Most AI-generated ad copy is mediocre. It reads like it was made by a machine, converts poorly, and costs more to produce than the value it creates.

**Your challenge:** Build an autonomous system that generates Facebook and Instagram ad copy, knows the difference between good and bad, surfaces only its best work, and measurably improves over time. The north star metric is **performance per token** — how much quality per dollar of API spend.

This is not a prompt engineering exercise. This is a **systems engineering challenge**: generate, evaluate, iterate, and improve — with minimal human intervention.

The domain is tight and closed: paid social ads for Facebook and Instagram. That's it. No email, no landing pages, no TikTok. One channel family, one content type, done well.

---

## Why This Matters

Real ad engines produce thousands of creatives across campaigns. The ones that win share a pattern:

- **Most ads fail.** The system that surfaces only its best work wins.
- **Quality is decomposable.** "Good ad copy" is really clarity + value proposition + CTA strength + brand voice + emotional resonance, each independently measurable.
- **Improvement compounds.** A system that tracks what works and feeds it back gets better every cycle.
- **ROI is the real metric.** Not "did the AI generate something?" but "was it worth the tokens?"

---

## Project Overview

Individual or small team project.

### Deliverables

- Autonomous ad copy generation pipeline for FB/IG
- Evaluation framework with atomic quality dimensions
- Quality feedback loop demonstrating iterative improvement
- Generated ad library with evaluation scores (50+ ads)
- Decision log documenting YOUR thinking and judgment calls
- Evaluation report (JSON/CSV + summary with quality trends)

### What We're Really Evaluating

We're not testing whether you can make an API call. We're evaluating:

- **Problem decomposition:** Can you break "generate good ads" into a system of measurable, improvable parts?
- **Taste and judgment:** Do you know what good looks like? Can you teach a system to know?
- **Creative Agency:** Even if you don't know what good looks like, could you gather context strategically to build a working proof of concept?
- **Systems thinking:** Does your system handle failure? Does it know when it's producing garbage?
- **Iteration methodology:** What did you try, what worked, what didn't, and why?

> Your decision log matters as much as your output. A well-reasoned decision log with honest limitations is worth more than a polished demo with no explanation of how you got there.

---

## The Channel: Facebook & Instagram Paid Ads

You're generating ad copy for Meta's paid social platforms. Real Varsity Tutors ads and performance data will be provided in the Gauntlet/Nerdy Slack channel.

**What works on Meta right now:**

- Authentic > polished. UGC-style outperforms studio creative.
- Story-driven > feature-list. Pain point → solution → proof → CTA.
- Pattern interrupts. Scroll-stopping hooks in the first line.
- Social proof (reviews, testimonials, numbers) builds trust.
- Emotional resonance > rational argument for awareness; flip for conversion.

**Ad anatomy on Meta:**

- **Primary text:** The main copy above the image (most important — this is what stops the scroll)
- **Headline:** Bold text below the image (short, punchy)
- **Description:** Secondary text below headline (often truncated on mobile)
- **CTA button:** "Learn More", "Sign Up", "Get Started", etc.
- **Creative:** Image (out of scope for v1, in scope for v2)

> "Great artists steal." Study our biggest competitor's ads. What patterns do you see? What hooks work? What CTAs convert? The best ad systems don't invent new formats — they study what works, fit the brand into proven patterns, and iterate. A great way to do this is to grab competitor's ads and then make them our own.

---

## Quality Dimensions

Every generated ad gets scored across these five dimensions:

| Dimension | What It Measures | Score 1 (Bad) | Score 10 (Excellent) |
|---|---|---|---|
| **Clarity** | Is the message immediately understandable? | Confusing, multiple messages competing | Crystal clear single takeaway in <3 seconds |
| **Value Proposition** | Does it communicate a compelling benefit? | Generic/feature-focused ("we have tutors") | Specific, differentiated benefit ("raise your SAT score 200+ points") |
| **Call to Action** | Is the next step clear and compelling? | No CTA or vague ("learn more") | Specific, urgent, low-friction ("Start your free practice test") |
| **Brand Voice** | Does it sound like the brand? | Generic, could be anyone | Distinctly on-brand: empowering, knowledgeable, approachable |
| **Emotional Resonance** | Does it connect emotionally? | Flat, purely rational | Taps into real motivation (parent worry, student ambition, test anxiety) |

**Quality threshold:** 7.0/10 average to be considered publishable. Below that, the system should flag and regenerate.

---

## Scope Variants

Choose your ambition level. All variants are valid submissions.

### v1: Ad Copy Pipeline *(1–2 days)*

Text-only ad copy generation and evaluation.

**What you build:**
- Ad copy generator from minimal briefs (audience + product + goal)
- LLM-as-judge evaluation scoring the 5 dimensions above
- Feedback loop: generate → evaluate → identify weakest dimension → targeted regeneration → re-evaluate
- Quality threshold enforcement: 7.0/10 minimum

**Demonstrate:**
- 50+ generated ads with full evaluation scores
- Quality improvement over 3+ iteration cycles
- Which interventions improved which dimensions

*Tech: Single LLM for both generation and evaluation is fine. Rules-based baseline also acceptable.*

### v2: Multi-Modal Ads *(3–5 days)*

Everything in v1, plus:
- Image generation for ad creatives (Imagen via Gemini API, Flux, etc.)
- Visual evaluation (brand consistency, engagement potential)
- A/B variant generation — same brief, different creative approaches
- Multi-model orchestration with clear rationale for which model does what

### v3: Autonomous Ad Engine *(1–2 weeks)*

Everything in v2, plus:
- Self-healing feedback loops (detect quality drops, diagnose, auto-fix)
- Quality ratchet: standards only go UP
- Performance-per-token tracking (cost per ad, quality per dollar)
- Agentic orchestration (researcher, writer, editor, evaluator agents)
- Competitive intelligence (analyze patterns from Meta Ad Library)

---

## Brand Context: Varsity Tutors (Nerdy)

Your ads are for Varsity Tutors, a Nerdy business.

**Brand voice:** Empowering, knowledgeable, approachable, results-focused.
- Lead with outcomes, not features.
- Confident but not arrogant. Expert but not elitist.
- Meet people where they are.

**Primary audience for this project:** SAT test prep
- Parents anxious about college admissions
- High school students stressed about scores
- Families comparing prep options (Princeton Review, Khan Academy, Chegg, Kaplan)

Reference ads and performance data will be provided in the Gauntlet/Nerdy Slack channel. These are real Varsity Tutors ads with performance context. **Study them before building anything.**

---

## Inputs & Outputs

### Inputs
- **Ad Brief:** Audience segment, product/offer, campaign goal (awareness/conversion), tone
- **Brand Guidelines:** Voice, do's and don'ts (provided above)
- **Reference Ads:** Real ads and performance data (provided via Slack)
- **Evaluation Config:** Dimension weights, quality thresholds

### Outputs
- **Generated Ads:** Primary text, headline, description, CTA button recommendation
- **Evaluation Report:** Scores per dimension with rationale, aggregate score, confidence
- **Iteration Log:** Changes per cycle, metrics before/after
- **Quality Trend:** Improvement trajectory across cycles
- **Decision Log:** YOUR reasoning for design choices

---

## Technical Architecture

### Suggested Directory Structure

```
generate/   - Ad copy generation from briefs
evaluate/   - Dimension scoring, LLM-as-judge, aggregation
iterate/    - Feedback loop, improvement strategies
output/     - Formatting, export, quality trend visualization
docs/       - Decision log, limitations
```

### Models to Use

| Task | Recommended | Why |
|---|---|---|
| Ad copy generation | Gemini | Strong creative writing, good at following brand voice constraints |
| Image generation (v2) | Imagen, Nano Banana, etc. | Brand-consistent image generation |

**API setup:** Gemini API at [ai.google.dev](https://ai.google.dev) — free tier available

### Technical Specifications

- **Reproducibility:** Deterministic with seeds
- **Scale:** 50+ ads generated and evaluated
- **Quality threshold:** 7.0/10 minimum

### Constraints
- Must run locally (API keys acceptable)
- No real PII in generated content
- Document rate limits and cost considerations

### Ambiguous Elements (You Decide)

These are intentionally open. Your decisions reveal your thinking.

- **Dimension weighting:** How do you balance the 5 dimensions? Why?
- **Improvement strategies:** Re-prompting? Chain-of-thought? Few-shot? What works?
- **Failure handling:** When quality doesn't improve after N cycles, what happens?
- **Human-in-the-loop:** When should a human intervene?
- **Context management:** What context does each generation/evaluation call see?

---

## Success Criteria

| Category | Metric | Target |
|---|---|---|
| Coverage | Ads with full evaluation | 50+ |
| Dimensions | Independently measured | 5 dimensions |
| Quality | Ads meeting 7.0/10 threshold | Majority of final output |
| Improvement | Quality gain over cycles | Measurable lift across 3+ cycles |
| Explainability | Evaluations with rationales | 100% |
| Documentation | Decision log with YOUR reasoning | Complete and honest |

### Code Quality Requirements

- Clear modular structure
- One-command setup (`requirements.txt` or `package.json`)
- Concise README with setup and usage
- ≥10 unit/integration tests
- Deterministic behavior (seeds)
- Decision log explaining what you tried, what worked, what didn't, and WHY
- Explicit limitations documented

---

## Submission Requirements

- Code repository (GitHub preferred)
- Brief technical writeup (1–2 pages)
- Documentation of AI tools and prompts used
- Demo video or live walkthrough
- Generated ad samples with evaluation scores
- Quality improvement metrics and visualizations
- Decision log explaining YOUR choices and reasoning

---

## Build Strategy

1. **Study** — Review the reference ads provided via Slack. Understand what good looks like before building.
2. **Define** — Set up dimensions, rubrics, and evaluation criteria.
3. **Generate** — Build ad copy pipeline. Start simple — one audience, one model.
4. **Evaluate** — Implement scoring. Calibrate against reference ads.
5. **Iterate** — Generate → evaluate → improve → re-evaluate. Track metrics.
6. **Scale** — 50+ ads. Show quality trends.
7. **Document** — Decision log, limitations, demo. Be honest about what didn't work.

---

## Final Notes

The system that wins is the one that **knows what's good**. Not the one that generates the most, or uses the fanciest model, but the one that can reliably distinguish excellent from mediocre and push its output toward excellent.

**Core principles:**
- Decomposition over holistic judgment
- Measurable dimensions over subjective assessment
- Iterative improvement over one-shot generation
- ROI awareness over unlimited token spending
- **YOUR thinking** over the AI's output

Build a system that gets better at making ads, and knows that it's getting better.

---

# Evaluation Criteria: Autonomous Ad Generation

## Philosophy

We evaluate YOUR thinking and judgment as much as the system's output. A well-reasoned decision log with honest limitations is worth more than a polished demo with no explanation of how you got there.

## Assessment Overview

| Area | Weight | Focus |
|---|---|---|
| Quality Measurement & Evaluation | 25% | Can the system tell good ads from bad? |
| System Design & Architecture | 20% | Is the system well-built and resilient? |
| Iteration & Improvement | 20% | Does ad quality measurably improve? |
| Speed of Optimization | 15% | How efficiently does the system iterate? |
| Documentation & Individual Thinking | 20% | Can we see YOUR mind at work? |

---

### 1. Quality Measurement & Evaluation (25%)

*Does your system know what a good ad looks like? Most ads fail. The system that surfaces only its best work wins.*

**Excellent (23–25 points)**
- 5 quality dimensions scored independently with clear rubrics
- LLM-as-judge with structured rationale per score
- Calibrated against best/worst reference ads (provided via Slack)
- Confidence scoring: the evaluator knows when it's uncertain
- Quality threshold enforcement (7.0+) with automatic flagging
- Thoughtful dimension weighting with documented rationale

**Good (18–22 points)**
- 5 dimensions with automated scoring and rationales
- Some calibration against reference ads (via Slack)
- Working quality threshold
- Reasonable aggregate scoring

**Acceptable (13–17 points)**
- 4–5 dimensions, basic scoring, limited rationales
- Minimal calibration
- Threshold exists but loosely enforced

**Needs Improvement (0–12 points)**
- Fewer than 4 dimensions or manual/unexplained scoring
- No calibration, no threshold, unclear methodology

---

### 2. System Design & Architecture (20%)

*Does the system know when it's failing?*

**Excellent (18–20 points)**
- Clean, modular architecture
- Failure detection and recovery
- One-command setup, 15+ tests, deterministic
- Context management as a deliberate choice

**Good (14–17 points)**
- Reasonable modularity, basic error handling
- 10+ tests, mostly deterministic
- Setup works with minimal friction

**Acceptable (10–13 points)**
- Functional but coupled structure
- 5–10 tests, some manual setup steps

**Needs Improvement (0–9 points)**
- Disorganized code, no tests, hard to run

---

### 3. Iteration & Improvement (20%)

*Does quality measurably improve, and do you know why?*

**Excellent (18–20 points)**
- 5+ iteration cycles with clear methodology
- Measurable quality gains with identified causes
- Documents which interventions improved which dimensions
- Performance-per-token awareness

**Good (14–17 points)**
- 3–4 cycles with documented changes
- Some measurable improvement
- Identifies what worked

**Acceptable (10–13 points)**
- 2–3 cycles, mixed results
- Basic documentation

**Needs Improvement (0–9 points)**
- Fewer than 2 cycles, no demonstrated improvement

---

### 4. Speed of Optimization (15%)

*How fast and efficiently does the system iterate?*

**Excellent (14–15 points)**
- Batch generation at scale (50+ ads efficiently)
- Minimal human intervention per cycle
- Smart resource allocation

**Good (11–13 points)**
- Handles batches, reasonable automation

**Acceptable (8–10 points)**
- Works but slowly, some manual steps

**Needs Improvement (0–7 points)**
- Single-piece processing, heavy manual intervention

---

### 5. Documentation & Individual Thinking (20%)

*Can we see YOUR mind at work? This is how we distinguish candidates who think from candidates who prompt.*

**Excellent (18–20 points)**
- Decision log explaining WHY, not just what
- Honest about what doesn't work and where it breaks
- Documents failed approaches, not just successes
- Clear evidence of independent thinking

**Good (14–17 points)**
- Decision log with reasoning for major choices
- Some limitations acknowledged
- Evidence of personal judgment

**Acceptable (10–13 points)**
- Basic documentation, few limitations mentioned
- Hard to distinguish personal thinking from AI output

**Needs Improvement (0–9 points)**
- Missing decision log, no reflection, reads like pure AI output

---

## Automatic Deductions

| Condition | Deduction |
|---|---|
| No working demo | -10 |
| Cannot run with provided instructions | -10 |
| Fewer than 50 ads generated | -5 |
| No evaluation scores on generated ads | -15 |
| No iteration/improvement attempted | -10 |
| No decision log | -10 |

## Bonus Points (up to 10)

| Achievement | Bonus |
|---|---|
| Self-healing / automatic quality improvement | +7 |
| Multi-model orchestration with clear rationale | +3 |
| Performance-per-token tracking (ROI awareness) | +2 |
| Quality trend visualization | +2 |
| Competitive intelligence from Meta Ad Library | +10 |

---

## What Separates Good from Great

**Good** submissions build a pipeline that generates ads, scores them, and shows improvement.

**Great** submissions build a system that knows what good looks like, filters its own output ruthlessly, learns from failures, and can explain every decision. The candidate's thinking is visible throughout.

---

# Starter Kit: Autonomous Ad Generation

## Reference Ads

Real Varsity Tutors ads and performance data will be provided in the Gauntlet/Nerdy Slack channel. **Study these before building anything.** The patterns in the best-performing ads are the shapes your system should learn to produce.

## Model Recommendations

| Task | Recommended | Why |
|---|---|---|
| Ad copy generation | Gemini | Strong creative writing, good at following brand voice constraints |
| Image generation (v2) | Imagen, Nano Banana, etc. | Brand-consistent image generation |

**API setup:** Gemini API at [ai.google.dev](https://ai.google.dev) — free tier available

## Ad Copy Structure on Meta

Every FB/IG ad has these components. Your system should generate all of them:

```
┌─────────────────────────────────┐
│ [Brand Name] · Sponsored        │
│                                 │
│ PRIMARY TEXT                    │  ← Main copy. Stops the scroll.
│ (up to ~125 chars visible,      │    Most important element.
│  "...See More" after that)      │
│                                 │
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │           IMAGE             │ │  ← Creative (v2 scope)
│ │                             │ │
│ └─────────────────────────────┘ │
│                                 │
│ HEADLINE                        │  ← Bold, below image. Short.
│ Description text                │  ← Often truncated on mobile.
│ [CTA Button]                    │  ← "Learn More", "Sign Up", etc.
└─────────────────────────────────┘
```

**Tips:**
- **Primary text:** First line is everything. Hook or lose them.
- **Headline:** 5–8 words max. Benefit-driven.
- **Description:** Optional reinforcement. Don't rely on it.
- **CTA button:** Match the funnel stage. "Learn More" for awareness, "Sign Up" for conversion.

## Evaluation Workflow

```
Brief → Generate Ad → Score (5 dimensions) → Above 7.0?
                                               ├─ Yes → Add to library
                                               └─ No  → Identify weakest dimension
                                                        → Targeted regeneration
                                                        → Re-score
                                                        → Track improvement
```

**Key decisions you'll make:**
- How many regeneration attempts before giving up on a brief?
- Do you regenerate the whole ad or just the weak parts?
- How do you prevent the feedback loop from optimizing one dimension at the expense of others?
- When do you use expensive models vs. cheap ones?

## The Five Dimensions

1. **Clarity** — Can you get the message in <3 seconds?
2. **Value Proposition** — Is the benefit specific and compelling?
3. **Call to Action** — Is the next step obvious and low-friction?
4. **Brand Voice** — Does it sound like Varsity Tutors?
5. **Emotional Resonance** — Does it tap into real motivation?

See `examples/evaluation-sample.json` for the expected output format.

## What Works on Meta Right Now

**Hooks that stop the scroll:**
- Question: *"Is your child's SAT score holding them back?"*
- Stat: *"Students who prep score 200+ points higher on average."*
- Story: *"My daughter went from a 1050 to a 1400 in 8 weeks."*
- Fear: *"The SAT is 3 months away. Is your student ready?"*

**Body patterns:**
- Problem → agitate → solution → proof → CTA
- Testimonial → benefit → CTA
- Stat → context → offer → CTA

**What converts:**
- Specific numbers ("200+ point improvement") > vague promises ("better scores")
- Social proof (reviews, ratings, student counts) > claims
- Urgency (deadlines, limited spots) > open-ended offers
- Free trials/assessments > paid commitments as first step

## Competitive Intelligence

The Meta Ad Library is free and public:

1. Go to [facebook.com/ads/library](https://facebook.com/ads/library)
2. Search for: Princeton Review, Kaplan, Khan Academy, Chegg
3. Filter by active ads, US
4. Study: What hooks do they use? What CTAs? What visual styles?

**What to look for:**
- Recurring copy patterns across multiple ads
- CTAs that appear most often (these are likely winners)
- Emotional angles (fear vs. aspiration vs. urgency)
- How they handle specificity (numbers, timeframes, guarantees)

> This is the "great artists steal" approach. Not copying — studying what shapes work and fitting your brand into them.

## Strategic Hints

**Most ads fail.** In production, the majority of generated ads don't meet quality bar. The winning system generates many, evaluates ruthlessly, and surfaces only the best. Design for this from the start.

**Performance per token.** Every API call costs money. Track your cost per ad. Which model gives you the best quality-per-dollar? This matters at scale and it's what separates a prototype from a production system.

**The taste problem.** The hardest part isn't generation — it's evaluation. Can your system reliably tell an 8/10 ad from a 5/10? If it can, the rest is plumbing. If it can't, nothing else matters. Spend your time here.

**Calibrate early.** Before generating anything, run your evaluator against the reference ads provided via Slack. If it can't score the best ads high and the worst ads low, fix that before moving on.

## Getting Started Checklist

- [ ] Study the reference ads provided via the Gauntlet/Nerdy Slack channel
- [ ] Build your evaluator first — score the reference ads, calibrate
- [ ] Build a simple generator — one audience, one offer
- [ ] Wire the feedback loop — generate, evaluate, regenerate
- [ ] Scale to 50+ ads, track quality trends
- [ ] Write your decision log as you go, not at the end