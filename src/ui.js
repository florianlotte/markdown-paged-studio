// The studio's controls: form fields bound to the state, tabs, file imports, downloads, export and print.
// The markup itself lives in index.html.
import { canDrawPages, markCannotDraw, probePageDrawing } from './pdf-capability.js';
import { activeFile, addEmptyFile, addFiles, initChapters, replaceActiveText, syncChapters } from './chapters.js';
import {
  clearStoredConfig,
  DEFAULTS,
  mergeConfig,
  onPersist,
  onStorageFailure,
  sanitizeConfig,
  state,
} from './config.js';
import { documentCss, documentHtml, sourcesOfHtml, standaloneHtml } from './document.js';
import {
  addImageFiles,
  clearImages,
  exportImages,
  findImage,
  listImages,
  missingImages,
  onImagesChange,
  removeImage,
  replaceImages,
  sanitizeImages,
  onImageStorageFailure,
} from './images.js';
import { currentLanguage, LANGUAGES, onLanguageChange, setLanguage, t } from './i18n.js';
import { refreshPreviewTools, scheduleRender } from './render.js';
import { APP_COMMIT, APP_VERSION, COMMIT_URL, RELEASE_URL, REPOSITORY_URL } from './version.js';
import { alignPreview, editorScrolled, initSync } from './sync.js';
import { currentTheme, onThemeChange, setTheme } from './theme.js';
import { applyView, revealEditor, setMode, toggleSidebar, toggleSync } from './view.js';
import { fileStem } from './files.js';
import { insertBlock, writeFile } from './editor.js';
import { decorateMenus, initShortcuts, showShortcuts } from './shortcuts.js';
import { initTooltips } from './tooltip.js';
import { initSettings, syncSettings } from './settings.js';
import { initWelcome, showWelcome } from './welcome.js';

// Every state key has a form control with the same id, except the logo (a file input, see settings.js), the
// language (chosen by name, or typed as a tag, see settings.js) and the text of the document (the files and
// the editor, see chapters.js).
const ids = Object.keys(state).filter(k => !['logoDataUrl', 'language', 'markdown', 'files'].includes(k));

export function syncInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(state[key]);
    else el.value = state[key];
  }
  syncRunningHeaderLevel();
  syncSettings();
}

// The level of the running header only matters while the running header is on.
function syncRunningHeaderLevel() {
  document.getElementById('runningHeaderLevel').disabled = !document.getElementById('runningHeader').checked;
}

// Merge a (possibly untrusted) config object into the state, refresh the form and the editor, and re-render.
export function applyConfig(config) {
  const text = 'markdown' in config || 'files' in config;
  mergeConfig(state, config);
  syncInputs();
  if (text) syncChapters();
  scheduleRender();
}

function bindInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      // A typed number is clamped like an imported one: a margin of 500 mm would make the layout loop. Text
      // keeps its raw value, which the document falls back from and the saved configuration drops if invalid.
      const value = el.type === 'checkbox' ? el.checked : el.value;
      state[key] = el.type === 'number' ? (sanitizeConfig({ [key]: value })[key] ?? state[key]) : value;
      scheduleRender();
    });
    if (el.type === 'number') el.addEventListener('change', () => (el.value = state[key]));
  }
  document.getElementById('runningHeader').addEventListener('change', syncRunningHeaderLevel);
}

function bindTabs() {
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
}

// The text of the file chosen in `input`, given to `callback`; a failure, of the reading or of the callback,
// is reported in the notice banner rather than lost.
async function readTextFile(input, callback) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    await callback(await file.text());
  } catch (error) {
    console.error(error);
    notify(t('This file could not be read: {error}', { error: error?.message || error }));
  }
}

// The name of an export: the title of the document and the extension.
const exportName = extension => `${fileStem(state.title)}.${extension}`;

// The sources of the document attached to a PDF: the project JSON and the Markdown, named after the title.
async function attachProject(pdf) {
  const { attachSources } = await import('./pdf-sources.js');
  return attachSources(pdf, { json: sourceJson(), markdown: state.markdown, name: exportName('md') });
}

// A message for the user, in a banner above the pages instead of a blocking dialog.
export function notify(message) {
  document.getElementById('noticeText').textContent = message;
  document.getElementById('notice').hidden = false;
}

// A short confirmation in the corner (a file saved, the document reset), gone by itself after `duration`;
// `action` names a button that runs `run`, to undo what was just done.
let toastTimer = 0;
export function toast(message, { action = '', run = null, duration = 5000 } = {}) {
  const box = document.getElementById('toast');
  const button = document.getElementById('toastAction');
  clearTimeout(toastTimer);
  document.getElementById('toastText').textContent = message;
  button.textContent = action;
  button.hidden = !action;
  button.onclick = () => {
    hideToast();
    run?.();
  };
  box.hidden = false;
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  document.getElementById('toast').hidden = true;
}

// Runs an action and reports its failure in the banner instead of letting the error vanish.
const guarded =
  (action, message) =>
  async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      console.error(error);
      notify(t(message, { error: error?.message || error }));
    }
  };

function bindNotice() {
  document.getElementById('dismissNotice').addEventListener('click', () => {
    document.getElementById('notice').hidden = true;
  });
  // The browser storage is full or disabled: said once, the first time a save fails.
  const warned = new Set();
  const warnOnce = message => {
    if (warned.has(message)) return;
    warned.add(message);
    notify(message);
  };
  onStorageFailure(() => warnOnce(t('Autosave failed: the browser storage is full or disabled')));
  onImageStorageFailure(() =>
    warnOnce(t('Images are kept for this session only: the browser storage is full or disabled')),
  );
}

// Where the document lives: the line of the editor bar says that it is saved in this browser, and since
// when; after a failed save it says that it is not.
function bindSaveState() {
  const label = document.getElementById('saveState');
  let savedAt = 0;
  let failed = false;
  let status = 'idle';
  const ago = () => {
    const seconds = Math.round((Date.now() - savedAt) / 1000);
    const format = new Intl.RelativeTimeFormat(currentLanguage(), { numeric: 'auto' });
    if (seconds < 45) return t('just now');
    if (seconds < 3600) return format.format(-Math.round(seconds / 60), 'minute');
    return format.format(-Math.round(seconds / 3600), 'hour');
  };
  const draw = () => {
    label.classList.toggle('is-failed', failed);
    if (failed) label.textContent = t('Not saved: the browser storage is full or disabled');
    else if (status === 'pending') label.textContent = t('Saving…');
    else if (status === 'saved') label.textContent = `${t('Saved in this browser')} · ${ago()}`;
    else label.textContent = t('Autosave in this browser');
  };
  onPersist((next, at) => {
    status = next;
    if (next === 'saved') {
      savedAt = at;
      failed = false;
    }
    draw();
  });
  onStorageFailure(() => {
    failed = true;
    draw();
  });
  onLanguageChange(draw);
  setInterval(() => {
    if (status === 'saved' && !failed) draw();
  }, 30000);
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// What the Insert menu writes at the cursor: a small example of each syntax, to be edited.
const INSERTS = {
  insertTable: '| Column | Column |\n| --- | --- |\n| Text | Text |\n\nTable: Caption',
  insertDiagram: '```mermaid caption="Caption"\nflowchart LR\n  A[Start] --> B[End]\n```',
  insertFormula: '$$\nE = mc^2\n$$',
  insertAlert: '> [!NOTE]\n> Text of the note.',
  insertPageBreak: '\\newpage',
  insertToc: '[[toc]]',
};

// A footnote takes the first number the file does not use yet.
function footnoteBlock() {
  const used = [...activeFile().markdown.matchAll(/\[\^(\d+)\]/g)].map(match => Number(match[1]));
  const number = Math.max(0, ...used) + 1;
  return `Text with a call.[^${number}]\n\n[^${number}]: The note.`;
}

// Whether the next images chosen through #imageFiles are referenced at the cursor (Insert → Image…).
let insertChosenImages = false;

function bindInsertMenu() {
  const actions = Object.fromEntries(Object.entries(INSERTS).map(([id, text]) => [id, () => insertIntoEditor(text)]));
  actions.insertFootnote = () => insertIntoEditor(footnoteBlock());
  actions.insertImage = () => {
    insertChosenImages = true;
    document.getElementById('imageFiles').click();
  };
  bindMenu('insertMenu', 'insertOptions', actions);
}

function bindFiles() {
  document
    .getElementById('loadMarkdown')
    .addEventListener('click', () => document.getElementById('markdownFile').click());
  // The current file takes the text of a Markdown file, as one edit that Ctrl+Z reverts. A Markdown
  // exported with its project keeps its front matter out of the editor.
  document
    .getElementById('markdownFile')
    .addEventListener('change', e =>
      readTextFile(e.target, async text => replaceActiveText(await markdownOfText(text))),
    );

  // The current file rewritten by Prettier (loaded on demand), as one edit that Ctrl+Z reverts.
  document.getElementById('prettifyMarkdown').addEventListener('click', async () => {
    const file = activeFile();
    try {
      const { prettifyMarkdown } = await import('./prettify.js');
      writeFile(file, await prettifyMarkdown(file.markdown));
    } catch (error) {
      console.error(error);
      notify(t('This file could not be formatted: {error}', { error: error?.message || error }));
    }
  });

  // More files for the document: an empty one, or Markdown files, each becoming a file of its name.
  document.getElementById('addFile').addEventListener('click', addEmptyFile);
  document.getElementById('addFiles').addEventListener('click', () => document.getElementById('chapterFiles').click());
  document.getElementById('chapterFiles').addEventListener(
    'change',
    guarded(async e => {
      const chosen = [...(e.target.files ?? [])];
      e.target.value = '';
      const entries = [];
      for (const file of chosen) entries.push({ name: file.name, markdown: await markdownOfText(await file.text()) });
      addFiles(entries);
    }, 'This file could not be read: {error}'),
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

  // Alone, the file is named after the title, like the PDF; among several, it keeps its own name, which tells
  // them apart.
  document.getElementById('downloadMarkdown').addEventListener('click', () => {
    const file = activeFile();
    const name = state.files.length === 1 ? exportName('md') : file.name;
    download(name, file.markdown, 'text/markdown;charset=utf-8');
  });

  document.getElementById('import').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      loadSources(await sourcesOfFile(file));
    } catch (error) {
      console.error(error);
      notify(t('This file could not be opened: {error}', { error: error?.message || error }));
    }
  });
}

// Reset, from the "more" menu: the sample comes back at once, and the toast undoes it for a moment from the
// sources kept here (the document, its settings and its images), the same way an import restores them.
const UNDO_MS = 10000;
function resetDocument() {
  const before = sourceJson();
  clearStoredConfig();
  clearImages();
  document.getElementById('logo').value = '';
  applyConfig(DEFAULTS);
  toast(t('Document reset: the sample is back'), {
    action: t('Undo'),
    run: () => loadSources(before),
    duration: UNDO_MS,
  });
}

// The exports that are plain downloads: the self-contained HTML page, the Markdown with its front matter,
// the archive of files and the project file.
async function exportHtml() {
  download(exportName('html'), await standaloneHtml({ source: sourceJson() }), 'text/html;charset=utf-8');
}

async function exportMarkdown() {
  const { markdownWithSources } = await import('./markdown-sources.js');
  const text = markdownWithSources({ json: sourceJson(), markdown: state.markdown });
  download(exportName('md'), text, 'text/markdown;charset=utf-8');
}

// The project as ordinary files in a zip: the Markdown files, the stylesheet, the logo and the images.
async function exportArchive() {
  const { projectArchive } = await import('./archive.js');
  download(exportName('zip'), projectArchive(sourceJson()), 'application/zip');
}

function exportProject() {
  download('markdown-paged-studio-project.json', sourceJson(2), 'application/json');
}

// ---- The sources of the document: the project file, what the exports carry.

// The images travel with the configuration, so the file is a complete, portable document.
function sourceJson(indent = 0) {
  return JSON.stringify({ ...state, images: exportImages() }, null, indent);
}

// The configuration text held by a file, told apart by content: a PDF, an HTML or a Markdown exported by
// the studio, a project JSON, or a plain Markdown document, which holds the Markdown alone.
async function sourcesOfFile(file) {
  const head = new TextDecoder().decode(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (head.startsWith('%PDF-')) {
    const { readSources } = await import('./pdf-sources.js');
    const found = await readSources(await file.arrayBuffer());
    if (!found) throw new Error(t('this PDF holds no project: import a PDF exported with its project'));
    return found.json;
  }
  if (head.startsWith('PK\u0003\u0004')) {
    const { sourcesOfArchive } = await import('./archive.js');
    try {
      return sourcesOfArchive(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      throw new Error(t(error?.message || 'this archive could not be read'), { cause: error });
    }
  }
  const text = (await file.text()).replace(/^\uFEFF/, '');
  if (/^\s*<(!doctype html|html)/i.test(text)) {
    const found = sourcesOfHtml(text);
    if (found === null) throw new Error(t('this HTML file holds no studio sources'));
    return found;
  }
  if (/^\s*\{/.test(text)) return text;
  const { sourcesOfMarkdown } = await import('./markdown-sources.js');
  return sourcesOfMarkdown(text).json;
}

// Applies a configuration text to the document: validated like any import, images included.
function loadSources(text) {
  let loaded;
  try {
    loaded = JSON.parse(text);
  } catch {
    throw new Error(t('not a valid JSON file'));
  }
  // A configuration saved before images existed has no `images` key: keep the current ones.
  if (loaded && typeof loaded === 'object' && 'images' in loaded) replaceImages(sanitizeImages(loaded.images));
  applyConfig(loaded);
}

// Locks the studio while a PDF is written: the overlay covers it and the app is inert (no clicks, no keys),
// so the document cannot change under the export. `detail` reports the progress.
// One export at a time: the overlay makes the page inert, but the desktop menu and Ctrl+P still reach the
// studio. `lock()` says no while an export runs.
let busy = false;
function lock(title) {
  if (busy) return false;
  busy = true;
  document.getElementById('busyTitle').textContent = title;
  document.getElementById('busyDetail').textContent = '';
  document.getElementById('busy').hidden = false;
  document.getElementById('app').inert = true;
  return true;
}

// Resolves once the preview shows the current document (no render pending), or fails after a while.
function previewSettled() {
  const preview = document.getElementById('preview');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!preview.classList.contains('is-stale') && !preview.classList.contains('is-rendering')) resolve();
      else if (Date.now() - started > 60_000)
        reject(new Error(t('the preview is still rendering, try again in a moment')));
      else setTimeout(check, 50);
    };
    check();
  });
}

function progress(detail) {
  document.getElementById('busyDetail').textContent = detail;
}

function unlock() {
  busy = false;
  document.getElementById('busy').hidden = true;
  document.getElementById('app').inert = false;
}

// Browser only, "PDF with project": the print dialog cannot hand its file back, so the studio draws the
// PDF itself from the preview (see pdf-render.js), puts the project in and downloads it in one go.
async function exportPdfRendered() {
  const preview = document.getElementById('preview');
  if (!lock(t('Exporting the PDF…'))) return;
  try {
    // An edit may still be on its way to the pages: the export waits for them.
    await previewSettled();
    const { renderPreviewToPdf } = await import('./pdf-render.js');
    const html = await documentHtml();
    const pdf = await renderPreviewToPdf({
      preview,
      title: state.title,
      html,
      css: documentCss(),
      onProgress: (done, total) => progress(t('Drawing page {done} of {total}…', { done, total })),
    });
    progress(t('Writing the file…'));
    const bytes = await attachProject(pdf);
    download(exportName('pdf'), bytes, 'application/pdf');
    toast(t('PDF saved with its project'));
  } catch (error) {
    console.error(error);
    // The pages could not be drawn or read back: said in plain words, and the next exports use the print
    // dialog (which has to open inside a click, so not from here).
    const drawing = error?.code === 'draw' || error?.name === 'SecurityError';
    if (drawing) {
      markCannotDraw();
      describeExport();
    }
    const reason = drawing
      ? t(
          'this browser could not draw the pages. Use PDF only (print dialog), or export HTML, Markdown or the zip to keep the project',
        )
      : error?.message || error;
    notify(t('PDF export failed: {error}', { error: reason }));
  } finally {
    unlock();
  }
}

// Browser only, when the pages cannot be drawn here (see pdf-capability.js): the main Export opens the
// print dialog, at once and inside the click, and says once what that PDF lacks.
const NOTICE_KEY = 'markdown-paged-studio:export-notice';

function printInsteadOfDrawing() {
  openPrintWindow();
  toast(t('Print dialog opened: this PDF does not carry the project'));
  let seen = false;
  try {
    seen = localStorage.getItem(NOTICE_KEY) === 'seen';
  } catch {
    // Storage unavailable: the notice shows again next time.
  }
  document.getElementById('exportNotice').hidden = seen;
}

function dismissExportNotice() {
  document.getElementById('exportNotice').hidden = true;
  try {
    localStorage.setItem(NOTICE_KEY, 'seen');
  } catch {
    // Storage unavailable: nothing to remember.
  }
}

// Says, where the choice is made, how the PDF is produced in this browser: drawn by the studio with its
// project, or through the print dialog when the pages cannot be drawn.
function describeExport() {
  if (window.desktop) return;
  const drawn = canDrawPages() !== false;
  document.getElementById('exportDefault').title = t(
    drawn
      ? 'PDF with project, drawn from the preview (pages as images with a text layer)'
      : 'PDF through the print dialog: this browser cannot draw the PDF that carries the project',
  );
  const entry = document.getElementById('exportPdfProject');
  // Not `disabled`: the entry stays reachable, so its explanation can be read.
  entry.setAttribute('aria-disabled', String(!drawn));
  entry.querySelector('span').textContent = t(
    drawn
      ? 'Settings, Markdown and images attached: the file reopens in the studio'
      : 'Not available in this browser. To keep the project, export HTML, Markdown or the zip',
  );
  document.querySelector('#exportPdfOnly span').textContent = t('The document alone, through the print dialog');
}

// Opens the print-ready document in a new window; it prints itself once Paged.js is done. In the browser
// this is also how a PDF is produced ("Save as PDF" in the print dialog), so it must run inside a user
// gesture (click or key press) or pop-up blockers stop it: window.open comes before the first await.
async function openPrintWindow() {
  if (busy) return;
  const win = window.open('', '_blank');
  if (!win) {
    notify(t('The browser blocked the print window. Allow pop-ups for this site.'));
    return;
  }
  let html;
  try {
    html = await standaloneHtml({ mode: 'print' });
  } catch (error) {
    // No document to print: the empty window must not stay open.
    win.close();
    console.error(error);
    notify(t('Export failed: {error}', { error: error?.message || error }));
    return;
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  win.location = url;
  // The opened page prints itself when Paged.js finishes; the URL only needs to outlive the load.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Desktop only: `window.desktop.exportPdf` renders the standalone HTML in a hidden Chromium window and hands
// the PDF back with a token for the place the user chose; the project is attached here when asked, then
// `window.desktop.writePdf` writes the file. The desktop package has no node_modules: pdf-lib lives in the
// page bundle, so this is the only place it can run.
async function exportPdfDirect({ project }) {
  if (!lock(t('Exporting the PDF…'))) return;
  try {
    const html = await standaloneHtml({ mode: 'pdf' });
    progress(t('Choose where to save it, then the pages are printed…'));
    const result = await window.desktop.exportPdf(html, fileStem(state.title));
    if (result.canceled) return;
    progress(t('Writing the file…'));
    let bytes = result.pdf;
    let saved = t('PDF saved');
    if (project) {
      try {
        bytes = await attachProject(result.pdf);
        saved = t('PDF saved with its project');
      } catch (error) {
        console.error(error);
        saved = t('PDF saved without its project');
      }
    }
    await window.desktop.writePdf(result.token, bytes);
    toast(saved);
  } catch (error) {
    console.error(error);
    notify(t('PDF export failed: {error}', { error: error?.message || error }));
  } finally {
    unlock();
  }
}

// Export PDF, with or without the project: a direct file in the desktop app; in the browser the print
// dialog (which must open inside the user gesture) for the plain PDF, the drawing of the pages for the one with the project.
function exportPdf({ project }) {
  if (window.desktop) return exportPdfDirect({ project });
  if (!project) return openPrintWindow();
  return canDrawPages() === false ? printInsteadOfDrawing() : exportPdfRendered();
}

// A menu under a toolbar button (the arrow next to Export, the "more" button): Escape, a click elsewhere or
// leaving it closes it; the arrow keys move between its entries; `actions` maps the id of an entry to what
// it does.
function bindMenu(buttonId, menuId, actions) {
  const arrow = document.getElementById(buttonId);
  const menu = document.getElementById(menuId);
  // The entries shown at this width (an entry may exist on a phone only), read once the menu is open.
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')].filter(item => item.getClientRects().length);
  const open = () => {
    menu.hidden = false;
    arrow.setAttribute('aria-expanded', 'true');
    items()[0].focus();
  };
  const close = ({ focus = false } = {}) => {
    if (menu.hidden) return;
    menu.hidden = true;
    arrow.setAttribute('aria-expanded', 'false');
    if (focus) arrow.focus();
  };
  arrow.addEventListener('click', () => (menu.hidden ? open() : close()));
  menu.addEventListener('keydown', event => {
    const shown = items();
    const index = shown.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ focus: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      shown[(index + (event.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length].focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!arrow.parentElement.contains(event.target)) close();
  });
  menu.addEventListener('focusout', event => {
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== arrow) close();
  });
  for (const [id, action] of Object.entries(actions)) {
    document.getElementById(id).addEventListener('click', event => {
      // An entry that is not available here keeps the menu open on its explanation.
      if (event.currentTarget.getAttribute('aria-disabled') === 'true') return;
      close();
      action();
    });
  }
}

function bindPdf() {
  const button = document.getElementById('exportDefault');
  // The main part of the split button is the default export: the PDF with the project.
  button.addEventListener('click', () => exportPdf({ project: true }));
  bindMenu('exportMenu', 'exportOptions', {
    exportPdfProject: () => exportPdf({ project: true }),
    exportPdfOnly: () => exportPdf({ project: false }),
    exportHtml: guarded(exportHtml, 'Export failed: {error}'),
    exportMarkdown: guarded(exportMarkdown, 'Export failed: {error}'),
    exportArchive: guarded(exportArchive, 'Export failed: {error}'),
    exportProject,
  });
  bindMenu('moreMenu', 'moreOptions', {
    importEntry: () => document.getElementById('importFile').click(),
    showWelcome,
    showShortcuts,
    resetDocument,
  });

  if (window.desktop) {
    // File menu entries of the desktop app.
    window.desktop.onCommand(command => {
      if (command === 'export-pdf') exportPdfDirect({ project: true });
      else if (command === 'export-pdf-plain') exportPdfDirect({ project: false });
      else if (command === 'export-html') guarded(exportHtml, 'Export failed: {error}')();
      else if (command === 'export-markdown') guarded(exportMarkdown, 'Export failed: {error}')();
      else if (command === 'export-archive') guarded(exportArchive, 'Export failed: {error}')();
      else if (command === 'export-project') exportProject();
      else if (command === 'import') document.getElementById('importFile').click();
      else if (command === 'print') openPrintWindow();
      else if (command === 'shortcuts') showShortcuts();
      else if (command === 'welcome') showWelcome();
      else if (command === 'toggle-sidebar') toggleSidebar();
      else if (command === 'mode-edit') setMode('edit');
      else if (command === 'mode-split') setMode('split');
      else if (command === 'mode-view') setMode('view');
      else if (command.startsWith('theme-')) setTheme(command.slice('theme-'.length));
    });
  } else {
    // In the browser the PDF with project is drawn by the studio, page by page, where the engine allows it:
    // say so where the choice is made, and again once the probe has answered.
    describeExport();
    onLanguageChange(describeExport);
    probePageDrawing().then(describeExport);
    document.getElementById('dismissExportNotice').addEventListener('click', dismissExportNotice);
    // Ctrl/Cmd+P prints the document rather than the studio page, Ctrl+Shift+E exports the PDF with the
    // project and Ctrl+B hides or shows the sidebar. On desktop the menu accelerators do this.
    document.addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p' && !event.shiftKey) openPrintWindow();
      else if (key === 'e' && event.shiftKey) exportPdf({ project: true });
      else if (key === 'b' && !event.shiftKey) toggleSidebar();
      else return;
      event.preventDefault();
    });
  }
}

// Sidebar footer: the version links to its release, the commit (when known) to the commit itself.
function showVersion() {
  document.getElementById('appRepository').href = REPOSITORY_URL;
  const version = document.getElementById('appVersion');
  version.textContent = `v${APP_VERSION}`;
  version.href = RELEASE_URL;
  if (!APP_COMMIT) return;
  const commit = document.getElementById('appCommit');
  commit.textContent = APP_COMMIT;
  if (COMMIT_URL) commit.href = COMMIT_URL;
  commit.hidden = false;
  document.getElementById('appCommitSeparator').hidden = false;
}

// ---- Images: uploaded files are matched to the Markdown by file name (see images.js).

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Markdown for an image: the name only, with the characters a link destination cannot hold escaped.
function imageReference(name) {
  const alt = name.replace(/\.[^.]+$/, '');
  const destination = encodeURI(name).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `![${alt}](${destination})`;
}

// Inserts a block at the cursor of the editor, shown first when the preview was alone.
function insertIntoEditor(text) {
  revealEditor();
  insertBlock(text);
}

// The Markdown of a file chosen by the user, without the front matter of a studio export.
async function markdownOfText(text) {
  const { sourcesOfMarkdown } = await import('./markdown-sources.js');
  return JSON.parse(sourcesOfMarkdown(text).json).markdown;
}

// Image files dropped on the editor or pasted into it are added to the library and referenced at the cursor.
function addEditorImages(files, kind) {
  if (kind === 'drop') {
    addImages(files, { insert: true });
    return;
  }
  // Clipboard images are all called "image.png": give each paste its own name.
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  addImages(files, {
    insert: true,
    rename: file => `pasted-${stamp}.${file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`,
  });
}

function reportImages(results) {
  const status = document.getElementById('imagesStatus');
  status.textContent = results
    .map(result => {
      if (result.error) return t('{name}: {error}.', { name: result.name, error: t(result.error) });
      return t(result.resized ? '{name} added, scaled down to {width} px wide.' : '{name} added.', result);
    })
    .join(' ');
  status.hidden = results.length === 0;
  status.classList.toggle(
    'is-error',
    results.some(result => result.error),
  );
}

async function addImages(files, { insert = false, rename } = {}) {
  const images = [...files].filter(file => file.type.startsWith('image/'));
  if (!images.length) return;
  const results = await addImageFiles(images, { rename });
  reportImages(results);
  if (insert) {
    const added = results.filter(result => !result.error).map(result => imageReference(result.name));
    if (added.length) insertIntoEditor(added.join('\n\n'));
  }
}

function imageListItem(image) {
  const item = document.createElement('li');
  const thumb = document.createElement('img');
  thumb.className = 'image-thumb';
  thumb.src = image.dataUrl;
  thumb.alt = '';
  const text = document.createElement('div');
  text.className = 'image-text';
  const name = document.createElement('span');
  name.className = 'image-name';
  name.textContent = image.name;
  name.title = image.name;
  const details = document.createElement('span');
  details.className = 'image-details';
  const size = image.width && image.height ? `${image.width} × ${image.height} · ` : '';
  details.textContent = `${size}${formatBytes(image.bytes)}${image.builtin ? t(' · built in') : ''}`;
  text.append(name, details);
  const insert = document.createElement('button');
  insert.type = 'button';
  insert.className = 'secondary';
  insert.textContent = t('Insert');
  insert.title = t('Insert {name} at the cursor', image);
  insert.addEventListener('click', () => insertIntoEditor(imageReference(image.name)));
  item.append(thumb, text, insert);
  if (!image.builtin) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = t('Remove');
    remove.title = t('Remove {name}', image);
    remove.addEventListener('click', () => removeImage(image.key));
    item.append(remove);
  }
  return item;
}

function missingListItem(name) {
  const item = document.createElement('li');
  item.className = 'is-missing';
  const text = document.createElement('div');
  text.className = 'image-text';
  const label = document.createElement('span');
  label.className = 'image-name';
  label.textContent = name;
  const details = document.createElement('span');
  details.className = 'image-details';
  details.textContent = t('Used in the document, not uploaded yet');
  text.append(label, details);
  item.append(text);
  return item;
}

function renderImageList() {
  const list = document.getElementById('imageList');
  // The missing names come from the last render: drop those uploaded since.
  const missing = missingImages().filter(name => !findImage(name));
  list.replaceChildren(...missing.map(missingListItem), ...listImages().map(imageListItem));
}

function bindImages() {
  const input = document.getElementById('imageFiles');
  document.getElementById('addImages').addEventListener('click', () => input.click());
  input.addEventListener(
    'change',
    guarded(async () => {
      const insert = insertChosenImages;
      insertChosenImages = false;
      await addImages(input.files, { insert });
      input.value = '';
    }, 'Images could not be added: {error}'),
  );

  onImagesChange(renderImageList);
  renderImageList();
}

// Links of the document open outside the studio (new tab, or the system browser in the desktop app):
// following them in place would replace the studio. The exported document keeps ordinary links.
function bindPreviewLinks() {
  document.getElementById('preview').addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const anchor = link.getAttribute('href');
    if (anchor.startsWith('#') && anchor.length > 1 && !event.defaultPrevented) {
      // Table of contents and cross-references: show the page that holds the target.
      event.preventDefault();
      const target = [...event.currentTarget.querySelectorAll('[id]')].find(element => `#${element.id}` === anchor);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Already handled: selecting an image that sits inside a link.
    const handled = event.defaultPrevented;
    event.preventDefault();
    // Anchors and relative links would resolve against the studio address: they have nowhere to go here.
    const href = link.getAttribute('href');
    if (handled || !/^(https?|mailto):/i.test(href)) return;
    window.open(href, '_blank', 'noopener');
  });
}

// Footer selector of the interface language. What was written through t() is rebuilt on a change.
function bindLanguage() {
  const select = document.getElementById('uiLanguage');
  // Short codes keep the control small; the full name is the tooltip of each option.
  select.replaceChildren(
    ...Object.entries(LANGUAGES).map(([value, label]) =>
      Object.assign(new Option(value.toUpperCase(), value), { title: label }),
    ),
  );
  select.value = currentLanguage();
  select.addEventListener('change', () => setLanguage(select.value));
  onLanguageChange(() => {
    applyView();
    renderImageList();
    document.getElementById('imagesStatus').hidden = true;
    refreshPreviewTools();
  });
}

// Header selector of the theme: follows a choice made from the desktop menu too.
function bindTheme() {
  const select = document.getElementById('uiTheme');
  select.value = currentTheme();
  select.addEventListener('change', () => setTheme(select.value));
  onThemeChange(theme => {
    select.value = theme;
  });
}

export function initUi() {
  bindNotice();
  bindSaveState();
  initTooltips();
  initShortcuts();
  initWelcome();
  onLanguageChange(() => decorateMenus());
  showVersion();
  bindLanguage();
  bindTheme();
  bindPreviewLinks();
  initChapters(document.getElementById('markdown'), {
    onChange: scheduleRender,
    onScroll: editorScrolled,
    onImageFiles: addEditorImages,
    onDownload: file => download(file.name, file.markdown, 'text/markdown;charset=utf-8'),
    // A removed file comes back from its toast for a moment, like a reset document.
    onRemove: (file, restore) =>
      toast(t('{name} removed from the document', { name: file.name }), {
        action: t('Undo'),
        run: restore,
        duration: UNDO_MS,
      }),
  });
  initSync();
  document.getElementById('syncScroll').addEventListener('click', () => {
    if (toggleSync()) alignPreview();
  });
  syncInputs();
  bindInputs();
  bindTabs();
  bindFiles();
  bindInsertMenu();
  bindPdf();
  bindImages();
  initSettings({ notify });
}
