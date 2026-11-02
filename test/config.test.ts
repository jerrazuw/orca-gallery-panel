import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_INTERVAL_SECONDS, parseConfig, parseIntervalSeconds } from '../src/panel/config.ts';

const valid = {
  images: [{ src: 'data:image/webp;base64,AAAA', label: 'cat' }],
  intervalMs: 1000,
  fit: 'contain',
  blur: true,
  effect: 'none',
  caption: false,
  demo: false,
};

describe('parseConfig', () => {
  it('accepts a valid config', () => {
    assert.deepEqual(parseConfig(valid), valid);
  });

  it('treats a config without demo as a regular build', () => {
    assert.equal(parseConfig({ ...valid, demo: undefined }).demo, false);
  });

  it('defaults a missing label to an empty string', () => {
    const config = parseConfig({ ...valid, images: [{ src: 'data:image/png;base64,AA' }] });
    assert.equal(config.images[0]?.label, '');
  });

  it('only accepts inline data:image sources', () => {
    assert.throws(
      () => parseConfig({ ...valid, images: [{ src: 'https://example.com/a.png' }] }),
      /images\[0\]\.src/,
    );
  });

  it('rejects an invalid interval or fit mode', () => {
    assert.throws(() => parseConfig({ ...valid, intervalMs: -1 }), /intervalMs/);
    assert.throws(() => parseConfig({ ...valid, intervalMs: Number.NaN }), /intervalMs/);
    assert.throws(() => parseConfig({ ...valid, fit: 'stretch' }), /fit/);
    assert.throws(() => parseConfig({ ...valid, effect: 'spin' }), /effect/);
    assert.throws(() => parseConfig({ ...valid, blur: 'yes' }), /blur/);
    assert.throws(() => parseConfig({ ...valid, caption: 1 }), /caption/);
    assert.throws(() => parseConfig({ ...valid, demo: 'yes' }), /demo/);
  });

  it('rejects anything that is not an object', () => {
    assert.throws(() => parseConfig(null), TypeError);
    assert.throws(() => parseConfig({ ...valid, images: 'nope' }), /images/);
  });
});

describe('parseIntervalSeconds', () => {
  it('accepts whole seconds in range, ignoring surrounding spaces', () => {
    assert.equal(parseIntervalSeconds('60'), 60);
    assert.equal(parseIntervalSeconds(' 0 '), 0);
    assert.equal(parseIntervalSeconds(String(MAX_INTERVAL_SECONDS)), MAX_INTERVAL_SECONDS);
  });

  for (const text of ['', '  ', 'abc', '1.5', '-3', '1e3', String(MAX_INTERVAL_SECONDS + 1)]) {
    it(`rejects ${JSON.stringify(text)}`, () => {
      assert.equal(parseIntervalSeconds(text), undefined);
    });
  }
});
