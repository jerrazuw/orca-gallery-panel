import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium, type Browser, type Frame, type Page } from 'playwright';
import sharp from 'sharp';
import { renderPanelHtml } from '../../src/html.ts';
import type { GalleryConfig, GalleryImage } from '../../src/panel/config.ts';
import { orcaShell } from '../../src/preview.ts';

const BROKEN: GalleryImage = { src: 'data:image/webp;base64,AAAA', label: 'broken' };

async function solid(color: string, label: string): Promise<GalleryImage> {
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: color } })
    .png()
    .toBuffer();
  return { src: `data:image/png;base64,${png.toString('base64')}`, label };
}

async function waitFor<T>(
  read: () => Promise<T>,
  check: (value: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!check(value)) {
    if (Date.now() > deadline) throw new Error(`Timed out, last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = await read();
  }
  return value;
}

describe('panel in a sandboxed Orca-like frame', () => {
  let browser: Browser;
  let images: GalleryImage[];

  before(async () => {
    browser = await chromium.launch();
    images = await Promise.all([
      solid('#e11d48', 'red'),
      solid('#16a34a', 'green'),
      solid('#2563eb', 'blue'),
    ]);
  });

  after(async () => {
    await browser.close();
  });

  async function open(
    config: Partial<GalleryConfig>,
    locale = 'en-US',
  ): Promise<{ page: Page; frame: Frame; errors: string[] }> {
    const html = await renderPanelHtml({ images, intervalMs: 0, fit: 'contain', ...config });
    const page = await browser.newPage({ locale, viewport: { width: 360, height: 560 } });
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const srcdoc = orcaShell(html, 'dark').replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    await page.setContent(
      `<iframe sandbox="allow-scripts" style="width:100%;height:100vh;border:0" srcdoc="${srcdoc}"></iframe>`,
    );
    const frame = await waitFor(
      () => Promise.resolve(page.frames()[1]),
      (found) => found !== undefined,
    );
    if (!frame) throw new Error('panel frame not found');
    await frame.waitForSelector('.layer.visible');
    return { page, frame, errors };
  }

  const visibleLabel = (frame: Frame) => frame.getAttribute('.layer.visible', 'alt');
  const counter = (frame: Frame) => frame.textContent('#counter');

  it('shows an image without errors or CSP violations', async () => {
    const { page, frame, errors } = await open({});
    assert.match((await counter(frame)) ?? '', /^[1-3] \/ 3$/);
    assert.ok(['red', 'green', 'blue'].includes((await visibleLabel(frame)) ?? ''));
    assert.deepEqual(errors, []);
    await page.close();
  });

  it('moves forward and back with the buttons and the keyboard', async () => {
    const { page, frame } = await open({});
    const first = await visibleLabel(frame);

    await frame.click('[data-action="next"]');
    const second = await waitFor(
      () => visibleLabel(frame),
      (label) => label !== first,
    );

    await frame.click('[data-action="previous"]');
    await waitFor(
      () => visibleLabel(frame),
      (label) => label === first,
    );

    await frame.press('body', 'ArrowRight');
    await waitFor(
      () => visibleLabel(frame),
      (label) => label === second,
    );
    await page.close();
  });

  it('pauses and resumes', async () => {
    const { page, frame } = await open({});
    const toggle = '[data-action="toggle"]';
    assert.equal(await frame.getAttribute(toggle, 'aria-label'), 'Pause slideshow');

    await frame.click(toggle);
    assert.equal(await frame.getAttribute(toggle, 'aria-pressed'), 'true');
    assert.equal(await frame.getAttribute(toggle, 'aria-label'), 'Resume slideshow');

    await frame.press('body', ' ');
    assert.equal(await frame.getAttribute(toggle, 'aria-pressed'), 'false');
    await page.close();
  });

  it('switches between fit and fill', async () => {
    const { page, frame } = await open({ fit: 'cover' });
    const fit = () => frame.getAttribute('body', 'data-fit');
    assert.equal(await fit(), 'cover');
    await frame.click('[data-action="fit"]');
    assert.equal(await fit(), 'contain');
    await frame.press('body', 'f');
    assert.equal(await fit(), 'cover');
    await page.close();
  });

  it('rotates on its own and stops while paused', async () => {
    const { page, frame } = await open({ intervalMs: 300 });
    const first = await visibleLabel(frame);
    await waitFor(
      () => visibleLabel(frame),
      (label) => label !== first,
      3000,
    );

    await frame.click('[data-action="toggle"]');
    const paused = await visibleLabel(frame);
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(await visibleLabel(frame), paused);
    await page.close();
  });

  it('skips images that fail to load', async () => {
    const { page, frame } = await open({ images: [BROKEN, images[0] as GalleryImage] });
    assert.equal(await visibleLabel(frame), 'red');
    await page.close();
  });

  it('explains when nothing can be shown', async () => {
    const html = await renderPanelHtml({ images: [BROKEN], intervalMs: 0, fit: 'contain' });
    assert.ok(html);
    const page = await browser.newPage();
    await page.setContent(orcaShell(html, 'light'));
    await waitFor(
      () => page.textContent('#message'),
      (text) => Boolean(text),
    );
    assert.equal(await page.textContent('#message'), 'None of the images could be displayed.');

    await page.setContent(
      orcaShell(await renderPanelHtml({ images: [], intervalMs: 0, fit: 'contain' }), 'light'),
    );
    assert.match((await page.textContent('#message')) ?? '', /No images yet/);
    await page.close();
  });

  it('changes the interval from the clock button', async () => {
    const { page, frame } = await open({ intervalMs: 0 });
    const clock = '[data-action="interval"]';
    assert.equal(
      await frame.getAttribute(clock, 'aria-label'),
      'Change interval (automatic change is off)',
    );

    await frame.click(clock);
    assert.equal(await frame.getAttribute(clock, 'aria-expanded'), 'true');
    assert.equal(await frame.inputValue('#interval-input'), '0');
    assert.equal(await frame.evaluate(() => document.activeElement?.id), 'interval-input');

    await frame.fill('#interval-input', '1');
    await frame.press('#interval-input', 'Enter');
    assert.equal(await frame.isVisible('#interval-editor'), false);
    assert.equal(await frame.getAttribute(clock, 'aria-label'), 'Change interval (1 s)');

    const first = await visibleLabel(frame);
    await waitFor(
      () => visibleLabel(frame),
      (label) => label !== first,
      3000,
    );
    await page.close();
  });

  it('rejects an invalid interval and keeps the editor open', async () => {
    const { page, frame } = await open({ intervalMs: 60_000 });
    await frame.click('[data-action="interval"]');
    await frame.fill('#interval-input', '1.5');
    await frame.click('#interval-apply');

    assert.equal(await frame.isVisible('#interval-editor'), true);
    assert.equal(await frame.getAttribute('#interval-input', 'aria-invalid'), 'true');
    assert.match((await frame.textContent('#interval-hint')) ?? '', /whole number/);
    assert.equal(
      await frame.getAttribute('[data-action="interval"]', 'aria-label'),
      'Change interval (60 s)',
    );
    await page.close();
  });

  it('does not treat typing in the editor as shortcuts, and closes on Escape or outside clicks', async () => {
    const { page, frame } = await open({ fit: 'contain' });
    await frame.click('[data-action="interval"]');
    await frame.press('#interval-input', 'f');
    await frame.press('#interval-input', ' ');
    assert.equal(await frame.getAttribute('body', 'data-fit'), 'contain');
    assert.equal(await frame.getAttribute('[data-action="toggle"]', 'aria-pressed'), 'false');

    await frame.press('#interval-input', 'Escape');
    assert.equal(await frame.isVisible('#interval-editor'), false);
    assert.equal(
      await frame.evaluate(() => document.activeElement?.getAttribute('data-action')),
      'interval',
    );

    await frame.click('[data-action="interval"]');
    await frame.click('.stage', { position: { x: 20, y: 20 }, force: true });
    assert.equal(await frame.isVisible('#interval-editor'), false);
    await page.close();
  });

  it('hides navigation for a single image', async () => {
    const { page, frame } = await open({ images: [images[0] as GalleryImage] });
    assert.equal(await frame.isVisible('[data-action="next"]'), false);
    assert.equal(await frame.isVisible('[data-action="interval"]'), false);
    assert.equal(await frame.isVisible('[data-action="fit"]'), true);
    await page.close();
  });

  it('speaks Spanish to a Spanish browser', async () => {
    const { page, frame } = await open({}, 'es-CL');
    assert.equal(await frame.getAttribute('html', 'lang'), 'es');
    assert.equal(
      await frame.getAttribute('[data-action="next"]', 'aria-label'),
      'Imagen siguiente',
    );
    await page.close();
  });
});
