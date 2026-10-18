import pkg from '../package.json' with { type: 'json' };

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

export function createManifest(title: string): OrcaPluginManifest {
  return {
    manifestVersion: 1,
    id: PLUGIN_ID,
    publisher: PUBLISHER,
    name: title,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    repository: pkg.repository.url.replace(/^git\+/, ''),
    engines: { orca: `>=${MIN_ORCA_VERSION}` },
    pluginApi: 1,
    contributes: {
      panels: [{ id: PANEL_ID, title, icon: PANEL_ICON, entry: PANEL_ENTRY }],
    },
    capabilities: [],
  };
}
