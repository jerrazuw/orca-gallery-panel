import { readdir } from 'node:fs/promises';
import { extname, join, parse } from 'node:path';

export const SUPPORTED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.tif',
  '.tiff',
]);

export function isSupportedImage(file: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(file).toLowerCase());
}

export function labelFor(file: string): string {
  return parse(file).name;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export async function findImages(folder: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true, recursive });
  return entries
    .filter(
      (entry) => entry.isFile() && !entry.name.startsWith('.') && isSupportedImage(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .sort(collator.compare);
}
