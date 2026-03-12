// ── ensure-images.ts ────────────────────────────────────────────────────────
// Called at /api/ads response time to guarantee that every ad with a
// selectedVariant has its image file present on disk.
//
// Why this is needed:
//   - Images are generated and downloaded immediately by the pipeline, but
//     localPath stores an absolute path. If the data was generated on a
//     different machine, or if data/images/ was cleared, the file is gone.
//   - fal.ai CDN URLs expire after ~1 hour, so for old runs the re-download
//     will silently fail — callers get the original broken localPath for those.
//
// Stable path convention: data/images/{ad.id}-selected.jpg
// This is predictable and matches the fallback the images route uses.

import * as fs from "fs";
import * as path from "path";

// Minimal shape — the runtime objects have all original fields even though
// TypeScript only sees this interface. JSON.stringify preserves everything.
interface EnsureEntry {
  ad: { id: string; briefId: string };
  selectedVariant?: {
    imageResult: {
      url?: string;
      localPath: string;
    };
  };
}

/**
 * Ensure every entry's selected image file exists on disk.
 *
 * For entries where selectedVariant.imageResult.localPath is missing:
 *   1. Check if the stable path (data/images/{ad.id}-selected.jpg) already exists.
 *   2. If not, attempt to download from the CDN URL (10 s timeout).
 *   3. Update imageResult.localPath in-place to the stable path.
 *
 * If any paths were updated, writes the modified array back to sourceJsonPath
 * so the images API route finds files on subsequent requests without re-checking.
 *
 * This function never throws — all failures are silent (CDN URL expired, etc).
 */
export async function ensureImages(
  entries: EnsureEntry[],
  sourceJsonPath: string,
  imagesDir: string,
): Promise<void> {
  // Quick pass: collect only entries that actually need attention
  const missing = entries.filter(
    (e): e is EnsureEntry & { selectedVariant: { imageResult: { url?: string; localPath: string } } } =>
      e.selectedVariant != null &&
      !fs.existsSync(e.selectedVariant.imageResult.localPath),
  );

  if (missing.length === 0) return;

  try {
    await fs.promises.mkdir(imagesDir, { recursive: true });
  } catch {
    return; // Can't create images dir — bail out silently
  }

  let anyChanged = false;

  for (const entry of missing) {
    const { imageResult } = entry.selectedVariant;
    const stablePath = path.join(imagesDir, `${entry.ad.id}-selected.jpg`);

    // If the stable file already exists (from a prior recovery attempt), just
    // update the pointer without re-downloading.
    if (fs.existsSync(stablePath)) {
      imageResult.localPath = stablePath;
      anyChanged = true;
      continue;
    }

    // Need a live URL to download
    if (!imageResult.url || !imageResult.url.startsWith("http")) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(imageResult.url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) continue; // Likely expired — skip silently

      const buffer = Buffer.from(await res.arrayBuffer());
      await fs.promises.writeFile(stablePath, buffer);

      imageResult.localPath = stablePath;
      anyChanged = true;
      console.log(`[ensure-images] Recovered missing image → ${stablePath}`);
    } catch {
      // Timeout, AbortError, network error — all silent
    }
  }

  if (anyChanged) {
    // Persist updated localPaths. The entries array holds full runtime objects
    // (all JSON fields survive JSON.parse + TypeScript cast), so serializing
    // back is safe — no field loss.
    try {
      fs.writeFileSync(sourceJsonPath, JSON.stringify(entries, null, 2));
    } catch {
      // Non-fatal: the in-memory localPath fix is still correct for this request
    }
  }
}
