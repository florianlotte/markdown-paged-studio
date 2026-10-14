// Document settings: defaults (built-in, then personal ones from local/), the mutable `state`, validation of
// anything that enters it, and the autosave in localStorage.

import { loadLogo, saveLogo } from './images.js';
import { mergeConfig, sanitizeConfig } from './schema.js';
import { readStored, removeStored } from './storage.js';

// The schema of a document and its validation are pure (see schema.js); they are re-exported here, where
// every module of the studio reads them from.
export * from './schema.js';

export const STORAGE_KEY = 'markdown-paged-studio:document';

const DEFAULT_MARKDOWN = `# Introduction

Welcome to **Markdown Paged Studio**.

This app turns your Markdown into a paginated document that is ready to print[^export].

[[toc]]

## Features

- configurable cover page and logo;
- table of contents with page numbers;
- header, footer and Page X / Y counter;
- images and Mermaid diagrams, with captions;
- numbered figures, tables and equations, with cross-references;
- formulas, alerts, footnotes and task lists;
- highlighted code;
- custom CSS, and a document in several files;
- PDF, HTML, Markdown and zip exports that reopen in the studio.

## Table example

| Item | Value |
|---|---|
| Source | Markdown |
| Rendering | HTML |
| Pagination | Paged.js |

Table: The three steps of the pipeline {#tab:steps}

\\newpage

## Diagram

This part starts on a new page: the line above its title holds only \`\\newpage\`. @Fig:pipeline shows
the steps listed in @tab:steps; their numbers and these references are written for you.

\`\`\`mermaid #fig:pipeline caption="From Markdown to pages"
flowchart LR
  A[Markdown] --> B[HTML]
  B --> C[Pages]
\`\`\`

## Second part

Add content here to get more pages. A formula sits in the text, $E = mc^2$, drawn by KaTeX; the
[Introduction](#introduction) is one link away.

> [!NOTE]
> Custom CSS only applies to the rendered document.

### Tasks

- [x] Write the Markdown
- [ ] Export the PDF

### Code

\`\`\`js
console.log('Markdown → HTML → pages');
\`\`\`

[^export]: With **Export**, or with the print dialog of the browser.
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
  runningHeaderLevel: 'h1',
  numberHeadings: 'none',
  numberFigures: false,
  mirrorMargins: false,
  coverTemplate: 'classic',
  accentColor: '#2c2f73',
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
  const raw = readStored(STORAGE_KEY);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Could not restore the saved document', error);
    return {};
  }
}

export function clearStoredConfig() {
  removeStored(STORAGE_KEY);
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
// Listeners told when the autosave fails (quota exceeded, storage disabled): the studio warns the user once.
const storageListeners = new Set();
export const onStorageFailure = listener => storageListeners.add(listener);
// Listeners told of the autosave: `pending` when a save is scheduled, `saved` (with the time) once written.
const persistListeners = new Set();
export const onPersist = listener => persistListeners.add(listener);
const tellPersist = (status, at) => {
  for (const listener of persistListeners) listener(status, at);
};

function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    // The files are saved; the Markdown is their assembly and is built again on restore.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, logoDataUrl: undefined, markdown: undefined }));
    tellPersist('saved', Date.now());
  } catch (error) {
    // Quota exceeded or storage disabled: the app keeps working without autosave.
    console.warn('Autosave failed', error);
    for (const listener of storageListeners) listener(error);
  }
}

export function schedulePersist() {
  // Written at once: a transaction started when the page closes still completes.
  persistLogo();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 500);
  tellPersist('pending');
}

// Writes a pending autosave immediately (used when the page is closed or reloaded).
export function flushPersist() {
  if (persistTimer !== null) persistNow();
}
