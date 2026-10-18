import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { encodeImage, type EncodedImage } from './encode.ts';
import { renderPanelHtml } from './html.ts';
import { findImages, labelFor } from './images.ts';
import { createManifest, MANIFEST_FILE, PANEL_ENTRY } from './manifest.ts';
import type { BuildOptions } from './options.ts';
import type { GalleryImage } from './panel/config.ts';

/** Orca rejects a panel entry above this size (PLUGIN_PANEL_ENTRY_MAX_BYTES). */
export const PANEL_ENTRY_MAX_BYTES = 10 * 1024 * 1024;
const ENCODE_CONCURRENCY = 4;

export class BuildError extends Error {
  override name = 'BuildError';
}

export interface ImageReport {
  file: string;
  bytes: number;
  width: number;
  height: number;
  animated: boolean;
}

export interface BuildResult {
  outDir: string;
  panelBytes: number;
  images: ImageReport[];
  skipped: { file: string; reason: string }[];
}

export interface Logger {
  warn: (message: string) => void;
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function oversizeMessage(panelBytes: number, images: readonly ImageReport[]): string {
  const largest = [...images]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map(
      (image) =>
        `  ${formatBytes(image.bytes).padStart(8)}  ${basename(image.file)}${image.animated ? ' (animated)' : ''}`,
    );
  return [
    `panel.html is ${formatBytes(panelBytes)}, over Orca's ${formatBytes(PANEL_ENTRY_MAX_BYTES)} limit.`,
    'Largest images:',
    ...largest,
    'Try a smaller --max-size or --quality, or remove some images.',
  ].join('\n');
}

async function assertFolder(folder: string): Promise<void> {
  const info = await stat(folder).catch(() => undefined);
  if (!info?.isDirectory()) throw new BuildError(`Image folder not found: ${folder}`);
}

export async function buildPlugin(
  options: BuildOptions,
  logger: Logger = console,
): Promise<BuildResult> {
  await assertFolder(options.input);
  const files = await findImages(options.input, options.recursive);

  const skipped: BuildResult['skipped'] = [];
  const encoded = await mapConcurrent(files, ENCODE_CONCURRENCY, async (file) => {
    try {
      return { file, image: await encodeImage(file, options) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      skipped.push({ file, reason });
      logger.warn(`Skipping ${basename(file)}: ${reason}`);
      return undefined;
    }
  });
  const ok = encoded.filter(
    (entry): entry is { file: string; image: EncodedImage } => entry !== undefined,
  );

  if (ok.length === 0) {
    throw new BuildError(
      files.length === 0
        ? `No supported images in ${options.input}${options.recursive ? '' : ' (use --recursive to include subfolders)'}`
        : `None of the ${String(files.length)} images in ${options.input} could be read`,
    );
  }

  const images: GalleryImage[] = ok.map(({ file, image }) => ({
    src: image.dataUrl,
    label: labelFor(file),
  }));
  const reports: ImageReport[] = ok.map(({ file, image }) => ({
    file,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    animated: image.animated,
  }));

  const html = await renderPanelHtml({
    images,
    intervalMs: options.intervalSeconds * 1000,
    fit: options.fit,
  });
  const panelBytes = Buffer.byteLength(html);
  if (panelBytes > PANEL_ENTRY_MAX_BYTES)
    throw new BuildError(oversizeMessage(panelBytes, reports));

  await mkdir(options.outDir, { recursive: true });
  await Promise.all([
    writeFile(join(options.outDir, PANEL_ENTRY), html),
    writeFile(
      join(options.outDir, MANIFEST_FILE),
      `${JSON.stringify(createManifest(options.title), null, 2)}\n`,
    ),
  ]);

  return { outDir: options.outDir, panelBytes, images: reports, skipped };
}
