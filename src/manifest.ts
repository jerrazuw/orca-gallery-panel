import { pkg } from './package-info.ts';

export const PLUGIN_ID = 'gallery-panel';
export const PUBLISHER = 'jerrazuw';
export const PANEL_ID = 'gallery';
export const PANEL_ENTRY = 'panel.html';
export const MANIFEST_FILE = 'orca-plugin.json';
/** First Orca release with the plugin system (stablyai/orca#8549). */
export const MIN_ORCA_VERSION = '1.4.160';
/** One of Orca's curated panel icons; there is no "image" icon. */
export const PANEL_ICON = 'layers';

export interface OrcaPluginManifest {
  manifestVersion: 1;
  id: string;
  publisher: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; url: string };
  repository: string;
  engines: { orca: string };
  pluginApi: 1;
  contributes: {
    panels: { id: string; title: string; icon: string; entry: string }[];
  };
  capabilities: string[];
}

export interface PanelEntry {
  id: string;
  title: string;
  entry: string;
}

const PANEL_ID_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

/**
 * One gallery keeps the original "gallery" id and panel.html, so existing installs
 * keep their panel. Several get an id and file each, derived from their titles.
 */
export function panelEntries(titles: readonly string[]): PanelEntry[] {
  if (titles.length === 1) return [{ id: PANEL_ID, title: titles[0] ?? '', entry: PANEL_ENTRY }];

  const used = new Set<string>();
  return titles.map((title, i) => {
    const base = slug(title) || `gallery-${String(i + 1)}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${String(n)}`;
    used.add(id);
    if (!PANEL_ID_FORMAT.test(id)) throw new Error(`Invalid panel id "${id}"`);
    return { id, title, entry: `panel-${id}.html` };
  });
}

export function isGeneratedPanelFile(file: string): boolean {
  return file === PANEL_ENTRY || /^panel-[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(file);
}

export function createManifest(name: string, panels: readonly PanelEntry[]): OrcaPluginManifest {
  return {
    manifestVersion: 1,
    id: PLUGIN_ID,
    publisher: PUBLISHER,
    name,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    repository: pkg.repository.url.replace(/^git\+/, ''),
    engines: { orca: `>=${MIN_ORCA_VERSION}` },
    pluginApi: 1,
    contributes: {
      panels: panels.map(({ id, title, entry }) => ({ id, title, icon: PANEL_ICON, entry })),
    },
    capabilities: [],
  };
}
