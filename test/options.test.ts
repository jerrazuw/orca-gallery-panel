import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULTS, parseCommand, UsageError, type BuildOptions } from '../src/options.ts';

const cwd = resolve('/work');

function build(argv: string[]): BuildOptions {
  const command = parseCommand(argv, cwd);
  assert.equal(command.kind, 'build');
  return command.options;
}

describe('parseCommand', () => {
  it('uses the defaults', () => {
    assert.deepEqual(build([]), {
      input: resolve(cwd, DEFAULTS.input),
      outDir: resolve(cwd, DEFAULTS.outDir),
      title: DEFAULTS.title,
      intervalSeconds: DEFAULTS.intervalSeconds,
      maxSize: DEFAULTS.maxSize,
      quality: DEFAULTS.quality,
      fit: DEFAULTS.fit,
      recursive: false,
    });
  });

  it('reads every option', () => {
    const options = build([
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
    ]);
    assert.deepEqual(options, {
      input: resolve(cwd, 'photos'),
      outDir: resolve(cwd, 'plugin'),
      title: 'My gallery',
      intervalSeconds: 0,
      maxSize: 1200,
      quality: 90,
      fit: 'cover',
      recursive: true,
    });
  });

  it('handles --help and --version', () => {
    assert.deepEqual(parseCommand(['--help'], cwd), { kind: 'help' });
    assert.deepEqual(parseCommand(['-v'], cwd), { kind: 'version' });
  });

  for (const [argv, pattern] of [
    [['--quality', '0'], /--quality must be an integer between 1 and 100/],
    [['--max-size', 'big'], /--max-size/],
    [['--interval', '1.5'], /--interval/],
    [['--fit', 'stretch'], /--fit must be one of contain, cover/],
    [['--title', '   '], /--title/],
    [['a', 'b'], /at most one folder/],
    [['--nope'], /Unknown option/],
  ] as const) {
    it(`rejects ${argv.join(' ')}`, () => {
      assert.throws(
        () => parseCommand(argv, cwd),
        (error: unknown) => {
          assert.ok(error instanceof UsageError);
          assert.match(error.message, pattern);
          return true;
        },
      );
    });
  }
});
