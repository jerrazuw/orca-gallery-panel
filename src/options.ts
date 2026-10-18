import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FIT_MODES, isFitMode, type FitMode } from './panel/config.ts';

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

export type ParsedCommand =
  { kind: 'help' } | { kind: 'version' } | { kind: 'build'; options: BuildOptions };

export class UsageError extends Error {
  override name = 'UsageError';
}

export const DEFAULTS = {
  input: 'images',
  outDir: 'dist',
  title: 'Gallery',
  intervalSeconds: 180,
  maxSize: 800,
  quality: 80,
  fit: 'contain',
} as const satisfies Partial<BuildOptions>;

export const HELP = `Build an Orca side panel plugin from a folder of images.

Usage:
  npm run build -- [folder] [options]

Arguments:
  folder                 Folder with your images (default: ./${DEFAULTS.input})

Options:
  -o, --out <dir>        Output folder for the plugin (default: ./${DEFAULTS.outDir})
  -t, --title <text>     Panel title shown in Orca (default: "${DEFAULTS.title}")
  -i, --interval <sec>   Seconds between images, 0 to disable rotation (default: ${String(DEFAULTS.intervalSeconds)})
  -s, --max-size <px>    Longest side of each image in pixels (default: ${String(DEFAULTS.maxSize)})
  -q, --quality <1-100>  WebP quality (default: ${String(DEFAULTS.quality)})
      --fit <mode>       Initial mode: ${FIT_MODES.join(' | ')} (default: ${DEFAULTS.fit})
  -r, --recursive        Include images in subfolders
  -h, --help             Show this help
  -v, --version          Show the version

Supported formats: png, jpg, jpeg, gif, webp, avif, tif, tiff.
`;

function integer(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new UsageError(
      `--${name} must be an integer between ${String(min)} and ${String(max)}, got "${raw}"`,
    );
  }
  return value;
}

export function parseCommand(argv: readonly string[], cwd = process.cwd()): ParsedCommand {
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
        recursive: { type: 'boolean', short: 'r', default: false },
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

  const title = (values.title ?? DEFAULTS.title).trim();
  if (title.length === 0 || title.length > 256) {
    throw new UsageError('--title must be between 1 and 256 characters');
  }

  const fit = values.fit ?? DEFAULTS.fit;
  if (!isFitMode(fit)) {
    throw new UsageError(`--fit must be one of ${FIT_MODES.join(', ')}, got "${fit}"`);
  }

  return {
    kind: 'build',
    options: {
      input: resolve(cwd, positionals[0] ?? DEFAULTS.input),
      outDir: resolve(cwd, values.out ?? DEFAULTS.outDir),
      title,
      intervalSeconds: integer('interval', values.interval, DEFAULTS.intervalSeconds, 0, 86_400),
      maxSize: integer('max-size', values['max-size'], DEFAULTS.maxSize, 16, 8192),
      quality: integer('quality', values.quality, DEFAULTS.quality, 1, 100),
      fit,
      recursive: values.recursive,
    },
  };
}
