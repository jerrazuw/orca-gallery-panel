#!/usr/bin/env node
import { join, relative } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { buildPlugin, BuildError, formatBytes, PANEL_ENTRY_MAX_BYTES } from './build.ts';
import { loadConfigFile } from './config-file.ts';
import { CONFIG_FILE, HELP, parseCommand, resolveOptions, UsageError } from './options.ts';

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

  const cwd = process.cwd();
  const configFile = await loadConfigFile(command.configPath ?? join(cwd, CONFIG_FILE), {
    required: command.configPath !== undefined,
  });
  if (configFile) console.log(`Using settings from ${command.configPath ?? CONFIG_FILE}`);
  const options = resolveOptions(
    [...(configFile ? [configFile] : []), { settings: command.settings, baseDir: cwd }],
    cwd,
  );

  const result = await buildPlugin(options);
  const relativeOut = relative(process.cwd(), result.outDir);
  const where =
    relativeOut === '' ? '.' : relativeOut.startsWith('..') ? result.outDir : relativeOut;
  const usage = ((result.panelBytes / PANEL_ENTRY_MAX_BYTES) * 100).toFixed(0);
  console.log(
    `Built "${options.title}" with ${String(result.images.length)} images: ` +
      `${formatBytes(result.panelBytes)} (${usage}% of Orca's limit) in ${where}`,
  );
  if (result.skipped.length > 0) console.warn(`${String(result.skipped.length)} file(s) skipped.`);
  console.log(
    'Load it in Orca from Settings > Plugins > Development > Add path (it reloads on every build).',
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
