// The studio's controls, wired together: the editor bar and the file tabs, the Insert menu, the ⋯ menu,
// the desktop menu commands, the notices of the storage, the sidebar footer, the links of the preview.
// The form is in form.js, the exports in exports.js, the image library in image-library.js.
import { activeFile, addEmptyFile, addFiles, initChapters, replaceActiveText } from './chapters.js';
import { clearStoredConfig, DEFAULTS, onPersist, onStorageFailure, state } from './config.js';
import { initCssEditor, setCss } from './css-editor.js';
import { clearImages, onImageStorageFailure } from './images.js';
import { focusEditor, writeFile } from './editor.js';
import {
  bindExports,
  download,
  exportArchive,
  exportDocx,
  exportName,
  exportHtml,
  exportMarkdown,
  exportPdfDirect,
  exportProject,
  loadSources,
  markdownOfText,
  openPrintWindow,
  sourceJson,
  sourcesOfFile,
} from './exports.js';
import { applyConfig, bindInputs, bindTabs, syncInputs } from './form.js';
import { currentLanguage, LANGUAGES, onLanguageChange, setLanguage, t } from './i18n.js';
import {
  addEditorImages,
  bindImages,
  chooseImagesToInsert,
  insertIntoEditor,
  renderImageList,
} from './image-library.js';
import { bindMenu } from './menu.js';
import { guarded, notify, toast } from './notices.js';
import { initOutline, outlineCursorMoved, toggleOutline } from './outline.js';
import { initProblems } from './problems.js';
import { refreshPreviewTools, scheduleRender } from './render.js';
import { initSettings } from './settings.js';
import { decorateMenus, initShortcuts, showShortcuts } from './shortcuts.js';
import { alignPreview, editorScrolled, initSync } from './sync.js';
import { currentTheme, onThemeChange, setTheme } from './theme.js';
import { initTooltips } from './tooltip.js';
import { APP_COMMIT, APP_VERSION, COMMIT_URL, RELEASE_URL, REPOSITORY_URL } from './version.js';
import { applyView, revealEditor, setMode, toggleSidebar, toggleSync } from './view.js';
import { initWelcome, showWelcome } from './welcome.js';

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

function bindInsertMenu() {
  const actions = Object.fromEntries(Object.entries(INSERTS).map(([id, text]) => [id, () => insertIntoEditor(text)]));
  actions.insertFootnote = () => insertIntoEditor(footnoteBlock());
  actions.insertImage = chooseImagesToInsert;
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
  document.getElementById('cssFile').addEventListener('change', e => readTextFile(e.target, setCss));
  document.getElementById('resetCss').addEventListener('click', () => setCss(DEFAULTS.customCss));
  // The empty document says what to do: the button takes the user to the editor.
  document.getElementById('startWriting').addEventListener('click', () => {
    revealEditor();
    focusEditor();
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

// The ⋯ menu, and the menu commands of the desktop app (its File, View and Help menus).
function bindDesktop() {
  bindMenu('moreMenu', 'moreOptions', {
    importEntry: () => document.getElementById('importFile').click(),
    showWelcome,
    showShortcuts,
    resetDocument,
  });
  if (!window.desktop) return;
  window.desktop.onCommand(command => {
    if (command === 'export-pdf') exportPdfDirect({ project: true });
    else if (command === 'export-pdf-plain') exportPdfDirect({ project: false });
    else if (command === 'export-docx') exportDocx({ project: true });
    else if (command === 'export-docx-plain') exportDocx({ project: false });
    else if (command === 'export-html') guarded(exportHtml, 'Export failed: {error}')();
    else if (command === 'export-markdown') guarded(exportMarkdown, 'Export failed: {error}')();
    else if (command === 'export-archive') guarded(exportArchive, 'Export failed: {error}')();
    else if (command === 'export-project') exportProject();
    else if (command === 'import') document.getElementById('importFile').click();
    else if (command === 'print') openPrintWindow();
    else if (command === 'shortcuts') showShortcuts();
    else if (command === 'welcome') showWelcome();
    else if (command === 'toggle-sidebar') toggleSidebar();
    else if (command === 'toggle-outline') toggleOutline();
    else if (command === 'mode-edit') setMode('edit');
    else if (command === 'mode-split') setMode('split');
    else if (command === 'mode-view') setMode('view');
    else if (command.startsWith('theme-')) setTheme(command.slice('theme-'.length));
  });
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
  // The CSS editor exists before the form is synchronised, which writes the state into it.
  initCssEditor();
  initChapters(document.getElementById('markdown'), {
    onChange: scheduleRender,
    onScroll: editorScrolled,
    onImageFiles: addEditorImages,
    onCursor: outlineCursorMoved,
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
  bindExports();
  bindDesktop();
  bindImages();
  initSettings();
  initOutline();
  initProblems();
}
