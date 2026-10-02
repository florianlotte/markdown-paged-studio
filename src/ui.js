// The studio's controls: form fields bound to the state, tabs, file imports, downloads, export and print.
// The markup itself lives in index.html.
import { clearStoredConfig, DEFAULTS, sanitizeConfig, state } from './config.js';
import { documentCss, documentHtml, sourcesOfHtml, standaloneHtml } from './document.js';
import { insertBlock } from './editor.js';
import {
  addImageFiles,
  clearImages,
  exportImages,
  findImage,
  listImages,
  MAX_LOGO_WIDTH,
  missingImages,
  onImagesChange,
  prepareImage,
  removeImage,
  replaceImages,
  sanitizeImages,
} from './images.js';
import { currentLanguage, LANGUAGES, onLanguageChange, setLanguage, t } from './i18n.js';
import { scheduleRender } from './render.js';
import { APP_COMMIT, APP_VERSION, COMMIT_URL, RELEASE_URL, REPOSITORY_URL } from './version.js';
import { applyView, toggleSidebar } from './view.js';

// Every state key has a form control with the same id, except the logo (a file input).
const ids = Object.keys(state).filter(k => k !== 'logoDataUrl');

export function syncInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(state[key]);
    else el.value = state[key];
  }
}

// Merge a (possibly untrusted) config object into the state, refresh the form, and re-render.
export function applyConfig(config) {
  Object.assign(state, sanitizeConfig(config));
  syncInputs();
  scheduleRender();
}

function bindInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      state[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
      scheduleRender();
    });
  }
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

function readTextFile(input, callback) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(String(reader.result ?? ''));
  reader.readAsText(file);
  input.value = '';
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

function bindFiles() {
  document.getElementById('logo').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Like the images of the document, a large logo is scaled down: it prints at most 55 mm wide.
      const { dataUrl } = await prepareImage(file, MAX_LOGO_WIDTH);
      state.logoDataUrl = sanitizeConfig({ logoDataUrl: dataUrl }).logoDataUrl ?? '';
      scheduleRender();
    } catch (error) {
      console.error(error);
      e.target.value = '';
      alert(t('The logo could not be read: {error}', { error: error?.message || error }));
    }
  });

  document.getElementById('clearLogo').addEventListener('click', () => {
    state.logoDataUrl = '';
    document.getElementById('logo').value = '';
    scheduleRender();
  });

  document.getElementById('insertPageBreak').addEventListener('click', () => insertIntoEditor('\\newpage'));
  document.getElementById('insertToc').addEventListener('click', () => insertIntoEditor('[[toc]]'));

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

  document
    .getElementById('downloadMarkdown')
    .addEventListener('click', () => download('document.md', state.markdown, 'text/markdown;charset=utf-8'));

  document.getElementById('import').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      loadSources(await sourcesOfFile(file));
    } catch (error) {
      console.error(error);
      alert(t('This file could not be opened: {error}', { error: error?.message || error }));
    }
  });

  document.getElementById('resetDocument').addEventListener('click', () => {
    if (!confirm(t('Discard the current document and its images, and restore the sample?'))) return;
    clearStoredConfig();
    clearImages();
    document.getElementById('logo').value = '';
    applyConfig(DEFAULTS);
  });
}

// The two exports that are plain downloads: the self-contained HTML page and the project file.
async function exportHtml() {
  download('document.html', await standaloneHtml({ source: sourceJson() }), 'text/html;charset=utf-8');
}

function exportProject() {
  download('markdown-paged-studio-project.json', sourceJson(2), 'application/json');
}

// ---- The sources of the document: the project file, what the exports carry.

// The images travel with the configuration, so the file is a complete, portable document.
function sourceJson(indent = 0) {
  return JSON.stringify({ ...state, images: exportImages() }, null, indent);
}

// The configuration text held by a file: a project JSON, or an HTML or PDF exported by the studio.
async function sourcesOfFile(file) {
  const head = new TextDecoder().decode(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (head.startsWith('%PDF-')) {
    const { readSources } = await import('./pdf-sources.js');
    const found = await readSources(await file.arrayBuffer());
    if (!found) throw new Error(t('this PDF holds no project: import a PDF exported with its project'));
    return found.json;
  }
  const text = await file.text();
  if (/^\s*<(!doctype html|html)/i.test(text)) {
    const found = sourcesOfHtml(text);
    if (found === null) throw new Error(t('this HTML file holds no studio sources'));
    return found;
  }
  return text;
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
function lock(title) {
  document.getElementById('busyTitle').textContent = title;
  document.getElementById('busyDetail').textContent = '';
  document.getElementById('busy').hidden = false;
  document.getElementById('app').inert = true;
}

function progress(detail) {
  document.getElementById('busyDetail').textContent = detail;
}

function unlock() {
  document.getElementById('busy').hidden = true;
  document.getElementById('app').inert = false;
}

// Browser only, "PDF with project": the print dialog cannot hand its file back, so the studio draws the
// PDF itself from the preview (see pdf-render.js), puts the project in and downloads it in one go.
async function exportPdfRendered() {
  const status = document.getElementById('status');
  const preview = document.getElementById('preview');
  if (preview.classList.contains('is-stale') || preview.classList.contains('is-rendering')) {
    alert(t('PDF export failed: {error}', { error: t('the preview is still rendering, try again in a moment') }));
    return;
  }
  lock(t('Exporting the PDF…'));
  try {
    const [{ renderPreviewToPdf }, { attachSources }] = await Promise.all([
      import('./pdf-render.js'),
      import('./pdf-sources.js'),
    ]);
    const html = await documentHtml();
    const pdf = await renderPreviewToPdf({
      preview,
      title: state.title,
      html,
      css: documentCss(),
      onProgress: (done, total) => progress(t('Drawing page {done} of {total}…', { done, total })),
    });
    progress(t('Writing the file…'));
    const bytes = await attachSources(pdf, { json: sourceJson(), markdown: state.markdown });
    download(`${fileStem(state.title)}.pdf`, bytes, 'application/pdf');
    status.textContent = t('PDF saved with its project');
  } catch (error) {
    console.error(error);
    status.textContent = t('Render error');
    alert(t('PDF export failed: {error}', { error: error?.message || error }));
  } finally {
    unlock();
  }
}

// A file name made of the title: letters, digits and a few signs, "document" when nothing is left.
function fileStem(title) {
  const stem = String(title ?? '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, ' ')
    .trim()
    .slice(0, 80);
  return stem || 'document';
}

// Opens the print-ready document in a new window; it prints itself once Paged.js is done. In the browser
// this is also how a PDF is produced ("Save as PDF" in the print dialog), so it must run inside a user
// gesture (click or key press) or pop-up blockers stop it: window.open comes before the first await.
async function openPrintWindow() {
  const win = window.open('', '_blank');
  if (!win) {
    alert(t('The browser blocked the print window. Allow pop-ups for this site.'));
    return;
  }
  const html = await standaloneHtml({ mode: 'print' });
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
  const status = document.getElementById('status');
  lock(t('Exporting the PDF…'));
  try {
    const html = await standaloneHtml({ mode: 'pdf' });
    progress(t('Choose where to save it, then the pages are printed…'));
    const result = await window.desktop.exportPdf(html);
    if (result.canceled) return;
    progress(t('Writing the file…'));
    let bytes = result.pdf;
    let saved = t('PDF saved');
    if (project) {
      try {
        const { attachSources } = await import('./pdf-sources.js');
        bytes = await attachSources(result.pdf, { json: sourceJson(), markdown: state.markdown });
        saved = t('PDF saved with its project');
      } catch (error) {
        console.error(error);
        saved = t('PDF saved without its project');
      }
    }
    await window.desktop.writePdf(result.token, bytes);
    status.textContent = saved;
  } catch (error) {
    console.error(error);
    alert(t('PDF export failed: {error}', { error: error?.message || error }));
  } finally {
    unlock();
  }
}

// Export PDF, with or without the project: a direct file in the desktop app; in the browser the print
// dialog (which must open inside the user gesture) for the plain PDF, the drawing of the pages for the one with the project.
function exportPdf({ project }) {
  if (window.desktop) return exportPdfDirect({ project });
  return project ? exportPdfRendered() : openPrintWindow();
}

// The arrow next to Export opens the four exports as a menu: Escape, a click elsewhere or leaving it closes
// it; the arrow keys move between its entries.
function bindExportMenu() {
  const arrow = document.getElementById('exportMenu');
  const menu = document.getElementById('exportOptions');
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  const open = () => {
    menu.hidden = false;
    arrow.setAttribute('aria-expanded', 'true');
    items[0].focus();
  };
  const close = ({ focus = false } = {}) => {
    if (menu.hidden) return;
    menu.hidden = true;
    arrow.setAttribute('aria-expanded', 'false');
    if (focus) arrow.focus();
  };
  arrow.addEventListener('click', () => (menu.hidden ? open() : close()));
  menu.addEventListener('keydown', event => {
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ focus: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.menu-button')) close();
  });
  menu.addEventListener('focusout', event => {
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== arrow) close();
  });
  const actions = {
    exportPdfProject: () => exportPdf({ project: true }),
    exportPdfOnly: () => exportPdf({ project: false }),
    exportHtml,
    exportProject,
  };
  for (const [id, action] of Object.entries(actions)) {
    document.getElementById(id).addEventListener('click', () => {
      close();
      action();
    });
  }
}

function bindPdf() {
  const button = document.getElementById('exportDefault');
  // The main part of the split button is the default export: the PDF with the project.
  button.addEventListener('click', () => exportPdf({ project: true }));
  bindExportMenu();

  if (window.desktop) {
    // File menu entries of the desktop app.
    window.desktop.onCommand(command => {
      if (command === 'export-pdf') exportPdfDirect({ project: true });
      else if (command === 'export-pdf-plain') exportPdfDirect({ project: false });
      else if (command === 'export-html') exportHtml();
      else if (command === 'export-project') exportProject();
      else if (command === 'import') document.getElementById('importFile').click();
      else if (command === 'print') openPrintWindow();
      else if (command === 'toggle-sidebar') toggleSidebar();
    });
  } else {
    // In the browser the PDF with project is drawn by the studio, page by page: say so where the choice is made.
    const describe = () => {
      button.title = t('PDF with project, drawn from the preview (pages as images with a text layer)');
      document.querySelector('#exportPdfOnly span').textContent = t('The document alone, through the print dialog');
    };
    describe();
    onLanguageChange(describe);
    // Ctrl/Cmd+P prints the document rather than the studio page. On desktop the menu accelerator does this.
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        openPrintWindow();
      }
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

function insertIntoEditor(text) {
  insertBlock(document.getElementById('markdown'), text);
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
  input.addEventListener('change', async () => {
    await addImages(input.files);
    input.value = '';
  });

  // Dropping or pasting image files into the editor adds them and writes their reference at the cursor.
  const editor = document.getElementById('markdown');
  editor.addEventListener('dragover', event => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  editor.addEventListener('drop', event => {
    const files = [...(event.dataTransfer?.files ?? [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    addImages(files, { insert: true });
  });
  editor.addEventListener('paste', event => {
    const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    // Clipboard images are all called "image.png": give each paste its own name.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    addImages(files, {
      insert: true,
      rename: file => `pasted-${stamp}.${file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`,
    });
  });

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
    scheduleRender();
  });
}

export function initUi() {
  showVersion();
  bindLanguage();
  bindPreviewLinks();
  syncInputs();
  bindInputs();
  bindTabs();
  bindFiles();
  bindPdf();
  bindImages();
}
