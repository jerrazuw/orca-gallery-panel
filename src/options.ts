import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FIT_MODES, isFitMode, MAX_INTERVAL_SECONDS, type FitMode } from './panel/config.ts';

export interface BuildOptions {
  input: string;
  outDir: string;
  title: string;
  intervalSeconds: number;
  maxSize: number;
  quality: number;
  fit: FitMode;
  recursive: boolean;
}

/** What a user can set, from the command line or a config file. Every field is optional. */
export interface Settings {
  folder?: string;
  out?: string;
  title?: string;
  interval?: number;
  maxSize?: number;
  quality?: number;
  fit?: FitMode;
  recursive?: boolean;
}

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'build'; settings: Settings; configPath: string | undefined };

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
  recursive: false,
} as const satisfies Required<Settings>;

const LIMITS = {
  interval: [0, MAX_INTERVAL_SECONDS],
  maxSize: [16, 8192],
  quality: [1, 100],
} as const;

export const SETTING_KEYS = Object.keys(DEFAULTS) as readonly (keyof Settings)[];

export const HELP = `Build an Orca side panel plugin from a folder of images.

Usage:
  npm run build -- [folder] [options]

Arguments:
  folder                 Folder with your images (default: ./${DEFAULTS.folder})

Options:
  -o, --out <dir>        Output folder for the plugin (default: ./${DEFAULTS.out})
  -t, --title <text>     Panel title shown in Orca (default: "${DEFAULTS.title}")
  -i, --interval <sec>   Seconds between images, 0 to disable rotation (default: ${String(DEFAULTS.interval)})
  -s, --max-size <px>    Longest side of each image in pixels (default: ${String(DEFAULTS.maxSize)})
  -q, --quality <1-100>  WebP quality (default: ${String(DEFAULTS.quality)})
      --fit <mode>       Initial mode: ${FIT_MODES.join(' | ')} (default: ${DEFAULTS.fit})
  -r, --recursive        Include images in subfolders
  -c, --config <file>    Read settings from this file (default: ./${CONFIG_FILE} if it exists)
  -h, --help             Show this help
  -v, --version          Show the version

Command-line options override the config file, which overrides the defaults.
Supported formats: png, jpg, jpeg, gif, webp, avif, tif, tiff.
`;

/**
 * Checks raw values from either source. `name` turns a key into how the user
 * wrote it ("--max-size" or "maxSize in gallery.config.json") for error messages.
 */
export function validateSettings(
  raw: Readonly<Record<string, unknown>>,
  name: (key: keyof Settings) => string,
): Settings {
  const settings: Settings = {};

  for (const key of ['folder', 'out', 'title'] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new UsageError(`${name(key)} must be a non-empty text`);
    }
    settings[key] = key === 'title' ? value.trim() : value;
  }
  if (settings.title !== undefined && settings.title.length > 256) {
    throw new UsageError(`${name('title')} must be at most 256 characters`);
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

  if (raw['recursive'] !== undefined) {
    if (typeof raw['recursive'] !== 'boolean') {
      throw new UsageError(`${name('recursive')} must be true or false`);
    }
    settings.recursive = raw['recursive'];
  }

  return settings;
}

const FLAG_NAMES: Record<keyof Settings, string> = {
  folder: 'folder',
  out: '--out',
  title: '--title',
  interval: '--interval',
  maxSize: '--max-size',
  quality: '--quality',
  fit: '--fit',
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
        recursive: { type: 'boolean', short: 'r' },
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
      recursive: values.recursive,
    },
    (key) => FLAG_NAMES[key],
  );
  return { kind: 'build', settings, configPath: values.config };
}

export function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path;
}

export interface SettingsSource {
  settings: Settings;
  /** Relative paths in these settings resolve against this folder. */
  baseDir: string;
}

/** Later sources win: pass them from lowest to highest priority. */
export function resolveOptions(sources: readonly SettingsSource[], cwd: string): BuildOptions {
  const pick = <K extends keyof Settings>(
    key: K,
  ): { value: Required<Settings>[K]; baseDir: string } => {
    for (const source of [...sources].reverse()) {
      const value = source.settings[key];
      if (value !== undefined)
        return { value: value as Required<Settings>[K], baseDir: source.baseDir };
    }
    return { value: DEFAULTS[key], baseDir: cwd };
  };
  const path = (key: 'folder' | 'out'): string => {
    const { value, baseDir } = pick(key);
    return resolve(baseDir, expandHome(value));
  };

  return {
    input: path('folder'),
    outDir: path('out'),
    title: pick('title').value,
    intervalSeconds: pick('interval').value,
    maxSize: pick('maxSize').value,
    quality: pick('quality').value,
    fit: pick('fit').value,
    recursive: pick('recursive').value,
  };
}
