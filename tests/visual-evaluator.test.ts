import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GeneratedAd, AdBrief } from '../src/types.js';

// ── Mock Anthropic SDK ──────────────────────────────────────────────────────
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// ── Mock fs/promises.readFile ───────────────────────────────────────────────
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])), // JPEG magic bytes
}));

// Import AFTER mocks are set up
const { evaluateImage } = await import('../src/evaluate/visual-evaluator.js');

// ── Fixtures ────────────────────────────────────────────────────────────────
const mockAd: GeneratedAd = {
  id: 'test-ad-001',
  briefId: 'test-brief-001',
  primaryText: 'Boost your SAT score by 200+ points with expert tutors.',
  headline: 'SAT Prep That Works',
  description: 'Personalized 1-on-1 tutoring for SAT success.',
  ctaButton: 'Sign Up',
  generatedAt: '2026-01-01T00:00:00.000Z',
  modelUsed: 'claude-haiku-4-5',
  iterationCycle: 1,
  inputTokens: 100,
  outputTokens: 200,
};

const mockBrief: AdBrief = {
  id: 'test-brief-001',
  audience: 'parents_anxious',
  goal: 'conversion',
  hookType: 'stat',
};

function mockApiResponse(scores: Array<{ dimension: string; score: number; rationale: string; confidence: string }>) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ scores }) }],
    usage: { input_tokens: 500, output_tokens: 150 },
  });
}

const goodScores = [
  { dimension: 'brand_consistency', score: 8, rationale: 'Warm education scene.', confidence: 'high' },
  { dimension: 'visual_engagement', score: 7, rationale: 'Good focal point.', confidence: 'medium' },
  { dimension: 'text_image_coherence', score: 9, rationale: 'Reinforces SAT prep message.', confidence: 'high' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Visual Evaluator', () => {
  it('returns a valid VisualEvaluation shape', async () => {
    mockApiResponse(goodScores);
    const result = await evaluateImage('/tmp/test.jpg', mockAd, mockBrief);

    expect(result.scores).toHaveLength(3);
    expect(result.scores.map(s => s.dimension)).toEqual([
      'brand_consistency', 'visual_engagement', 'text_image_coherence',
    ]);
    expect(result.imageLocalPath).toBe('/tmp/test.jpg');
    expect(result.evaluatedAt).toBeTruthy();
    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(150);
  });

  it('computes aggregate as equal-weight average of 3 dimensions', async () => {
    mockApiResponse(goodScores);
    const result = await evaluateImage('/tmp/test.jpg', mockAd, mockBrief);

    // (8 + 7 + 9) / 3 = 8.0
    expect(result.aggregateScore).toBe(8);
  });

  it('sets passesThreshold correctly at 7.0 boundary', async () => {
    // Scores averaging exactly 7.0: (7 + 7 + 7) / 3 = 7.0
    mockApiResponse([
      { dimension: 'brand_consistency', score: 7, rationale: 'Adequate.', confidence: 'medium' },
      { dimension: 'visual_engagement', score: 7, rationale: 'Adequate.', confidence: 'medium' },
      { dimension: 'text_image_coherence', score: 7, rationale: 'Adequate.', confidence: 'medium' },
    ]);
    const passing = await evaluateImage('/tmp/test.jpg', mockAd, mockBrief);
    expect(passing.passesThreshold).toBe(true);

    // Scores averaging 6.7: (6 + 7 + 7) / 3 = 6.666... → 6.7
    mockApiResponse([
      { dimension: 'brand_consistency', score: 6, rationale: 'Weak.', confidence: 'medium' },
      { dimension: 'visual_engagement', score: 7, rationale: 'OK.', confidence: 'medium' },
      { dimension: 'text_image_coherence', score: 7, rationale: 'OK.', confidence: 'medium' },
    ]);
    const failing = await evaluateImage('/tmp/test.jpg', mockAd, mockBrief);
    expect(failing.passesThreshold).toBe(false);
  });

  it('identifies the weakest dimension correctly', async () => {
    mockApiResponse(goodScores);
    const result = await evaluateImage('/tmp/test.jpg', mockAd, mockBrief);

    expect(result.weakestDimension.dimension).toBe('visual_engagement');
    expect(result.weakestDimension.score).toBe(7);
  });

  it('throws on missing dimension in API response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ scores: [
        { dimension: 'brand_consistency', score: 8, rationale: 'Good.', confidence: 'high' },
        // Missing visual_engagement and text_image_coherence
      ] }) }],
      usage: { input_tokens: 500, output_tokens: 100 },
    });

    await expect(evaluateImage('/tmp/test.jpg', mockAd, mockBrief))
      .rejects.toThrow(/Missing or invalid score for visual dimension/);
  });

  it('detects JPEG vs PNG media type from magic bytes', async () => {
    // Default mock uses JPEG magic bytes (0xFF 0xD8)
    mockApiResponse(goodScores);
    await evaluateImage('/tmp/test.jpg', mockAd, mockBrief);

    const call = mockCreate.mock.calls[0]![0];
    const imageBlock = call.messages[0].content[0];
    expect(imageBlock.source.media_type).toBe('image/jpeg');

    // Now test PNG magic bytes (0x89)
    const { readFile } = await import('node:fs/promises');
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      Buffer.from([0x89, 0x50, 0x4E, 0x47]),
    );
    mockApiResponse(goodScores);
    await evaluateImage('/tmp/test.png', mockAd, mockBrief);

    const call2 = mockCreate.mock.calls[1]![0];
    const imageBlock2 = call2.messages[0].content[0];
    expect(imageBlock2.source.media_type).toBe('image/png');
  });
});
