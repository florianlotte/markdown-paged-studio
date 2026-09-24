// The rendered document: its CSS (@page rules, cover, built-in rules, then the user's stylesheet), its HTML,
// and the standalone file used for export, print and PDF. The class names here are public API (see README).
import { LANGUAGE_TAG, PAGE_HEIGHT_MM, state } from './config.js';
import { escCssString, escapeHtml } from './escape.js';
import { md, renderDiagrams } from './markdown.js';

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

export function documentCss() {
  const coverHeight = PAGE_HEIGHT_MM[state.pageSize] ?? PAGE_HEIGHT_MM.A4;
  return `
@page {
  size: ${state.pageSize};
  margin: ${state.marginTop}mm ${state.marginRight}mm ${state.marginBottom}mm ${state.marginLeft}mm;
  font-family: Inter, Arial, sans-serif;
  @top-left { content: "${escCssString(state.headerTitle)}"; font-size: 8.5pt; color: #5f6368; }
  @top-right { content: "${escCssString(state.headerName)}"; font-size: 8.5pt; color: #5f6368; }
  @bottom-left { content: "${escCssString(state.footerText)}"; font-size: 8pt; color: #6f7378; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font-size: 8pt; color: #6f7378; }
}
@page cover {
  size: ${state.pageSize};
  margin: 0;
  @top-left { content: none; }
  @top-right { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}
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
.cover-meta { margin-top: 18mm; color: #6d7278; font-size: 10.5pt; line-height: 1.6; }
.document-content h1, .document-content h2, .document-content h3 { break-after: avoid; }
.document-content img, .document-content table, .document-content pre, .document-content blockquote, .mermaid-diagram { break-inside: avoid; max-width: 100%; }
.mermaid-diagram { margin: 5mm 0; text-align: center; }
.mermaid-diagram svg { max-width: 100%; height: auto; }
.document-content .mermaid-error { text-align: left; white-space: pre-wrap; font-size: 8.5pt; color: #8a1f1f; background: #fff3f3; border: .3mm solid #d7a8a8; padding: 3mm; border-radius: 1.5mm; }
${state.customCss}
`;
}

export async function documentHtml() {
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
  const body = await renderDiagrams(md.render(state.markdown));
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
const AFTER_PAGINATION = {
  export: '',
  print: ',after:()=>setTimeout(()=>window.print(),100)',
  pdf: ',after:()=>{document.documentElement.dataset.pagedReady="true"}',
};

// Self-contained HTML: same content and CSS as the preview, with Paged.js inlined so it works offline.
export async function standaloneHtml({ mode = 'export' } = {}) {
  const content = await documentHtml();
  const css = documentCss();
  // A literal "</script" inside the inlined library would end the script element early.
  const library = (await loadPagedPolyfill()).replace(/<\/script/gi, '<\\/script');
  const after = AFTER_PAGINATION[mode] ?? '';
  return `<!doctype html>\n<html lang="${documentLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.title)}</title><style>${css}</style><script>window.PagedConfig={auto:true${after}};</script><script>${library}</script></head><body>${content}</body></html>`;
}
