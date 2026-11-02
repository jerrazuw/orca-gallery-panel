import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import pkg from '../package.json' with { type: 'json' };
import {
  createManifest,
  DEMO_ICON,
  DEMO_NAME,
  DEMO_PLUGIN_ID,
  DEMO_TITLE,
  PLUGIN_ID,
  isGeneratedPanelFile,
  PANEL_ENTRY,
  PANEL_ID,
  panelEntries,
} from '../src/manifest.ts';

const ID_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PANEL_ICONS = [
  'activity',
  'barchart3',
  'bell',
  'blocks',
  'book',
  'bot',
  'bug',
  'calendar',
  'cloud',
  'code',
  'database',
  'filetext',
  'flag',
  'folder',
  'gauge',
  'globe',
  'hammer',
  'layers',
  'lightbulb',
  'package',
  'plug',
  'puzzle',
  'rocket',
  'star',
  'terminal',
  'wrench',
  'zap',
];

describe('createManifest', () => {
  const manifest = createManifest('My gallery', panelEntries(['My gallery']));

  it('follows Orca naming rules', () => {
    assert.match(manifest.id, ID_FORMAT);
    assert.match(manifest.publisher, ID_FORMAT);
    assert.ok(!manifest.id.startsWith('orca-'), 'the orca- prefix is reserved');
    assert.match(manifest.engines.orca, /^>=\d+\.\d+\.\d+$/);
  });

  it('uses the title for the plugin and the panel', () => {
    assert.equal(manifest.name, 'My gallery');
    assert.equal(manifest.contributes.panels[0]?.title, 'My gallery');
  });

  it('points the panel at the generated entry with a supported icon', () => {
    const [panel] = manifest.contributes.panels;
    assert.equal(panel?.entry, PANEL_ENTRY);
    assert.ok(PANEL_ICONS.includes(panel.icon), `${panel.icon} is not an Orca panel icon`);
  });

  it('takes its version and metadata from package.json', () => {
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.description, pkg.description);
    assert.equal(manifest.repository, 'https://github.com/jerrazuw/orca-gallery-panel.git');
  });

  it('asks for no capabilities', () => {
    assert.deepEqual(manifest.capabilities, []);
  });
});

describe('createManifest for the demo', () => {
  const regular = createManifest(DEMO_NAME, panelEntries([DEMO_TITLE]));
  const demo = createManifest(DEMO_NAME, panelEntries([DEMO_TITLE]), { demo: true });

  it('uses its own id, so it can sit next to a build of your own photos', () => {
    assert.equal(regular.id, PLUGIN_ID);
    assert.equal(demo.id, DEMO_PLUGIN_ID);
    assert.match(demo.id, ID_FORMAT);
  });

  it('says it is a sample and has an icon for the plugin directory', () => {
    assert.match(demo.description, /sample/);
    assert.equal(demo.icon, DEMO_ICON);
    assert.equal(regular.icon, undefined);
  });

  it('matches the committed plugin/ build (run npm run build:demo after changing it)', async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL('../plugin/orca-plugin.json', import.meta.url), 'utf8'),
    );
    assert.deepEqual(committed, demo);
  });
});

describe('panelEntries', () => {
  it('keeps the original id and file for a single gallery', () => {
    assert.deepEqual(panelEntries(['Anything']), [
      { id: PANEL_ID, title: 'Anything', entry: PANEL_ENTRY },
    ]);
  });

  it('derives a valid, unique id per gallery from its title', () => {
    const entries = panelEntries(['Wallpapers', 'Fotos de Viña!', 'Wallpapers', '✨✨']);
    assert.deepEqual(
      entries.map((entry) => entry.id),
      ['wallpapers', 'fotos-de-vina', 'wallpapers-2', 'gallery-4'],
    );
    for (const entry of entries) {
      assert.match(entry.id, ID_FORMAT);
      assert.equal(entry.entry, `panel-${entry.id}.html`);
      assert.ok(isGeneratedPanelFile(entry.entry));
    }
  });
});

describe('isGeneratedPanelFile', () => {
  it('only matches files this tool writes', () => {
    assert.ok(isGeneratedPanelFile('panel.html'));
    assert.ok(isGeneratedPanelFile('panel-wallpapers-2.html'));
    assert.ok(!isGeneratedPanelFile('preview.html'));
    assert.ok(!isGeneratedPanelFile('panel-.html'));
    assert.ok(!isGeneratedPanelFile('my-panel.html'));
  });
});
