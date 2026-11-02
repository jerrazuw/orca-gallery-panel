import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPlugin, BuildError, formatBytes, oversizeMessage } from '../src/build.ts';
import { serializeConfig } from '../src/html.ts';
import { parseCommand, resolveOptions, type BuildOptions, type Settings } from '../src/options.ts';
import { parseConfig } from '../src/panel/config.ts';

const EXAMPLES = fileURLToPath(new URL('../examples/images/', import.meta.url));
const silent = { warn: () => undefined };

function options(input: string, outDir: string, extra: string[] = []): BuildOptions {
  const command = parseCommand([input, '--out', outDir, ...extra]);
  assert.equal(command.kind, 'build');
  return resolveOptions([{ settings: command.settings, baseDir: process.cwd() }], process.cwd());
}

function only<T>(items: readonly T[]): T {
  assert.equal(items.length, 1);
  return items[0] as T;
}

function embeddedConfig(html: string): unknown {
  const match = /<script type="application\/json" id="gallery-config">([\s\S]*?)<\/script>/.exec(
    html,
  );
  assert.ok(match?.[1], 'config script not found');
  return JSON.parse(match[1]);
}

describe('buildPlugin', () => {
  let work = '';

  before(async () => {
    work = await mkdtemp(join(tmpdir(), 'gallery-build-'));
  });

  after(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it('builds a self-contained panel and manifest from the examples', async () => {
    const outDir = join(work, 'out');
    const result = await buildPlugin(
      options(EXAMPLES, outDir, [
        '--title',
        'Demo',
        '-i',
        '30',
        '--fit',
        'cover',
        '--effect',
        'kenburns',
        '--caption',
      ]),
      silent,
    );
    const gallery = only(result.galleries);

    assert.equal(gallery.images.length, 6);
    assert.deepEqual(gallery.skipped, []);
    assert.ok(
      gallery.images.some((image) => image.animated),
      'the GIF stays animated',
    );
    assert.ok(gallery.images.every((image) => Math.max(image.width, image.height) <= 800));

    const html = await readFile(join(outDir, 'panel.html'), 'utf8');
    assert.equal(Buffer.byteLength(html), gallery.panelBytes);
    assert.doesNotMatch(html, /\b(src|href)="(?!data:)[^"]+"/, 'no external resources');
    assert.doesNotMatch(html, /\/\*__(STYLE|SCRIPT|CONFIG)__\*\//, 'every placeholder is filled');

    const config = parseConfig(embeddedConfig(html));
    assert.equal(config.intervalMs, 30_000);
    assert.equal(config.fit, 'cover');
    assert.equal(config.effect, 'kenburns');
    assert.equal(config.caption, true);
    assert.equal(config.blur, true);
    assert.deepEqual(
      config.images.map((image) => image.label),
      ['01-dusk', '02-ember', '03-lagoon', '04-bloom', '05-glacier', '06-orbit'],
    );
    assert.ok(config.images.every((image) => image.src.startsWith('data:image/webp;base64,')));

    const manifest = JSON.parse(await readFile(join(outDir, 'orca-plugin.json'), 'utf8')) as {
      name: string;
    };
    assert.equal(manifest.name, 'Demo');
  });

  it('builds one panel per gallery and removes panels of galleries that are gone', async () => {
    const outDir = join(work, 'multi');
    const settings: Settings = {
      title: 'Collections',
      out: outDir,
      galleries: [
        { folder: EXAMPLES, title: 'Abstract art' },
        { folder: EXAMPLES, title: 'Abstract art', interval: 5 },
      ],
    };
    const first = await buildPlugin(resolveOptions([{ settings, baseDir: work }], work), silent);
    assert.deepEqual(
      first.galleries.map((gallery) => gallery.entry),
      ['panel-abstract-art.html', 'panel-abstract-art-2.html'],
    );

    const manifest = JSON.parse(await readFile(join(outDir, 'orca-plugin.json'), 'utf8')) as {
      name: string;
      contributes: { panels: { id: string; title: string }[] };
    };
    assert.equal(manifest.name, 'Collections');
    assert.deepEqual(
      manifest.contributes.panels.map((panel) => panel.id),
      ['abstract-art', 'abstract-art-2'],
    );
    const second = parseConfig(
      embeddedConfig(await readFile(join(outDir, 'panel-abstract-art-2.html'), 'utf8')),
    );
    assert.equal(second.intervalMs, 5000);

    await writeFile(join(outDir, 'notes.html'), 'not ours');
    await buildPlugin(
      resolveOptions([{ settings: { folder: EXAMPLES, out: outDir }, baseDir: work }], work),
      silent,
    );
    assert.deepEqual((await readdir(outDir)).sort(), [
      'notes.html',
      'orca-plugin.json',
      'panel.html',
    ]);
  });

  it('skips files it cannot decode and keeps the rest', async () => {
    const input = join(work, 'mixed');
    await mkdir(input);
    await copyFile(join(EXAMPLES, '01-dusk.jpg'), join(input, 'good.jpg'));
    await writeFile(join(input, 'broken.png'), 'not an image');

    const warnings: string[] = [];
    const result = await buildPlugin(options(input, join(work, 'mixed-out')), {
      warn: (m) => warnings.push(m),
    });

    const gallery = only(result.galleries);
    assert.equal(gallery.images.length, 1);
    assert.equal(gallery.skipped.length, 1);
    assert.match(warnings[0] ?? '', /Skipping broken\.png/);
  });

  it('fails clearly when the folder is missing or has no images', async () => {
    await assert.rejects(
      buildPlugin(options(join(work, 'missing'), work), silent),
      (error: unknown) => {
        assert.ok(error instanceof BuildError);
        assert.match(error.message, /Image folder not found/);
        return true;
      },
    );
    await assert.rejects(
      buildPlugin(options(work, join(work, 'empty-out')), silent),
      /No supported images/,
    );
  });
});

describe('serializeConfig', () => {
  it('cannot close the script element it lives in', () => {
    const json = serializeConfig({
      images: [{ src: 'data:image/png;base64,AA', label: '</script><script>alert(1)</script>' }],
      intervalMs: 0,
      fit: 'contain',
      blur: true,
      effect: 'none',
      caption: false,
      layout: 'slideshow',
      count: 3,
      rotate: 'one',
      demo: false,
    });
    assert.doesNotMatch(json, /</);
    assert.equal(
      parseConfig(JSON.parse(json)).images[0]?.label,
      '</script><script>alert(1)</script>',
    );
  });
});

describe('oversizeMessage', () => {
  it('names the largest images and how to shrink them', () => {
    const message = oversizeMessage('Wallpapers', 11 * 1024 * 1024, [
      { file: '/a/small.jpg', bytes: 1_000, width: 1, height: 1, animated: false },
      { file: '/a/huge.gif', bytes: 9_000_000, width: 1, height: 1, animated: true },
    ]);
    assert.match(message, /"Wallpapers" is 11\.0 MB, over Orca's 10\.0 MB limit for a panel/);
    assert.match(message, /huge\.gif \(animated\)\n.*small\.jpg/);
    assert.match(message, /--max-size or --quality/);
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2 KB');
    assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
  });
});
