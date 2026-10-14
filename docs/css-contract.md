The rendered document has this structure (the cover section only when the cover page is on):

```html
<section class="cover-page">
  <img class="cover-logo" />
  <h1 class="cover-title">…</h1>
  <div class="cover-subtitle">…</div>
  <div class="cover-meta">
    <div>author</div>
    <div>date</div>
  </div>
</section>
<article class="document-content">…your Markdown as HTML…</article>
```

Inside the content, these class names are stable and meant to be styled:

| Element           | Selector                                                                                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagram           | `.mermaid-diagram`, its drawing `.mermaid-diagram > svg`; `.is-sized` with `--diagram-width`, `data-align`; a failed one keeps the wrapper and holds a `pre.mermaid-error`                                                                                                                   |
| Image             | `.document-image` around the `img`; `.is-block` alone in a paragraph, `.is-sized` with `--image-width`, `data-align`, `.has-caption` with a caption; `.image-missing` if not uploaded                                                                                                        |
| Number, reference | `.heading-number` in a numbered heading ("1.1.", with a right margin), `.caption-label` opening a numbered caption ("Figure 1: "), `.ref` (a link) with `.ref-fig`, `.ref-tab`, `.ref-eq` or `.ref-sec`, a `span.ref.ref-missing` for an unknown label; ids start with `fig-`, `tab-`, `eq-` |
| Table caption     | `caption.table-caption` inside a `table.has-caption`                                                                                                                                                                                                                                         |
| Caption           | `.image-caption`, `.diagram-caption`                                                                                                                                                                                                                                                         |
| Table of contents | `nav.toc` holding an `ol.toc-list` of `.toc-item` with `.toc-level-1`…, holding a link with `.toc-text` and `.toc-dots`; the page number is the `::after` of the link                                                                                                                        |
| Page break        | `.page-break`                                                                                                                                                                                                                                                                                |
| Footnote          | `.footnote` for the note, `.footnote::footnote-call` for its call in the text, `.footnote::footnote-marker` for its number, `.footnote-ref` for a repeated call; the area of the notes is `@page { @footnote { … } }`                                                                        |
| Task list         | `.contains-task-list` on the list, `.task-list-item` on the item, holding an `input`                                                                                                                                                                                                         |
| Formula           | `.math` with `.math-inline` or `.math-block`, holding KaTeX's `.katex`; `.math-error` when the formula could not be read                                                                                                                                                                     |
| Alert             | `.alert` with `.alert-note`, `.alert-tip`, `.alert-important`, `.alert-warning` or `.alert-caution`, its title in `.alert-title`; the colour is `--alert-color`                                                                                                                              |
| Highlighted text  | `mark`; subscript and superscript are `sub` and `sup`, definition lists `dl`, `dt`, `dd`                                                                                                                                                                                                     |
| Highlighted code  | `pre.code-block` with `.code-light` or `.code-dark`, and highlight.js `.hljs-*` spans                                                                                                                                                                                                        |
| Heading           | an `id` made of `sec-` and the anchor name: `#sec-details`                                                                                                                                                                                                                                   |

Header, footer and the page counter are `@page` margin boxes driven by the settings, not by classes. Use print units (`mm`, `pt`) and paged-media properties such as `break-before: page` or `break-inside: avoid`.
