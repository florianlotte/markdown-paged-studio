// The Markdown editor: one CodeMirror view showing one file at a time. Each file keeps its own editor state
// (text, selection, undo history) and its scroll position, so switching files loses nothing. Every edit the
// studio makes for the user (tools of the preview, insert buttons, pasted images) is an ordinary transaction:
// Ctrl+Z reverts it like something typed, whether the editor is visible or not.
import { defaultKeymap, history, historyKeymap, redo } from '@codemirror/commands';
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState, Prec } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

let view = null;
let current = null; // the file object being edited
let handlers = { onChange() {}, onScroll() {}, onImageFiles() {} };
const states = new WeakMap(); // file -> EditorState, for the files that are not shown
const scrolls = new WeakMap(); // file -> scrollTop

// Texts of the search panel, translated in place when the language changes (see setEditorPhrases).
const phrases = {};

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: '#fff', color: '#1f2733' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    lineHeight: '1.55',
    overflow: 'auto',
  },
  '.cm-content': { padding: '10px 0' },
  '.cm-line': { padding: '0 14px 0 8px' },
  '.cm-gutters': { backgroundColor: '#f8f9fb', color: '#9aa3ae', border: 'none', borderRight: '1px solid #e5e9ef' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 10px', minWidth: '28px' },
  '.cm-activeLine': { backgroundColor: '#f4f6fb' },
  '.cm-activeLineGutter': { backgroundColor: '#eef1f8', color: '#4f5660' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#cfd9ff' },
  '.cm-panels': { backgroundColor: '#f8f9fb', color: '#1f2733', borderColor: '#e5e9ef' },
  '.cm-panel.cm-search': { padding: '6px 8px', fontSize: '12px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '12px', margin: '2px 4px 2px 0' },
  '.cm-panel.cm-search label': { fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '3px' },
  '.cm-panel.cm-search input[type=checkbox]': { width: 'auto' },
});

// Markdown colours: structure stands out, the marks themselves stay quiet. No background blocks, so wrapped
// lines keep an even rhythm.
const colours = HighlightStyle.define([
  { tag: tags.heading, color: '#1d2b6b', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: '#2456c8' },
  { tag: tags.monospace, color: '#a3381f' },
  { tag: tags.quote, color: '#5d6672' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: '#8a93a0' },
  { tag: tags.labelName, color: '#7a4fc4' },
]);

const imageFiles = transfer => [...(transfer?.files ?? [])].filter(file => file.type.startsWith('image/'));

const extensions = [
  lineNumbers(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  drawSelection(),
  history(),
  EditorView.lineWrapping,
  // The Markdown language alone: `markdown()` would bring the HTML, CSS and JavaScript languages with it
  // (several hundred kilobytes) for raw HTML, which the studio does not render.
  markdownLanguage,
  Prec.high(keymap.of(markdownKeymap)),
  syntaxHighlighting(colours),
  search({ top: true }),
  highlightSelectionMatches(),
  EditorState.phrases.of(phrases),
  EditorView.contentAttributes.of({ 'aria-label': 'Markdown', spellcheck: 'false' }),
  // Ctrl+Shift+Z redoes on every system, as in a plain text field (CodeMirror binds it on some only).
  keymap.of([
    { key: 'Mod-Shift-z', run: redo, preventDefault: true },
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
  ]),
  theme,
  EditorView.updateListener.of(update => {
    if (!update.docChanged || !current) return;
    current.markdown = update.state.doc.toString();
    handlers.onChange(current);
  }),
  // Image files dropped or pasted go to the image library instead of being read as text.
  EditorView.domEventHandlers({
    dragover(event) {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    },
    drop(event) {
      const files = imageFiles(event.dataTransfer);
      if (!files.length) return false;
      event.preventDefault();
      handlers.onImageFiles(files, 'drop');
      return true;
    },
    paste(event) {
      const files = imageFiles(event.clipboardData);
      if (!files.length) return false;
      event.preventDefault();
      handlers.onImageFiles(files, 'paste');
      return true;
    },
  }),
];

const stateOf = file => {
  if (!states.has(file)) states.set(file, EditorState.create({ doc: file.markdown, extensions }));
  return states.get(file);
};

// The smallest change that turns `before` into `after`.
function changeBetween(before, after) {
  let from = 0;
  const limit = Math.min(before.length, after.length);
  while (from < limit && before[from] === after[from]) from++;
  let tail = 0;
  while (tail < limit - from && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { from, to: before.length - tail, insert: after.slice(from, after.length - tail) };
}

// Creates the editor inside `host`. `onChange(file)` runs after every change of a file, `onScroll()` when
// the editor scrolls, `onImageFiles(files, 'drop' | 'paste')` when image files are dropped or pasted.
export function initEditor(host, callbacks) {
  handlers = { ...handlers, ...callbacks };
  view = new EditorView({ parent: host, state: EditorState.create({ doc: '', extensions }) });
  view.scrollDOM.addEventListener('scroll', () => handlers.onScroll(), { passive: true });
  return view;
}

// Shows `file` in the editor, with the state it was left in.
export function openFile(file) {
  if (current) {
    states.set(current, view.state);
    scrolls.set(current, view.scrollDOM.scrollTop);
  }
  current = file;
  // A file whose text was replaced from outside (import, reset) starts from a fresh state.
  if (states.has(file) && states.get(file).doc.toString() !== file.markdown) states.delete(file);
  view.setState(stateOf(file));
  const top = scrolls.get(file) ?? 0;
  view.requestMeasure({
    read() {},
    write() {
      view.scrollDOM.scrollTop = top;
    },
  });
}

export const currentFile = () => current;

// Writes `next` into a file as one undoable edit of its smallest changed range. The file does not need to
// be the one shown, nor the editor to be visible. The selection of the shown file follows the edit.
export function writeFile(file, next) {
  const before = file === current ? view.state.doc.toString() : stateOf(file).doc.toString();
  if (before === next) return;
  const transaction = { changes: changeBetween(before, next), userEvent: 'input.studio' };
  if (file === current) {
    view.dispatch(transaction);
    return;
  }
  states.set(file, stateOf(file).update(transaction).state);
  file.markdown = next;
  handlers.onChange(file);
}

// Inserts a block of text at the cursor of the shown file, on lines of its own, and leaves the cursor
// after it.
export function insertBlock(text) {
  const { from, to } = view.state.selection.main;
  const before = view.state.sliceDoc(0, from);
  const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const block = `${lead}${text}\n`;
  view.dispatch({
    changes: { from, to, insert: block },
    selection: EditorSelection.cursor(from + block.length),
    userEvent: 'input.studio',
    scrollIntoView: true,
  });
}

export const editorText = () => view.state.doc.toString();

export function editorSelection() {
  const { from, to } = view.state.selection.main;
  return [from, to];
}

export function selectInEditor(from, to = from) {
  const length = view.state.doc.length;
  view.dispatch({ selection: EditorSelection.range(Math.min(from, length), Math.min(to, length)) });
}

export const focusEditor = () => view.focus();
export const editorHasFocus = () => view.hasFocus;

// Puts the cursor at the start of a line (from 0) of the shown file, brings it into view and takes the focus.
export function goToLine(line) {
  const target = view.state.doc.line(Math.max(1, Math.min(line + 1, view.state.doc.lines)));
  view.dispatch({
    selection: EditorSelection.cursor(target.from),
    effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
  });
  view.focus();
}

// The line at the top of the visible part of the editor, with the share of it already scrolled past
// (line 12.5: half of line 12 is above the top edge). Lines count from 0.
export function topLine() {
  const scroller = view.scrollDOM;
  const block = view.lineBlockAtHeight(scroller.scrollTop);
  const line = view.state.doc.lineAt(block.from).number - 1;
  return line + (block.height > 0 ? Math.max(0, Math.min(1, (scroller.scrollTop - block.top) / block.height)) : 0);
}

// Scrolls the editor so that the given (fractional) line sits at its top edge.
export function scrollToLine(line) {
  const whole = Math.max(0, Math.min(Math.floor(line), view.state.doc.lines - 1));
  const block = view.lineBlockAt(view.state.doc.line(whole + 1).from);
  view.scrollDOM.scrollTop = block.top + (line - whole) * block.height;
}

export const editorScrollTop = () => view.scrollDOM.scrollTop;
export const editorLineCount = () => view.state.doc.lines;

// Translations of the search panel: CodeMirror reads this table whenever it draws a text.
export function setEditorPhrases(table) {
  for (const key of Object.keys(phrases)) delete phrases[key];
  Object.assign(phrases, table);
}
