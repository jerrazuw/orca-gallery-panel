import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { SETTING_KEYS, UsageError, validateSettings, type SettingsSource } from './options.ts';

/**
 * Reads saved build settings so a rebuild is just `npm run build`. Returns
 * undefined when an optional file is missing; a file that exists but is
 * invalid always fails, so a typo never silently falls back to defaults.
 */
export async function loadConfigFile(
  path: string,
  { required }: { required: boolean },
): Promise<SettingsSource | undefined> {
  const file = resolve(path);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new UsageError(`Cannot read config file ${file}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new UsageError(
      `${basename(file)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UsageError(`${basename(file)} must contain a JSON object`);
  }

  const entries = raw as Record<string, unknown>;
  const unknown = Object.keys(entries).filter(
    (key) => key !== '$schema' && !(SETTING_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new UsageError(
      `Unknown setting ${unknown.map((key) => `"${key}"`).join(', ')} in ${basename(file)}. ` +
        `Valid settings: ${SETTING_KEYS.join(', ')}`,
    );
  }

  const settings = validateSettings(entries, (key) => `"${key}" in ${basename(file)}`);
  return { settings, baseDir: dirname(file) };
}
