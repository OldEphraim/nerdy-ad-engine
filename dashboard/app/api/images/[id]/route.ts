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
  const adsPath = path.resolve(dataDir, "ads.json");

  if (!fs.existsSync(adsPath)) {
    return NextResponse.json({ error: "No ad library found" }, { status: 404 });
  }

  const raw = fs.readFileSync(adsPath, "utf-8");
  const ads = JSON.parse(raw) as AdEntry[];

  const entry = ads.find((a) => a.ad.id === id);
  if (!entry) {
    return NextResponse.json({ error: `Ad ${id} not found` }, { status: 404 });
  }

  if (!entry.selectedVariant?.imageResult?.localPath) {
    return NextResponse.json(
      { error: `Ad ${id} has no image` },
      { status: 404 },
    );
  }

  const localPath = entry.selectedVariant.imageResult.localPath;

  if (!fs.existsSync(localPath)) {
    return NextResponse.json(
      { error: `Image file not found on disk: ${localPath}` },
      { status: 400 },
    );
  }

  const buffer = fs.readFileSync(localPath);

  // Detect content type from magic bytes
  const contentType =
    buffer[0] === 0x89 ? "image/png" : "image/jpeg";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
