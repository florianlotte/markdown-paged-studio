// Document settings: defaults (built-in, then personal ones from local/), the mutable `state`, validation of
// anything that enters it, and the autosave in localStorage.

import { assembleFiles, DEFAULT_FILE_NAME, sanitizeFiles } from './files.js';
import { IMAGE_DATA_URL, loadLogo, saveLogo } from './images.js';

export const STORAGE_KEY = 'markdown-paged-studio:document';
export const PAGE_SIZES = ['A4', 'Letter', 'A5'];
// Page heights in mm, used to size the cover page to the selected paper.
export const PAGE_HEIGHT_MM = { A4: 297, A5: 210, Letter: 279.4 };
export const MARGIN_MAX_MM = 80;
export const CODE_THEMES = ['light', 'dark', 'none'];
export const COVER_TEMPLATES = ['classic', 'centered', 'band', 'minimal'];
const COLOR = /^#[0-9a-f]{6}$/i;
// BCP 47 language tag such as "en", "fr", "pt-BR" or "zh-Hant".
export const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

const DEFAULT_MARKDOWN = `# Introduction

Welcome to **Markdown Paged Studio**.

This app turns your Markdown into a paginated document that is ready to print[^export].

[[toc]]

## Features

- configurable cover page and logo;
- table of contents with page numbers;
- header, footer and Page X / Y counter;
- images and Mermaid diagrams, with captions;
- footnotes and task lists;
- highlighted code;
- custom CSS;
- standalone HTML and PDF export.

## Table example

| Item | Value |
|---|---|
| Source | Markdown |
| Rendering | HTML |
| Pagination | Paged.js |

\\newpage

## Diagram

This part starts on a new page: the line above its title holds only \`\\newpage\`.

\`\`\`mermaid caption="Figure 1: from Markdown to pages"
flowchart LR
  A[Markdown] --> B[HTML]
  B --> C[Pages]
\`\`\`

## Second part

Add content here to get more pages.

> Custom CSS only applies to the rendered document.

### Tasks

- [x] Write the Markdown
- [ ] Export the PDF

### Code

\`\`\`js
console.log('Markdown → HTML → pages');
\`\`\`

[^export]: With **Export PDF**, or with the print dialog of the browser.
`;

const DEFAULT_CSS = `
.document-content {
  font-family: Inter, Arial, sans-serif;
  color: #202124;
  font-size: 8.5pt;
  line-height: 1.45;
  hyphens: auto;
}
.document-content h1 { font-size: 22pt; margin: 0 0 8mm; }
.document-content h2 { font-size: 15pt; margin-top: 10mm; }
.document-content h3 { font-size: 11pt; margin-top: 7mm; }
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
  // The Markdown as files, in the order of the document; `markdown` is their assembly (see mergeConfig()).
  files: [],
  customCss: DEFAULT_CSS,
  logoDataUrl: '',
  codeTheme: 'light',
  runningHeader: false,
  mirrorMargins: false,
  coverTemplate: 'classic',
  accentColor: '#2c2f73',
};

// Value kind per config key. Anything not listed here is dropped on import.
export const CONFIG_SCHEMA = {
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
  files: 'files',
  customCss: 'string',
  logoDataUrl: 'imageDataUrl',
  codeTheme: 'codeTheme',
  runningHeader: 'boolean',
  mirrorMargins: 'boolean',
  coverTemplate: 'coverTemplate',
  accentColor: 'color',
};

// Returns only the keys of `input` that are known and well-typed, coerced into safe values.
export function sanitizeConfig(input) {
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
      case 'codeTheme':
        if (CODE_THEMES.includes(value)) out[key] = value;
        break;
      case 'coverTemplate':
        if (COVER_TEMPLATES.includes(value)) out[key] = value;
        break;
      case 'color':
        if (typeof value === 'string' && COLOR.test(value.trim())) out[key] = value.trim().toLowerCase();
        break;
      case 'language':
        if (typeof value === 'string' && LANGUAGE_TAG.test(value.trim())) out[key] = value.trim();
        break;
      case 'imageDataUrl':
        if (value === '' || (typeof value === 'string' && IMAGE_DATA_URL.test(value))) out[key] = value;
        break;
      case 'files':
        out[key] = sanitizeFiles(value);
        break;
    }
  }
  return out;
}

// Merges a (possibly untrusted) configuration into `target` and keeps its two forms of the text consistent:
// the files are the source and the Markdown is their assembly. A configuration that only brings a Markdown
// text (an older project, the MCP server, a plain Markdown file) becomes a document of one file.
export function mergeConfig(target, config) {
  const clean = sanitizeConfig(config);
  if (clean.files?.length) clean.markdown = assembleFiles(clean.files);
  else if (typeof clean.markdown === 'string') clean.files = [{ name: DEFAULT_FILE_NAME, markdown: clean.markdown }];
  else delete clean.files;
  return Object.assign(target, clean);
}

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

// Images bundled from local/images/: available to every document of this build, matched by file name.
export const LOCAL_IMAGES = import.meta.glob('../local/images/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  query: '?inline',
  import: 'default',
});

export const DEFAULTS = mergeConfig(
  { ...DEFAULT_STATE },
  {
    ...DEFAULT_STATE,
    ...sanitizeConfig(localConfig),
    ...(localText['../local/custom.css'] ? { customCss: localText['../local/custom.css'] } : {}),
    // The template is the whole default document: it replaces files a local configuration may list.
    ...(localText['../local/template.md'] ? { markdown: localText['../local/template.md'], files: [] } : {}),
    ...(localLogo ? { logoDataUrl: localLogo } : {}),
  },
);

// The live document. Mutated in place (mergeConfig, Object.assign) so every module sees the same object;
// its files are copies, never the objects of DEFAULTS.
export const state = mergeConfig({}, DEFAULTS);

// The saved document, to be merged into the state with mergeConfig().
export function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Could not restore the saved document', error);
    return {};
  }
}

export function clearStoredConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
  savedLogo = undefined;
  saveLogo(undefined);
}

// The logo is saved in IndexedDB: as a data URL it can outgrow the few megabytes of localStorage, and the
// whole autosave would then fail. `savedLogo` is what IndexedDB holds (undefined: nothing).
let savedLogo;

// Brings the saved logo into the state. A logo found in localStorage comes from an older version: it is
// moved to IndexedDB by the next autosave.
export async function restoreLogo() {
  const stored = await loadLogo();
  if (stored === undefined) {
    if (state.logoDataUrl !== DEFAULTS.logoDataUrl) schedulePersist();
    return;
  }
  savedLogo = stored;
  state.logoDataUrl = stored;
}

function persistLogo() {
  // A logo equal to the default one is not saved, so a newer default applies.
  const logo = state.logoDataUrl === DEFAULTS.logoDataUrl ? undefined : state.logoDataUrl;
  if (logo === savedLogo) return;
  savedLogo = logo;
  saveLogo(logo);
}

let persistTimer = null;
function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    // The files are saved; the Markdown is their assembly and is built again on restore.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, logoDataUrl: undefined, markdown: undefined }));
  } catch (error) {
    // Quota exceeded or storage disabled: the app keeps working without autosave.
    console.warn('Autosave failed', error);
  }
}

export function schedulePersist() {
  // Written at once: a transaction started when the page closes still completes.
  persistLogo();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 500);
}

// Writes a pending autosave immediately (used when the page is closed or reloaded).
export function flushPersist() {
  if (persistTimer !== null) persistNow();
}
