// ── Image generation via fal.ai Flux Schnell ────────────────────────────────
// Generates multiple image variants from a text prompt, downloads each
// immediately to data/images/ (CDN URLs expire in ~1 hour), and returns
// populated ImageResult objects ready for visual evaluation.

import { fal } from '@fal-ai/client';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type ImageResult, FLUX_SCHNELL_COST_PER_IMAGE } from '../types.js';

const IMAGES_DIR = join(process.cwd(), 'data', 'images');

/**
 * Generate `count` image variants from a Flux-compatible text prompt.
 * Each variant uses a different random seed for visual diversity.
 * Images are downloaded immediately to data/images/{uuid}.jpg.
 *
 * @throws Error with descriptive message if generation or download fails
 */
export async function generateImageVariants(
  prompt: string,
  count: number = parseInt(process.env['IMAGE_VARIANTS'] ?? '2'),
): Promise<ImageResult[]> {
  const model = process.env['IMAGE_MODEL'] ?? 'fal-ai/flux/schnell';
  const width = parseInt(process.env['IMAGE_WIDTH'] ?? '1200');
  const height = parseInt(process.env['IMAGE_HEIGHT'] ?? '628');

  // Ensure output directory exists
  await mkdir(IMAGES_DIR, { recursive: true });

  // Generate seeds upfront — crypto-random, guaranteed unique per batch
  const seeds = Array.from({ length: count }, () =>
    Math.floor(Math.random() * 2_147_483_647),
  );

  const results: ImageResult[] = [];

  for (let i = 0; i < count; i++) {
    const seed = seeds[i]!;
    const startMs = Date.now();

    try {
      const response = await fal.subscribe(model, {
        input: {
          prompt,
          image_size: { width, height },
          seed,
          num_images: 1,
        },
      });

      const elapsedMs = Date.now() - startMs;
      const data = response.data as {
        images?: Array<{ url: string; width: number; height: number }>;
      };

      if (!data.images || data.images.length === 0) {
        throw new Error(
          `fal.ai returned no images for seed ${seed} (model: ${model})`,
        );
      }

      const image = data.images[0]!;

      // Download immediately — CDN URLs expire in ~1 hour
      const localFilename = `${randomUUID()}.jpg`;
      const localPath = join(IMAGES_DIR, localFilename);
      await downloadImage(image.url, localPath);

      results.push({
        url: image.url,
        localPath,
        width: image.width,
        height: image.height,
        seed,
        generationTimeMs: elapsedMs,
        costUsd: FLUX_SCHNELL_COST_PER_IMAGE,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Image generation failed for variant ${i + 1}/${count} (seed: ${seed}, model: ${model}): ${message}`,
      );
    }
  }

  return results;
}

/**
 * Download an image from a URL and write it to disk.
 * Retries once on transient network failures before giving up.
 */
async function downloadImage(url: string, destPath: string): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(destPath, buffer);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Only retry once — if both attempts fail, the URL is probably bad
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  throw new Error(
    `Failed to download image after 2 attempts (${url}): ${lastError?.message}`,
  );
}
