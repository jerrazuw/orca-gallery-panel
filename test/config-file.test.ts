import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { loadConfigFile } from '../src/config-file.ts';
import { DEFAULTS, GALLERY_KEYS, SETTING_KEYS, UsageError } from '../src/options.ts';

describe('loadConfigFile', () => {
  let dir = '';

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gallery-config-'));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function write(name: string, content: unknown): Promise<string> {
    const file = join(dir, name);
    await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
    return file;
  }

  async function rejects(file: string, pattern: RegExp): Promise<void> {
    await assert.rejects(loadConfigFile(file, { required: true }), (error: unknown) => {
      assert.ok(error instanceof UsageError);
      assert.match(error.message, pattern);
      return true;
    });
  }

  it('reads the settings and remembers where the file is', async () => {
    const file = await write('ok.json', {
      $schema: './gallery.config.schema.json',
      folder: '~/Pictures',
      title: 'Wallpapers',
      interval: 60,
      fit: 'cover',
      recursive: true,
    });
    assert.deepEqual(await loadConfigFile(file, { required: true }), {
      settings: {
        folder: '~/Pictures',
        title: 'Wallpapers',
        interval: 60,
        fit: 'cover',
        recursive: true,
      },
      baseDir: dir,
    });
  });

  it('is optional unless it was asked for', async () => {
    const missing = join(dir, 'missing.json');
    assert.equal(await loadConfigFile(missing, { required: false }), undefined);
    await rejects(missing, /Cannot read config file/);
  });

  it('rejects broken JSON and non-objects', async () => {
    await rejects(await write('broken.json', '{ "interval": 60, }'), /not valid JSON/);
    await rejects(await write('array.json', [1, 2]), /must contain a JSON object/);
  });

  it('names a typo instead of ignoring it', async () => {
    await rejects(
      await write('typo.json', { intervall: 60 }),
      /Unknown setting "intervall" in typo\.json\. Valid settings: folder, title, interval/,
    );
  });

  it('validates every gallery and points at the one that is wrong', async () => {
    const file = await write('galleries.json', {
      galleries: [{ folder: 'a' }, { folder: 'b', intervall: 5 }],
    });
    await rejects(file, /Unknown setting "galleries\[1\]\.intervall"/);
    await rejects(
      await write('no-folder.json', { galleries: [{ title: 'x' }] }),
      /"galleries\[0\]\.folder" in no-folder\.json is required/,
    );
    await rejects(await write('empty.json', { galleries: [] }), /must be a non-empty list/);
    await rejects(
      await write('bad-effect.json', { galleries: [{ folder: 'a', effect: 'spin' }] }),
      /"galleries\[0\]\.effect" in bad-effect\.json must be one of none, kenburns/,
    );
  });

  it('validates values like the command line does', async () => {
    await rejects(
      await write('text.json', { interval: '60' }),
      /"interval" in text\.json must be an integer/,
    );
    await rejects(await write('fit.json', { fit: 'stretch' }), /"fit" in fit\.json must be one of/);
    await rejects(
      await write('bool.json', { recursive: 'yes' }),
      /"recursive" in bool\.json must be true or false/,
    );
  });
});

describe('gallery.config.schema.json', () => {
  interface Schema {
    properties: Record<string, { default?: unknown }>;
    $defs: { gallery: { properties: Record<string, unknown> } };
  }

  it('documents exactly the settings the CLI accepts, with the same defaults', async () => {
    const schema = JSON.parse(
      await readFile(new URL('../gallery.config.schema.json', import.meta.url), 'utf8'),
    ) as Schema;

    const documented = Object.keys(schema.properties).filter((key) => key !== '$schema');
    assert.deepEqual(documented, [...SETTING_KEYS]);
    assert.deepEqual(Object.keys(schema.$defs.gallery.properties), [...GALLERY_KEYS]);
    for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
      assert.equal(schema.properties[key]?.default, DEFAULTS[key], `default of ${key}`);
    }
  });

  it('accepts the example config', async () => {
    const example = new URL('../gallery.config.example.json', import.meta.url);
    assert.ok(await loadConfigFile(fileURLToPath(example), { required: true }));
  });
});
