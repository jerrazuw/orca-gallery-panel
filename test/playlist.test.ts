import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_HISTORY, Playlist, shuffledCycle, type Random } from '../src/panel/playlist.ts';

function sequence(...values: number[]): Random {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('shuffledCycle', () => {
  it('contains every index exactly once', () => {
    const cycle = shuffledCycle(10, Math.random);
    assert.deepEqual(
      [...cycle].sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
  });

  it('orders indexes by their random key', () => {
    assert.deepEqual(shuffledCycle(3, sequence(0.9, 0.1, 0.5)), [1, 2, 0]);
  });

  it('moves the avoided index away from the front', () => {
    const cycle = shuffledCycle(3, sequence(0.9, 0.1, 0.5), 1);
    assert.notEqual(cycle[0], 1);
    assert.equal(cycle.length, 3);
  });

  it('cannot avoid the only index there is', () => {
    assert.deepEqual(shuffledCycle(1, Math.random, 0), [0]);
  });
});

describe('Playlist', () => {
  it('rejects an empty or invalid size', () => {
    assert.throws(() => new Playlist(0), RangeError);
    assert.throws(() => new Playlist(1.5), RangeError);
  });

  it('shows every image once before repeating any', () => {
    const playlist = new Playlist(5);
    for (let cycle = 0; cycle < 20; cycle++) {
      const seen = new Set(Array.from({ length: 5 }, () => playlist.next()));
      assert.equal(seen.size, 5);
    }
  });

  it('never shows the same image twice in a row', () => {
    const playlist = new Playlist(3);
    let last = playlist.next();
    for (let i = 0; i < 300; i++) {
      const current = playlist.next();
      assert.notEqual(current, last);
      last = current;
    }
  });

  it('walks back through history and forward again', () => {
    const playlist = new Playlist(4);
    const shown = [playlist.next(), playlist.next(), playlist.next()];
    assert.equal(playlist.previous(), shown[1]);
    assert.equal(playlist.previous(), shown[0]);
    assert.equal(playlist.previous(), shown[0], 'stays on the first image');
    assert.equal(playlist.next(), shown[1]);
    assert.equal(playlist.next(), shown[2]);
  });

  it('keeps a single image on screen', () => {
    const playlist = new Playlist(1);
    assert.equal(playlist.next(), 0);
    assert.equal(playlist.next(), 0);
    assert.equal(playlist.previous(), 0);
  });

  it('bounds its history', () => {
    const playlist = new Playlist(7);
    for (let i = 0; i < MAX_HISTORY * 3; i++) playlist.next();

    let steps = 0;
    let current = playlist.current;
    for (;;) {
      const previous = playlist.previous();
      if (previous === current) break;
      current = previous;
      steps++;
    }
    assert.ok(steps < MAX_HISTORY, `walked back ${String(steps)} steps`);
  });

  it('throws when asked for previous before anything was shown', () => {
    assert.throws(() => new Playlist(2).previous(), /call next\(\) first/);
  });
});
