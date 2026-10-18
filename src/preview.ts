import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PANEL_ENTRY } from './manifest.ts';

/**
 * Wraps a built panel the way Orca does (CSP meta, theme tokens, sandboxed
 * srcdoc iframe) so it can be checked in a regular browser without Orca.
 * Token values mirror Orca's src/renderer/src/assets/main.css.
 */

const CSP =
  "default-src 'none'; connect-src 'none'; script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

export const THEMES = {
  dark: '--background:#0a0a0a;--foreground:#fafafa;--secondary:#262626;--muted-foreground:#a1a1a1;--border:rgb(255 255 255 / 0.07);--ring:#737373;--input:rgb(255 255 255 / 0.15);--primary:#e5e5e5;--primary-foreground:#171717;--destructive:#ff6568;--radius:0.625rem',
  light:
    '--background:#fff;--foreground:#0a0a0a;--secondary:#f5f5f5;--muted-foreground:#737373;--border:#e5e5e5;--ring:#a1a1a1;--input:#e5e5e5;--primary:#171717;--primary-foreground:#fafafa;--destructive:#e40014;--radius:0.625rem',
} as const;

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

export function orcaShell(panelHtml: string, theme: keyof typeof THEMES): string {
  return (
    `<!doctype html>\n<html class="${theme}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n` +
    `<style>:root{${THEMES[theme]}}</style>\n` +
    // Orca swallows every form submit inside a panel, so the panel must not rely on one.
    `<script>window.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation()},true)</script>\n` +
    `</head>\n` +
    panelHtml
  );
}

export function previewPage(panelHtml: string): string {
  const frame = (theme: keyof typeof THEMES): string =>
    `<figure><figcaption>${theme}</figcaption><iframe sandbox="allow-scripts" srcdoc="${escapeAttribute(orcaShell(panelHtml, theme))}"></iframe></figure>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Gallery panel preview</title>
<style>
  body { margin: 0; padding: 24px; display: flex; gap: 24px; flex-wrap: wrap; background: #1c1c1c; font: 13px system-ui, sans-serif; color: #ccc; }
  figure { margin: 0; }
  figcaption { margin-bottom: 8px; }
  iframe { width: 360px; height: 560px; border: 1px solid #333; border-radius: 8px; resize: both; overflow: auto; }
</style>
</head>
<body>
${frame('dark')}
${frame('light')}
</body>
</html>
`;
}

async function main(): Promise<void> {
  const outDir = resolve(process.argv[2] ?? 'dist');
  const panel = await readFile(join(outDir, PANEL_ENTRY), 'utf8').catch(() => {
    throw new Error(`No ${PANEL_ENTRY} in ${outDir}. Run "npm run build" first.`);
  });
  const target = join(outDir, 'preview.html');
  await writeFile(target, previewPage(panel));
  console.log(`Open ${target} in a browser.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
