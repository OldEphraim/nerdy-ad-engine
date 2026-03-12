import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

// Allow up to 3 minutes — image generation + visual evaluation takes 30-90s
export const maxDuration = 180;

// FIX 3 — No temp files created by this route.
// The pipeline runs via scripts/generate-one.ts as a child process that
// communicates entirely over stdin/stdout. No .ts or .js temp files are
// written to disk at any point. The only file written is the image itself
// (to data/images/) and the updated data/ads.json — both via the subprocess.

type Audience = "parents_anxious" | "students_stressed" | "comparison_shoppers";
type CampaignGoal = "awareness" | "conversion";
type HookType = "question" | "stat" | "story" | "fear";

interface GenerateRequest {
  audience: Audience;
  goal: CampaignGoal;
  hookType: HookType;
}

// Mirrors OFFERS in src/generate/briefs.ts — pick first offer per goal
const FIRST_OFFER: Record<CampaignGoal, string> = {
  awareness: "free SAT score analysis",
  conversion: "free diagnostic practice test",
};

const VALID_AUDIENCES: Audience[] = [
  "parents_anxious",
  "students_stressed",
  "comparison_shoppers",
];
const VALID_GOALS: CampaignGoal[] = ["awareness", "conversion"];
const VALID_HOOK_TYPES: HookType[] = ["question", "stat", "story", "fear"];

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { audience, goal, hookType } = body as GenerateRequest;

  if (!VALID_AUDIENCES.includes(audience)) {
    return NextResponse.json(
      { error: `Invalid audience: ${String(audience)}` },
      { status: 400 }
    );
  }
  if (!VALID_GOALS.includes(goal)) {
    return NextResponse.json(
      { error: `Invalid goal: ${String(goal)}` },
      { status: 400 }
    );
  }
  if (!VALID_HOOK_TYPES.includes(hookType)) {
    return NextResponse.json(
      { error: `Invalid hookType: ${String(hookType)}` },
      { status: 400 }
    );
  }

  const timestamp = Date.now();
  const brief = {
    id: `brief-${audience}-${goal}-${hookType}-custom-${timestamp}`,
    audience,
    goal,
    hookType,
    offer: FIRST_OFFER[goal],
    tone: "empathetic, results-focused",
  };

  // Root of the ad-engine project (parent of the dashboard directory)
  const rootDir = path.resolve(process.cwd(), "..");
  const scriptPath = path.resolve(rootDir, "scripts", "generate-one.ts");
  const tsxPath = path.resolve(rootDir, "node_modules", ".bin", "tsx");

  if (!fs.existsSync(tsxPath)) {
    return NextResponse.json(
      { error: "tsx binary not found in root node_modules/.bin" },
      { status: 500 }
    );
  }
  if (!fs.existsSync(scriptPath)) {
    return NextResponse.json(
      { error: "generate-one.ts script not found" },
      { status: 500 }
    );
  }

  return new Promise<NextResponse>((resolve) => {
    const child = spawn(tsxPath, [scriptPath], {
      cwd: rootDir,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdin.write(JSON.stringify({ brief }));
    child.stdin.end();

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    // 3-minute hard timeout
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(
        NextResponse.json(
          { error: "Pipeline timed out after 3 minutes" },
          { status: 500 }
        )
      );
    }, 180_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString().trim();
      const stderr = Buffer.concat(stderrChunks).toString().trim();

      if (!stdout) {
        const errMsg =
          stderr || `Process exited with code ${code ?? "?"} and no output`;
        resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        resolve(
          NextResponse.json(
            { error: `Non-JSON output: ${stdout.slice(0, 200)}` },
            { status: 500 }
          )
        );
        return;
      }

      const result = parsed as Record<string, unknown>;
      if (typeof result.error === "string") {
        resolve(NextResponse.json({ error: result.error }, { status: 500 }));
        return;
      }

      resolve(NextResponse.json(parsed, { status: 200 }));
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve(
        NextResponse.json(
          { error: `Failed to spawn pipeline process: ${err.message}` },
          { status: 500 }
        )
      );
    });
  });
}
