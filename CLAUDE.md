# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` / `npm run build` / `npm run preview` (Vite, no config file, entry is `index.html`).
- `npm run lint` (ESLint flat config, browser globals) and `npm run format` (Prettier: 2-space, single quotes, semicolons, width 120). Both must pass before you finish.
- `npm test` runs the Playwright integration tests in `tests/studio.spec.js` (headless Chromium, starts Vite itself; one-time `npx playwright install chromium --only-shell`). Run a single test with `npx playwright test -g "part of its title"`. Nothing here is Node-runnable (Paged.js, FileReader, Blob URLs), so there are no unit tests; use `/verify-preview` for visual checks.
- Desktop build: `electron/main.js` (ESM) serves `dist/` over the private `app://studio` scheme and exposes only `window.desktop.exportPdf` and `window.desktop.onCommand` (File menu) through `electron/preload.cjs` (sandboxed renderer). `standaloneHtml({ mode })` takes `export`, `print` or `pdf`. `#exportPdf` is the only PDF button: `exportPdf()` picks the direct desktop path or `openPrintWindow()` (browser print dialog), which must stay inside a user gesture (click, Ctrl+P) with `window.open` before its first `await`; the desktop test is `npm run test:desktop` (needs `npm run build` first, own config `playwright.desktop.config.js`). Packaging: `electron-builder.yml`, output in `release/`.
- MCP server: `mcp/server.mjs` (stdio, `@modelcontextprotocol/sdk` + Playwright) renders through `dist/` using the page automation API `window.studio` from `src/automation.js` (`defaults()`, `schema()`, `render(config, mode)`). Keep that API in sync with `CONFIG_SCHEMA`. `MPS_OUTPUT_DIR` confines the tools' writes and existing files are only replaced with `overwrite: true`. Test: `npm run test:mcp` after `npm run build` (Node test runner, real MCP client over stdio).

## Constraints

- 100 % client-side: no backend, no env vars. Personal defaults come from the gitignored `local/` folder, read at build time with `import.meta.glob` and merged into `DEFAULTS` (never into `DEFAULT_STATE`); use `DEFAULTS` for anything that resets or initializes the document. The document autosaves to localStorage (`STORAGE_KEY`), and every config that enters the state (JSON import, restore) goes through `sanitizeConfig()`, which whitelists keys and coerces values. Extend `CONFIG_SCHEMA` when adding a state key.
- Module map (`src/`): `config.js` (constants, defaults, personal `local/` defaults merged into `DEFAULTS`, the mutable `state`, `sanitizeConfig()`, autosave), `markdown.js` (markdown-it + Mermaid → `renderDiagrams()`), `document.js` (`documentCss()`, `documentHtml()`, `standaloneHtml({ mode })`), `render.js` (Paged.js preview lifecycle, `scheduleRender()`), `view.js` (layout and zoom: the `view` object, own localStorage key, `applyView()` must run after every successful render; zoom is the CSS `zoom` property on `#preview`), `ui.js` (form binding, tabs, files, export, print, desktop bridge), `automation.js` (`window.studio` for the MCP server, `?automation=1` skips the initial preview), `escape.js`, and `main.js` as the entry point. The markup lives in `index.html`; `src/ui.css` styles the studio chrome only; the rendered document is styled solely by `documentCss()`.
- Language: UI strings, README, comments and docs are all English. The sample date uses the browser locale (`Intl.DateTimeFormat(undefined, …)`).
- The CSS class contract for user stylesheets (`.document-content`, `.cover-page`, `.cover-logo`, `.cover-title`, `.cover-subtitle`, `.cover-meta`) is documented in README and is public API. Do not rename those classes. Load the `paged-css` skill before editing layout, `@page`, or export code.

## Paged.js gotchas

- Preview creates a fresh `new Previewer()` per render (220 ms debounce) into a hidden but attached `.render-stage`, then swaps the pages into `#preview`. A newer render stops the pending one with `chunker.stop()`, and `disposePreviewer()` removes the `<style>` each Previewer injects into `<head>`. Never render straight into `#preview`. CSS is handed to Paged.js as a Blob URL.
- Print and HTML export (`standaloneHtml()`) inline `paged.polyfill.min.js` from node_modules through a Vite `?raw` import, so the export works offline and always matches the bundled version. The print window prints itself from `PagedConfig.after`, never from a timer.
- markdown-it runs with `html: false`: raw HTML in Markdown is intentionally stripped.
- Mermaid diagrams are rendered to inline SVG in `renderDiagrams()` before pagination and are part of the HTML handed to Paged.js and to the export. `documentHtml()` and `standaloneHtml()` are async; the print handler must call `window.open` before its first `await` or pop-up blockers will stop it.
- Any user string injected into `@page` margin boxes must go through `escCssString()`; any injected into HTML must go through `escapeHtml()`.
- `.cover-page` takes its height from `PAGE_HEIGHT_MM[state.pageSize]` so it fills exactly one page on A4, A5 and Letter; keep that map in sync with `PAGE_SIZES`.
