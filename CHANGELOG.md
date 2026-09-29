# Changelog

All notable changes to Markdown Paged Studio are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/). Each version is a Git tag with the desktop binaries attached to its
[release](https://github.com/florianlotte/markdown-paged-studio/releases).

## [Unreleased]

## [1.13.1] - 2026-09-29

### Changed

- The default accent colour of the cover templates is `#2c2f73`.

## [1.13.0] - 2026-09-29

### Added

- `npm run screenshots` retakes the screenshots of the README from the build.

### Changed

- The actions of the toolbar are more compact and fit on one line.
- The page number of a table of contents entry written on several lines sits on its last line.
- README screenshots show the table of contents, the cover templates and the French interface.

### Fixed

- What the **Page break**, **Table of contents** and image **Insert** buttons write, and pasted or dropped
  images, can be undone with Ctrl+Z in the editor.

## [1.12.0] - 2026-09-29

### Added

- `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, issue forms and a pull request template.
- The notes of a GitHub release start with the section of this file for its version.

### Changed

- The desktop release reuses the CI run of the same commit instead of running the checks a second time.

## [1.11.0] - 2026-09-29

### Added

- Table of contents with page numbers from `[[toc]]` or `[[toc depth=N]]`.
- Page breaks from a line holding only `\newpage`.
- Captions under images (the image title) and diagrams (`caption="…"` on the fence line).
- Syntax highlighting of code blocks, with a light, dark or disabled theme (`codeTheme`).
- Running header taken from the current first-level heading (`runningHeader`).
- Mirrored margins for facing pages (`mirrorMargins`); the two-page view pairs the pages as in the bound document.
- Cover templates (classic, centered, colour band, minimal) with an accent colour.
- Interface in English or French, following the browser or a selector in the sidebar footer.
- The MCP server accepts the new options and syntaxes.

### Changed

- Headings carry an id (`sec-` plus the slug of their text); `[text](#slug)` links follow them and anchors of the
  preview scroll to their target.
- The title of an image is now shown as its caption instead of a tooltip.

## [1.10.0] - 2026-09-29

### Added

- The Inter font ships with the studio and is embedded in every export; only the subsets a document needs are
  loaded and inlined.
- Undo and redo (Ctrl+Z, Ctrl+Y) of the changes made from the preview, also with the sidebar hidden.

### Changed

- The cover logo is saved in IndexedDB instead of localStorage and scaled down to 1200 px on upload. A logo saved
  by an older version is migrated.
- Web tests split by domain; the desktop test covers images, logo, font and persistence.

### Security

- `lodash-es` forced to 4.18.1 through an npm override: `npm audit` reports no vulnerability.

## [1.9.0] - 2026-09-29

### Changed

- The desktop release runs the CI checks before building, and GitHub Pages deploys only after a successful CI on
  `main`.
- The resize handle keeps the focus across renders, so arrow keys can follow one another.

### Fixed

- Links of the preview open in a new tab (the system browser in the desktop app) instead of replacing the studio.
- A change made from the preview tools no longer wipes the undo history of the editor.

## [1.8.0] - 2026-09-29

### Added

- Every image can be sized and aligned, wherever it is: paragraph, list, quote, table cell or link.
- Text wraps around an image aligned left or right inside a paragraph.

### Changed

- An image alone on its line is centered by default.

### Fixed

- The toolbar of the preview tools stays inside the page when the element sits on the right.

## [1.7.0] - 2026-09-29

### Added

- Images: upload, drop or paste, matched to the Markdown by file name only, stored in IndexedDB and carried by the
  configuration file. Raster images wider than 2400 px are scaled down.
- `![Alt](photo.png){width=60% align=center}` with the same preview tools as the diagrams.
- MCP server: `images` input, `MPS_INPUT_DIR` confinement and `missing_images` in the results.
- The running version and commit in a sidebar footer.

### Fixed

- The close button of the phone drawer no longer shows on desktop.

## [1.6.0] - 2026-09-29

### Added

- Resizable Mermaid diagrams: `width` and `align` on the fence line, with size presets, alignment buttons and a
  drag handle in the preview.

## [1.5.0] - 2026-09-24

### Added

- Phone layout: the settings become a full-screen drawer over a full-height preview.

## [1.4.1] - 2026-09-24

### Changed

- GitHub Actions updated (Dependabot).

## [1.4.0] - 2026-09-24

### Added

- A button hides the sidebar so the preview takes the full width.

### Changed

- The brand and the tabs of the sidebar stay in place while the settings scroll.

## [1.3.0] - 2026-09-24

### Added

- SHA-256 checksum files and macOS Intel builds in the releases.
- GitHub Pages deployment of the web app; Dependabot for npm packages and actions.
- MCP server: `MPS_OUTPUT_DIR` confinement, and existing files are only replaced on request.

### Changed

- The application is split into modules and the markup moved to `index.html`.

### Fixed

- The cover page fills exactly one page on A4, A5 and Letter.

## [1.2.1] - 2026-09-24

### Added

- Windows zip bundles (x64 and ARM64) next to the portable executables.

## [1.2.0] - 2026-09-24

### Added

- MCP server (`render_pdf`, `render_html`, `describe_config`) so AI assistants can render reports.

### Fixed

- Headers and footers use the document font in PDFs, as in the preview.

## [1.1.1] - 2026-09-24

### Added

- Windows ARM64 portable executable.

## [1.1.0] - 2026-09-24

### Changed

- One "Export PDF" button everywhere: the print dialog in the browser, a direct file in the desktop app.

## [1.0.0] - 2026-09-24

### Added

- Live paged preview of Markdown with Paged.js: cover page, running header, footer, page counter, A4, Letter and
  A5, custom CSS.
- Mermaid diagrams, document language, preview zoom and one or two page layouts.
- Autosave, configuration import and export, personal defaults from a `local/` folder.
- Standalone HTML export and print.
- Portable desktop app for Windows, Linux and macOS with direct PDF export.
- Docker image, Playwright integration tests and CI.

[Unreleased]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.13.1...HEAD
[1.13.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.13.0...v1.13.1
[1.13.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/florianlotte/markdown-paged-studio/releases/tag/v1.0.0
