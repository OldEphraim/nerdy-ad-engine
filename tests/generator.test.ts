import { describe, it, expect } from 'vitest';
import { parseGeneratorResponse } from '../src/generate/generator.js';
import type { AdBrief } from '../src/types.js';

// Minimal mock of the Anthropic.Message shape that parseGeneratorResponse uses
function mockResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    model: 'claude-haiku-4-5-20250301',
    usage: { input_tokens: 100, output_tokens: 50 },
    // The function only accesses .content, .model, and .usage
  } as Parameters<typeof parseGeneratorResponse>[0];
}

const testBrief: AdBrief = {
  id: 'brief-test',
  audience: 'parents_anxious',
  goal: 'awareness',
  hookType: 'question',
  offer: 'free diagnostic test',
  tone: 'curious, empathetic',
};

const validAdJson = JSON.stringify({
  primaryText: 'Is your child ready for the SAT?',
  headline: 'Expert SAT Prep That Works',
  description: 'Personalized tutoring that raises scores.',
  ctaButton: 'Start Free Trial',
});

describe('parseGeneratorResponse', () => {
  it('parses valid JSON correctly', () => {
    const result = parseGeneratorResponse(mockResponse(validAdJson), testBrief, 1);

    expect(result.primaryText).toBe('Is your child ready for the SAT?');
    expect(result.headline).toBe('Expert SAT Prep That Works');
    expect(result.description).toBe('Personalized tutoring that raises scores.');
    expect(result.ctaButton).toBe('Start Free Trial');
    expect(result.briefId).toBe('brief-test');
    expect(result.iterationCycle).toBe(1);
    expect(result.modelUsed).toBe('claude-haiku-4-5-20250301');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.id).toBeTruthy(); // UUID generated
    expect(result.generatedAt).toBeTruthy(); // ISO timestamp
  });

  it('handles JSON wrapped in markdown fences', () => {
    const wrapped = '```json\n' + validAdJson + '\n```';
    const result = parseGeneratorResponse(mockResponse(wrapped), testBrief, 2);

    expect(result.primaryText).toBe('Is your child ready for the SAT?');
    expect(result.iterationCycle).toBe(2);
  });

  it('handles JSON wrapped in plain markdown fences (no language tag)', () => {
    const wrapped = '```\n' + validAdJson + '\n```';
    const result = parseGeneratorResponse(mockResponse(wrapped), testBrief, 1);

    expect(result.headline).toBe('Expert SAT Prep That Works');
  });

  it('throws on missing required fields', () => {
    const incomplete = JSON.stringify({
      primaryText: 'Some text',
      headline: 'Some headline',
      // missing description and ctaButton
    });

    expect(() =>
      parseGeneratorResponse(mockResponse(incomplete), testBrief, 1)
    ).toThrow(/incomplete ad/i);
  });

  it('throws on empty primaryText', () => {
    const emptyField = JSON.stringify({
      primaryText: '',
      headline: 'Headline',
      description: 'Desc',
      ctaButton: 'CTA',
    });

    expect(() =>
      parseGeneratorResponse(mockResponse(emptyField), testBrief, 1)
    ).toThrow(/incomplete ad/i);
  });

  it('throws on completely invalid JSON', () => {
    expect(() =>
      parseGeneratorResponse(mockResponse('This is not JSON at all'), testBrief, 1)
    ).toThrow(/malformed JSON/i);
  });

  it('throws on empty response text', () => {
    expect(() =>
      parseGeneratorResponse(mockResponse(''), testBrief, 1)
    ).toThrow(/malformed JSON/i);
  });
});
