# Changelog

All notable changes to Markdown Paged Studio are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/). Each version is a Git tag with the desktop binaries attached to its
[release](https://github.com/florianlotte/markdown-paged-studio/releases).

## [Unreleased]

## [1.27.0] - 2026-10-14

### Added

- An **Insert** menu above the editor writes an example of a table, an image (chosen files, added to the
  library), a diagram, a formula, an alert, a footnote, a page break or a table of contents at the cursor; an
  empty file shows a prompt that names it.
- The date has a **Today** button and a date picker, both writing the date the way the document language
  writes it.
- The document language is chosen by its name; any other BCP 47 tag is typed under "Other…".
- Margin presets (Narrow, Normal, Wide, or Custom) and a "Same on all sides" box.
- The logo is dropped on a zone or chosen from it; once set, a thumbnail with **Replace** and **Remove**.

### Changed

- The settings are grouped by intent, in groups that fold and stay folded: Document (title, author, date,
  language), Cover (switch, template, accent, logo) and Images (with the count of the library and of the
  missing names) under Content; Headers and footers, Numbering, Code and stylesheet under Design; Paper and
  Margins under Page. The examples of the long check box labels moved to a hint under the field.

## [1.26.0] - 2026-10-14

### Added

- A welcome tour opens on the first visit: six short panels on how the studio works, with Previous and Next
  arrows and a "Don't show this again" box; the ⋯ menu (Welcome tour) and Help → Welcome Tour in the desktop
  app show it again.
- Every file tab has a menu (right-click, a long press, Shift+F10 or the Menu key): Rename, Move left, Move
  right, Download and Remove, with their shortcuts.
- When the tabs overflow, a shadow shows on the side where tabs are hidden, the mouse wheel scrolls the strip
  and a list button offers every file.
- Tooltips of the studio show on keyboard focus as well as on hover, and carry the shortcut of the control; the
  entries of the Export and ⋯ menus show their shortcut too.
- A **Keyboard shortcuts** panel lists everything the keyboard and the mouse can do: `?` outside a text field,
  the ⋯ menu, or Help → Keyboard Shortcuts in the desktop app.
- The row of the file tabs says where the document lives: "Saved in this browser · just now" after each autosave, and
  "Not saved" in red when the browser storage is full or disabled; its tooltip points to PDF with project.
- In the browser, Ctrl+Shift+E exports the PDF with the project and Ctrl+B hides or shows the sidebar, as the
  desktop menus do.

## [1.25.0] - 2026-10-14

### Fixed

- A render interrupted by a newer edit stops at once: Paged.js 0.4.3 resumes a stopped render, which kept
  paginating long documents in the background after every keystroke.
- Renaming a file or switching the interface language no longer paginates the document again.
- A full or disabled browser storage is reported once, in a banner, instead of silently losing the autosave or
  the images; an image database that never opens no longer stalls the first render.
- A tall image is scaled down on upload like a wide one (3600 px at most); the quality of the downscaling is set
  to high.
- Errors of the file loaders, of the exports and of the image upload are shown in the banner instead of vanishing
  in the console; a print window whose document fails to build is closed.
- Only one export runs at a time: a second click, menu command or Ctrl+P during an export is ignored.
- Desktop: the PDF export gets more time as long as pages keep coming (10 minutes at most); expired write tokens
  are purged; the developer tools entry is left out of release builds.
- The "Missing image" box follows the language of the document.
- A margin typed beyond 0–80 mm is clamped at once, as an imported one is, instead of reaching the layout.
- Desktop: the PDF save dialog proposes the title of the document instead of `document.pdf`.
- Between 761 and 1000 px the toolbar stacked its actions and pushed Export out of the window: under 1100 px
  the view controls now take a row of their own and the actions stay in reach.

### Added

- `docs/ux-review.md`: a UX review of the studio, its findings by priority and the lots that follow.

### Changed

- Formulas, diagrams and code colours are applied in one pass over an inert fragment, with the coloured code
  blocks cached; Paged.js is loaded for the first render, which halves the entry bundle.
- The notice banner replaces every blocking `alert()`; an export started while the preview still renders waits
  for it instead of failing.
- MCP: the image and output folders are compared as real paths, so a symbolic link cannot lead outside them; the
  headless browser fetches nothing (a remote image stays a reference); KaTeX runs with expansion and size limits.
- A zip is read up to 256 MB in total; the editor and the tests share `src/util.js` (`lazy`, `clamp`).
- Documentation split: the README presents the studio and links to `docs/writing.md` (the writing guide),
  `docs/exports.md` (saving, exports, reopening) and `docs/architecture.md` (pipeline, project layout, workflows);
  CONTRIBUTING.md holds the scripts and the rules of the code base. The MCP descriptions, the Markdown support
  page and the French translations of the search panel are brought up to date, and the sample document shows an
  alert, a formula, a table caption and cross-references.
- **Reset** leaves the toolbar for a ⋯ menu, as "Reset the document": it applies at once, without a dialog, and
  a toast undoes it for ten seconds, images included.
- The status line only shows the page count: a thin progress bar under the toolbar replaces "Rendering…", the
  confirmations of the exports ("PDF saved with its project", the print dialog notice) are a toast that goes
  away by itself.
- The **Import .css** and **Default CSS** buttons sit above the stylesheet, in reach without scrolling; the
  "Pagination" card of the Page tab gives way to a hint about the room the header and the footer need in the
  margins.
- Focus rings and the focused field border are at 3:1 or more on every surface, in both themes, as the line
  numbers of the editor; `prefers-reduced-motion` stops the sweeps and spins of the studio.

### Security

- The custom stylesheet and the header fields can no longer end the `<style>` element of an export or of the print
  window: a `</style>` in an imported project could inject markup there. `escCssString()` also escapes `<` and
  every kind of line break.
- Desktop: the navigation guards apply to every window, the print windows and the hidden PDF worker included.
- Docker: nginx sends `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'` and
  hides its version.

## [1.24.0] - 2026-10-13

### Added

- A **Prettify** button above the editor formats the current file with Prettier (loaded on demand): one space
  after `#`, `-` lists, `_emphasis_`, aligned tables, one blank line between blocks. Formulas, labels, page breaks
  and the other syntax of the studio are kept, and Ctrl+Z reverts the formatting.

## [1.23.0] - 2026-10-13

### Changed

- The HTML export and the Markdown attached to the PDF are named after the title, like the other exports
  (`document.html` and `document.md` before).
- Mermaid 12.2 and KaTeX 0.18 (one copy in the build), and the other dependencies updated within their ranges.
- The CSS contract of the document is one file, `docs/css-contract.md`, included in the README and served by the MCP
  server; the MCP README no longer repeats the Markdown syntax of the README.
- Documentation brought in line with the studio: the browser draws the PDF with project, formulas and definition
  lists are supported, the project layout lists every module, the desktop menu names, the release steps and the
  MCP tool description are complete, and the CSS contract names `.toc-list`, `.has-caption` and `span.ref-missing`.

## [1.22.4] - 2026-10-13

### Changed

- The `.md` download of the editor bar is named after the title, like the PDF, when the document has one
  file (`document.md` before); among several files, each keeps its own name.

## [1.22.3] - 2026-10-13

### Fixed

- Mermaid labels: `<b>`, `<strong>`, `<i>` and `<em>` format the text, which was drawn with its tags, and
  any other HTML tag is dropped while its text stays (labels are SVG text, where only `<br>` was understood).

## [1.22.2] - 2026-10-12

### Changed

- Numbered headings: the number ends with a dot ("1.", "1.1.") and stands half an em from the title; the
  margin is `.heading-number { margin-right: .5em }`, to override in the custom CSS. References keep the
  bare number ("section 1.1").

## [1.22.1] - 2026-10-12

### Fixed

- The selection of the editor is visible on the line of the cursor (the background of the active line hid
  it), and takes the colour of the theme while the editor is focused: in the dark theme it was a light block
  under light text.

## [1.22.0] - 2026-10-12

### Added

- Automatic numbering and cross-references, in the style of pandoc-crossref. A label numbers its element:
  `{#fig:plan}` on an image, `#fig:flow` on a diagram, `{#tab:costs}` in a table caption, `{#eq:energy}`
  after a formula, `{#sec:intro}` on a heading. `@fig:plan` in the text becomes "figure 3" with a link, also
  before the figure; `@Fig:plan` opens a sentence, `-@fig:plan` gives the number alone. The words follow
  the language of the document.
- Table captions: a paragraph `Table: caption` (or `: caption`) right after or right before a table.
- Two settings of the Design tab: **Heading numbering** (from level 1, or from level 2 when level 1 is the
  title) and **Number figures and tables** for those that carry no label. Headings ending with `{-}` keep
  no number; `{#custom}` at the end of a heading sets its anchor.
- A **dark theme** for the studio: it follows the system, and the selector next to the language at the top
  of the sidebar (View → Theme on desktop) forces light or dark. The pages of the preview stay white, as
  they print; exports do not change.
- **Running header level** in the Design tab: the running header can follow the sections (level 2 or 3)
  instead of the chapters only, going back to the chapter title where a chapter starts.

### Changed

- The sample document labels its diagram instead of writing "Figure 1" by hand.

### Fixed

- The running header was missing from "PDF with project" in Chromium: Paged.js leaves its string values
  unclosed in the inline style of the pages, and the image Chromium draws each page from dropped them.

## [1.21.1] - 2026-10-04

### Fixed

- Version 1.21.0 was tagged but never published: a test of the interface language read the page count
  before the preview had caught up, which only failed on the slower machines of the CI. The test now waits
  for the render, and `SLOWMO=300 npm test` reproduces such timing locally. Nothing changes in the studio
  itself: this release publishes what 1.21.0 contains.

## [1.21.0] - 2026-10-04

### Added

- Formulas written in TeX and drawn by KaTeX: `$…$` inside a sentence, `$$…$$` or a ` ```math ` block on
  lines of their own, numbered with `\begin{equation}`. KaTeX and its fonts are loaded only for documents
  that hold formulas, and those fonts travel in the exports. Amounts such as `5 $ and 10 $` stay text.
- Alerts as on GitHub (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), titled in the
  language of the document; highlighted text (`==text==`), subscript and superscript (`H~2~O`, `x^2^`),
  definition lists.
- The web tests also run under Firefox and WebKit (`npm run test:browsers`, and a job of the CI for each).

### Changed

- Where a browser cannot draw the PDF that carries the project, **Export** opens the print dialog inside
  the click and explains once that this PDF does not hold the project; the menu entry says why it is not
  available. A drawing that fails midway is explained in plain words instead of a raw error.

### Fixed

- Switching the interface language no longer translates words of the document that match a label of the
  interface inside the editor.

## [1.20.0] - 2026-10-03

### Added

- A document can be written as several Markdown files, one tab each above the editor: new file, existing
  `.md` files added in one go, rename (double-click or F2), move (drag or Alt + arrows), remove. The files
  are assembled into one paged document, with shared settings, table of contents and page numbers; each
  file keeps its own undo history, and a change made from the preview goes to the file that holds the
  source. The project file and the Markdown export carry the files.
- The editor is a real code editor: Markdown colours, line numbers, search and replace (Ctrl+F), and undo
  that covers everything the studio writes, also while the editor is hidden.
- The editor and the preview scroll together: the pane you scroll takes the other one to the same part of
  the document (a button of the editor bar switches it off). A double-click on a block of the preview puts
  the cursor on its source line, in its file.
- **Markdown files (zip)** in the Export menu (and **File → Export Markdown files (zip)…** on desktop): the
  files of the document, `style.css`, the logo and the images side by side, with the settings in a YAML
  file. **Import…** reopens it, and opens any zip of Markdown files as a document.

### Changed

- The text layer of the PDF drawn by the browser holds any script (Cyrillic, Greek, Chinese…), not only
  Latin text, so the whole document can be searched and copied; its lines are no longer cut at the first
  letter or where the font changes.
- The bar of the editor is made of icons for the file actions and fits on one line in French. **Import .md**
  replaces the current file as one edit that Ctrl+Z reverts; **Download .md** downloads the current file
  under its name.
- Dependencies updated (Electron 44.5, Mermaid 12.1, Vite 8.3.2, MCP SDK 1.32).

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

[Unreleased]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.27.0...HEAD
[1.27.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.26.0...v1.27.0
[1.26.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.25.0...v1.26.0
[1.25.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.24.0...v1.25.0
[1.24.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.23.0...v1.24.0
[1.23.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.22.4...v1.23.0
[1.22.4]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.22.3...v1.22.4
[1.22.3]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.22.2...v1.22.3
[1.22.2]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.22.1...v1.22.2
[1.22.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.22.0...v1.22.1
[1.22.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.21.1...v1.22.0
[1.21.1]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.21.0...v1.21.1
[1.21.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.20.0...v1.21.0
[1.20.0]: https://github.com/florianlotte/markdown-paged-studio/compare/v1.19.2...v1.20.0
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
