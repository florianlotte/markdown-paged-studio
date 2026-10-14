// The files of the document in the studio: the strip of tabs above the editor (one tab per file, in the
// order of the document) and the link between the files, the editor and the assembled Markdown that is
// rendered. `state.files` is the source; `state.markdown` is kept equal to their assembly after every change.
import { state } from './config.js';
import { currentFile, focusEditor, goToLine, initEditor, openFile, setEditorPhrases, writeFile } from './editor.js';
import { applyAssembledEdit, assembleFiles, DEFAULT_FILE_NAME, fileName, fileOffsets, locateLine } from './files.js';
import { onLanguageChange, t } from './i18n.js';
import { keys } from './shortcuts.js';

let active = 0;
let documentChanged = () => {};
let downloadFile = () => {};
let dragged = null;

const strip = () => document.getElementById('fileTabs');
const tabAt = index => strip().children[index];
const names = (except = -1) => state.files.filter((_, index) => index !== except).map(file => file.name);

// After any change of the files: the document is assembled again, then rendered and saved.
function commit() {
  state.markdown = assembleFiles(state.files);
  documentChanged();
}

function searchPhrases() {
  const keys = [
    'Find',
    'Replace',
    'next',
    'previous',
    'all',
    'match case',
    'by word',
    'regexp',
    'replace',
    'replace all',
    'close',
    'Go to line',
    'go',
    'current match',
    'on line',
    'replaced $ matches',
    'replaced match on line $',
    'Control character',
  ];
  return Object.fromEntries(keys.map(key => [key, t(key)]));
}

function startRename(tab, index) {
  const label = tab.querySelector('.file-name');
  const input = document.createElement('input');
  input.className = 'file-rename';
  input.value = state.files[index].name.replace(/\.md$/, '');
  input.setAttribute('aria-label', t('File name'));
  let finished = false;
  const finish = keep => {
    if (finished) return;
    finished = true;
    if (keep && input.value.trim()) {
      state.files[index].name = fileName(input.value, names(index));
      documentChanged();
    }
    drawTabs();
    strip().querySelector('.file-tab.active')?.focus();
  };
  input.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Enter') finish(true);
    else if (event.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  label.replaceWith(input);
  input.focus();
  input.select();
}

function move(index, to) {
  if (to < 0 || to >= state.files.length || to === index) return;
  const [file] = state.files.splice(index, 1);
  state.files.splice(to, 0, file);
  active = state.files.indexOf(currentFile());
  drawTabs();
  commit();
}

function remove(index) {
  const file = state.files[index];
  if (state.files.length < 2) return;
  if (file.markdown.trim() && !confirm(t('Remove {name} and its text from the document?', { name: file.name }))) return;
  state.files.splice(index, 1);
  showFile(Math.min(index === active ? index : state.files.indexOf(currentFile()), state.files.length - 1));
  commit();
}

// ---- The popup menu of the strip: the actions of a file (right-click or Shift+F10 on its tab) and, when
// the tabs overflow, the list of the files. One <ul>, filled again at each opening, placed at the pointer
// or under the control that opened it; the focus comes back to that control when it closes.

let menuOpener = null;
const menu = () => document.getElementById('fileMenu');
const menuItems = () => [...menu().querySelectorAll('[role^="menuitem"]')];

function menuEntry(entry) {
  const item = document.createElement('li');
  if (entry === 'separator') {
    item.setAttribute('role', 'separator');
    item.className = 'menu-separator';
    return item;
  }
  item.setAttribute('role', 'none');
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', entry.checked === undefined ? 'menuitem' : 'menuitemradio');
  if (entry.checked !== undefined) button.setAttribute('aria-checked', String(entry.checked));
  if (entry.danger) button.className = 'danger';
  const label = document.createElement('span');
  label.className = 'menu-label';
  label.textContent = entry.label;
  button.append(label);
  if (entry.shortcut) {
    const kbd = document.createElement('kbd');
    kbd.className = 'shortcut';
    kbd.textContent = keys(entry.shortcut, entry.shortcutMac);
    button.append(kbd);
  }
  button.addEventListener('click', () => {
    closeMenu({ focus: true });
    entry.run();
  });
  item.append(button);
  return item;
}

function openMenu(entries, { opener, at = null }) {
  const list = menu();
  list.replaceChildren(...entries.map(menuEntry));
  menuOpener = opener;
  opener.setAttribute('aria-expanded', 'true');
  list.hidden = false;
  const anchor = opener.getBoundingClientRect();
  const size = list.getBoundingClientRect();
  const left = at ? at.x : anchor.left;
  const top = at ? at.y : anchor.bottom + 4;
  list.style.left = `${Math.round(Math.max(8, Math.min(left, innerWidth - size.width - 8)))}px`;
  list.style.top = `${Math.round(Math.max(8, Math.min(top, innerHeight - size.height - 8)))}px`;
  (list.querySelector('[aria-checked="true"]') ?? menuItems()[0])?.focus();
}

function closeMenu({ focus = false } = {}) {
  const list = menu();
  if (list.hidden) return;
  list.hidden = true;
  menuOpener?.setAttribute('aria-expanded', 'false');
  if (focus && menuOpener?.isConnected) menuOpener.focus();
  menuOpener = null;
}

function bindMenu() {
  const list = menu();
  list.addEventListener('keydown', event => {
    const items = menuItems();
    const index = items.indexOf(document.activeElement);
    const moves = { ArrowDown: index + 1, ArrowUp: index + items.length - 1, Home: 0, End: items.length - 1 };
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMenu({ focus: true });
    } else if (event.key in moves) {
      event.preventDefault();
      items[moves[event.key] % items.length].focus();
    }
  });
  list.addEventListener('focusout', event => {
    if (!list.contains(event.relatedTarget)) closeMenu();
  });
  document.addEventListener('pointerdown', event => {
    if (!list.contains(event.target)) closeMenu();
  });
  const listButton = document.getElementById('fileList');
  listButton.addEventListener('click', () => {
    if (!menu().hidden) return closeMenu();
    openMenu(
      state.files.map((file, index) => ({
        label: file.name,
        checked: index === active,
        run: () => {
          showFile(index);
          tabAt(active)?.focus();
        },
      })),
      { opener: listButton },
    );
  });
}

// The actions of a file, for the menu of its tab.
function fileActions(index) {
  const file = state.files[index];
  const tab = tabAt(index);
  const entries = [{ label: t('Rename'), shortcut: 'F2', run: () => startRename(tabAt(index), index) }];
  const moved = to => () => {
    move(index, to);
    tabAt(to)?.focus();
  };
  if (index > 0) entries.push({ label: t('Move left'), shortcut: 'Alt+←', run: moved(index - 1) });
  if (index < state.files.length - 1)
    entries.push({ label: t('Move right'), shortcut: 'Alt+→', run: moved(index + 1) });
  entries.push({ label: t('Download'), run: () => downloadFile(file) });
  if (state.files.length > 1) {
    entries.push('separator', { label: t('Remove'), shortcut: 'Delete', danger: true, run: () => remove(index) });
  }
  return { entries, tab };
}

function openFileMenu(index, at = null) {
  const { entries, tab } = fileActions(index);
  if (!menu().hidden && menuOpener === tab) return;
  openMenu(entries, { opener: tab, at });
}

// ---- Overflow of the strip: a shadow on the side where tabs are hidden, the wheel scrolls sideways, and
// the list button shows.
function updateOverflow() {
  const tabs = strip();
  const wrap = tabs.parentElement;
  const hiddenEnd = tabs.scrollWidth - tabs.clientWidth - tabs.scrollLeft;
  wrap.classList.toggle('is-clipped-start', tabs.scrollLeft > 1);
  wrap.classList.toggle('is-clipped-end', hiddenEnd > 1);
  document.getElementById('fileList').hidden = tabs.scrollWidth <= tabs.clientWidth + 1;
}

function bindOverflow() {
  const tabs = strip();
  tabs.addEventListener('scroll', updateOverflow, { passive: true });
  new ResizeObserver(updateOverflow).observe(tabs);
  tabs.addEventListener(
    'wheel',
    event => {
      if (!event.deltaY || event.deltaX || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      tabs.scrollLeft += event.deltaY;
    },
    { passive: false },
  );
}

function tabElement(file, index) {
  const tab = document.createElement('div');
  tab.className = 'file-tab';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', String(index === active));
  tab.classList.toggle('active', index === active);
  tab.tabIndex = index === active ? 0 : -1;
  tab.draggable = true;
  tab.title = t('{name}: right-click for the actions, double-click to rename, drag to move', { name: file.name });
  tab.setAttribute('aria-haspopup', 'menu');
  tab.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.className = 'file-name';
  label.textContent = file.name;
  tab.append(label);
  if (state.files.length > 1) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'file-close';
    close.tabIndex = -1;
    close.textContent = '×';
    close.setAttribute('aria-label', t('Remove {name}', { name: file.name }));
    close.title = close.getAttribute('aria-label');
    close.addEventListener('click', event => {
      event.stopPropagation();
      remove(index);
    });
    tab.append(close);
  }

  // The tabs are drawn again when the file changes: a click on the current tab must leave them alone, or
  // the double-click that renames would land on a tab that is gone.
  tab.addEventListener('click', () => {
    if (index !== active) showFile(index);
  });
  tab.addEventListener('dblclick', () => startRename(tab, index));
  // The menu of the file: right-click (a long press on a touch screen), Shift+F10 or the Menu key.
  tab.addEventListener('contextmenu', event => {
    event.preventDefault();
    openFileMenu(index, event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : null);
  });
  tab.addEventListener('keydown', event => {
    const last = state.files.length - 1;
    const steps = { ArrowLeft: -1, ArrowRight: 1 };
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      openFileMenu(index);
    } else if (event.key in steps && event.altKey) {
      event.preventDefault();
      move(index, index + steps[event.key]);
      strip().querySelector('.file-tab.active')?.focus();
    } else if (event.key in steps || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const to =
        event.key === 'Home' ? 0 : event.key === 'End' ? last : (index + steps[event.key] + last + 1) % (last + 1);
      showFile(to);
      strip().querySelector('.file-tab.active')?.focus();
    } else if (event.key === 'F2') {
      event.preventDefault();
      startRename(tab, index);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      remove(index);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      focusEditor();
    }
  });

  tab.addEventListener('dragstart', event => {
    dragged = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', file.name);
  });
  tab.addEventListener('dragover', event => {
    if (dragged === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  tab.addEventListener('drop', event => {
    if (dragged === null) return;
    event.preventDefault();
    showFile(dragged);
    move(dragged, index);
    dragged = null;
  });
  tab.addEventListener('dragend', () => {
    dragged = null;
  });
  return tab;
}

function drawTabs() {
  closeMenu();
  strip().replaceChildren(...state.files.map(tabElement));
  strip().querySelector('.file-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateOverflow();
}

// Shows a file in the editor and marks its tab.
export function showFile(index) {
  active = Math.max(0, Math.min(index, state.files.length - 1));
  openFile(state.files[active]);
  drawTabs();
}

export const activeFile = () => state.files[active];

// The files of the state were replaced (import, reset, restore): tabs and editor start again from them.
export function syncChapters() {
  if (!state.files.length) state.files = [{ name: DEFAULT_FILE_NAME, markdown: state.markdown }];
  showFile(0);
}

// Adds files after the current one, as given ({ name, markdown }), and shows the first of them. A document
// that only holds one empty file takes the new files in its place.
export function addFiles(entries) {
  if (!entries.length) return;
  const pristine = state.files.length === 1 && !state.files[0].markdown.trim();
  const added = [];
  const taken = pristine ? [] : names();
  for (const entry of entries) {
    const file = {
      name: fileName(entry.name, [...taken, ...added.map(other => other.name)]),
      markdown: entry.markdown,
    };
    added.push(file);
  }
  if (pristine) state.files.splice(0, 1, ...added);
  else state.files.splice(active + 1, 0, ...added);
  showFile(state.files.indexOf(added[0]));
  commit();
}

// A new empty file after the current one, ready to be typed in.
export function addEmptyFile() {
  const file = { name: fileName(t('chapter'), names()), markdown: '' };
  state.files.splice(active + 1, 0, file);
  showFile(active + 1);
  commit();
  focusEditor();
}

// Replaces the text of the current file, as one undoable edit.
export function replaceActiveText(markdown) {
  writeFile(activeFile(), markdown);
}

// An edit of the assembled document (made from the preview, or undone there) written back into the file it
// belongs to, shown or not, as an undoable edit of that file.
export function writeDocument(markdown) {
  const edit = applyAssembledEdit(state.files, markdown);
  if (!edit) return;
  if (edit.index < 0) {
    // Not attributable to one file: the first file takes the whole document.
    state.files = [{ name: state.files[0].name, markdown: markdown.replace(/\r\n?/g, '\n') }];
    showFile(0);
    commit();
    return;
  }
  writeFile(state.files[edit.index], edit.markdown);
}

// Inserts a block at the cursor of the current file.
// Line of the assembled document (from 0) for a line of the current file, and back: the file and the line
// in it for a line of the document.
// The line offsets of the files, computed again only when the assembled document changed: the scroll
// synchronisation asks for them on every frame.
let offsetsFor = null;
let offsets = [];
function currentOffsets() {
  if (offsetsFor !== state.markdown) {
    offsetsFor = state.markdown;
    offsets = fileOffsets(state.files);
  }
  return offsets;
}

export const documentLine = line => (currentOffsets()[active] ?? 0) + line;
export const locateDocumentLine = line => locateLine(state.files, line);
export const activeIndex = () => active;

// Shows the source of a line of the document: its file, the cursor on the line, the focus in the editor.
export function revealDocumentLine(line) {
  const place = locateDocumentLine(line);
  if (place.index !== active) showFile(place.index);
  goToLine(place.line);
}

// Creates the editor and the tabs. `onChange()` runs after every change of the document; `onScroll()` and
// `onImageFiles(files, kind)` come from the editor; `onDownload(file)` saves a file from the menu of its tab.
export function initChapters(host, { onChange, onScroll, onImageFiles, onDownload }) {
  documentChanged = onChange;
  downloadFile = onDownload;
  bindMenu();
  bindOverflow();
  initEditor(host, { onChange: commit, onScroll, onImageFiles });
  setEditorPhrases(searchPhrases());
  onLanguageChange(() => {
    setEditorPhrases(searchPhrases());
    drawTabs();
  });
  syncChapters();
}

// The text of the current file as the editor holds it.
