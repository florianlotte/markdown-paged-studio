---
name: paged-css
description: Reference for the rendered-document CSS contract and the Paged.js pipeline in Markdown Paged Studio. Load before editing documentCss(), documentHtml(), standaloneHtml(), the cover page, @page margin boxes, or anything a user stylesheet could depend on.
---

## Rendering pipeline (`src/markdown.js`, `src/document.js`, `src/render.js`)

1. `state.markdown` → `md.render()` (markdown-it, `html: false`, `linkify`, `typographer`). A custom `fence` rule turns ```mermaid blocks into `.mermaid-diagram` placeholders carrying the source in `data-source`; `renderDiagrams()` then replaces each with inline SVG via a lazily imported Mermaid (cached per source in `diagramCache`). `documentHtml()` is therefore async.
2. `documentHtml()` wraps the result:
   ```html
   <section class="cover-page">
     <!-- only when state.cover -->
     <img class="cover-logo" src="data:…" />
     <!-- only when state.logoDataUrl -->
     <h1 class="cover-title">…</h1>
     <div class="cover-subtitle">…</div>
     <!-- only when state.subtitle -->
     <div class="cover-meta">
       <div>author</div>
       <div>date</div>
     </div>
   </section>
   <article class="document-content">…markdown html…</article>
   ```
3. `documentCss()` returns one CSS string, in this order: default `@page`, named `@page cover`, `.cover-*` rules, break-avoid rules for headings/tables/images/pre/blockquote, then `state.customCss` verbatim. User CSS therefore wins on specificity ties.
4. Preview: `new Previewer().preview(html, [blobUrlOfCss], previewElement)` returns a `flow` whose `flow.total` is the page count.
5. Export/print: `standaloneHtml({ mode })` inlines the same HTML and CSS plus `paged.polyfill.min.js` (imported with Vite `?raw`) into a self-contained page with `window.PagedConfig = { auto: true }`. Mode `print` adds a `PagedConfig.after` hook that calls `window.print()`; mode `pdf` sets `data-paged-ready` for the desktop app and the MCP server.

## `@page` contract

- Default page: `size: <A4|Letter|A5>`; `margin: top right bottom left` in mm from `state`.
- Margin boxes: `@top-left` = `state.headerTitle`, `@top-right` = `state.headerName`, `@bottom-left` = `state.footerText`, `@bottom-right` = `"Page " counter(page) " / " counter(pages)`.
- `@page cover`: same size, `margin: 0`, every margin box set to `content: none`. `.cover-page` selects it with `page: cover` and ends with `break-after: page`.
- Strings inside `content: "…"` must pass through `escCssString()`, which escapes backslashes and double quotes and flattens newlines. Adding a new margin box means adding a new escaped interpolation, never raw state.

## Public class names (do not rename)

`.document-content`, `.cover-page`, `.cover-logo`, `.cover-title`, `.cover-subtitle`, `.cover-meta`. Also `.mermaid-diagram` (wrapper of a rendered diagram SVG) and `.mermaid-error` (a `<pre>` shown when a diagram fails to parse). Users paste stylesheets that target these; README documents them.

## Known quirks

- `.cover-page` gets `min-height` from `PAGE_HEIGHT_MM[state.pageSize]` (`src/config.js`): A4 297mm, A5 210mm, Letter 279.4mm. Add an entry there when adding a page size.
- Paged.js reads only the CSS you pass it. Studio chrome styles in `src/ui.css` never reach the document, except the `.preview .pagedjs_page` rules that position rendered pages inside the app.
- `Inter` is referenced but never loaded; it silently falls back to Arial/system fonts.
- Print flow: `window.open(blobUrl)` on the auto-print variant of the export; the opened page prints itself. The blob URL is revoked after 30 s. Pop-up blocking is reported with an `alert()`.
- Units: document CSS uses mm and pt (print), studio CSS uses px.
