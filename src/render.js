// The live preview: paginates the document with Paged.js into a hidden, attached stage (Paged.js needs
// layout to measure overflow), then swaps the pages into #preview in one step. The previous pages stay
// visible meanwhile, so typing never flashes an empty preview, and two renders never write into the same
// element. Each Previewer injects a <style> into <head>; disposePreviewer() removes it.
import { Previewer } from 'pagedjs';
import { schedulePersist, state } from './config.js';
import { setMissingImages } from './images.js';
import { enhanceResizables } from './resize-controls.js';
import { documentCss, documentHtml } from './document.js';
import { applyView } from './view.js';

let renderTimer;
let renderToken = 0;
// The previewer whose pages are currently displayed. Its injected <style> must stay alive until replaced.
let activePreviewer = null;
// The previewer still paginating, if any, so a newer render can stop it early.
let pendingPreviewer = null;

function disposePreviewer(previewer) {
  if (!previewer) return;
  try {
    previewer.chunker.stop();
    previewer.chunker.destroy();
    previewer.polisher.destroy();
  } catch (error) {
    console.warn('Previewer cleanup failed', error);
  }
}

function renderErrorElement(error) {
  const box = document.createElement('div');
  box.className = 'render-error';
  const title = document.createElement('strong');
  title.textContent = 'Paged.js error';
  const details = document.createElement('pre');
  details.textContent = error?.stack || error?.message || String(error);
  box.append(title, details);
  return box;
}

export async function render() {
  const token = ++renderToken;
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  status.textContent = 'Rendering…';
  preview.classList.add('is-rendering');

  if (pendingPreviewer) pendingPreviewer.chunker.stop();

  const stage = document.createElement('div');
  stage.className = 'render-stage';
  stage.setAttribute('aria-hidden', 'true');
  document.body.appendChild(stage);

  const styleUrl = URL.createObjectURL(new Blob([documentCss()], { type: 'text/css' }));
  let previewer = null;
  try {
    // Diagrams render first (async, possibly loading Mermaid); a stale token here means a newer edit arrived.
    const html = await documentHtml();
    if (token !== renderToken) return;
    previewer = new Previewer();
    pendingPreviewer = previewer;
    const flow = await previewer.preview(html, [styleUrl], stage);
    if (token !== renderToken) {
      disposePreviewer(previewer);
      return;
    }
    preview.replaceChildren(...stage.childNodes);
    preview.classList.remove('is-stale');
    disposePreviewer(activePreviewer);
    activePreviewer = previewer;
    status.textContent = `${flow.total} page${flow.total > 1 ? 's' : ''}`;
    applyView();
    enhanceResizables(preview, () => state.markdown, applyMarkdown);
    setMissingImages([...preview.querySelectorAll('.image-missing')].map(element => element.dataset.image));
  } catch (error) {
    disposePreviewer(previewer);
    if (token !== renderToken) return;
    console.error(error);
    status.textContent = 'Render error';
    disposePreviewer(activePreviewer);
    activePreviewer = null;
    preview.replaceChildren(renderErrorElement(error));
  } finally {
    stage.remove();
    if (pendingPreviewer === previewer) pendingPreviewer = null;
    if (token === renderToken) preview.classList.remove('is-rendering');
    setTimeout(() => URL.revokeObjectURL(styleUrl), 1000);
  }
}

// Writes `next` into the editor as an edit of its smallest changed range, through the browser's editing
// command: unlike assigning `value`, this keeps the undo history, so Ctrl+Z reverts the change and what was
// typed before it. Returns false when the editor cannot take the edit (hidden sidebar or panel).
function editInPlace(editor, next) {
  const current = editor.value;
  if (!editor.checkVisibility?.({ visibilityProperty: true })) return false;

  let start = 0;
  const limit = Math.min(current.length, next.length);
  while (start < limit && current[start] === next[start]) start++;
  let tail = 0;
  while (tail < limit - start && current[current.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  const end = current.length - tail;
  const inserted = next.slice(start, next.length - tail);

  const focused = document.activeElement;
  const { selectionStart, selectionEnd, scrollTop } = editor;
  // A caret after the edited range moves with the text; inside the range it goes to its end.
  const shift = offset =>
    offset <= start ? offset : Math.max(start + inserted.length, offset + next.length - current.length);

  editor.focus({ preventScroll: true });
  if (document.activeElement !== editor) return false;
  editor.setSelectionRange(start, end);
  // Deprecated but without replacement: no other API records an edit in the undo history of a textarea.
  const command = inserted ? 'insertText' : 'delete';
  const done = document.execCommand(command, false, inserted) && editor.value === next;
  if (done) editor.setSelectionRange(shift(selectionStart), shift(selectionEnd));
  editor.scrollTop = scrollTop;
  if (focused instanceof HTMLElement && focused !== editor) focused.focus({ preventScroll: true });
  return done;
}

// Replaces the Markdown source (used when the preview edits it), keeps the editor in sync and re-renders.
function applyMarkdown(markdown) {
  if (markdown === state.markdown) return;
  const editor = document.getElementById('markdown');
  // A textarea holds line breaks as "\n" whatever the source used.
  const next = markdown.replace(/\r\n?/g, '\n');
  if (editor && editor.value !== next && !editInPlace(editor, next)) editor.value = next;
  state.markdown = editor ? editor.value : markdown;
  scheduleRender();
}

// Debounced re-render after a state change; also schedules the autosave.
export function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 220);
  // The displayed pages no longer match the source: their diagram tools point at outdated lines.
  document.getElementById('preview').classList.add('is-stale');
  schedulePersist();
}
