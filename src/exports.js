// The exports and the imports of the document: the PDF with its project (drawn by the browser, or written
// by the desktop app), the PDF through the print dialog, the Word file, the HTML, the Markdown, the zip and
// the project file; the reading of any of them back (Import…); the lock while a PDF or a Word file is
// written.
import { canDrawPages, markCannotDraw, probePageDrawing } from './pdf-capability.js';
import { exportImages, replaceImages, sanitizeImages } from './images.js';
import { state } from './config.js';
import { documentCss, documentHtml, sourcesOfHtml, standaloneHtml } from './document.js';
import { applyConfig } from './form.js';
import { fileStem } from './files.js';
import { onLanguageChange, t } from './i18n.js';
import { bindMenu } from './menu.js';
import { notify, toast, guarded } from './notices.js';
import { readStored, writeStored } from './storage.js';
import { toggleSidebar } from './view.js';

// The name of an export: the title of the document and the extension.
export const exportName = extension => `${fileStem(state.title)}.${extension}`;

// The sources of the document attached to a PDF: the project JSON and the Markdown, named after the title.
async function attachProject(pdf) {
  const { attachSources } = await import('./pdf-sources.js');
  return attachSources(pdf, { json: sourceJson(), markdown: state.markdown, name: exportName('md') });
}

export function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// The exports that are plain downloads: the self-contained HTML page, the Markdown with its front matter,
// the archive of files and the project file.
export async function exportHtml() {
  download(exportName('html'), await standaloneHtml({ source: sourceJson() }), 'text/html;charset=utf-8');
}

export async function exportMarkdown() {
  const { markdownWithSources } = await import('./markdown-sources.js');
  const text = markdownWithSources({ json: sourceJson(), markdown: state.markdown });
  download(exportName('md'), text, 'text/markdown;charset=utf-8');
}

// The project as ordinary files in a zip: the Markdown files, the stylesheet, the logo and the images.
export async function exportArchive() {
  const { projectArchive } = await import('./archive.js');
  download(exportName('zip'), projectArchive(sourceJson()), 'application/zip');
}

export function exportProject() {
  download('markdown-paged-studio-project.json', sourceJson(2), 'application/json');
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// The Word file, built by the page from the HTML of the document (see docx-export.js), with the project in
// a custom XML part when asked. Browser and desktop alike: the download opens the save dialog there.
export async function exportDocx({ project }) {
  if (!lock(t('Exporting the Word file…'))) return;
  try {
    const { documentDocx } = await import('./docx-export.js');
    let bytes = await documentDocx();
    if (project) {
      progress(t('Writing the file…'));
      const { attachSources } = await import('./docx-sources.js');
      bytes = attachSources(bytes, { json: sourceJson() });
    }
    download(exportName('docx'), bytes, DOCX_TYPE);
    toast(t(project ? 'Word file saved with its project' : 'Word file saved'));
  } catch (error) {
    console.error(error);
    notify(t('Word export failed: {error}', { error: error?.message || error }));
  } finally {
    unlock();
  }
}

// ---- The sources of the document: the project file, what the exports carry.

// The images travel with the configuration, so the file is a complete, portable document.
export function sourceJson(indent = 0) {
  return JSON.stringify({ ...state, images: exportImages() }, null, indent);
}

// The configuration text held by a file, told apart by content: a PDF, a Word file, an HTML or a Markdown
// exported by the studio, a zip of Markdown files, a project JSON, or a plain Markdown document, which
// holds the Markdown alone.
export async function sourcesOfFile(file) {
  const head = new TextDecoder().decode(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (head.startsWith('%PDF-')) {
    const { readSources } = await import('./pdf-sources.js');
    const found = await readSources(await file.arrayBuffer());
    if (!found) throw new Error(t('this PDF holds no project: import a PDF exported with its project'));
    return found.json;
  }
  if (head.startsWith('PK\u0003\u0004')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // A Word file is a zip too: the one the studio wrote holds the project in a part of its own.
    const { isDocx, readSources } = await import('./docx-sources.js');
    if (isDocx(bytes)) {
      const found = readSources(bytes);
      if (!found) throw new Error(t('this Word file holds no project: import a Word file exported with its project'));
      return found.json;
    }
    const { sourcesOfArchive } = await import('./archive.js');
    try {
      return sourcesOfArchive(bytes);
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
export function loadSources(text) {
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

export function dismissExportNotice() {
  document.getElementById('exportNotice').hidden = true;
  writeStored(NOTICE_KEY, 'seen');
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
export async function openPrintWindow() {
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
export async function exportPdfDirect({ project }) {
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
export function exportPdf({ project }) {
  if (window.desktop) return exportPdfDirect({ project });
  if (!project) return openPrintWindow();
  return canDrawPages() === false ? printInsteadOfDrawing() : exportPdfRendered();
}

// The Markdown of a file chosen by the user, without the front matter of a studio export.
export async function markdownOfText(text) {
  const { sourcesOfMarkdown } = await import('./markdown-sources.js');
  return JSON.parse(sourcesOfMarkdown(text).json).markdown;
}

function printInsteadOfDrawing() {
  openPrintWindow();
  toast(t('Print dialog opened: this PDF does not carry the project'));
  document.getElementById('exportNotice').hidden = readStored(NOTICE_KEY) === 'seen';
}

// The Export button and its menu, and what the browser does on its own (the desktop app has menu
// accelerators for all of it: see bindDesktop() in ui.js).
export function bindExports() {
  const button = document.getElementById('exportDefault');
  // The main part of the split button is the default export: the PDF with the project.
  button.addEventListener('click', () => exportPdf({ project: true }));
  bindMenu('exportMenu', 'exportOptions', {
    exportPdfProject: () => exportPdf({ project: true }),
    exportPdfOnly: () => exportPdf({ project: false }),
    exportDocxProject: () => exportDocx({ project: true }),
    exportDocxOnly: () => exportDocx({ project: false }),
    exportHtml: guarded(exportHtml, 'Export failed: {error}'),
    exportMarkdown: guarded(exportMarkdown, 'Export failed: {error}'),
    exportArchive: guarded(exportArchive, 'Export failed: {error}'),
    exportProject,
  });
  if (window.desktop) return;
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
