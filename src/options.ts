import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  EFFECTS,
  FIT_MODES,
  isEffect,
  isFitMode,
  MAX_INTERVAL_SECONDS,
  type Effect,
  type FitMode,
} from './panel/config.ts';

/** Settings that can differ per gallery. */
export interface GallerySettings {
  folder?: string;
  title?: string;
  interval?: number;
  maxSize?: number;
  quality?: number;
  fit?: FitMode;
  blur?: boolean;
  effect?: Effect;
  caption?: boolean;
  recursive?: boolean;
}

/** What a user can set, from the command line or a config file. Every field is optional. */
export interface Settings extends GallerySettings {
  out?: string;
  galleries?: GallerySettings[];
}

export interface GalleryOptions {
  input: string;
  title: string;
  intervalSeconds: number;
  maxSize: number;
  quality: number;
  fit: FitMode;
  blur: boolean;
  effect: Effect;
  caption: boolean;
  recursive: boolean;
}

export interface BuildOptions {
  outDir: string;
  /** Plugin name in Orca's plugin list. */
  name: string;
  galleries: GalleryOptions[];
}

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'build'; settings: Settings; configPath: string | undefined; watch: boolean };

export class UsageError extends Error {
  override name = 'UsageError';
}

export const CONFIG_FILE = 'gallery.config.json';

export const DEFAULTS = {
  folder: 'images',
  out: 'dist',
  title: 'Gallery',
  interval: 180,
  maxSize: 800,
  quality: 80,
  fit: 'contain',
  blur: true,
  effect: 'none',
  caption: false,
  recursive: false,
} as const satisfies Required<GallerySettings> & { out: string };

export const GALLERY_KEYS = [
  'folder',
  'title',
  'interval',
  'maxSize',
  'quality',
  'fit',
  'blur',
  'effect',
  'caption',
  'recursive',
] as const satisfies readonly (keyof GallerySettings)[];

export const SETTING_KEYS = [
  ...GALLERY_KEYS,
  'out',
  'galleries',
] as const satisfies readonly (keyof Settings)[];

const LIMITS = {
  interval: [0, MAX_INTERVAL_SECONDS],
  maxSize: [16, 8192],
  quality: [1, 100],
} as const;

export const HELP = `Build an Orca side panel plugin from a folder of images.

Usage:
  npx orca-gallery-panel [folder] [options]
  npm run build -- [folder] [options]        (from a clone of the repository)

Arguments:
  folder                 Folder with your images (default: ./${DEFAULTS.folder})

Options:
  -o, --out <dir>        Output folder for the plugin (default: ./${DEFAULTS.out})
  -t, --title <text>     Panel title shown in Orca (default: "${DEFAULTS.title}")
  -i, --interval <sec>   Seconds between images, 0 to disable rotation (default: ${String(DEFAULTS.interval)})
  -s, --max-size <px>    Longest side of each image in pixels (default: ${String(DEFAULTS.maxSize)})
  -q, --quality <1-100>  WebP quality (default: ${String(DEFAULTS.quality)})
      --fit <mode>       Initial mode: ${FIT_MODES.join(' | ')} (default: ${DEFAULTS.fit})
      --effect <name>    ${EFFECTS.join(' | ')} (default: ${DEFAULTS.effect})
      --no-blur          No blurred background behind images that don't fill the panel
      --caption          Show the image name
  -r, --recursive        Include images in subfolders
  -w, --watch            Rebuild whenever the images or the config file change
  -c, --config <file>    Read settings from this file (default: ./${CONFIG_FILE} if it exists)
  -h, --help             Show this help
  -v, --version          Show the version

Command-line options override the config file, which overrides the defaults.
Several galleries, each in its own panel, are set up in the config file.
Supported formats: png, jpg, jpeg, gif, webp, avif, tif, tiff.
`;

function validateText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`${label} must be a non-empty text`);
  }
  return value;
}

function validateBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new UsageError(`${label} must be true or false`);
  return value;
}

/**
 * Checks the settings a gallery can have. `name` turns a key into how the user
 * wrote it ("--max-size" or "maxSize in gallery.config.json") for error messages.
 */
export function validateGallerySettings(
  raw: Readonly<Record<string, unknown>>,
  name: (key: keyof Settings) => string,
): GallerySettings {
  const settings: GallerySettings = {};

  if (raw['folder'] !== undefined) settings.folder = validateText(raw['folder'], name('folder'));
  if (raw['title'] !== undefined) {
    settings.title = validateText(raw['title'], name('title')).trim();
    if (settings.title.length > 256) {
      throw new UsageError(`${name('title')} must be at most 256 characters`);
    }
  }

  for (const key of ['interval', 'maxSize', 'quality'] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    const [min, max] = LIMITS[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new UsageError(
        `${name(key)} must be an integer between ${String(min)} and ${String(max)}, got ${JSON.stringify(value)}`,
      );
    }
    settings[key] = value;
  }

  if (raw['fit'] !== undefined) {
    if (!isFitMode(raw['fit'])) {
      throw new UsageError(
        `${name('fit')} must be one of ${FIT_MODES.join(', ')}, got ${JSON.stringify(raw['fit'])}`,
      );
    }
    settings.fit = raw['fit'];
  }
  if (raw['effect'] !== undefined) {
    if (!isEffect(raw['effect'])) {
      throw new UsageError(
        `${name('effect')} must be one of ${EFFECTS.join(', ')}, got ${JSON.stringify(raw['effect'])}`,
      );
    }
    settings.effect = raw['effect'];
  }

  for (const key of ['blur', 'caption', 'recursive'] as const) {
    if (raw[key] !== undefined) settings[key] = validateBoolean(raw[key], name(key));
  }

  return settings;
}

/** Like validateGallerySettings, plus the top-level-only settings: out and galleries. */
export function validateSettings(
  raw: Readonly<Record<string, unknown>>,
  name: (key: string) => string,
): Settings {
  const settings: Settings = validateGallerySettings(raw, name);
  if (raw['out'] !== undefined) settings.out = validateText(raw['out'], name('out'));

  const galleries = raw['galleries'];
  if (galleries !== undefined) {
    if (!Array.isArray(galleries) || galleries.length === 0) {
      throw new UsageError(`${name('galleries')} must be a non-empty list`);
    }
    settings.galleries = galleries.map((gallery: unknown, i) => {
      const at = (key: string) => name(`galleries[${String(i)}].${key}`);
      if (typeof gallery !== 'object' || gallery === null || Array.isArray(gallery)) {
        throw new UsageError(`${name(`galleries[${String(i)}]`)} must be an object`);
      }
      const entry = gallery as Record<string, unknown>;
      const unknown = Object.keys(entry).filter(
        (key) => !(GALLERY_KEYS as readonly string[]).includes(key),
      );
      if (unknown.length > 0) {
        throw new UsageError(
          `Unknown setting ${unknown.map((key) => at(key)).join(', ')}. ` +
            `A gallery accepts: ${GALLERY_KEYS.join(', ')}`,
        );
      }
      if (entry['folder'] === undefined) throw new UsageError(`${at('folder')} is required`);
      return validateGallerySettings(entry, at);
    });
  }
  return settings;
}

const FLAG_NAMES: Record<string, string> = {
  folder: 'folder',
  out: '--out',
  title: '--title',
  interval: '--interval',
  maxSize: '--max-size',
  quality: '--quality',
  fit: '--fit',
  effect: '--effect',
  blur: '--no-blur',
  caption: '--caption',
  recursive: '--recursive',
};

/** Numeric flags arrive as text; anything that is not a plain number is kept so validation reports it. */
function numberFlag(value: string | undefined): number | string | undefined {
  if (value === undefined) return undefined;
  return /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
}

export function parseCommand(argv: readonly string[]): ParsedCommand {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        out: { type: 'string', short: 'o' },
        title: { type: 'string', short: 't' },
        interval: { type: 'string', short: 'i' },
        'max-size': { type: 'string', short: 's' },
        quality: { type: 'string', short: 'q' },
        fit: { type: 'string' },
        effect: { type: 'string' },
        'no-blur': { type: 'boolean' },
        caption: { type: 'boolean' },
        recursive: { type: 'boolean', short: 'r' },
        watch: { type: 'boolean', short: 'w', default: false },
        config: { type: 'string', short: 'c' },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const { values, positionals } = parsed;
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };
  if (positionals.length > 1) {
    throw new UsageError(
      `Expected at most one folder, got ${String(positionals.length)}: ${positionals.join(', ')}`,
    );
  }

  const settings = validateSettings(
    {
      folder: positionals[0],
      out: values.out,
      title: values.title,
      interval: numberFlag(values.interval),
      maxSize: numberFlag(values['max-size']),
      quality: numberFlag(values.quality),
      fit: values.fit,
      effect: values.effect,
      blur: values['no-blur'] === true ? false : undefined,
      caption: values.caption,
      recursive: values.recursive,
    },
    (key) => FLAG_NAMES[key] ?? key,
  );
  return { kind: 'build', settings, configPath: values.config, watch: values.watch };
}

export function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path;
}

export interface SettingsSource {
  settings: Settings;
  /** Relative paths in these settings resolve against this folder. */
  baseDir: string;
}

type Layer = { settings: GallerySettings & { out?: string }; baseDir: string };

function picker(layers: readonly Layer[], cwd: string) {
  const pick = <K extends keyof typeof DEFAULTS>(
    key: K,
  ): { value: (typeof DEFAULTS)[K] | NonNullable<Layer['settings'][K]>; baseDir: string } => {
    for (const layer of [...layers].reverse()) {
      const value = layer.settings[key];
      if (value !== undefined) return { value, baseDir: layer.baseDir };
    }
    return { value: DEFAULTS[key], baseDir: cwd };
  };
  const path = (key: 'folder' | 'out'): string => {
    const { value, baseDir } = pick(key);
    return resolve(baseDir, expandHome(value));
  };
  return { pick, path };
}

function galleryOptions(
  layers: readonly Layer[],
  cwd: string,
  title: (input: string) => string,
): GalleryOptions {
  const { pick, path } = picker(layers, cwd);
  const input = path('folder');
  return {
    input,
    title: title(input),
    intervalSeconds: pick('interval').value,
    maxSize: pick('maxSize').value,
    quality: pick('quality').value,
    fit: pick('fit').value,
    blur: pick('blur').value,
    effect: pick('effect').value,
    caption: pick('caption').value,
    recursive: pick('recursive').value,
  };
}

/**
 * Sources go from lowest to highest priority (config file, then command line).
 * With a "galleries" list, each gallery takes a setting from the command line
 * first, then its own entry, then the top level of the file, then DEFAULTS;
 * its title is its own "title" or its folder's name, and the top-level title
 * names the plugin.
 */
export function resolveOptions(sources: readonly SettingsSource[], cwd: string): BuildOptions {
  const layers: Layer[] = sources.map(({ settings, baseDir }) => ({ settings, baseDir }));
  const { path, pick } = picker(layers, cwd);
  const outDir = path('out');
  const name = pick('title').value;

  const owner = sources.findLastIndex((source) => source.settings.galleries !== undefined);
  const galleries = sources[owner]?.settings.galleries;
  if (!galleries) {
    return { outDir, name, galleries: [galleryOptions(layers, cwd, () => name)] };
  }

  const overrides = layers.slice(owner + 1);
  if (overrides.some((layer) => layer.settings.folder !== undefined)) {
    throw new UsageError(
      'The config file lists several galleries, so a folder cannot be given on the command line. ' +
        'Use --config with another file to build a single folder.',
    );
  }
  const baseDir = sources[owner]?.baseDir ?? cwd;
  return {
    outDir,
    name,
    galleries: galleries.map((gallery) =>
      galleryOptions(
        [...layers.slice(0, owner + 1), { settings: gallery, baseDir }, ...overrides],
        cwd,
        (input) => gallery.title ?? basename(input),
      ),
    ),
  };
}
