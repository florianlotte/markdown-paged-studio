# Contributing

Thank you for helping. Issues and pull requests are welcome, in English.

## Reporting a bug or asking for a feature

Use the [issue forms](https://github.com/florianlotte/markdown-paged-studio/issues/new/choose). For a bug, the
version shown at the bottom of the sidebar and a small Markdown document that shows the problem are what helps
most. Security problems go through the [security policy](SECURITY.md), not through public issues.

## Working on the code

You need Node.js 22.12 or later (20.19 or later also works).

```bash
npm install
npx playwright install chromium --only-shell   # once, for the tests
npm run dev                                     # http://localhost:5173
```

[docs/architecture.md](docs/architecture.md) describes the rendering pipeline, the layout of the project and the
workflows. [CLAUDE.md](CLAUDE.md) describes the constraints of the code base in more detail; it is written for AI
coding assistants and is just as useful to people.

| Script                  | What it does                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`           | Start the Vite dev server                                                                 |
| `npm run build`         | Build the static site into `dist/`                                                        |
| `npm run preview`       | Serve the build locally                                                                   |
| `npm run lint`          | ESLint (flat config, browser globals)                                                     |
| `npm run format`        | Prettier over the whole repository                                                        |
| `npm run format:check`  | Prettier in check mode                                                                    |
| `npm test`              | Playwright integration tests of the web app in a headless Chromium (starts Vite itself)   |
| `npm run test:browsers` | The same tests under Chromium, Firefox and WebKit (`test:firefox`, `test:webkit` for one) |
| `npm run test:unit`     | Unit tests of the helpers, of the Markdown conformance and of the changelog (Node runner) |
| `npm run desktop`       | Build and open the Electron desktop app                                                   |
| `npm run desktop:build` | Package the desktop app for the current OS into `release/`                                |
| `npm run test:desktop`  | Playwright smoke test of the desktop app (after `npm run build`)                          |
| `npm run desktop:dir`   | Package the desktop app unpacked into `release/`, as the CI does before its smoke test    |
| `npm run mcp`           | Start the MCP server on stdio (after `npm run build`)                                     |
| `npm run test:mcp`      | End-to-end test of the MCP server with a real MCP client (after `npm run build`)          |
| `npm run conformance`   | Measure the parser against the CommonMark and GFM examples (`-- --write` updates the doc) |
| `npm run screenshots`   | Retake the screenshots of the README from the build (after `npm run build`)               |

A few rules that are easy to miss:

- Everything runs in the browser: no backend, no environment variables.
- Code, comments, documentation and the interface strings in the code are in English. When you add or change a
  string of the interface, add its French translation to `src/i18n.js`; a label of the desktop menu goes through
  `MENU_FR` in `electron/main.js`, a text of the editor's search panel through `searchPhrases()` in `src/chapters.js`.
- The rendered document is styled only by `documentCss()`. The class names of the document are public: people
  write stylesheets against them, so do not rename them. The contract lives in `docs/css-contract.md`; the README
  holds a copy between `<!-- css-contract:start -->` and `<!-- css-contract:end -->`, which a unit test compares.
- A change of `src/markdown.js` is checked with `npm run conformance`: every difference with CommonMark must have a
  known cause (see `docs/markdown-support.md`).
- A new document setting is a key of `CONFIG_SCHEMA` in `src/config.js`, validated by `sanitizeConfig()`, and an
  entry in the schema of the MCP server.
- Text that reaches HTML goes through `escapeHtml()`, text that reaches a CSS string through `escCssString()`.
- Personal files of the `local/` folder are never committed.

## Before opening a pull request

```bash
npm run lint
npm run format:check      # npm run format fixes it
npm run test:unit
npm test                  # web tests under Chromium; PORT=5183 npm test if port 5173 is busy
npm run test:browsers     # the same under Chromium, Firefox and WebKit (npx playwright install firefox webkit)
npm run build
npm run test:desktop      # after the build; needs a display (xvfb-run on a server)
npm run test:mcp          # after the build
```

- Add or update a test for what you change. Most of the application needs a real browser, so the tests drive
  the studio in a headless browser (`tests/studio-*.spec.js`; Chromium by default, Firefox and WebKit in the CI);
  pure helpers have unit tests (`tests/*.test.mjs`).
- Check the preview, the HTML export and the PDF export in a Chromium-based browser when you touch the document.
- Describe the change under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- Keep a pull request to one subject.

## Desktop app

The desktop app is built from the same `dist/`:

```bash
npm run desktop         # build dist/ and open the app
npm run desktop:build   # package for the current OS into release/
npm run test:desktop    # Playwright smoke test of the Electron app (run npm run build first)
```

Binaries are built by the `Desktop release` workflow (`.github/workflows/release-desktop.yml`). Run it manually from the **Actions** tab with **Run workflow**: the three binaries are attached to the run as downloadable artifacts, and ticking **publish** also creates the GitHub Release `v<version>` with them. Pushing a tag `v*` publishes the release automatically, with notes taken from `CHANGELOG.md`; the steps are below.

## Releases

Maintainers only. Move the `Unreleased` entries of `CHANGELOG.md` under a dated heading `## [x.y.z] - YYYY-MM-DD`,
first among the versions, and add its compare link at the bottom of the file
(`[x.y.z]: https://github.com/florianlotte/markdown-paged-studio/compare/vA.B.C...vx.y.z`; point the `[Unreleased]`
link at the new tag). Set the same version in `package.json` (`npm version <version> --no-git-tag-version`), commit,
push, then push the tag `v<version>`. The tag builds the desktop binaries and publishes the release, whose notes
start with that section of the changelog (`scripts/release-notes.mjs`). A unit test (`tests/repo.test.mjs`) fails
when the changelog has no dated section or no compare link for the version of `package.json`. The `Desktop release`
workflow can also be run by hand from the **Actions** tab: it attaches the binaries to the run, and publishes the
release when **publish** is ticked.

## License

Contributions are published under the [MIT license](LICENSE) of the project.
