/**
 * Compiles src/ to lib/ for the npm package. The panel template and styles are
 * read at build time next to the compiled panel code, so they are copied over.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lib = new URL('../lib/', import.meta.url);

await rm(lib, { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
for (const file of ['template.html', 'panel.css']) {
  await copyFile(new URL(`../src/panel/${file}`, import.meta.url), new URL(`panel/${file}`, lib));
}
console.log('Compiled src/ to lib/');
