import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { watchLoop, type WatchTarget } from '../src/watch.ts';

async function until(check: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a rebuild');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

describe('watchLoop', () => {
  let dir = '';

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gallery-watch-'));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function start(targets: (runs: number) => WatchTarget[], debounceMs = 50) {
    const controller = new AbortController();
    let runs = 0;
    const done = watchLoop(
      () => {
        runs++;
        return Promise.resolve(targets(runs));
      },
      { signal: controller.signal, debounceMs },
    );
    await until(() => runs === 1);
    await settle(150);
    return {
      runs: () => runs,
      stop: async () => {
        controller.abort();
        await done;
      },
    };
  }

  it('runs once, then again when an accepted file changes', async () => {
    const folder = join(dir, 'accepted');
    await mkdir(folder);
    const loop = await start(() => [
      { path: folder, recursive: true, accept: (file) => file.endsWith('.png') },
    ]);

    await writeFile(join(folder, 'notes.txt'), 'ignored');
    await settle();
    assert.equal(loop.runs(), 1, 'a rejected file does not rebuild');

    await writeFile(join(folder, 'cat.png'), 'x');
    await until(() => loop.runs() === 2);
    await loop.stop();
  });

  it('collapses a burst of changes into a single run', async () => {
    const folder = join(dir, 'burst');
    await mkdir(folder);
    const loop = await start(() => [{ path: folder, recursive: false }], 200);

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => writeFile(join(folder, `${String(i)}.png`), 'x')),
    );
    await until(() => loop.runs() === 2);
    await settle(500);
    assert.equal(loop.runs(), 2);
    await loop.stop();
  });

  it('watches the targets returned by the latest run', async () => {
    const first = join(dir, 'first');
    const second = join(dir, 'second');
    await mkdir(first);
    await mkdir(second);
    const loop = await start((runs) => [{ path: runs === 1 ? first : second, recursive: false }]);

    await writeFile(join(first, 'a.png'), 'x');
    await until(() => loop.runs() === 2);
    await settle();

    await writeFile(join(first, 'b.png'), 'x');
    await settle();
    assert.equal(loop.runs(), 2, 'the old folder is no longer watched');

    await writeFile(join(second, 'c.png'), 'x');
    await until(() => loop.runs() === 3);
    await loop.stop();
  });

  it('skips a target that cannot be watched instead of failing', async () => {
    const controller = new AbortController();
    const skipped: string[] = [];
    const done = watchLoop(
      () => Promise.resolve([{ path: join(dir, 'missing'), recursive: false }]),
      {
        signal: controller.signal,
        onSkip: (target) => skipped.push(target.path),
      },
    );
    await until(() => skipped.length === 1);
    controller.abort();
    await done;
  });
});
