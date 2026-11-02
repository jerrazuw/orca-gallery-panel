# Contributing

Thanks for helping out! Bug reports, ideas and pull requests are all welcome.

## Setup

```bash
npm install
npx playwright install chromium   # only needed for the browser tests
```

Use Node.js 22.18 or later (`.nvmrc` pins the major version).

## Before opening a pull request

```bash
npm run check      # typecheck, lint, format check and unit tests
npm run test:e2e   # browser tests for the panel
```

Run `npm run format` to fix formatting. If you change something users will notice, add a line
to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md).

## Guidelines

- Code that runs inside Orca lives in `src/panel/`. It must work under Orca's panel CSP: inline
  scripts and styles and `data:` images only, no network, no `localStorage` (the iframe has an
  opaque origin).
- Keep logic that can be tested without a browser in plain modules (like `playlist.ts`) and
  cover it with unit tests. Behavior that needs a DOM goes in `test/e2e/`.
- Add a new interface string to every catalog in `src/panel/i18n.ts`. A test checks that they
  stay in sync.

## Publishing to npm

The package is published as [`orca-gallery-panel`](https://www.npmjs.com/package/orca-gallery-panel).
After bumping the version (see below), check what will be published with `npm pack --dry-run`
(it compiles `lib/` first), then run `npm publish`. Run it in a regular terminal: with a passkey
as the second factor, npm opens a browser page to confirm, and it only does that in an
interactive terminal.

## Releasing

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new version heading.
2. Bump the version: `npm version <major|minor|patch>`. This also rebuilds the demo plugin in
   `plugin/` with the new version, adds it to the release commit and creates the tag.
3. Push with `git push --follow-tags`. The release workflow publishes a GitHub release with
   those notes and a ready-to-install demo build, and Orca's plugin directory picks up the new
   tag within about 30 minutes.
4. Publish to npm (above).
