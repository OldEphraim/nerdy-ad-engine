// Called by dashboard/app/api/generate/route.ts
// Reads a single AdBrief from stdin as JSON, runs the full v3 pipeline,
// appends the result to data/ads.json, and writes the entry to stdout as JSON.

import 'dotenv/config';
import type { AdBrief } from '../src/types.js';
import { research } from '../src/agents/researcher.js';
import { edit } from '../src/agents/editor.js';
import { appendToLibrary, updateRatchetPool } from '../src/output/library.js';

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  let brief: AdBrief;
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString()) as { brief: AdBrief };
    brief = input.brief;
  } catch {
    process.stdout.write(JSON.stringify({ error: 'Failed to parse input JSON from stdin' }));
    process.exit(0);
    return;
  }

  const researcherStart = Date.now();
  const enrichedBrief = await research(brief, null);
  const researcherMs = Date.now() - researcherStart;

  const entry = await edit(enrichedBrief, Date.now());

  if (!entry) {
    process.stdout.write(
      JSON.stringify({ error: 'Ad generation failed — text did not pass quality threshold after maximum iterations' })
    );
    process.exit(0);
    return;
  }

  // Mirror what src/index.ts does: set researcher timing, then persist
  entry.agentTrace.researcherMs = researcherMs;
  appendToLibrary(entry);
  updateRatchetPool(entry);

  process.stdout.write(JSON.stringify(entry));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stdout.write(JSON.stringify({ error: msg }));
  process.exit(0);
});
