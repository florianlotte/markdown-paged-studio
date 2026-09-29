// The studio's controls: form fields bound to the state, tabs, file imports, downloads, export and print.
// The markup itself lives in index.html.
import { clearStoredConfig, DEFAULTS, sanitizeConfig, state } from './config.js';
import { standaloneHtml } from './document.js';
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
import { APP_COMMIT, APP_VERSION, COMMIT_URL, RELEASE_URL } from './version.js';
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

  document.getElementById('saveConfig').addEventListener('click', () => {
    // The images travel with the configuration, so the file is a complete, portable document.
    const config = { ...state, images: exportImages() };
    download('markdown-paged-config.json', JSON.stringify(config, null, 2), 'application/json');
  });

  document.getElementById('loadConfig').addEventListener('click', () => document.getElementById('configFile').click());
  document.getElementById('configFile').addEventListener('change', e =>
    readTextFile(e.target, text => {
      let loaded;
      try {
        loaded = JSON.parse(text);
      } catch {
        alert(t('Invalid JSON file.'));
        return;
      }
      // A configuration saved before images existed has no `images` key: keep the current ones.
      if (loaded && typeof loaded === 'object' && 'images' in loaded) replaceImages(sanitizeImages(loaded.images));
      applyConfig(loaded);
    }),
  );

  document.getElementById('resetDocument').addEventListener('click', () => {
    if (!confirm(t('Discard the current document and its images, and restore the sample?'))) return;
    clearStoredConfig();
    clearImages();
    document.getElementById('logo').value = '';
    applyConfig(DEFAULTS);
  });

  document.getElementById('exportHtml').addEventListener('click', async () => {
    download('document.html', await standaloneHtml(), 'text/html;charset=utf-8');
  });
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

// Desktop only: the preload script exposes `window.desktop.exportPdf`, which renders the standalone HTML in
// a hidden Chromium window and writes the PDF where the user chooses, without any dialog in between.
async function exportPdfDirect() {
  const button = document.getElementById('exportPdf');
  button.disabled = true;
  try {
    const result = await window.desktop.exportPdf(await standaloneHtml({ mode: 'pdf' }));
    if (!result.canceled) document.getElementById('status').textContent = t('PDF saved');
  } catch (error) {
    console.error(error);
    alert(t('PDF export failed: {error}', { error: error?.message || error }));
  } finally {
    button.disabled = false;
  }
}

function bindPdf() {
  const button = document.getElementById('exportPdf');
  // One "Export PDF" button everywhere: direct file in the desktop app, print dialog in the browser.
  button.addEventListener('click', () => (window.desktop ? exportPdfDirect() : openPrintWindow()));

  if (window.desktop) {
    // File menu entries of the desktop app.
    window.desktop.onCommand(command => {
      if (command === 'export-pdf') exportPdfDirect();
      else if (command === 'print') openPrintWindow();
      else if (command === 'toggle-sidebar') toggleSidebar();
    });
  } else {
    const describe = () => (button.title = t('Opens the print dialog: choose "Save as PDF"'));
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
  select.replaceChildren(...Object.entries(LANGUAGES).map(([value, label]) => new Option(label, value)));
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
