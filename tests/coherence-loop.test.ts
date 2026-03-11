import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  GeneratedAd, AdBrief, AdLibraryEntry, EvaluationResult,
  VisualEvaluation, ImageResult, CoherenceLoopResult, CopyRefinementResult,
  CombinedAdEntryV3,
} from '../src/types.js';

// ── Mocks — must be declared before imports that use them ───────────────────

// Use vi.hoisted so mockMessagesCreate is available inside vi.mock factories
const { mockMessagesCreate } = vi.hoisted(() => {
  const mockMessagesCreate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{ "side": "image", "copySideSignal": null }' }],
    usage: { input_tokens: 100, output_tokens: 50 },
    model: 'claude-haiku-4-5',
  });
  return { mockMessagesCreate };
});

// Mock Anthropic SDK globally — used by generator.ts, evaluator.ts, loop.ts at module level
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockMessagesCreate };
    constructor(_opts?: Record<string, unknown>) {}
  }
  return { default: MockAnthropic };
});

vi.mock('../src/generate/prompts.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/generate/prompts.js')>();
  return {
    ...original,
    buildImagePrompt: vi.fn().mockResolvedValue('A warm photo of a student studying.'),
  };
});

vi.mock('../src/generate/image-generator.js', () => ({
  generateImageVariants: vi.fn(),
}));

vi.mock('../src/evaluate/visual-evaluator.js', () => ({
  evaluateImage: vi.fn(),
}));

// Mock generator and evaluator — they import Anthropic at module level
vi.mock('../src/generate/generator.js', () => ({
  generateAd: vi.fn(),
  regenerateAd: vi.fn(),
  parseGeneratorResponse: vi.fn(),
}));

vi.mock('../src/evaluate/evaluator.js', () => ({
  evaluateAd: vi.fn(),
}));

import { generateImageVariants } from '../src/generate/image-generator.js';
import { evaluateImage } from '../src/evaluate/visual-evaluator.js';
import { runImagePipeline } from '../src/iterate/loop.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeAd(overrides: Partial<GeneratedAd> = {}): GeneratedAd {
  return {
    id: 'ad-test-1',
    briefId: 'brief-parents_anxious-conversion-question-run1',
    primaryText: 'Is your child spending hours studying with nothing to show for it?',
    headline: 'SAT Scores Up 200+ Points',
    description: 'Expert 1-on-1 tutoring.',
    ctaButton: 'Sign Up',
    generatedAt: new Date().toISOString(),
    modelUsed: 'claude-haiku-4-5',
    iterationCycle: 1,
    inputTokens: 100,
    outputTokens: 50,
    ...overrides,
  };
}

function makeBrief(overrides: Partial<AdBrief> = {}): AdBrief {
  return {
    id: 'brief-parents_anxious-conversion-question-run1',
    audience: 'parents_anxious',
    goal: 'conversion',
    hookType: 'question',
    ...overrides,
  };
}

function makeImageResult(): ImageResult {
  return {
    url: 'https://cdn.fal.ai/test.jpg',
    localPath: 'data/images/test.jpg',
    width: 1200,
    height: 628,
    seed: 12345,
    generationTimeMs: 2000,
    costUsd: 0.003,
  };
}

function makeVisualEval(coherenceScore: number): VisualEvaluation {
  const scores = [
    { dimension: 'brand_consistency' as const, score: 8, rationale: 'Good brand fit', confidence: 'high' as const },
    { dimension: 'visual_engagement' as const, score: 8, rationale: 'Engaging visuals', confidence: 'high' as const },
    { dimension: 'text_image_coherence' as const, score: coherenceScore, rationale: `Coherence score is ${coherenceScore}. The image does not match the copy tone.`, confidence: 'high' as const },
  ];
  const aggregate = Math.round(scores.reduce((s, v) => s + v.score, 0) / 3 * 10) / 10;
  return {
    imageLocalPath: 'data/images/test.jpg',
    scores,
    aggregateScore: aggregate,
    passesThreshold: aggregate >= 7.0,
    weakestDimension: scores.reduce((w, s) => s.score < w.score ? s : w),
    evaluatedAt: new Date().toISOString(),
    inputTokens: 500,
    outputTokens: 300,
  };
}

function makeEntry(ad?: GeneratedAd): AdLibraryEntry {
  const a = ad ?? makeAd();
  const scores = [
    { dimension: 'clarity' as const, score: 8, rationale: 'Clear', confidence: 'high' as const },
    { dimension: 'value_proposition' as const, score: 8, rationale: 'Strong', confidence: 'high' as const },
    { dimension: 'call_to_action' as const, score: 7, rationale: 'OK', confidence: 'high' as const },
    { dimension: 'brand_voice' as const, score: 8, rationale: 'On brand', confidence: 'high' as const },
    { dimension: 'emotional_resonance' as const, score: 8, rationale: 'Resonant', confidence: 'high' as const },
  ];
  return {
    ad: a,
    evaluation: {
      adId: a.id,
      scores,
      aggregateScore: 7.8,
      passesThreshold: true,
      weakestDimension: scores[2]!,
      evaluatedAt: new Date().toISOString(),
      inputTokens: 200,
      outputTokens: 150,
    },
    iterationHistory: {
      briefId: a.briefId,
      cycles: [{ cycle: 1, ad: a, evaluation: null as never, improvementDelta: 0 }],
      converged: true,
      totalInputTokens: 300,
      totalOutputTokens: 200,
      estimatedCostUsd: 0.001,
    },
  };
}

function makeDefaultCoherenceLoop(): CoherenceLoopResult {
  return {
    triggered: false, triggerScore: 10, triggerRationale: '',
    revisedPrompt: '', variant3: null, variant3Score: null,
    improved: false, costUsd: 0,
  };
}

function makeDefaultCopyRefinement(ad: GeneratedAd): CopyRefinementResult {
  return {
    triggered: false, copySideSignal: null, originalCopy: ad.primaryText,
    refinedAd: null, refinedTextScore: null, refinedCombinedScore: null,
    improved: false, costUsd: 0,
  };
}

// ── Setup helpers ───────────────────────────────────────────────────────────

function setupImageMocks(coherenceScore: number) {
  const imgResult = makeImageResult();
  const visualEval = makeVisualEval(coherenceScore);

  vi.mocked(generateImageVariants).mockResolvedValue([imgResult, { ...imgResult, seed: 99999 }]);
  vi.mocked(evaluateImage).mockResolvedValue(visualEval);

  return { imgResult, visualEval };
}

// ── Prompt tests ────────────────────────────────────────────────────────────

describe('buildCoherenceRevisionPrompt', () => {
  it('includes the evaluator rationale and ad copy', async () => {
    const { buildCoherenceRevisionPrompt } = await import('../src/generate/prompts.js');
    const ad = makeAd();
    const brief = makeBrief();
    const originalPrompt = 'A warm, sunlit classroom with a student studying at a desk.';
    const rationale = 'The image shows a generic classroom but the copy talks about one-on-one mentorship.';

    const result = buildCoherenceRevisionPrompt(ad, brief, originalPrompt, rationale);

    expect(result).toContain(rationale);
    expect(result).toContain(ad.primaryText);
    expect(result).toContain(ad.headline);
    expect(result).toContain(originalPrompt);
    expect(result).toContain('REVISION NEEDED');
  });
});

describe('buildCopyRefinementPrompt', () => {
  it('includes the image description and copy-side signal', async () => {
    const { buildCopyRefinementPrompt } = await import('../src/generate/prompts.js');
    const ad = makeAd();
    const brief = makeBrief();
    const imageDescription = 'A warm scene of a parent and child working together.';
    const signal = 'The copy is clinical and feature-driven but the image is warm and relational.';

    const result = buildCopyRefinementPrompt(ad, brief, imageDescription, signal);

    expect(result).toContain(imageDescription);
    expect(result).toContain(signal);
    expect(result).toContain(ad.primaryText);
    expect(result).toContain('COPY REFINEMENT');
    expect(result).toContain('JSON');
  });
});

// ── Coherence loop integration tests ────────────────────────────────────────

describe('Coherence loop logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers coherence loop when text_image_coherence < 7.5', async () => {
    setupImageMocks(6.0); // coherence 6.0 < 7.5 threshold

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(true);
    expect(result!.coherenceLoop.triggerScore).toBe(6.0);
    // Should have called generateImageVariants twice: once for initial 2 variants, once for variant 3
    expect(generateImageVariants).toHaveBeenCalledTimes(2);
  });

  it('does NOT trigger coherence loop when text_image_coherence >= 7.5', async () => {
    setupImageMocks(8.0); // coherence 8.0 >= 7.5 threshold

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(false);
    expect(result!.coherenceLoop.triggerScore).toBe(10); // default
    // Should have called generateImageVariants only once for the initial 2 variants
    expect(generateImageVariants).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger coherence loop at exactly the threshold (7.5)', async () => {
    setupImageMocks(7.5);

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(false);
    expect(generateImageVariants).toHaveBeenCalledTimes(1);
  });

  it('variant 3 replaces winner when variant3 has higher aggregate score', async () => {
    const lowCoherenceEval = makeVisualEval(5.0);  // aggregate ~7.0
    const highCoherenceEval = makeVisualEval(9.0);  // aggregate ~8.3

    vi.mocked(generateImageVariants).mockResolvedValue([makeImageResult(), makeImageResult()]);
    // First two calls return low coherence, third call (variant 3) returns high
    vi.mocked(evaluateImage)
      .mockResolvedValueOnce(lowCoherenceEval)   // variant 1
      .mockResolvedValueOnce(lowCoherenceEval)   // variant 2
      .mockResolvedValueOnce(highCoherenceEval); // variant 3

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(true);
    expect(result!.coherenceLoop.improved).toBe(true);
    expect(result!.coherenceLoop.variant3Score).toBe(highCoherenceEval.aggregateScore);
  });

  it('variant 3 does NOT replace winner when score is lower', async () => {
    const eval1 = makeVisualEval(6.0);  // aggregate ~7.3
    const lowerEval = makeVisualEval(4.0); // aggregate ~6.7

    vi.mocked(generateImageVariants).mockResolvedValue([makeImageResult(), makeImageResult()]);
    vi.mocked(evaluateImage)
      .mockResolvedValueOnce(eval1)     // variant 1
      .mockResolvedValueOnce(eval1)     // variant 2
      .mockResolvedValueOnce(lowerEval); // variant 3 — worse

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(true);
    expect(result!.coherenceLoop.improved).toBe(false);
  });

  it('gracefully handles variant 3 generation failure', async () => {
    setupImageMocks(5.0); // triggers loop
    // First call succeeds (initial variants), second call throws (variant 3)
    vi.mocked(generateImageVariants)
      .mockResolvedValueOnce([makeImageResult(), makeImageResult()])
      .mockRejectedValueOnce(new Error('fal.ai timeout'));

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(true);
    expect(result!.coherenceLoop.improved).toBe(false);
  });

  it('records coherence loop cost when variant 3 is generated', async () => {
    const lowEval = makeVisualEval(5.0);
    const v3Eval = makeVisualEval(9.0);

    vi.mocked(generateImageVariants).mockResolvedValue([makeImageResult(), makeImageResult()]);
    vi.mocked(evaluateImage)
      .mockResolvedValueOnce(lowEval)
      .mockResolvedValueOnce(lowEval)
      .mockResolvedValueOnce(v3Eval);

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.costUsd).toBeGreaterThan(0);
  });

  it('records revised prompt in coherenceLoop result', async () => {
    setupImageMocks(5.0);

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(true);
    expect(result!.coherenceLoop.revisedPrompt.length).toBeGreaterThan(0);
  });

  it('adds variant 3 to allVariants array', async () => {
    setupImageMocks(5.0);

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    // 2 initial + 1 variant 3 = 3 total
    expect(result!.allVariants.length).toBe(3);
  });

  it('returns default v3 fields (ratchetExamplesUsed, agentTrace) for caller to set', async () => {
    setupImageMocks(8.0);

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.ratchetExamplesUsed).toBe(0);
    expect(result!.competitorInsightsUsed).toBe(false);
    expect(result!.agentTrace.researcherMs).toBe(0);
    expect(result!.agentTrace.writerMs).toBe(0);
    expect(result!.agentTrace.editorMs).toBe(0);
  });
});

// ── Copy refinement integration tests ───────────────────────────────────────

describe('Copy refinement logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers copy refinement when coherence stays below 7.0 and signal is copy-side', async () => {
    // Set up: coherence at 6.0 (triggers coherence loop), variant 3 doesn't improve,
    // so post-loop coherence is still 6.0 < 7.0 → triggers copy refinement
    setupImageMocks(6.0);

    // Mock detectCopySideSignal to return copy-side signal
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ "side": "copy", "copySideSignal": "Copy is too clinical for this warm image" }' }],
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'claude-haiku-4-5',
    });

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.copyRefinement.triggered).toBe(true);
    expect(result!.copyRefinement.copySideSignal).toBe('Copy is too clinical for this warm image');
  });

  it('does NOT trigger copy refinement when coherence is >= 7.0', async () => {
    setupImageMocks(8.0); // well above both thresholds

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.copyRefinement.triggered).toBe(false);
    expect(result!.copyRefinement.copySideSignal).toBeNull();
  });

  it('does NOT trigger copy refinement when signal is image-side only', async () => {
    setupImageMocks(6.0); // triggers coherence loop

    // Mock returns image-side signal
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{ "side": "image", "copySideSignal": null }' }],
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'claude-haiku-4-5',
    });

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    // Coherence loop should trigger (score 6.0 < 7.5)
    expect(result!.coherenceLoop.triggered).toBe(true);
    // Copy refinement triggers (6.0 < 7.0) but signal is image-side → no actual refinement
    expect(result!.copyRefinement.triggered).toBe(true);
    expect(result!.copyRefinement.copySideSignal).toBeNull();
    expect(result!.copyRefinement.improved).toBe(false);
  });

  it('copy refinement does not trigger when coherence loop improved score above threshold', async () => {
    const lowEval = makeVisualEval(6.0);  // triggers coherence loop
    const highEval = makeVisualEval(9.0); // variant 3 pushes coherence above 7.0

    vi.mocked(generateImageVariants).mockResolvedValue([makeImageResult(), makeImageResult()]);
    vi.mocked(evaluateImage)
      .mockResolvedValueOnce(lowEval)   // variant 1
      .mockResolvedValueOnce(lowEval)   // variant 2
      .mockResolvedValueOnce(highEval); // variant 3 — big improvement

    const result = await runImagePipeline(makeEntry(), makeBrief());

    expect(result).not.toBeNull();
    expect(result!.coherenceLoop.triggered).toBe(true);
    expect(result!.coherenceLoop.improved).toBe(true);
    // Post-loop coherence is 9.0 >= 7.0 → copy refinement should NOT trigger
    expect(result!.copyRefinement.triggered).toBe(false);
  });
});

// ── V3 type shape tests ─────────────────────────────────────────────────────

describe('V3 type shapes', () => {
  it('CoherenceLoopResult has all required fields', () => {
    const result = makeDefaultCoherenceLoop();
    const requiredKeys: (keyof CoherenceLoopResult)[] = [
      'triggered', 'triggerScore', 'triggerRationale', 'revisedPrompt',
      'variant3', 'variant3Score', 'improved', 'costUsd',
    ];
    for (const key of requiredKeys) {
      expect(key in result).toBe(true);
    }
  });

  it('CopyRefinementResult has all required fields', () => {
    const result = makeDefaultCopyRefinement(makeAd());
    const requiredKeys: (keyof CopyRefinementResult)[] = [
      'triggered', 'copySideSignal', 'originalCopy', 'refinedAd',
      'refinedTextScore', 'refinedCombinedScore', 'improved', 'costUsd',
    ];
    for (const key of requiredKeys) {
      expect(key in result).toBe(true);
    }
  });

  it('CopyRefinementResult has no image generation fields by design', () => {
    const result = makeDefaultCopyRefinement(makeAd());
    expect('variant3' in result).toBe(false);
  });
});
