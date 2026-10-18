#!/usr/bin/env node
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { pkg } from './package-info.ts';
import {
  buildPlugin,
  BuildError,
  formatBytes,
  PANEL_ENTRY_MAX_BYTES,
  type BuildResult,
} from './build.ts';
import { loadConfigFile } from './config-file.ts';
import { isSupportedImage } from './images.ts';
import {
  CONFIG_FILE,
  HELP,
  parseCommand,
  resolveOptions,
  UsageError,
  type BuildOptions,
  type Settings,
} from './options.ts';
import { watchLoop, type WatchTarget } from './watch.ts';

interface Invocation {
  settings: Settings;
  configPath: string | undefined;
  cwd: string;
}

function configFilePath({ configPath, cwd }: Invocation): string {
  return resolve(cwd, configPath ?? CONFIG_FILE);
}

async function loadOptions(invocation: Invocation): Promise<BuildOptions> {
  const { settings, configPath, cwd } = invocation;
  const configFile = await loadConfigFile(configFilePath(invocation), {
    required: configPath !== undefined,
  });
  if (configFile) console.log(`Using settings from ${configPath ?? CONFIG_FILE}`);
  return resolveOptions([...(configFile ? [configFile] : []), { settings, baseDir: cwd }], cwd);
}

function displayPath(path: string, cwd: string): string {
  const relativePath = relative(cwd, path);
  if (relativePath === '') return '.';
  return relativePath.startsWith('..') ? path : relativePath;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function report(options: BuildOptions, result: BuildResult, cwd: string): void {
  const where = displayPath(result.outDir, cwd);
  const usage = (bytes: number) => `${((bytes / PANEL_ENTRY_MAX_BYTES) * 100).toFixed(0)}%`;
  const [only] = result.galleries;

  if (result.galleries.length === 1 && only) {
    console.log(
      `Built "${only.title}" with ${plural(only.images.length, 'image')}: ` +
        `${formatBytes(only.panelBytes)} (${usage(only.panelBytes)} of Orca's limit) in ${where}`,
    );
  } else {
    console.log(
      `Built "${options.name}" with ${String(result.galleries.length)} panels in ${where}:`,
    );
    const width = Math.max(...result.galleries.map((gallery) => gallery.title.length));
    for (const gallery of result.galleries) {
      console.log(
        `  ${gallery.title.padEnd(width)}  ${plural(gallery.images.length, 'image').padStart(10)}  ` +
          `${formatBytes(gallery.panelBytes).padStart(8)} (${usage(gallery.panelBytes)} of the limit)`,
      );
    }
  }
  const skipped = result.galleries.reduce((sum, gallery) => sum + gallery.skipped.length, 0);
  if (skipped > 0) console.warn(`${String(skipped)} file(s) skipped.`);
}

function watchTargets(invocation: Invocation, options: BuildOptions | undefined): WatchTarget[] {
  const config = configFilePath(invocation);
  const targets: WatchTarget[] = [
    {
      path: dirname(config),
      recursive: false,
      accept: (file) => basename(file) === basename(config),
    },
  ];
  for (const gallery of options?.galleries ?? []) {
    targets.push({
      path: gallery.input,
      recursive: true,
      accept: (file) => isSupportedImage(file) && (gallery.recursive || !file.includes(sep)),
    });
  }
  return targets;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function watchAndBuild(invocation: Invocation): Promise<void> {
  const controller = new AbortController();
  process.once('SIGINT', () => {
    controller.abort();
  });

  await watchLoop(
    async () => {
      let options: BuildOptions | undefined;
      try {
        options = await loadOptions(invocation);
        report(options, await buildPlugin(options), invocation.cwd);
      } catch (error) {
        if (!(error instanceof UsageError || error instanceof BuildError)) throw error;
        console.error(describe(error));
      }
      console.log(`[${new Date().toLocaleTimeString()}] Watching for changes. Ctrl+C to stop.`);
      return watchTargets(invocation, options);
    },
    {
      signal: controller.signal,
      onSkip: (target, error) => {
        console.warn(`Not watching ${target.path}: ${describe(error)}`);
      },
    },
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const command = parseCommand(argv);
  if (command.kind === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (command.kind === 'version') {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  const invocation: Invocation = {
    settings: command.settings,
    configPath: command.configPath,
    cwd: process.cwd(),
  };
  if (command.watch) {
    await watchAndBuild(invocation);
    return 0;
  }

  const options = await loadOptions(invocation);
  report(options, await buildPlugin(options), invocation.cwd);
  console.log(
    'Load it in Orca from Settings > Plugins > Development > Add path; it reloads on every build.\n' +
      'Add --watch to rebuild on its own whenever your images change.',
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\nRun with --help for usage.`);
      process.exitCode = 2;
    } else if (error instanceof BuildError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      console.error(error);
      process.exitCode = 1;
    }
  },
);
