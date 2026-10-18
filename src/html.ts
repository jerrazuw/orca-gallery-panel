import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { GalleryConfig } from './panel/config.ts';

const PANEL_DIR = new URL('./panel/', import.meta.url);
/** The panel's own sources: TypeScript in the repository, compiled JavaScript in the npm package. */
const PANEL_ENTRY_POINT = import.meta.url.endsWith('.ts') ? 'main.ts' : 'main.js';

/** Keeps "</script>" and "<!--" inside the JSON from closing the script element. */
export function serializeConfig(config: GalleryConfig): string {
  return JSON.stringify(config).replaceAll('<', '\\u003c');
}

async function bundlePanelScript(): Promise<string> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(PANEL_ENTRY_POINT, PANEL_DIR))],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'chrome120',
    minify: true,
    legalComments: 'none',
  });
  const [output] = result.outputFiles;
  if (!output) throw new Error('esbuild produced no output for the panel script');
  return output.text;
}

/**
 * Orca loads a panel as a single srcdoc with a CSP that only allows inline
 * scripts/styles and data: images, so everything is inlined into one file.
 */
export async function renderPanelHtml(config: GalleryConfig): Promise<string> {
  const [template, style, script] = await Promise.all([
    readFile(new URL('template.html', PANEL_DIR), 'utf8'),
    readFile(new URL('panel.css', PANEL_DIR), 'utf8'),
    bundlePanelScript(),
  ]);

  return template
    .replace('/*__STYLE__*/', () => style)
    .replace('/*__CONFIG__*/', () => serializeConfig(config))
    .replace('/*__SCRIPT__*/', () => script.replaceAll('</script', '<\\/script'));
}
