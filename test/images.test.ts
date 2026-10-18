import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { findImages, isSupportedImage, labelFor } from '../src/images.ts';

describe('isSupportedImage', () => {
  it('matches extensions case-insensitively', () => {
    assert.ok(isSupportedImage('a.JPG'));
    assert.ok(isSupportedImage('b.webp'));
    assert.ok(!isSupportedImage('c.heic'));
    assert.ok(!isSupportedImage('notes.txt'));
  });
});

describe('labelFor', () => {
  it('uses the file name without its extension', () => {
    assert.equal(labelFor('/x/Mount Fuji.final.png'), 'Mount Fuji.final');
  });
});

describe('findImages', () => {
  let dir = '';

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gallery-images-'));
    await mkdir(join(dir, 'nested'));
    await Promise.all(
      ['img10.png', 'img2.png', 'img1.JPG', '.hidden.png', 'readme.md', 'nested/deep.gif'].map(
        (file) => writeFile(join(dir, file), ''),
      ),
    );
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lists supported images in natural order and skips hidden files', async () => {
    assert.deepEqual(await findImages(dir, false), [
      join(dir, 'img1.JPG'),
      join(dir, 'img2.png'),
      join(dir, 'img10.png'),
    ]);
  });

  it('includes subfolders when recursive', async () => {
    const files = await findImages(dir, true);
    assert.ok(files.includes(join(dir, 'nested', 'deep.gif')));
    assert.equal(files.length, 4);
  });
});
