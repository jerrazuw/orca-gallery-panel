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
        recursive: true,
      },
    );
  });

  it('returns the config path', () => {
    const command = parseCommand(['-c', 'mine.json']);
    assert.equal(command.kind === 'build' && command.configPath, 'mine.json');
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
  it('falls back to the defaults', () => {
    assert.deepEqual(resolveOptions([], cwd), {
      input: resolve(cwd, DEFAULTS.folder),
      outDir: resolve(cwd, DEFAULTS.out),
      title: DEFAULTS.title,
      intervalSeconds: DEFAULTS.interval,
      maxSize: DEFAULTS.maxSize,
      quality: DEFAULTS.quality,
      fit: DEFAULTS.fit,
      recursive: DEFAULTS.recursive,
    });
  });

  it('lets later sources override earlier ones, setting by setting', () => {
    const options = resolveOptions(
      [
        { settings: { title: 'From file', interval: 60, quality: 90 }, baseDir: cwd },
        { settings: { interval: 10 }, baseDir: cwd },
      ],
      cwd,
    );
    assert.equal(options.title, 'From file');
    assert.equal(options.quality, 90);
    assert.equal(options.intervalSeconds, 10);
  });

  it('resolves each path against the folder of the source that set it', () => {
    const options = resolveOptions(
      [
        { settings: { folder: 'pics', out: 'build' }, baseDir: resolve('/config') },
        { settings: { out: 'here' }, baseDir: cwd },
      ],
      cwd,
    );
    assert.equal(options.input, resolve('/config', 'pics'));
    assert.equal(options.outDir, resolve(cwd, 'here'));
  });

  it('expands ~ to the home folder', () => {
    const options = resolveOptions([{ settings: { folder: '~/Pictures' }, baseDir: cwd }], cwd);
    assert.equal(options.input, join(homedir(), 'Pictures'));
  });
});

describe('expandHome', () => {
  it('only expands a leading ~', () => {
    assert.equal(expandHome('~'), homedir());
    assert.equal(expandHome('a/~/b'), 'a/~/b');
    assert.equal(expandHome('~other'), '~other');
  });
});
