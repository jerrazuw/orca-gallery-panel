import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  DEFAULTS,
  expandHome,
  parseCommand,
  resolveOptions,
  UsageError,
  type BuildOptions,
  type GalleryOptions,
  type Settings,
} from '../src/options.ts';

const cwd = resolve('/work');

function settings(argv: string[]): Settings {
  const command = parseCommand(argv);
  assert.equal(command.kind, 'build');
  return command.settings;
}

describe('parseCommand', () => {
  it('leaves unset options undefined so other sources can fill them', () => {
    assert.deepEqual(settings([]), {});
  });

  it('reads every option', () => {
    assert.deepEqual(
      settings([
        'photos',
        '--out',
        'plugin',
        '--title',
        '  My gallery ',
        '-i',
        '0',
        '-s',
        '1200',
        '-q',
        '90',
        '--fit',
        'cover',
        '--effect',
        'kenburns',
        '--no-blur',
        '--caption',
        '-r',
      ]),
      {
        folder: 'photos',
        out: 'plugin',
        title: 'My gallery',
        interval: 0,
        maxSize: 1200,
        quality: 90,
        fit: 'cover',
        effect: 'kenburns',
        blur: false,
        caption: true,
        recursive: true,
      },
    );
  });

  it('returns the config path and watch mode', () => {
    const command = parseCommand(['-c', 'mine.json', '--watch']);
    assert.equal(command.kind, 'build');
    assert.equal(command.configPath, 'mine.json');
    assert.equal(command.watch, true);
  });

  it('handles --help and --version', () => {
    assert.deepEqual(parseCommand(['--help']), { kind: 'help' });
    assert.deepEqual(parseCommand(['-v']), { kind: 'version' });
  });

  for (const [argv, pattern] of [
    [['--quality', '0'], /--quality must be an integer between 1 and 100, got 0/],
    [['--max-size', 'big'], /--max-size .* got "big"/],
    [['--interval', '1.5'], /--interval/],
    [['--fit', 'stretch'], /--fit must be one of contain, cover/],
    [['--effect', 'spin'], /--effect must be one of none, kenburns/],
    [['--title', '   '], /--title must be a non-empty text/],
    [['a', 'b'], /at most one folder/],
    [['--nope'], /Unknown option/],
  ] as const) {
    it(`rejects ${argv.join(' ')}`, () => {
      assert.throws(
        () => parseCommand(argv),
        (error: unknown) => {
          assert.ok(error instanceof UsageError);
          assert.match(error.message, pattern);
          return true;
        },
      );
    });
  }
});

describe('resolveOptions', () => {
  const only = (options: BuildOptions): GalleryOptions => {
    assert.equal(options.galleries.length, 1);
    const [gallery] = options.galleries;
    assert.ok(gallery);
    return gallery;
  };

  it('falls back to the defaults', () => {
    const options = resolveOptions([], cwd);
    assert.equal(options.outDir, resolve(cwd, DEFAULTS.out));
    assert.equal(options.name, DEFAULTS.title);
    assert.deepEqual(only(options), {
      input: resolve(cwd, DEFAULTS.folder),
      title: DEFAULTS.title,
      intervalSeconds: DEFAULTS.interval,
      maxSize: DEFAULTS.maxSize,
      quality: DEFAULTS.quality,
      fit: DEFAULTS.fit,
      blur: DEFAULTS.blur,
      effect: DEFAULTS.effect,
      caption: DEFAULTS.caption,
      recursive: DEFAULTS.recursive,
    });
  });

  it('lets later sources override earlier ones, setting by setting', () => {
    const gallery = only(
      resolveOptions(
        [
          { settings: { title: 'From file', interval: 60, quality: 90 }, baseDir: cwd },
          { settings: { interval: 10, blur: false }, baseDir: cwd },
        ],
        cwd,
      ),
    );
    assert.equal(gallery.title, 'From file');
    assert.equal(gallery.quality, 90);
    assert.equal(gallery.intervalSeconds, 10);
    assert.equal(gallery.blur, false);
  });

  it('resolves each path against the folder of the source that set it', () => {
    const options = resolveOptions(
      [
        { settings: { folder: 'pics', out: 'build' }, baseDir: resolve('/config') },
        { settings: { out: 'here' }, baseDir: cwd },
      ],
      cwd,
    );
    assert.equal(only(options).input, resolve('/config', 'pics'));
    assert.equal(options.outDir, resolve(cwd, 'here'));
  });

  it('expands ~ to the home folder', () => {
    const options = resolveOptions([{ settings: { folder: '~/Pictures' }, baseDir: cwd }], cwd);
    assert.equal(only(options).input, join(homedir(), 'Pictures'));
  });

  describe('with several galleries', () => {
    const file = resolve('/config');
    const listed = {
      settings: {
        title: 'My galleries',
        interval: 60,
        effect: 'kenburns',
        galleries: [
          { folder: 'anime', title: 'Anime', interval: 20 },
          { folder: '~/Pictures/Walls' },
        ],
      } satisfies Settings,
      baseDir: file,
    };

    it('gives each gallery its own settings on top of the shared ones', () => {
      const options = resolveOptions([listed], cwd);
      assert.equal(options.name, 'My galleries');
      const [anime, walls] = options.galleries;
      assert.ok(anime && walls);
      assert.equal(anime.input, resolve(file, 'anime'));
      assert.equal(anime.intervalSeconds, 20);
      assert.equal(anime.effect, 'kenburns');
      assert.equal(walls.intervalSeconds, 60);
      assert.equal(walls.input, join(homedir(), 'Pictures', 'Walls'));
    });

    it("titles a gallery after its folder when it doesn't have a title", () => {
      assert.equal(resolveOptions([listed], cwd).galleries[1]?.title, 'Walls');
    });

    it('lets the command line override every gallery', () => {
      const options = resolveOptions([listed, { settings: { interval: 5 }, baseDir: cwd }], cwd);
      assert.deepEqual(
        options.galleries.map((gallery) => gallery.intervalSeconds),
        [5, 5],
      );
    });

    it('refuses a folder on the command line', () => {
      assert.throws(
        () => resolveOptions([listed, { settings: { folder: 'x' }, baseDir: cwd }], cwd),
        /cannot be given on the command line/,
      );
    });
  });
});

describe('expandHome', () => {
  it('only expands a leading ~', () => {
    assert.equal(expandHome('~'), homedir());
    assert.equal(expandHome('a/~/b'), 'a/~/b');
    assert.equal(expandHome('~other'), '~other');
  });
});
