// Keeps the editor and the preview on the same part of the document. The preview marks its blocks with the
// line of the assembled Markdown they come from (`data-source-line`, written by src/markdown.js for the
// preview only); between two marked blocks the position is interpolated. The pane the user is acting on
// drives the other one, so a programmatic scroll (a render, a jump to a line) never bounces back.
import { activeIndex, documentLine, locateDocumentLine, revealDocumentLine } from './chapters.js';
import { editorLineCount, scrollToLine, topLine } from './editor.js';
import { effectiveMode, syncOn } from './view.js';

// Room kept above the block that is brought to the top of the preview.
const MARGIN_PX = 16;
const STUDIO_ONLY = '.diagram-tools, .diagram-handle';

let shell = null;
let preview = null;
let driver = null; // 'editor' or 'preview': the pane the user is acting on
let pending = null;
let cache = { key: null, anchors: [] };

const active = () => syncOn() && effectiveMode() === 'split';

// The marked blocks of the preview: { line, top }, sorted by line, with `top` in the scroll coordinates of
// the preview. Measured again when the pages, the zoom or the width change.
function anchors() {
  const key = [preview.firstElementChild, preview.style.zoom, preview.dataset.layout, shell.clientWidth];
  if (cache.key && key.every((value, index) => value === cache.key[index])) return cache.anchors;
  const origin = shell.getBoundingClientRect().top - shell.scrollTop;
  const seen = new Map();
  for (const element of preview.querySelectorAll('[data-source-line], [data-line]')) {
    const line = Number(element.dataset.sourceLine ?? element.dataset.line);
    const top = element.getBoundingClientRect().top - origin;
    // A block cut by a page break appears twice: its first part is the place of its line.
    if (Number.isInteger(line) && (!seen.has(line) || top < seen.get(line))) seen.set(line, top);
  }
  const sorted = [...seen].map(([line, top]) => ({ line, top })).sort((a, b) => a.line - b.line);
  // Positions must grow with the lines: what was moved elsewhere by the layout (a float) is left out.
  const kept = [];
  for (const anchor of sorted) if (!kept.length || anchor.top >= kept.at(-1).top) kept.push(anchor);
  cache = { key, anchors: kept };
  return kept;
}

// Position in the preview of a (fractional) line of the document.
function topOfLine(line, list) {
  let index = 0;
  while (index + 1 < list.length && list[index + 1].line <= line) index++;
  const from = list[index];
  if (line <= from.line) return from.top;
  const end = shell.scrollHeight - shell.clientHeight + MARGIN_PX;
  const to = list[index + 1] ?? { line: Math.max(from.line + 1, documentLine(editorLineCount())), top: end };
  const share = Math.min(1, (line - from.line) / (to.line - from.line));
  return from.top + Math.max(0, to.top - from.top) * share;
}

// (Fractional) line of the document shown at a position of the preview.
function lineOfTop(top, list) {
  let index = 0;
  while (index + 1 < list.length && list[index + 1].top <= top) index++;
  const from = list[index];
  const to = list[index + 1];
  if (top <= from.top || !to || to.top <= from.top) return from.line;
  return from.line + (to.line - from.line) * ((top - from.top) / (to.top - from.top));
}

function followEditor() {
  const list = anchors();
  if (!list.length) return;
  shell.scrollTop = Math.max(0, topOfLine(documentLine(topLine()), list) - MARGIN_PX);
}

function followPreview() {
  const list = anchors();
  if (!list.length) return;
  const line = lineOfTop(shell.scrollTop + MARGIN_PX, list);
  const place = locateDocumentLine(Math.floor(line));
  // The preview shows another file than the one being edited: the editor stays where it is.
  if (place.index !== activeIndex()) return;
  scrollToLine(place.line + (line - Math.floor(line)));
}

function schedule(follow) {
  if (pending) cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    pending = null;
    if (active()) follow();
  });
}

// The editor scrolled: the preview follows when the user is acting on the editor.
export function editorScrolled() {
  if (driver === 'editor' && active()) schedule(followEditor);
}

// Brings the preview to the part of the document shown in the editor (when the synchronisation is switched
// on, after a file is shown).
export function alignPreview() {
  if (active()) schedule(followEditor);
}

export function initSync() {
  shell = document.querySelector('.preview-shell');
  preview = document.getElementById('preview');
  const editorPane = document.getElementById('editorPane');
  for (const type of ['pointerover', 'pointerdown', 'wheel', 'touchstart', 'keydown']) {
    editorPane.addEventListener(type, () => (driver = 'editor'), { capture: true, passive: true });
    shell.addEventListener(type, () => (driver = 'preview'), { capture: true, passive: true });
  }
  shell.addEventListener(
    'scroll',
    () => {
      if (driver === 'preview' && active()) schedule(followPreview);
    },
    { passive: true },
  );
  // A double-click on a block of the preview shows its source: the file, the line, the focus in the editor.
  preview.addEventListener('dblclick', event => {
    if (effectiveMode() !== 'split' || event.target.closest(`${STUDIO_ONLY}, a[href]`)) return;
    const block = event.target.closest('[data-source-line], [data-line]');
    const line = Number(block?.dataset.sourceLine ?? block?.dataset.line);
    if (!block || !Number.isInteger(line)) return;
    getSelection()?.removeAllRanges();
    revealDocumentLine(line);
  });
}
