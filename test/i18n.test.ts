import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { catalogs, pickLocale } from '../src/panel/i18n.ts';

describe('pickLocale', () => {
  it('matches a regional Spanish variant', () => {
    assert.equal(pickLocale(['es-CL', 'en-US']), 'es');
  });

  it('uses the first supported language in order of preference', () => {
    assert.equal(pickLocale(['fr-FR', 'en-GB', 'es-ES']), 'en');
  });

  it('falls back to English', () => {
    assert.equal(pickLocale(['ja-JP']), 'en');
    assert.equal(pickLocale([]), 'en');
  });
});

describe('catalogs', () => {
  it('translates every message', () => {
    assert.deepEqual(Object.keys(catalogs.es).sort(), Object.keys(catalogs.en).sort());
  });

  it('formats the counter for screen readers', () => {
    assert.equal(catalogs.en.counter(2, 9), 'Image 2 of 9');
    assert.equal(catalogs.es.counter(2, 9), 'Imagen 2 de 9');
  });
});
