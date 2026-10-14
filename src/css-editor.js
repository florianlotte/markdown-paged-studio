// The custom CSS of the Design tab: a CodeMirror view in `#customCss`, with line numbers, colours and the
// history of the Markdown editor. It reads and writes `state.customCss`, the only setting not bound by
// form.js. The CSS language is loaded the first time the Design tab is opened (or the field focused); the
// view itself is there from the start, so the state can be written into it whenever the form is synchronised.
import { defaultKeymap, history, historyKeymap, redo } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { state } from './config.js';
import { studioTheme } from './editor.js';
import { scheduleRender } from './render.js';
import { lazy } from './util.js';

const loadLanguage = lazy(() => import('@codemirror/lang-css'));

const colours = HighlightStyle.define([
  { tag: [tags.tagName, tags.className, tags.labelName], color: 'var(--code-heading)', fontWeight: '600' },
  { tag: tags.propertyName, color: 'var(--code-label)' },
  { tag: [tags.string, tags.number, tags.unit, tags.color], color: 'var(--code-link)' },
  { tag: tags.keyword, color: 'var(--code-mono)' },
  { tag: tags.comment, color: 'var(--code-quote)', fontStyle: 'italic' },
  { tag: [tags.definitionKeyword, tags.atom, tags.derefOperator], color: 'var(--code-mark)' },
]);

const language = new Compartment();
let view = null;
let languageLoaded = false;

const EDIT = 'input.css';

function extensions() {
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    history(),
    EditorView.lineWrapping,
    language.of([]),
    syntaxHighlighting(colours),
    studioTheme,
    EditorView.contentAttributes.of({ 'aria-labelledby': 'customCssLabel', spellcheck: 'false' }),
    Prec.high(keymap.of([{ key: 'Mod-Shift-z', run: redo }])),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.updateListener.of(update => {
      if (!update.docChanged || update.transactions.every(tr => tr.isUserEvent(EDIT))) return;
      state.customCss = update.state.doc.toString();
      scheduleRender();
    }),
  ];
}

// The CSS colours come with the language, loaded once the field is about to be seen.
async function loadColours() {
  if (languageLoaded) return;
  languageLoaded = true;
  try {
    const { css } = await loadLanguage();
    view?.dispatch({ effects: language.reconfigure(css()) });
  } catch (error) {
    console.warn('The CSS language could not be loaded', error);
    languageLoaded = false;
  }
}

export function initCssEditor() {
  const host = document.getElementById('customCss');
  view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: state.customCss, extensions: extensions() }),
  });
  // The Design tab is not the first one shown: the language waits for it, or for the focus to reach the field.
  document.getElementById('tabDesign').addEventListener('click', loadColours);
  host.addEventListener('focusin', loadColours);
}

export const cssText = () => view.state.doc.toString();

// Writes the state into the editor (restore, import, reset, a stylesheet file), as one undoable edit.
export function syncCssEditor() {
  if (!view) return;
  const text = state.customCss ?? '';
  if (view.state.doc.toString() === text) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: EDIT });
}

// A new stylesheet (file, default): the state takes it and the editor shows it.
export function setCss(text) {
  state.customCss = text;
  syncCssEditor();
  scheduleRender();
}
