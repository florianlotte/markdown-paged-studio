# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` / `npm run build` / `npm run preview` (Vite, no config file, entry is `index.html`).
- `npm run lint` (ESLint flat config, browser globals) and `npm run format` (Prettier: 2-space, single quotes, semicolons, width 120). Both must pass before you finish.
- There is no test suite and nothing here is Node-runnable (Paged.js, FileReader, Blob URLs). Verify changes in a real browser with the `/verify-preview` skill.

## Constraints

- 100 % client-side: no backend, no env vars. The document autosaves to localStorage (`STORAGE_KEY`), and every config that enters the state (JSON import, restore) goes through `sanitizeConfig()`, which whitelists keys and coerces values. Extend `CONFIG_SCHEMA` when adding a state key.
- All app code is in `src/main.js`: `state` object → `documentHtml()` (markdown-it) + `documentCss()` (`@page` rules + user CSS) → Paged.js `Previewer` into `#preview`. Preview layout and zoom live in the separate `view` object (own localStorage key, not part of the config JSON); zoom is the CSS `zoom` property on `#preview`, and `applyView()` must run after every successful render. `src/ui.css` styles the studio chrome only; the rendered document is styled solely by `documentCss()`.
- Language: UI strings, README, comments and docs are all English. The sample date uses the browser locale (`Intl.DateTimeFormat(undefined, …)`).
- The CSS class contract for user stylesheets (`.document-content`, `.cover-page`, `.cover-logo`, `.cover-title`, `.cover-subtitle`, `.cover-meta`) is documented in README and is public API. Do not rename those classes. Load the `paged-css` skill before editing layout, `@page`, or export code.

## Paged.js gotchas

- Preview creates a fresh `new Previewer()` per render (220 ms debounce) into a hidden but attached `.render-stage`, then swaps the pages into `#preview`. A newer render stops the pending one with `chunker.stop()`, and `disposePreviewer()` removes the `<style>` each Previewer injects into `<head>`. Never render straight into `#preview`. CSS is handed to Paged.js as a Blob URL.
- Print and HTML export (`standaloneHtml()`) inline `paged.polyfill.min.js` from node_modules through a Vite `?raw` import, so the export works offline and always matches the bundled version. The print window prints itself from `PagedConfig.after`, never from a timer.
- markdown-it runs with `html: false`: raw HTML in Markdown is intentionally stripped.
- Mermaid diagrams are rendered to inline SVG in `renderDiagrams()` before pagination and are part of the HTML handed to Paged.js and to the export. `documentHtml()` and `standaloneHtml()` are async; the print handler must call `window.open` before its first `await` or pop-up blockers will stop it.
- Any user string injected into `@page` margin boxes must go through `escCssString()`; any injected into HTML must go through `escapeHtml()`.
- `.cover-page` hard-codes `min-height: 297mm` (A4) even though A5 and Letter are selectable. Known quirk, not yet fixed.
