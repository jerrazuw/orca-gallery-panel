# Orca Gallery Panel

A side panel plugin for Orca that shows a random image from a local folder and rotates through the collection while you work.

## Features

- Shows a random image on open and rotates every 3 minutes.
- Click the image to skip to the next one (the timer restarts).
- Shuffle-deck order: every image appears once before any repeats, and the same image never shows twice in a row.
- Cross-fade between images.
- **Fill / Fit** toggle (hover the panel): crop to fill the panel or show the whole image.
- Uses Orca's theme variables, so it matches light and dark themes.

## How it works

Orca's panel Content Security Policy only allows `data:` images, so the panel can't read files from disk at runtime. Instead, `build.sh` resizes each image (max 800 px on the longest side) and inlines it as base64 into a self-contained `panel.html`.

Orca limits a panel entry to 10 MB; the build script reports the final size and fails if it goes over.

## Requirements

- Orca `>= 1.4.0`
- Bash
- Optional, for resizing: `sips` (built into macOS) or ImageMagick's `convert`. Without either, images are inlined at their original size.

## Usage

1. Put your images (`png`, `jpg`, `jpeg`, `gif`, `webp`) in a folder.
2. Build the panel:

   ```bash
   ./build.sh                  # default: ~/Pictures/Gallery, falls back to ./imagenes
   ./build.sh /path/to/folder  # any other folder
   ```

3. Install the plugin folder in Orca and open the **Gallery** panel.

After adding or removing images, run `./build.sh` again and reload the panel.

## Files

| File               | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `orca-plugin.json` | Plugin manifest: declares the side panel and its entry file. |
| `build.sh`         | Resizes the images and generates `panel.html`.               |
| `panel.html`       | Generated, not committed.                                    |
| `imagenes/`        | Fallback image folder, contents not committed.               |
