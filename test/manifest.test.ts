import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pkg from '../package.json' with { type: 'json' };
import { createManifest, PANEL_ENTRY } from '../src/manifest.ts';

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
  const manifest = createManifest('My gallery');

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
