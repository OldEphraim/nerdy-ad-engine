import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

interface AdEntry {
  ad: { id: string };
  selectedVariant?: {
    imageResult: { localPath: string };
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataDir = path.resolve(process.cwd(), "..", "data");

  // 1. Search ads.json first (live library)
  let entry = findEntry(path.resolve(dataDir, "ads.json"), id);

  // 2. If not found, search run archives — needed for the Showcase page
  //    when a named run is selected and those ads aren't in ads.json.
  if (!entry) {
    const runsDir = path.resolve(dataDir, "runs");
    if (fs.existsSync(runsDir)) {
      const runFiles = fs.readdirSync(runsDir)
        .filter((f) => f.endsWith(".json"))
        .sort(); // deterministic order
      for (const runFile of runFiles) {
        entry = findEntry(path.resolve(runsDir, runFile), id);
        if (entry) break;
      }
    }
  }

  if (!entry) {
    return NextResponse.json({ error: `Ad ${id} not found` }, { status: 404 });
  }

  if (!entry.selectedVariant?.imageResult?.localPath) {
    return NextResponse.json(
      { error: `Ad ${id} has no image` },
      { status: 404 },
    );
  }

  // 3. Resolve the image file — primary localPath, then stable fallback
  const imagesDir = path.resolve(dataDir, "images");
  let localPath = entry.selectedVariant.imageResult.localPath;

  if (!fs.existsSync(localPath)) {
    // Stable fallback written by ensure-images: data/images/{id}-selected.jpg
    const stablePath = path.resolve(imagesDir, `${id}-selected.jpg`);
    if (fs.existsSync(stablePath)) {
      localPath = stablePath;
    } else {
      return NextResponse.json(
        { error: `Image file not found on disk for ad ${id}` },
        { status: 404 },
      );
    }
  }

  const buffer = fs.readFileSync(localPath);

  // Detect content type from magic bytes
  const contentType = buffer[0] === 0x89 ? "image/png" : "image/jpeg";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function findEntry(jsonPath: string, id: string): AdEntry | undefined {
  if (!fs.existsSync(jsonPath)) return undefined;
  try {
    const ads = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as AdEntry[];
    return ads.find((a) => a.ad.id === id);
  } catch {
    return undefined;
  }
}
