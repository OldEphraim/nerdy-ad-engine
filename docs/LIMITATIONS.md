# Known Limitations

_Fill this in honestly as you discover them._

---

## 1. CTA dimension structurally capped for awareness ads

The spec mandates that awareness-goal ads use "Learn More" as their CTA button. The evaluator
rubric scores CTAs on specificity, urgency, and low-friction action — "Learn More" is inherently
generic by that rubric, so awareness ads consistently score 5-6 on the `call_to_action` dimension
regardless of how strong the rest of the ad is. This is a real tension between spec compliance
(correct CTA for funnel stage) and CTA score optimization (the evaluator wants "Start your free
practice test"). We chose spec compliance — matching CTA to funnel stage is the right production
behavior, even though it costs ~1 point on the CTA dimension for half the library.

---
