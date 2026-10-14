// The outline of the headings, a column next to the editor: every heading of the document (all the files),
// with its number when the document numbers them, a filter above, and the heading that holds the cursor
// marked. A click shows its source in the editor, the preview following. Ctrl+Shift+O opens and closes it;
// the choice is remembered in localStorage.
import { state } from './config.js';
import { documentLine, locateDocumentLine, revealDocumentLine } from './chapters.js';
import { cursorLine } from './editor.js';
import { headingAt, headingMatches, headingsOf } from './headings.js';
import { onLanguageChange, t } from './i18n.js';
import { IS_MAC } from './shortcuts.js';
import { readStored, writeStored } from './storage.js';
import { revealEditor } from './view.js';

export const OUTLINE_KEY = 'markdown-paged-studio:outline';

// On a phone the outline covers the editor: a chosen heading closes it.
const NARROW = matchMedia('(max-width: 760px)');

const $ = id => document.getElementById(id);

let headings = [];
let headingsFor = null;

const isOpen = () => !$('outline').hidden;

// The headings of the assembled document, parsed again only when it or the numbering changed.
function currentHeadings() {
  const key = `${state.numberHeadings}\n${state.markdown}`;
  if (headingsFor !== key) {
    headingsFor = key;
    headings = headingsOf(state.markdown, { numberHeadings: state.numberHeadings });
  }
  return headings;
}

// The heading that holds the cursor of the shown file, marked in the list.
function markCurrent() {
  if (!isOpen()) return;
  const current = headingAt(currentHeadings(), documentLine(cursorLine()));
  for (const item of $('outlineList').querySelectorAll('.outline-item')) {
    const here = current !== null && Number(item.dataset.line) === current.line;
    if (here) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  }
}

function itemOf(heading) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'outline-item';
  button.dataset.level = String(heading.level);
  button.dataset.line = String(heading.line);
  const place = locateDocumentLine(heading.line);
  // Several files: the tooltip says which one holds the heading.
  if (state.files.length > 1) button.title = state.files[place.index]?.name ?? '';
  if (heading.number) {
    const number = document.createElement('span');
    number.className = 'outline-number';
    number.textContent = heading.number;
    button.append(number);
  }
  const text = document.createElement('span');
  text.className = 'outline-text';
  text.textContent = heading.text || t('(untitled)');
  button.append(text);
  button.addEventListener('click', () => {
    revealDocumentLine(heading.line);
    if (NARROW.matches) toggleOutline(false);
  });
  item.append(button);
  return item;
}

// Draws the list: the headings that match the filter, or why there is none.
function draw() {
  if (!isOpen()) return;
  const filter = $('outlineFilter').value;
  const list = $('outlineList');
  const shown = currentHeadings().filter(heading => headingMatches(heading, filter));
  list.replaceChildren(...shown.map(itemOf));
  const empty = $('outlineEmpty');
  empty.hidden = shown.length > 0;
  empty.textContent = currentHeadings().length ? t('No heading matches') : t('No heading yet');
  markCurrent();
}

// After each render: the list follows the document and its numbering.
export function refreshOutline() {
  if (isOpen()) draw();
}

// Opens or closes the outline (`open` forces a state). Opening shows the editor and puts the focus in the
// filter; closing gives it back to the button of the editor bar.
export function toggleOutline(open = !isOpen()) {
  if (open) revealEditor();
  $('outline').hidden = !open;
  $('toggleOutline').setAttribute('aria-pressed', String(open));
  writeStored(OUTLINE_KEY, open ? 'open' : 'closed');
  if (open) {
    draw();
    $('outlineFilter').focus();
  } else if ($('outline').contains(document.activeElement)) {
    $('toggleOutline').focus();
  }
}

// The arrows, Home and End move between the headings of the list.
function listKeydown(event) {
  const items = [...$('outlineList').querySelectorAll('.outline-item')];
  const index = items.indexOf(document.activeElement);
  if (index < 0) return;
  const moves = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 };
  if (!(event.key in moves)) return;
  event.preventDefault();
  items[Math.max(0, Math.min(moves[event.key], items.length - 1))].focus();
}

export function initOutline() {
  const filter = $('outlineFilter');
  filter.addEventListener('input', draw);
  filter.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      $('outlineList').querySelector('.outline-item')?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (filter.value) {
        filter.value = '';
        draw();
      } else toggleOutline(false);
    }
  });
  $('outlineList').addEventListener('keydown', listKeydown);
  $('toggleOutline').addEventListener('click', () => toggleOutline());
  $('closeOutline').addEventListener('click', () => toggleOutline(false));
  // Ctrl+Shift+O (Cmd+Shift+O on a Mac), from anywhere in the studio.
  document.addEventListener('keydown', event => {
    const chord = (IS_MAC ? event.metaKey : event.ctrlKey) && event.shiftKey && !event.altKey;
    if (!chord || event.code !== 'KeyO') return;
    event.preventDefault();
    toggleOutline();
  });
  onLanguageChange(draw);
  if (readStored(OUTLINE_KEY) === 'open') toggleOutline(true);
}

// The cursor moved, or another file is shown: the mark follows it.
export function outlineCursorMoved() {
  if (isOpen()) markCurrent();
}
