// The rendered document: its CSS (@page rules, cover, built-in rules, then the user's stylesheet), its HTML,
// and the standalone file used for export, print and PDF. The class names here are public API (see README).
import { LANGUAGE_TAG, PAGE_HEIGHT_MM, state } from './config.js';
import { escCssString, escapeHtml } from './escape.js';
import { inlineFontCss } from './fonts.js';
import { highlightCode, md, renderDiagrams } from './markdown.js';

// Typographic quotes used by markdown-it's typographer, per primary language.
const QUOTES_BY_LANGUAGE = {
  en: '“”‘’',
  // Array form: markdown-it only accepts a 4-character string, and French quotes carry a no-break space.
  fr: ['« ', ' »', '‹ ', ' ›'],
  de: '„“‚‘',
  es: '«»“”',
  it: '«»“”',
  pt: '«»“”',
  nl: '„”‚’',
};

// The language typed by the user, or "en" while it is not a valid tag.
export function documentLanguage() {
  const value = String(state.language ?? '').trim();
  return LANGUAGE_TAG.test(value) ? value : 'en';
}

// Colours of the highlighted code, per theme: [text, background, comment, keyword, string, number, title,
// attribute, built-in, deletion, addition].
const CODE_COLORS = {
  light: ['#24292f', '#f5f6f8', '#6e7781', '#cf222e', '#0a3069', '#0550ae', '#8250df', '#116329', '#953800'],
  dark: ['#e6edf3', '#161b22', '#8b949e', '#ff7b72', '#a5d6ff', '#79c0ff', '#d2a8ff', '#7ee787', '#ffa657'],
};

function codeCss() {
  const colors = CODE_COLORS[state.codeTheme];
  if (!colors) return '';
  const [text, background, comment, keyword, string, number, title, attribute, builtin] = colors;
  const block = `.document-content pre.code-${state.codeTheme}`;
  return `
${block} { background: ${background}; color: ${text}; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
${block} .hljs-comment, ${block} .hljs-quote, ${block} .hljs-meta { color: ${comment}; }
${block} .hljs-keyword, ${block} .hljs-selector-tag, ${block} .hljs-doctag, ${block} .hljs-template-tag, ${block} .hljs-deletion { color: ${keyword}; }
${block} .hljs-string, ${block} .hljs-regexp, ${block} .hljs-link { color: ${string}; }
${block} .hljs-number, ${block} .hljs-literal, ${block} .hljs-variable, ${block} .hljs-template-variable, ${block} .hljs-symbol, ${block} .hljs-bullet { color: ${number}; }
${block} .hljs-title, ${block} .hljs-section, ${block} .hljs-selector-id, ${block} .hljs-selector-class { color: ${title}; }
${block} .hljs-attr, ${block} .hljs-attribute, ${block} .hljs-name, ${block} .hljs-tag, ${block} .hljs-addition { color: ${attribute}; }
${block} .hljs-built_in, ${block} .hljs-type, ${block} .hljs-params { color: ${builtin}; }
${block} .hljs-strong { font-weight: 700; }`;
}

// Margin boxes of a page. With mirrored margins the left-hand pages swap sides, so the page number stays
// on the outer edge and the inner margin on the binding.
function marginBoxes({ mirrored = false } = {}) {
  // The running header is the text of the current first-level heading.
  const title = state.runningHeader ? 'string(chapter)' : `"${escCssString(state.headerTitle)}"`;
  const name = `"${escCssString(state.headerName)}"`;
  const footer = `"${escCssString(state.footerText)}"`;
  const counter = '"Page " counter(page) " / " counter(pages)';
  const [left, right] = mirrored ? ['right', 'left'] : ['left', 'right'];
  return `
  @top-${left} { content: ${title}; font-size: 8.5pt; color: #5f6368; }
  @top-${right} { content: ${name}; font-size: 8.5pt; color: #5f6368; }
  @bottom-${left} { content: ${footer}; font-size: 8pt; color: #6f7378; }
  @bottom-${right} { content: ${counter}; font-size: 8pt; color: #6f7378; }
  @footnote { margin-top: 4mm; padding-top: 2mm; border-top: .2mm solid #9aa0a6; }`;
}

const NO_MARGIN_BOXES = `
  @top-left { content: none; }
  @top-right { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }`;

// Layout of the cover page per template. The markup is the same for all of them.
function coverCss() {
  const accent = state.accentColor;
  switch (state.coverTemplate) {
    case 'centered':
      return `
.cover-page { align-items: center; text-align: center; }
.cover-logo { margin-left: auto; margin-right: auto; }
.cover-title::after { content: ""; display: block; width: 30mm; height: 1.2mm; margin: 9mm auto 0; background: ${accent}; }`;
    case 'band':
      return `
.cover-page { padding-left: 46mm; print-color-adjust: exact; -webkit-print-color-adjust: exact; background: linear-gradient(to right, ${accent} 0, ${accent} 22mm, transparent 22mm); }`;
    case 'minimal':
      return `
.cover-page { justify-content: flex-end; padding-bottom: 40mm; }
.cover-logo { margin-bottom: auto; max-width: 40mm; max-height: 20mm; }
.cover-title { font-size: 24pt; padding-top: 6mm; border-top: .6mm solid ${accent}; }
.cover-subtitle { margin-top: 4mm; font-size: 12pt; }
.cover-meta { margin-top: 10mm; font-size: 9.5pt; }`;
    default:
      return '';
  }
}

export function documentCss() {
  const coverHeight = PAGE_HEIGHT_MM[state.pageSize] ?? PAGE_HEIGHT_MM.A4;
  // A diagram never grows taller than the text area of a page (it cannot be split across pages).
  const diagramMaxHeight = Math.max(40, coverHeight - state.marginTop - state.marginBottom - 12);
  return `
@page {
  size: ${state.pageSize};
  margin: ${state.marginTop}mm ${state.marginRight}mm ${state.marginBottom}mm ${state.marginLeft}mm;
  font-family: Inter, Arial, sans-serif;${marginBoxes()}
}${
    state.mirrorMargins
      ? `
@page :left {
  margin: ${state.marginTop}mm ${state.marginLeft}mm ${state.marginBottom}mm ${state.marginRight}mm;${marginBoxes({ mirrored: true })}
}`
      : ''
  }
@page cover {
  size: ${state.pageSize};
  margin: 0;${NO_MARGIN_BOXES}
}${
    state.mirrorMargins
      ? `
@page cover:left {
  margin: 0;${NO_MARGIN_BOXES}
}`
      : ''
  }${state.runningHeader ? '\n.document-content h1 { string-set: chapter content(text); }' : ''}
.cover-page {
  page: cover;
  break-after: page;
  box-sizing: border-box;
  min-height: ${coverHeight}mm;
  padding: 32mm 28mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-family: Inter, Arial, sans-serif;
}
.cover-logo { max-width: 55mm; max-height: 28mm; object-fit: contain; margin-bottom: 20mm; }
.cover-title { margin: 0; font-size: 32pt; line-height: 1.1; color: #17191c; }
.cover-subtitle { margin-top: 7mm; font-size: 15pt; color: #5f6368; }
.cover-meta { margin-top: 18mm; color: #6d7278; font-size: 10.5pt; line-height: 1.6; }${coverCss()}
.page-break { break-after: page; height: 0; margin: 0; }
.toc { margin: 4mm 0 8mm; }
.toc-list { list-style: none; margin: 0; padding: 0; }
.toc-item { margin: 1.4mm 0; break-inside: avoid; }
.toc-item a { display: flex; align-items: last baseline; gap: 2mm; color: inherit; text-decoration: none; }
.toc-item a::after { content: target-counter(attr(href), page); font-variant-numeric: tabular-nums; }
.toc-dots { flex: 1; min-width: 8mm; border-bottom: .25mm dotted #9aa0a6; }
.toc-level-1 { font-weight: 600; margin-top: 3mm; }
.toc-level-2 { padding-left: 5mm; }
.toc-level-3 { padding-left: 10mm; font-size: .95em; }
.toc-level-4, .toc-level-5, .toc-level-6 { padding-left: 15mm; font-size: .9em; }
.footnote { float: footnote; font-size: 8.5pt; font-weight: 400; font-style: normal; line-height: 1.4; color: #3c4043; text-align: left; hyphens: auto; }
.footnote::footnote-call { font-size: 65%; line-height: 0; vertical-align: super; font-variant-position: normal; }
.footnote::footnote-marker { font-weight: 600; }
.footnote-ref { font-size: 65%; line-height: 0; vertical-align: super; }
.contains-task-list { padding-left: 6mm; }
.task-list-item { list-style: none; }
.task-list-item input { margin: 0 1.5mm 0 -5.5mm; vertical-align: middle; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.image-caption, .diagram-caption { display: block; margin-top: 2mm; font-size: 9pt; line-height: 1.35; color: #5f6368; text-align: center; }
.document-image.has-caption > .image-caption { box-sizing: border-box; width: 0; min-width: 100%; }
.document-content h1, .document-content h2, .document-content h3 { break-after: avoid; }
.document-content img, .document-content table, .document-content pre, .document-content blockquote, .mermaid-diagram { break-inside: avoid; max-width: 100%; }
.mermaid-diagram { margin: 5mm auto; text-align: center; }
.mermaid-diagram > svg { max-width: 100%; height: auto; max-height: ${diagramMaxHeight}mm; }
.mermaid-diagram.is-sized { width: var(--diagram-width); max-width: 100%; }
.mermaid-diagram.is-sized > svg { width: 100%; max-width: 100% !important; }
.mermaid-diagram[data-align="left"] { margin-left: 0; text-align: left; }
.mermaid-diagram[data-align="right"] { margin-right: 0; text-align: right; }
.document-image { display: inline-block; max-width: 100%; vertical-align: middle; break-inside: avoid; }
.document-image > img { display: block; max-width: 100%; height: auto; max-height: ${diagramMaxHeight}mm; object-fit: contain; }
.document-image.is-sized > img { width: 100%; }
.document-image.is-sized { width: var(--image-width); }
.document-image.is-block { display: block; width: fit-content; margin: 4mm auto; }
.document-image.is-block.is-sized { width: var(--image-width); }
.document-image.is-block[data-align="left"] { margin-left: 0; }
.document-image.is-block[data-align="right"] { margin-right: 0; }
.document-image:not(.is-block)[data-align="left"] { float: left; margin: 1mm 5mm 3mm 0; }
.document-image:not(.is-block)[data-align="right"] { float: right; margin: 1mm 0 3mm 5mm; }
.document-image:not(.is-block)[data-align="center"] { display: block; width: fit-content; margin: 4mm auto; }
.document-image:not(.is-block)[data-align="center"].is-sized { width: var(--image-width); }
.document-content h1, .document-content h2, .document-content h3, .document-content table, .document-content pre, .mermaid-diagram { clear: both; }
.document-content .image-missing { display: inline-block; font-size: 8.5pt; color: #8a1f1f; background: #fff3f3; border: .3mm dashed #d7a8a8; padding: 2mm 3mm; border-radius: 1.5mm; }
.document-content .mermaid-error { text-align: left; white-space: pre-wrap; font-size: 8.5pt; color: #8a1f1f; background: #fff3f3; border: .3mm solid #d7a8a8; padding: 3mm; border-radius: 1.5mm; }
${state.customCss}
${codeCss()}
`;
}

// `sourceLines` marks every block with its line of the Markdown: for the preview, never for an export.
export async function documentHtml({ sourceLines = false } = {}) {
  const lang = documentLanguage();
  md.set({ quotes: QUOTES_BY_LANGUAGE[lang.split('-')[0].toLowerCase()] ?? QUOTES_BY_LANGUAGE.en });
  const cover = state.cover
    ? `
    <section class="cover-page" lang="${lang}">
      ${state.logoDataUrl ? `<img class="cover-logo" src="${escapeHtml(state.logoDataUrl)}" alt="Logo">` : ''}
      <h1 class="cover-title">${escapeHtml(state.title)}</h1>
      ${state.subtitle ? `<div class="cover-subtitle">${escapeHtml(state.subtitle)}</div>` : ''}
      <div class="cover-meta">
        ${state.author ? `<div>${escapeHtml(state.author)}</div>` : ''}
        ${state.date ? `<div>${escapeHtml(state.date)}</div>` : ''}
      </div>
    </section>`
    : '';
  const body = await highlightCode(await renderDiagrams(md.render(state.markdown, { sourceLines })), state.codeTheme);
  return `${cover}<article class="document-content" lang="${lang}">${body}</article>`;
}

// The Paged.js polyfill is inlined into exports as a string (so they paginate offline with the exact version
// used by the preview). It only matters for export and print, so it is loaded on first use, not at startup.
let pagedPolyfillPromise = null;
function loadPagedPolyfill() {
  pagedPolyfillPromise ??= import('../node_modules/pagedjs/dist/paged.polyfill.min.js?raw')
    .then(module => module.default)
    .catch(error => {
      pagedPolyfillPromise = null;
      throw error;
    });
  return pagedPolyfillPromise;
}

// What happens once Paged.js reports pagination is complete, per `standaloneHtml` mode:
//   'export' nothing (the file is meant to be opened later),
//   'print'  the print dialog opens,
//   'pdf'    a `data-paged-ready` flag is set for the desktop app and the MCP server, which then print to PDF.
export const SOURCE_BLOCK_ID = 'markdown-paged-studio-source';

// The configuration a studio HTML export carries, as text, or null.
export function sourcesOfHtml(html) {
  const match = new RegExp(`<script type="application/json" id="${SOURCE_BLOCK_ID}">([^]*?)</script>`).exec(html);
  return match ? match[1] : null;
}

const AFTER_PAGINATION = {
  export: '',
  print: ',after:()=>setTimeout(()=>window.print(),100)',
  pdf: ',after:()=>{document.documentElement.dataset.pagedReady="true"}',
};

// Self-contained HTML: same content and CSS as the preview, with Paged.js inlined so it works offline.
// `source` is the project JSON (the content of a project file): the exported HTML carries it in a data
// block, so that Import… can reopen the file.
export async function standaloneHtml({ mode = 'export', source = '' } = {}) {
  const content = await documentHtml();
  const css = documentCss();
  // Kept away from Paged.js, which would parse the inlined font files for nothing.
  const fonts = await inlineFontCss(content, css).catch(error => {
    console.warn('The document font could not be embedded', error);
    return '';
  });
  // A literal "</script" inside the inlined library would end the script element early.
  const library = (await loadPagedPolyfill()).replace(/<\/script/gi, '<\\/script');
  const after = AFTER_PAGINATION[mode] ?? '';
  // A "<" in the JSON could end the script element: written as its escape, which JSON reads back as is.
  const sources = source
    ? `<script type="application/json" id="${SOURCE_BLOCK_ID}">${source.replace(/</g, '\\u003c')}</script>`
    : '';
  return `<!doctype html>\n<html lang="${documentLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.title)}</title>${fonts ? `<style data-pagedjs-ignore>${fonts}</style>` : ''}<style>${css}</style><script>window.PagedConfig={auto:true${after}};</script><script>${library}</script>${sources}</head><body>${content}</body></html>`;
}
