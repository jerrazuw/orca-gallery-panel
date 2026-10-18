# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/jerrazuw/orca-gallery-panel/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jerrazuw/orca-gallery-panel/releases/tag/v1.0.0
