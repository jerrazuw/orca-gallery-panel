/**
 * Generates the sample images in examples/images/: abstract, license-free art
 * in several formats, aspect ratios and one animation, so the build can be
 * tried (and tested) without bringing your own pictures.
 */
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = new URL('../examples/images/', import.meta.url);

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Palette {
  from: string;
  to: string;
  shapes: string[];
}

const PALETTES: Palette[] = [
  { from: '#0f172a', to: '#312e81', shapes: ['#f472b6', '#a78bfa', '#38bdf8'] },
  { from: '#fef3c7', to: '#fb923c', shapes: ['#be123c', '#7c2d12', '#facc15'] },
  { from: '#022c22', to: '#0f766e', shapes: ['#a3e635', '#5eead4', '#fde047'] },
  { from: '#1e1b4b', to: '#9d174d', shapes: ['#fda4af', '#fcd34d', '#c4b5fd'] },
  { from: '#e0f2fe', to: '#6366f1', shapes: ['#0e7490', '#f0abfc', '#1e3a8a'] },
];

function artwork(width: number, height: number, palette: Palette, seed: number): string {
  const random = seeded(seed);
  const shapes = Array.from({ length: 14 }, (_, i) => {
    const color = palette.shapes[i % palette.shapes.length] ?? '#fff';
    const x = (random() * width).toFixed(0);
    const y = (random() * height).toFixed(0);
    const r = (Math.min(width, height) * (0.05 + random() * 0.25)).toFixed(0);
    const opacity = (0.35 + random() * 0.5).toFixed(2);
    return random() > 0.4
      ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="${opacity}"/>`
      : `<rect x="${x}" y="${y}" width="${r}" height="${r}" rx="${(Number(r) / 6).toFixed(0)}" fill="${color}" fill-opacity="${opacity}" transform="rotate(${(random() * 90).toFixed(0)} ${x} ${y})"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${palette.from}"/><stop offset="1" stop-color="${palette.to}"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  ${shapes.join('\n  ')}
</svg>`;
}

function palette(index: number): Palette {
  const found = PALETTES[index % PALETTES.length];
  if (!found) throw new Error('No palettes defined');
  return found;
}

async function animatedOrbit(file: string): Promise<void> {
  const size = 480;
  const frames = await Promise.all(
    Array.from({ length: 24 }, (_, frame) => {
      const angle = (frame / 24) * Math.PI * 2;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <circle cx="240" cy="240" r="60" fill="#facc15"/>
  <circle cx="${(240 + Math.cos(angle) * 150).toFixed(1)}" cy="${(240 + Math.sin(angle) * 150).toFixed(1)}" r="26" fill="#38bdf8"/>
  <circle cx="${(240 + Math.cos(-angle * 2) * 90).toFixed(1)}" cy="${(240 + Math.sin(-angle * 2) * 90).toFixed(1)}" r="12" fill="#f472b6"/>
</svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }),
  );
  await sharp(frames, { join: { animated: true } })
    .gif({ delay: 80, loop: 0, dither: 0 })
    .toFile(file);
}

async function main(): Promise<void> {
  const dir = fileURLToPath(OUT);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const stills: { name: string; width: number; height: number; format: 'jpeg' | 'png' }[] = [
    { name: '01-dusk.jpg', width: 1600, height: 1000, format: 'jpeg' },
    { name: '02-ember.jpg', width: 1000, height: 1500, format: 'jpeg' },
    { name: '03-lagoon.png', width: 1200, height: 1200, format: 'png' },
    { name: '04-bloom.jpg', width: 1800, height: 900, format: 'jpeg' },
    { name: '05-glacier.jpg', width: 900, height: 1400, format: 'jpeg' },
  ];

  await Promise.all(
    stills.map(async ({ name, width, height, format }, i) => {
      const image = sharp(Buffer.from(artwork(width, height, palette(i), i + 1)));
      const encoded =
        format === 'png'
          ? image.png({ palette: true })
          : image.jpeg({ quality: 82, mozjpeg: true });
      await encoded.toFile(join(dir, name));
    }),
  );
  await animatedOrbit(join(dir, '06-orbit.gif'));
  console.log(`Wrote ${String(stills.length + 1)} images to ${dir}`);
}

await main();
