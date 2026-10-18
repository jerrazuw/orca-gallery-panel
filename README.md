# Orca Gallery Panel

[![CI](https://github.com/jerrazuw/orca-gallery-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/jerrazuw/orca-gallery-panel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A side panel for the [Orca](https://github.com/stablyai/orca) editor that shows a rotating
gallery of your own images while you work: wallpapers, photos, art, mood boards.

![The panel in Orca's dark and light themes](docs/screenshot.png)

## Features

- **Slideshow**: shuffles your images and changes them on an interval you choose. Every image
  shows once before any repeats, and the same one never appears twice in a row.
- **Controls** on hover: previous, pause/resume, next, a position counter, and fit/fill.
- **Keyboard**: `←` / `→` to navigate, `Space` to pause, `F` to switch between fit and fill.
- **Matches Orca's theme**, light or dark, using the design tokens Orca gives every panel.
- **Any common format**: PNG, JPEG, GIF, WebP, AVIF and TIFF. Animated GIF and WebP stay
  animated, and EXIF rotation is applied.
- **English and Spanish**, picked from the system language.
- **Accessible**: labeled buttons, visible focus, and no fade if you have reduced motion turned on.
- **Private**: the plugin asks Orca for no permissions and makes no network requests.

## Quick start

Requires [Node.js](https://nodejs.org) 22.18 or later and Orca 1.4.160 or later.

```bash
git clone https://github.com/jerrazuw/orca-gallery-panel.git
cd orca-gallery-panel
npm install
npm run build -- ~/Pictures/wallpapers --title "Wallpapers"
```

The plugin is written to `dist/`. In Orca, go to **Settings → Plugins → Development**, click
**Add path** and enter the full path to `dist/`. Then open the panel from the right sidebar.

To try it without your own pictures, build the bundled samples: `npm run build -- examples/images`.

### Updating your images

Add or remove files in your folder and run the same `npm run build` command again. A plugin
loaded from **Development** reloads on its own.

If you installed it with **Install plugin → Local folder** instead, Orca keeps a copy, so you
need to install it again after each build.

## Options

```text
npm run build -- [folder] [options]

  folder                 Folder with your images (default: ./images)
  -o, --out <dir>        Output folder for the plugin (default: ./dist)
  -t, --title <text>     Panel title shown in Orca (default: "Gallery")
  -i, --interval <sec>   Seconds between images, 0 to disable rotation (default: 180)
  -s, --max-size <px>    Longest side of each image in pixels (default: 800)
  -q, --quality <1-100>  WebP quality (default: 80)
      --fit <mode>       Initial mode: contain | cover (default: contain)
  -r, --recursive        Include images in subfolders
```

## How it works

Orca renders a plugin panel as a sandboxed `srcdoc` iframe whose Content Security Policy only
allows inline scripts and styles and `data:` images. A panel cannot read files from disk, and
Orca's plugin API gives it no file or folder access either.

So the images are packed into the panel when you build it:

1. `src/images.ts` finds the supported images in your folder, in natural order.
2. `src/encode.ts` uses [sharp](https://sharp.pixelplumbing.com) to apply EXIF rotation, shrink
   each image to `--max-size` and re-encode it as WebP. That keeps transparency and animation,
   and is far smaller than base64-encoded PNGs or GIFs.
3. `src/html.ts` bundles the panel script (`src/panel/`, TypeScript) with
   [esbuild](https://esbuild.github.io) and inlines it, the CSS and the images into one
   `panel.html`.
4. `src/build.ts` checks the result against Orca's 10 MiB limit for a panel. If it's over, it
   names the largest images and suggests what to change.
5. `src/manifest.ts` writes `orca-plugin.json`, taking the version from `package.json`.

At the default settings a typical photo ends up around 40 KB, so the limit fits a couple of
hundred images. Animated GIFs are much heavier.

## Development

```bash
npm run check        # typecheck, lint, format check and unit tests
npm run test:e2e     # the panel in headless Chromium (first run: npx playwright install chromium)
npm run preview      # writes dist/preview.html: the built panel inside an Orca-like frame
```

| Path                           | What it is                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `src/cli.ts`, `src/options.ts` | Command-line entry point and argument parsing.                                |
| `src/build.ts`                 | Builds the plugin: find, encode, render, check size, write.                   |
| `src/panel/`                   | The code that runs inside Orca: slideshow, controls, translations and styles. |
| `src/preview.ts`               | Reproduces Orca's panel shell so the panel can be checked in a browser.       |
| `test/`                        | Unit tests (`node:test`) and browser tests (`test/e2e/`, Playwright).         |
| `examples/images/`             | Sample images, made by `scripts/generate-examples.ts`.                        |

TypeScript runs directly on Node through
[type stripping](https://nodejs.org/api/typescript.html#type-stripping), so there is no compile
step. CI runs on Linux, macOS and Windows with Node 22.18, 22 and 24.

## Why it isn't in the Orca marketplace

Marketplace plugins are installed from a git repository as they are, but this panel only works
once it has been built with your images. A marketplace entry could only ship the sample gallery.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). The sample images in `examples/images/` are generated by code in this repository
and are covered by the same license.
