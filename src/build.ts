import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { encodeImage, type EncodedImage } from './encode.ts';
import { renderPanelHtml } from './html.ts';
import { findImages, labelFor } from './images.ts';
import { createManifest, isGeneratedPanelFile, MANIFEST_FILE, panelEntries } from './manifest.ts';
import type { BuildOptions, GalleryOptions } from './options.ts';
import type { GalleryImage } from './panel/config.ts';

/** Orca rejects a panel entry above this size (PLUGIN_PANEL_ENTRY_MAX_BYTES). */
export const PANEL_ENTRY_MAX_BYTES = 10 * 1024 * 1024;
/** Orca rejects a whole plugin above this size. */
export const PLUGIN_MAX_BYTES = 50 * 1024 * 1024;
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

export interface GalleryResult {
  title: string;
  entry: string;
  panelBytes: number;
  images: ImageReport[];
  skipped: { file: string; reason: string }[];
}

export interface BuildResult {
  outDir: string;
  galleries: GalleryResult[];
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

export function oversizeMessage(
  title: string,
  panelBytes: number,
  images: readonly ImageReport[],
): string {
  const largest = [...images]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map(
      (image) =>
        `  ${formatBytes(image.bytes).padStart(8)}  ${basename(image.file)}${image.animated ? ' (animated)' : ''}`,
    );
  return [
    `"${title}" is ${formatBytes(panelBytes)}, over Orca's ${formatBytes(PANEL_ENTRY_MAX_BYTES)} limit for a panel.`,
    'Largest images:',
    ...largest,
    'Try a smaller --max-size or --quality, or remove some images.',
  ].join('\n');
}

async function assertFolder(folder: string): Promise<void> {
  const info = await stat(folder).catch(() => undefined);
  if (!info?.isDirectory()) throw new BuildError(`Image folder not found: ${folder}`);
}

async function buildGallery(
  gallery: GalleryOptions,
  logger: Logger,
  demo: boolean,
): Promise<{ html: string; images: ImageReport[]; skipped: GalleryResult['skipped'] }> {
  await assertFolder(gallery.input);
  const files = await findImages(gallery.input, gallery.recursive);

  const skipped: GalleryResult['skipped'] = [];
  const encoded = await mapConcurrent(files, ENCODE_CONCURRENCY, async (file) => {
    try {
      return { file, image: await encodeImage(file, gallery) };
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
        ? `No supported images in ${gallery.input}${gallery.recursive ? '' : ' (use --recursive to include subfolders)'}`
        : `None of the ${String(files.length)} images in ${gallery.input} could be read`,
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
    intervalMs: gallery.intervalSeconds * 1000,
    fit: gallery.fit,
    blur: gallery.blur,
    effect: gallery.effect,
    caption: gallery.caption,
    demo,
  });
  const panelBytes = Buffer.byteLength(html);
  if (panelBytes > PANEL_ENTRY_MAX_BYTES) {
    throw new BuildError(oversizeMessage(gallery.title, panelBytes, reports));
  }
  return { html, images: reports, skipped };
}

/** Removes panel files an earlier build wrote for galleries that no longer exist. */
async function removeStalePanels(outDir: string, keep: ReadonlySet<string>): Promise<void> {
  const files = await readdir(outDir);
  await Promise.all(
    files
      .filter((file) => isGeneratedPanelFile(file) && !keep.has(file))
      .map((file) => rm(join(outDir, file))),
  );
}

export async function buildPlugin(
  options: BuildOptions,
  logger: Logger = console,
): Promise<BuildResult> {
  const entries = panelEntries(options.galleries.map((gallery) => gallery.title));
  const built = [];
  const demo = options.demo ?? false;
  for (const gallery of options.galleries) built.push(await buildGallery(gallery, logger, demo));

  const totalBytes = built.reduce((sum, { html }) => sum + Buffer.byteLength(html), 0);
  if (totalBytes > PLUGIN_MAX_BYTES) {
    throw new BuildError(
      `The galleries add up to ${formatBytes(totalBytes)}, over Orca's ${formatBytes(PLUGIN_MAX_BYTES)} limit for a plugin.`,
    );
  }

  await mkdir(options.outDir, { recursive: true });
  await Promise.all([
    ...built.map(({ html }, i) => writeFile(join(options.outDir, entries[i]?.entry ?? ''), html)),
    writeFile(
      join(options.outDir, MANIFEST_FILE),
      `${JSON.stringify(createManifest(options.name, entries, { demo }), null, 2)}\n`,
    ),
  ]);
  await removeStalePanels(options.outDir, new Set(entries.map(({ entry }) => entry)));

  return {
    outDir: options.outDir,
    galleries: built.map(({ html, images, skipped }, i) => ({
      title: entries[i]?.title ?? '',
      entry: entries[i]?.entry ?? '',
      panelBytes: Buffer.byteLength(html),
      images,
      skipped,
    })),
  };
}
