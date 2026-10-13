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

The [Development](README.md#development) section of the README lists the scripts and the layout of the project.
[CLAUDE.md](CLAUDE.md) describes the constraints of the code base in more detail; it is written for AI coding
assistants and is just as useful to people.

A few rules that are easy to miss:

- Everything runs in the browser: no backend, no environment variables.
- Code, comments, documentation and the interface strings in the code are in English. When you add or change a
  string of the interface, add its French translation to `src/i18n.js`.
- The rendered document is styled only by `documentCss()`. The class names of the document are public: people
  write stylesheets against them, so do not rename them.
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
  the studio in a headless browser (`tests/studio-*.spec.js`; Chromium by default, Firefox and WebKit in the CI); pure helpers have unit tests (`tests/*.test.mjs`).
- Check the preview, the HTML export and the PDF export in a Chromium-based browser when you touch the document.
- Describe the change under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- Keep a pull request to one subject.

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
