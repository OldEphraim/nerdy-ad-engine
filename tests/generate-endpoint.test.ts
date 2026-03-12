/**
 * tests/generate-endpoint.test.ts
 *
 * Mocked unit tests for the /api/generate route handler.
 *
 * Mocking strategy:
 *   - child_process — vi.mock to control spawn() behaviour
 *   - fs            — vi.mock so existsSync returns true by default
 *   - path          — real (no side effects)
 *   - next/server   — NOT mocked; the real NextResponse from dashboard/node_modules
 *                     is used. Response shape is inspected via .status and .json().
 *
 * Import:
 *   The POST handler is imported from the dashboard directory. vitest/tsx
 *   transpiles it on-the-fly; child_process and fs are intercepted before
 *   the handler runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── 1. Mock fs (must be before route import) ───────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}));

// ── 2. Mock child_process ──────────────────────────────────────────────────

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// ── Import route after mocks are registered ────────────────────────────────

import { POST } from '../dashboard/app/api/generate/route.js';
import * as childProcess from 'child_process';
import * as fs from 'fs';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return {
    json: () => Promise.resolve(body),
  } as Parameters<typeof POST>[0];
}

/** Simulates a child process that emits JSON stdout then closes cleanly. */
function mockSpawnSuccess(stdoutPayload: unknown, exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  setImmediate(() => {
    child.stdout.emit('data', Buffer.from(JSON.stringify(stdoutPayload)));
    child.emit('close', exitCode);
  });

  vi.mocked(childProcess.spawn).mockReturnValue(child as ReturnType<typeof childProcess.spawn>);
  return child;
}

/** Simulates a child process that exits with stderr and no stdout. */
function mockSpawnError(stderrMsg: string, exitCode = 1) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  setImmediate(() => {
    child.stderr.emit('data', Buffer.from(stderrMsg));
    child.emit('close', exitCode);
  });

  vi.mocked(childProcess.spawn).mockReturnValue(child as ReturnType<typeof childProcess.spawn>);
  return child;
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fs.existsSync).mockReturnValue(true);
});

describe('POST /api/generate — input validation', () => {
  it('returns 400 for an invalid audience', async () => {
    const res = await POST(makeRequest({ audience: 'aliens', goal: 'awareness', hookType: 'question' }));

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/audience/i);
  });

  it('returns 400 for an invalid goal', async () => {
    const res = await POST(makeRequest({ audience: 'parents_anxious', goal: 'domination', hookType: 'question' }));

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/goal/i);
  });

  it('returns 400 for an invalid hookType', async () => {
    const res = await POST(makeRequest({ audience: 'parents_anxious', goal: 'awareness', hookType: 'joke' }));

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/hookType/i);
  });

  it('returns 400 when the JSON body is malformed', async () => {
    const badRequest = {
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as Parameters<typeof POST>[0];

    const res = await POST(badRequest);

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid json/i);
  });
});

describe('POST /api/generate — brief ID format', () => {
  it('includes audience, goal, and hookType in the brief ID passed to the subprocess', async () => {
    const child = mockSpawnSuccess({ ad: { id: 'ad-1' }, combinedScore: 8.2 });

    await POST(makeRequest({ audience: 'students_stressed', goal: 'conversion', hookType: 'fear' }));

    expect(vi.mocked(childProcess.spawn)).toHaveBeenCalledOnce();

    const writtenData = (child.stdin.write as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(writtenData) as { brief: { id: string } };

    expect(parsed.brief.id).toMatch(/students_stressed/);
    expect(parsed.brief.id).toMatch(/conversion/);
    expect(parsed.brief.id).toMatch(/fear/);
    expect(parsed.brief.id).toMatch(/custom-\d+/);
  });
});

describe('POST /api/generate — subprocess behaviour', () => {
  it('returns 500 when the subprocess exits with no stdout', async () => {
    mockSpawnError('tsx: command not found', 127);

    const res = await POST(makeRequest({ audience: 'parents_anxious', goal: 'awareness', hookType: 'question' }));

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe('string');
  });

  it('returns 500 when the subprocess stdout is not valid JSON', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('this is not json'));
      child.emit('close', 0);
    });

    vi.mocked(childProcess.spawn).mockReturnValue(child as ReturnType<typeof childProcess.spawn>);

    const res = await POST(makeRequest({ audience: 'parents_anxious', goal: 'awareness', hookType: 'question' }));

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/non-json/i);
  });

  it('returns 200 with the parsed subprocess result on success', async () => {
    const payload = {
      ad: { id: 'ad-abc', primaryText: 'Test', headline: 'H', description: 'D', ctaButton: 'CTA', briefId: 'brief-x' },
      combinedScore: 8.5,
      evaluation: { aggregateScore: 8.2 },
    };
    mockSpawnSuccess(payload);

    const res = await POST(makeRequest({ audience: 'comparison_shoppers', goal: 'conversion', hookType: 'stat' }));

    expect(res.status).toBe(200);
    const body = await res.json() as typeof payload;
    expect(body.combinedScore).toBe(8.5);
    expect(body.ad.id).toBe('ad-abc');
  });
});
