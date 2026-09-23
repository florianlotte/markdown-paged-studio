import './ui.css';
import MarkdownIt from 'markdown-it';
import { Previewer } from 'pagedjs';
import logoUrl from './assets/logo.svg';

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

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

// ```mermaid fences become placeholders; renderDiagrams() turns them into inline SVG before pagination,
// because Paged.js needs the final diagram size to lay out pages.
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim().toLowerCase() === 'mermaid') {
    return `<div class="mermaid-diagram" data-source="${escapeHtml(token.content)}"></div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

let mermaidPromise = null;
// Mermaid weighs several MB, so it is only loaded the first time a document contains a diagram.
function loadMermaid() {
  mermaidPromise ??= import('mermaid')
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'Inter, Arial, sans-serif',
        // Pure SVG text instead of foreignObject labels: more reliable in print and in the exported file.
        htmlLabels: false,
      });
      return mermaid;
    })
    .catch(error => {
      mermaidPromise = null;
      throw error;
    });
  return mermaidPromise;
}

// Rendered SVG per diagram source, so retyping elsewhere in the document does not re-render every diagram.
const diagramCache = new Map();
let diagramCounter = 0;

async function diagramSvg(mermaid, source) {
  if (diagramCache.has(source)) return diagramCache.get(source);
  const id = `mermaid-${++diagramCounter}`;
  let html;
  try {
    // parse() reports syntax errors without touching the DOM; render() on bad input leaves temp nodes behind.
    await mermaid.parse(source);
    const { svg } = await mermaid.render(id, source);
    html = svg;
  } catch (error) {
    html = `<pre class="mermaid-error">${escapeHtml(error?.message || String(error))}\n\n${escapeHtml(source)}</pre>`;
  } finally {
    // Mermaid renders inside temporary containers named after the id; make sure none survives a failure.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(`i${id}`)?.remove();
  }
  if (diagramCache.size >= 100) diagramCache.clear();
  diagramCache.set(source, html);
  return html;
}

// Replace every mermaid placeholder in `html` with its rendered SVG. Returns `html` untouched when there is none.
async function renderDiagrams(html) {
  if (!html.includes('class="mermaid-diagram"')) return html;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const mermaid = await loadMermaid();
  for (const node of wrap.querySelectorAll('.mermaid-diagram')) {
    const source = node.dataset.source ?? '';
    delete node.dataset.source;
    node.innerHTML = await diagramSvg(mermaid, source);
  }
  return wrap.innerHTML;
}

const STORAGE_KEY = 'markdown-paged-studio:document';
const PAGE_SIZES = ['A4', 'Letter', 'A5'];
const MARGIN_MAX_MM = 80;
const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=-]+)*,[^\s"<>]*$/i;
// BCP 47 language tag such as "en", "fr", "pt-BR" or "zh-Hant".
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
// Typographic quotes used by markdown-it's typographer, per primary language.
const QUOTES_BY_LANGUAGE = {
  en: '\u201c\u201d\u2018\u2019',
  // Array form: markdown-it only accepts a 4-character string, and French quotes carry a no-break space.
  fr: ['\u00ab\u00a0', '\u00a0\u00bb', '\u2039\u00a0', '\u00a0\u203a'],
  de: '\u201e\u201c\u201a\u2018',
  es: '\u00ab\u00bb\u201c\u201d',
  it: '\u00ab\u00bb\u201c\u201d',
  pt: '\u00ab\u00bb\u201c\u201d',
  nl: '\u201e\u201d\u201a\u2019',
};

const DEFAULT_MARKDOWN = `# Introduction\n\nWelcome to **Markdown Paged Studio**.\n\nThis app turns your Markdown into a paginated document that is ready to print.\n\n## Features\n\n- configurable cover page;\n- logo;\n- header and footer;\n- Page X / Y counter;\n- custom CSS;\n- live paged preview;\n- Mermaid diagrams;\n- standalone HTML export;\n- print / PDF through the browser.\n\n## Table example\n\n| Item | Value |\n|---|---|\n| Source | Markdown |\n| Rendering | HTML |\n| Pagination | Paged.js |\n\n## Diagram\n\n\`\`\`mermaid\nflowchart LR\n  A[Markdown] --> B[HTML]\n  B --> C[Pages]\n\`\`\`\n\n## Second part\n\nAdd content here to get more pages.\n\n> Custom CSS only applies to the rendered document.\n\n### Code\n\n\`\`\`js\nconsole.log('Markdown → HTML → pages');\n\`\`\`\n`;

const DEFAULT_CSS = `
.document-content {
  font-family: Inter, Arial, sans-serif;
  color: #202124;
  font-size: 10.5pt;
  line-height: 1.55;
  hyphens: auto;
}
.document-content h1 { font-size: 24pt; margin: 0 0 8mm; }
.document-content h2 { font-size: 17pt; margin-top: 10mm; }
.document-content h3 { font-size: 13pt; margin-top: 7mm; }
.document-content table { width: 100%; border-collapse: collapse; }
.document-content th,
.document-content td { border: .2mm solid #d0d4da; padding: 2.5mm 3mm; text-align: left; }
.document-content pre { background: #f5f6f8; padding: 4mm; border-radius: 2mm; white-space: pre-wrap; }
.document-content blockquote { margin-left: 0; padding-left: 5mm; border-left: 1mm solid #c8cdd4; color: #555; }
`;

const DEFAULT_STATE = {
  title: 'Architecture Report',
  subtitle: 'Generated from Markdown',
  author: 'Jane Doe',
  date: new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date()),
  headerTitle: 'Architecture Report',
  headerName: 'Jane Doe',
  footerText: 'Confidential',
  language: 'en',
  pageSize: 'A4',
  marginTop: 24,
  marginRight: 18,
  marginBottom: 20,
  marginLeft: 18,
  cover: true,
  markdown: DEFAULT_MARKDOWN,
  customCss: DEFAULT_CSS,
  logoDataUrl: '',
};

// Value kind per config key. Anything not listed here is dropped on import.
const CONFIG_SCHEMA = {
  title: 'string',
  subtitle: 'string',
  author: 'string',
  date: 'string',
  headerTitle: 'string',
  headerName: 'string',
  footerText: 'string',
  language: 'language',
  pageSize: 'pageSize',
  marginTop: 'margin',
  marginRight: 'margin',
  marginBottom: 'margin',
  marginLeft: 'margin',
  cover: 'boolean',
  markdown: 'string',
  customCss: 'string',
  logoDataUrl: 'imageDataUrl',
};

// Personal defaults from the gitignored `local/` folder (see local/README.md), resolved at build time by Vite.
// They apply on first start and on Reset; a document saved in the browser always wins over them.
const localConfig =
  Object.values(import.meta.glob('../local/config.json', { eager: true, import: 'default' }))[0] ?? {};
const localText = import.meta.glob(['../local/custom.css', '../local/template.md'], {
  eager: true,
  query: '?raw',
  import: 'default',
});
const localLogo = Object.values(
  import.meta.glob('../local/logo.{svg,png,jpg,jpeg,webp,gif}', { eager: true, query: '?inline', import: 'default' }),
)[0];

const DEFAULTS = {
  ...DEFAULT_STATE,
  ...sanitizeConfig(localConfig),
  ...(localText['../local/custom.css'] ? { customCss: localText['../local/custom.css'] } : {}),
  ...(localText['../local/template.md'] ? { markdown: localText['../local/template.md'] } : {}),
  ...(localLogo ? { logoDataUrl: localLogo } : {}),
};

const state = { ...DEFAULTS };

// Returns only the keys of `input` that are known and well-typed, coerced into safe values.
function sanitizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [key, kind] of Object.entries(CONFIG_SCHEMA)) {
    if (!(key in input)) continue;
    const value = input[key];
    switch (kind) {
      case 'string':
        if (typeof value === 'string') out[key] = value;
        break;
      case 'boolean':
        out[key] = Boolean(value);
        break;
      case 'pageSize':
        if (PAGE_SIZES.includes(value)) out[key] = value;
        break;
      case 'margin': {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = Math.min(MARGIN_MAX_MM, Math.max(0, n));
        break;
      }
      case 'language':
        if (typeof value === 'string' && LANGUAGE_TAG.test(value.trim())) out[key] = value.trim();
        break;
      case 'imageDataUrl':
        if (value === '' || (typeof value === 'string' && IMAGE_DATA_URL.test(value))) out[key] = value;
        break;
    }
  }
  return out;
}

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeConfig(JSON.parse(raw)) : {};
  } catch (error) {
    console.warn('Could not restore the saved document', error);
    return {};
  }
}

let persistTimer = null;
function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Quota exceeded (large logo) or storage disabled: the app keeps working without autosave.
    console.warn('Autosave failed', error);
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 500);
}

const app = document.querySelector('#app');
app.innerHTML = `
<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <img class="brand-mark" src="${logoUrl}" alt="" width="38" height="38" />
      <div><strong>Markdown Paged Studio</strong><span>100% in the browser</span></div>
    </div>

    <div class="tabs" role="tablist" aria-label="Settings">
      <button class="tab active" role="tab" id="tab-content" data-tab="content" aria-selected="true" aria-controls="panel-content">Content</button>
      <button class="tab" role="tab" id="tab-design" data-tab="design" aria-selected="false" aria-controls="panel-design" tabindex="-1">Design</button>
      <button class="tab" role="tab" id="tab-page" data-tab="page" aria-selected="false" aria-controls="panel-page" tabindex="-1">Page</button>
    </div>

    <div class="panel active" role="tabpanel" id="panel-content" aria-labelledby="tab-content" data-panel="content">
      <label>Title<input id="title" /></label>
      <label>Subtitle<input id="subtitle" /></label>
      <label>Author<input id="author" /></label>
      <label>Date<input id="date" /></label>
      <label class="check"><input id="cover" type="checkbox" /> Show cover page</label>
      <label>Logo<input id="logo" type="file" accept="image/*" /></label>
      <button id="clearLogo" class="secondary">Remove logo</button>
      <label>Markdown<textarea id="markdown" class="editor markdown-editor" spellcheck="false"></textarea></label>
      <div class="row-actions">
        <button id="loadMarkdown" class="secondary">Import .md</button>
        <input id="markdownFile" type="file" accept=".md,.markdown,text/markdown,text/plain" hidden />
        <button id="downloadMarkdown" class="secondary">Download .md</button>
      </div>
    </div>

    <div class="panel" role="tabpanel" id="panel-design" aria-labelledby="tab-design" data-panel="design">
      <label>Header title<input id="headerTitle" /></label>
      <label>Header name<input id="headerName" /></label>
      <label>Footer text<input id="footerText" /></label>
      <label>Custom CSS<textarea id="customCss" class="editor css-editor" spellcheck="false"></textarea></label>
      <div class="row-actions">
        <button id="loadCss" class="secondary">Import .css</button>
        <input id="cssFile" type="file" accept=".css,text/css" hidden />
        <button id="resetCss" class="secondary">Sample CSS</button>
      </div>
    </div>

    <div class="panel" role="tabpanel" id="panel-page" aria-labelledby="tab-page" data-panel="page">
      <label>Page size
        <select id="pageSize">
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
          <option value="A5">A5</option>
        </select>
      </label>
      <label>Language (hyphenation and quotes)
        <input id="language" list="languageList" placeholder="en" spellcheck="false" autocomplete="off" />
      </label>
      <datalist id="languageList">
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="de">Deutsch</option>
        <option value="es">Español</option>
        <option value="it">Italiano</option>
        <option value="pt">Português</option>
        <option value="nl">Nederlands</option>
      </datalist>
      <div class="grid2">
        <label>Top (mm)<input id="marginTop" type="number" min="0" max="80" /></label>
        <label>Right (mm)<input id="marginRight" type="number" min="0" max="80" /></label>
        <label>Bottom (mm)<input id="marginBottom" type="number" min="0" max="80" /></label>
        <label>Left (mm)<input id="marginLeft" type="number" min="0" max="80" /></label>
      </div>
      <div class="info-card">
        <strong>Pagination</strong>
        <p>The header, footer and <code>Page X / Y</code> counter are computed by Paged.js.</p>
      </div>
    </div>
  </aside>

  <main class="workspace">
    <header class="toolbar">
      <div>
        <strong>Paged preview</strong>
        <span id="status">Starting…</span>
      </div>
      <div class="view-controls">
        <div class="segmented" role="group" aria-label="Page layout">
          <button id="layoutSingle" class="active" title="One continuous column" aria-pressed="true">1 page</button>
          <button id="layoutSpread" title="Two pages side by side" aria-pressed="false">2 pages</button>
        </div>
        <div class="segmented" role="group" aria-label="Preview zoom">
          <button id="zoomOut" title="Zoom out (Ctrl + wheel)" aria-label="Zoom out">−</button>
          <span id="zoomValue" class="zoom-value" aria-live="polite">100 %</span>
          <button id="zoomIn" title="Zoom in (Ctrl + wheel)" aria-label="Zoom in">+</button>
          <button id="zoomFit" title="Fit to the available width" aria-pressed="false">Fit</button>
        </div>
      </div>
      <div class="toolbar-actions">
        <button id="resetDocument" class="secondary">Reset</button>
        <button id="saveConfig" class="secondary">Save config</button>
        <button id="loadConfig" class="secondary">Load config</button>
        <input id="configFile" type="file" accept="application/json,.json" hidden />
        <button id="exportHtml" class="secondary">Export HTML</button>
        <button id="printPdf" class="primary">Print / PDF</button>
      </div>
    </header>
    <section class="preview-shell">
      <div id="preview" class="preview"></div>
    </section>
  </main>
</div>
`;

const ids = Object.keys(state).filter(k => k !== 'logoDataUrl');

function syncInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(state[key]);
    else el.value = state[key];
  }
}

// Merge a (possibly untrusted) config object into the state, refresh the form, and re-render.
function applyConfig(config) {
  Object.assign(state, sanitizeConfig(config));
  syncInputs();
  scheduleRender();
}

Object.assign(state, loadStoredConfig());
syncInputs();

function escCssString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ');
}

function documentCss() {
  return `
@page {
  size: ${state.pageSize};
  margin: ${state.marginTop}mm ${state.marginRight}mm ${state.marginBottom}mm ${state.marginLeft}mm;
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
  min-height: 297mm;
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

// The language typed by the user, or "en" while it is not a valid tag.
function documentLanguage() {
  const value = String(state.language ?? '').trim();
  return LANGUAGE_TAG.test(value) ? value : 'en';
}

async function documentHtml() {
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

let renderTimer;
let renderToken = 0;
// The previewer whose pages are currently displayed. Its injected <style> must stay alive until replaced.
let activePreviewer = null;
// The previewer still paginating, if any, so a newer render can stop it early.
let pendingPreviewer = null;

// Stop a previewer and remove everything it injected into the document (styles in <head>, its pages area).
function disposePreviewer(previewer) {
  if (!previewer) return;
  try {
    previewer.chunker.stop();
    previewer.chunker.destroy();
    previewer.polisher.destroy();
  } catch (error) {
    console.warn('Previewer cleanup failed', error);
  }
}

function renderErrorElement(error) {
  const box = document.createElement('div');
  box.className = 'render-error';
  const title = document.createElement('strong');
  title.textContent = 'Paged.js error';
  const details = document.createElement('pre');
  details.textContent = error?.stack || error?.message || String(error);
  box.append(title, details);
  return box;
}

// Paginate into a hidden, attached stage (Paged.js needs layout to measure overflow), then swap the
// result into #preview in one step. The previous pages stay visible meanwhile, so typing never flashes
// an empty preview, and two renders never write into the same element.
async function render() {
  const token = ++renderToken;
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  status.textContent = 'Rendering…';
  preview.classList.add('is-rendering');

  if (pendingPreviewer) pendingPreviewer.chunker.stop();

  const stage = document.createElement('div');
  stage.className = 'render-stage';
  stage.setAttribute('aria-hidden', 'true');
  document.body.appendChild(stage);

  const styleUrl = URL.createObjectURL(new Blob([documentCss()], { type: 'text/css' }));
  let previewer = null;
  try {
    // Diagrams render first (async, possibly loading Mermaid); a stale token here means a newer edit arrived.
    const html = await documentHtml();
    if (token !== renderToken) return;
    previewer = new Previewer();
    pendingPreviewer = previewer;
    const flow = await previewer.preview(html, [styleUrl], stage);
    if (token !== renderToken) {
      disposePreviewer(previewer);
      return;
    }
    preview.replaceChildren(...stage.childNodes);
    disposePreviewer(activePreviewer);
    activePreviewer = previewer;
    status.textContent = `${flow.total} page${flow.total > 1 ? 's' : ''}`;
    applyView();
  } catch (error) {
    disposePreviewer(previewer);
    if (token !== renderToken) return;
    console.error(error);
    status.textContent = 'Render error';
    disposePreviewer(activePreviewer);
    activePreviewer = null;
    preview.replaceChildren(renderErrorElement(error));
  } finally {
    stage.remove();
    if (pendingPreviewer === previewer) pendingPreviewer = null;
    if (token === renderToken) preview.classList.remove('is-rendering');
    setTimeout(() => URL.revokeObjectURL(styleUrl), 1000);
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 220);
  schedulePersist();
}

for (const key of ids) {
  const el = document.getElementById(key);
  if (!el) continue;
  const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
  el.addEventListener(eventName, () => {
    state[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    scheduleRender();
  });
}

const tabs = [...document.querySelectorAll('.tab')];

function activateTab(tab, { focus = false } = {}) {
  for (const other of tabs) {
    const selected = other === tab;
    other.classList.toggle('active', selected);
    other.setAttribute('aria-selected', String(selected));
    other.tabIndex = selected ? 0 : -1;
  }
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
  });
  if (focus) tab.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  // Roving focus per the WAI-ARIA tabs pattern: arrows, Home and End move between tabs.
  tab.addEventListener('keydown', event => {
    const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index };
    if (!(event.key in moves)) return;
    event.preventDefault();
    activateTab(tabs[(index + moves[event.key] + tabs.length) % tabs.length], { focus: true });
  });
});

function readTextFile(input, callback) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(String(reader.result ?? ''));
  reader.readAsText(file);
  input.value = '';
}

document.getElementById('logo').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.logoDataUrl = String(reader.result || '');
    scheduleRender();
  };
  reader.readAsDataURL(file);
});

document.getElementById('clearLogo').addEventListener('click', () => {
  state.logoDataUrl = '';
  document.getElementById('logo').value = '';
  scheduleRender();
});

document
  .getElementById('loadMarkdown')
  .addEventListener('click', () => document.getElementById('markdownFile').click());
document.getElementById('markdownFile').addEventListener('change', e =>
  readTextFile(e.target, text => {
    state.markdown = text;
    document.getElementById('markdown').value = text;
    scheduleRender();
  }),
);

document.getElementById('loadCss').addEventListener('click', () => document.getElementById('cssFile').click());
document.getElementById('cssFile').addEventListener('change', e =>
  readTextFile(e.target, text => {
    state.customCss = text;
    document.getElementById('customCss').value = text;
    scheduleRender();
  }),
);

document.getElementById('resetCss').addEventListener('click', () => {
  state.customCss = DEFAULTS.customCss;
  document.getElementById('customCss').value = DEFAULTS.customCss;
  scheduleRender();
});

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

document
  .getElementById('downloadMarkdown')
  .addEventListener('click', () => download('document.md', state.markdown, 'text/markdown;charset=utf-8'));

document.getElementById('saveConfig').addEventListener('click', () => {
  download('markdown-paged-config.json', JSON.stringify(state, null, 2), 'application/json');
});

document.getElementById('loadConfig').addEventListener('click', () => document.getElementById('configFile').click());
document.getElementById('configFile').addEventListener('change', e =>
  readTextFile(e.target, text => {
    let loaded;
    try {
      loaded = JSON.parse(text);
    } catch {
      alert('Invalid JSON file.');
      return;
    }
    applyConfig(loaded);
  }),
);

document.getElementById('resetDocument').addEventListener('click', () => {
  if (!confirm('Discard the current document and restore the sample?')) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
  document.getElementById('logo').value = '';
  applyConfig(DEFAULTS);
});

// Self-contained HTML: same content and CSS as the preview, with Paged.js inlined so it works offline.
// With `autoPrint`, the print dialog opens once Paged.js reports pagination is complete.
async function standaloneHtml({ autoPrint = false } = {}) {
  const content = await documentHtml();
  const css = documentCss();
  // A literal "</script" inside the inlined library would end the script element early.
  const library = (await loadPagedPolyfill()).replace(/<\/script/gi, '<\\/script');
  const after = autoPrint ? ',after:()=>setTimeout(()=>window.print(),100)' : '';
  return `<!doctype html>\n<html lang="${documentLanguage()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.title)}</title><style>${css}</style><script>window.PagedConfig={auto:true${after}};</script><script>${library}</script></head><body>${content}</body></html>`;
}

document.getElementById('exportHtml').addEventListener('click', async () => {
  download('document.html', await standaloneHtml(), 'text/html;charset=utf-8');
});

document.getElementById('printPdf').addEventListener('click', async () => {
  // Open the window synchronously, inside the click, so pop-up blockers allow it; fill it once the HTML is ready.
  const win = window.open('', '_blank');
  if (!win) {
    alert('The browser blocked the print window. Allow pop-ups for this site.');
    return;
  }
  const html = await standaloneHtml({ autoPrint: true });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  win.location = url;
  // The opened page prints itself when Paged.js finishes; the URL only needs to outlive the load.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});

// ---- Preview view settings: page layout and zoom. Stored apart from the document, they are not part
// ---- of the config JSON. Zoom uses the CSS `zoom` property so the scrollable area follows the scale.
const VIEW_KEY = 'markdown-paged-studio:view';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const PAGE_GAP_PX = 24; // must match the `gap` of `.preview .pagedjs_pages` in ui.css

const view = { layout: 'single', zoom: 1, fit: true };

function loadView() {
  try {
    const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    if (stored.layout === 'single' || stored.layout === 'spread') view.layout = stored.layout;
    const zoom = Number(stored.zoom);
    if (Number.isFinite(zoom)) view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
    if (typeof stored.fit === 'boolean') view.fit = stored.fit;
  } catch {
    // Storage unavailable or corrupt: keep the defaults.
  }
}

let saveViewTimer = null;
function saveViewNow() {
  clearTimeout(saveViewTimer);
  saveViewTimer = null;
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Storage unavailable: the view still applies for this session.
  }
}

// Debounced: in fit mode the ResizeObserver calls applyView() on every frame of a window resize.
function saveView() {
  clearTimeout(saveViewTimer);
  saveViewTimer = setTimeout(saveViewNow, 300);
}

// Closing or reloading the tab must not lose the last edit or view change still waiting on a debounce.
window.addEventListener('pagehide', () => {
  if (persistTimer !== null) persistNow();
  if (saveViewTimer !== null) saveViewNow();
});

// Width of one rendered page at zoom 1. getBoundingClientRect() reports the zoomed size, so divide it out.
function pageNaturalWidth() {
  const page = document.querySelector('#preview .pagedjs_page');
  if (!page) return null;
  const currentZoom = Number(document.getElementById('preview').style.zoom) || 1;
  return page.getBoundingClientRect().width / currentZoom;
}

function fitZoom() {
  const shell = document.querySelector('.preview-shell');
  const pageWidth = pageNaturalWidth();
  if (!pageWidth) return view.zoom;
  const columns = view.layout === 'spread' ? 2 : 1;
  const shellStyle = getComputedStyle(shell);
  const available = shell.clientWidth - parseFloat(shellStyle.paddingLeft) - parseFloat(shellStyle.paddingRight);
  const zoom = available / (pageWidth * columns + PAGE_GAP_PX * (columns - 1));
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

function applyView() {
  const preview = document.getElementById('preview');
  preview.dataset.layout = view.layout;
  if (view.fit) view.zoom = fitZoom();
  preview.style.zoom = String(view.zoom);
  document.getElementById('zoomValue').textContent = `${Math.round(view.zoom * 100)} %`;
  const single = view.layout === 'single';
  document.getElementById('layoutSingle').classList.toggle('active', single);
  document.getElementById('layoutSingle').setAttribute('aria-pressed', String(single));
  document.getElementById('layoutSpread').classList.toggle('active', !single);
  document.getElementById('layoutSpread').setAttribute('aria-pressed', String(!single));
  document.getElementById('zoomFit').classList.toggle('active', view.fit);
  document.getElementById('zoomFit').setAttribute('aria-pressed', String(view.fit));
  saveView();
}

function setZoom(zoom) {
  view.fit = false;
  view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
  applyView();
}

function setLayout(layout) {
  view.layout = layout;
  applyView();
}

document.getElementById('layoutSingle').addEventListener('click', () => setLayout('single'));
document.getElementById('layoutSpread').addEventListener('click', () => setLayout('spread'));
document.getElementById('zoomIn').addEventListener('click', () => setZoom(view.zoom + ZOOM_STEP));
document.getElementById('zoomOut').addEventListener('click', () => setZoom(view.zoom - ZOOM_STEP));
document.getElementById('zoomFit').addEventListener('click', () => {
  view.fit = true;
  applyView();
});

// Ctrl + wheel over the preview zooms the pages instead of the whole studio.
document.querySelector('.preview-shell').addEventListener(
  'wheel',
  event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
  },
  { passive: false },
);

// In fit mode, follow the available width when the window or the sidebar changes size.
new ResizeObserver(() => {
  if (view.fit) applyView();
}).observe(document.querySelector('.preview-shell'));

loadView();
applyView();

render();
