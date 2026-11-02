# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-11-02

### Added

- Stacked layout: `--layout stack` (or `"layout": "stack"`) shows 2 to 4 images at once, stacked
  top to bottom, never the same one twice. `--count` sets how many (default 3), and `--rotate`
  whether they change one at a time, taking turns (default), or all together. The display settings
  menu switches the layout, the count and the turn-taking without a rebuild.

## [1.4.0] - 2026-11-02

### Added

- Listed in Orca's plugin directory as **Gallery Panel (demo)**: the sample images, with a note in
  the panel on how to show a folder of your own photos that updates as you add more. The build
  lives in `plugin/`, and `npm version` regenerates it for every release.

### Changed

- The quick start now leads with a single `npx orca-gallery-panel` command that keeps watching
  your folder, and explains how new photos reach the panel on their own.

## [1.3.0] - 2026-11-02

### Added

- Published on npm: `npx orca-gallery-panel <folder>` builds the plugin without cloning the
  repository.

## [1.2.0] - 2026-10-18

### Added

- Display settings menu in the panel: blurred background, Ken Burns zoom and the image name, each
  with a switch. Like the interval, changes last until the panel reloads.
- Blurred background behind images that don't fill the panel, on by default (`--no-blur` or
  `"blur": false` turns it off).
- Ken Burns effect: a slow zoom while each image is shown (`--effect kenburns`).
- Image name at the top of the panel (`--caption`).
- `--watch`: rebuilds when images or the config file change, collapsing bursts into one build.
- Several galleries in one plugin, one panel each, through `galleries` in the config file.
  Panels of galleries that were removed are cleaned up on the next build, and the size check
  also covers Orca's 50 MiB limit for a whole plugin.
- The CLI can be packed and installed from npm as `orca-gallery-panel`. CI checks the packed
  package in an empty project.

## [1.1.0] - 2026-10-18

### Added

- `gallery.config.json`: save your build settings once and rebuild with a plain `npm run build`.
  Unknown keys and invalid values are reported instead of ignored. Command-line options still
  override the file, and `--config <file>` picks a different one.
- JSON Schema for the config file, for autocomplete and validation in editors.
- Clock button in the panel toolbar to change the seconds between images while the panel is open.

## [1.0.0] - 2026-10-18

### Added

- Command-line build (`npm run build`) that turns a folder of images into an Orca panel plugin,
  with options for the panel title, rotation interval, image size, quality, initial fit mode and
  subfolders.
- Images are re-encoded as WebP with EXIF rotation applied. Animation and transparency are kept.
- The build checks the panel against Orca's 10 MiB limit and names the largest images when it is
  over.
- Unreadable files are skipped with a warning instead of failing the build.
- Panel controls: previous, pause/resume, next, a position counter and fit/fill, plus keyboard
  shortcuts.
- Shuffled playback that shows every image once per cycle and never repeats an image back to back.
- Pauses the timer while the panel is hidden.
- Skips images that fail to load, and shows a message when there is nothing to display.
- English and Spanish interface, chosen from the system language.
- Light and dark theme support through Orca's panel design tokens.
- Respects `prefers-reduced-motion`.
- `npm run preview` to check a built panel in a browser inside an Orca-like frame.
- Sample images, unit tests, browser tests and CI on Linux, macOS and Windows.

### Changed

- Replaced the original Bash build script with a cross-platform Node.js CLI.
- The plugin is now `jerrazuw.gallery-panel` and uses the `layers` icon. `image` is not an icon
  Orca supports, so the panel showed a generic plug.
- `engines.orca` is now `>=1.4.160`, the first Orca release with plugin support.

[Unreleased]: https://github.com/jerrazuw/orca-gallery-panel/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/jerrazuw/orca-gallery-panel/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/jerrazuw/orca-gallery-panel/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/jerrazuw/orca-gallery-panel/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/jerrazuw/orca-gallery-panel/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jerrazuw/orca-gallery-panel/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/jerrazuw/orca-gallery-panel/releases/tag/v1.0.0
