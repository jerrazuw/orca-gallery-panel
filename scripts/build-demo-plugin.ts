/**
 * Builds plugin/: the sample gallery that Orca's plugin directory lists. The
 * directory installs a plugin from a tagged commit as it is, so this build is
 * committed, and `npm version` reruns this script so every tag carries a fresh one.
 *
 * Its panel shows a note on how to build a gallery from your own folder, and it
 * uses its own plugin id so it can sit next to that build.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildPlugin } from '../src/build.ts';
import { DEMO_ICON, DEMO_NAME, DEMO_TITLE } from '../src/manifest.ts';
import { resolveOptions } from '../src/options.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const DEMO_DIR = join(root, 'plugin');
const ICON_SOURCE = join(root, 'examples/images/01-dusk.jpg');
const ICON_SIZE = 256;

const options = resolveOptions(
  [
    {
      settings: {
        folder: 'examples/images',
        out: 'plugin',
        title: DEMO_TITLE,
        interval: 20,
        effect: 'kenburns',
      },
      baseDir: root,
    },
  ],
  root,
);

await buildPlugin({ ...options, name: DEMO_NAME, demo: true });
await sharp(ICON_SOURCE)
  .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' })
  .png({ compressionLevel: 9 })
  .toFile(join(DEMO_DIR, DEMO_ICON));

console.log(`Built the demo plugin in ${DEMO_DIR}`);
