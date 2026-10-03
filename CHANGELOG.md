# Changelog

All notable changes to Markdown Paged Studio are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/). Each version is a Git tag with the desktop binaries attached to its
[release](https://github.com/florianlotte/markdown-paged-studio/releases).

## [Unreleased]

## [1.19.2] - 2026-10-03

### Fixed

- The size toolbar of an image or a diagram is placed again when the zoom changes (zoom buttons, Ctrl + wheel,
  the splitter), so it no longer sticks out of the page after zooming out.
- The sidebar closes when the window becomes as narrow as a phone, where it would cover the whole screen, and
  comes back when the window grows.
- The description of the project attached to a PDF, and the documentation, name **Import…** instead of the
  former Load config.

## [1.19.1] - 2026-10-03

### Changed

- The workflows use the current GitHub Actions: `actions/checkout` 7, `actions/upload-artifact` 7 and
  `actions/upload-pages-artifact` 5. Nothing changes in the studio.

## [1.19.0] - 2026-10-02

### Changed

- The Markdown editor leaves the sidebar for the main area, beside the paged preview. Three view modes in the
  toolbar, **Edit**, **Split** (the default) and **View**, with a draggable splitter (arrow keys, Home, End,
  double-click), keyboard shortcuts (Ctrl+Shift+1/2/3, Cmd+Alt+1/2/3 on macOS) and **View** menu entries in
  the desktop app; the mode and the editor width are remembered. On phones, Split gives way to a switch
  between Edit and View. The insert buttons and the Markdown import and download sit in a bar above the
  editor; the **Content** tab keeps the cover fields and the images. An insert made while the editor is
  hidden shows it first.

### Fixed

- The size toolbar of an image or a diagram stays inside the page at low zooms, where it is wider than the
  room beside the drawing: it now starts at the left edge of the page instead of being clipped.

## [1.18.0] - 2026-10-02

### Added

- **Markdown with project** in the Export menu (and **File → Export Markdown…** on desktop): a `.md` file
  whose YAML front matter carries the settings, CSS, logo and images, so any Markdown editor opens it and
  **Import…** reopens it in the studio. **Import…** also accepts a plain Markdown file, which replaces the
  Markdown, takes its first level 1 heading as the title and keeps the other settings and the images.

## [1.17.0] - 2026-10-02

### Changed

- In the browser, **PDF with project** is produced in one step: the studio draws the pages itself (page images
  at 192 dpi under a text layer that stays selectable and searchable, links kept) and attaches the project.
  The two-step banner is gone. **PDF only** and Ctrl+P keep the print dialog and its vector PDF. While a PDF
  is written, in the browser or in the desktop app, the studio is locked behind an overlay that reports the
  progress.

## [1.16.0] - 2026-10-01

### Added

- Editable exports and a simpler toolbar: one **Export** menu (PDF with project, the default; PDF only; HTML
  with project; project only) and one **Import…** button that opens a PDF, an HTML or a project file. The
  project (settings, Markdown, logo, images) travels inside the PDF as attachments and inside the HTML as a
  data block. In the browser, where the print dialog writes the PDF, a banner then asks for the saved file
  and gives it back with the project. The desktop File menu has the same commands; the MCP server attaches
  the project unless `project` is `false`.

### Changed

- **Save config** and **Load config** are replaced by **Export → Project only** and **Import…**; the project
  file is named `markdown-paged-studio-project.json`.
- The **Sample CSS** button of the Design tab is named **Default CSS**.

## [1.15.1] - 2026-10-01

### Added

- At the bottom of the sidebar, a GitHub mark linking to the repository in front of the version, and the
  author's name, linked to his LinkedIn profile, next to it.

### Changed

- The language selector of the interface moves to the top of the sidebar, next to the logo, where it is
  visible on every tab.
- Default stylesheet: body text at 8.5 pt with a line height of 1.45 (was 10.5 pt and 1.55), headings at
  22, 15 and 11 pt. It applies to new documents and after **Reset**; a saved document keeps its own CSS.

## [1.15.0] - 2026-09-29

### Added

- Footnotes: `Text[^1]` with `[^1]: The note`, or `^[a note in place]`, numbered and printed at the foot of the
  page that calls them.
- Task lists: `- [ ] to do` and `- [x] done` show check boxes.
- Addresses starting with `www.` become links.

### Changed

- The sample document shows the table of contents, a page break, a caption, a footnote and a task list.
- All the GitHub Flavored Markdown extensions are now supported.

### Fixed

- `Text[^1]` followed by `[^1]: Note` no longer shows as a broken link.

## [1.14.0] - 2026-09-29

### Added

- `docs/markdown-support.md`: what Markdown the studio understands, its four deliberate differences with
  CommonMark, what is not supported, and the conformance measured on the official examples (all of CommonMark
  apart from those differences).
- `npm run conformance` measures the parser against the CommonMark and GFM examples, and a unit test fails when
  a rule of the studio changes a basic syntax.

## [1.13.2] - 2026-09-29

### Changed

- README revised: undo, captions, table of contents, CSS class names and desktop downloads as tables, what the
  exports contain, browser support.

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

[Unreleased]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.19.2...HEAD
[1.19.2]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.19.1...v1.19.2
[1.19.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.19.0...v1.19.1
[1.19.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.15.1...v1.16.0
[1.15.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.15.0...v1.15.1
[1.15.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.13.2...v1.14.0
[1.13.2]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.13.1...v1.13.2
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
