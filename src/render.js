// The live preview: paginates the document with Paged.js into a hidden, attached stage (Paged.js needs
// layout to measure overflow), then swaps the pages into #preview in one step. The previous pages stay
// visible meanwhile, so typing never flashes an empty preview, and two renders never write into the same
// element. Each Previewer injects a <style> into <head>; disposePreviewer() removes it.
import { Previewer } from 'pagedjs';
import { schedulePersist, state } from './config.js';
import { setMissingImages } from './images.js';
import { enhanceResizables } from './resize-controls.js';
import { documentCss, documentHtml } from './document.js';
import { editInPlace } from './editor.js';
import { loadPreviewFonts } from './fonts.js';
import { t } from './i18n.js';
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
  title.textContent = t('Paged.js error');
  const details = document.createElement('pre');
  details.textContent = error?.stack || error?.message || String(error);
  box.append(title, details);
  return box;
}

export async function render() {
  const token = ++renderToken;
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  status.textContent = t('Rendering…');
  preview.classList.add('is-rendering');

  if (pendingPreviewer) pendingPreviewer.chunker.stop();

  const stage = document.createElement('div');
  stage.className = 'render-stage';
  stage.setAttribute('aria-hidden', 'true');
  document.body.appendChild(stage);

  const css = documentCss();
  const styleUrl = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
  let previewer = null;
  try {
    // Diagrams render first (async, possibly loading Mermaid); a stale token here means a newer edit arrived.
    const html = await documentHtml();
    // The fonts must be there before pagination: text measured with a fallback font breaks elsewhere.
    await loadPreviewFonts(html, css);
    if (token !== renderToken) return;
    previewer = new Previewer();
    pendingPreviewer = previewer;
    const flow = await previewer.preview(html, [styleUrl], stage);
    if (token !== renderToken) {
      disposePreviewer(previewer);
      return;
    }
    preview.replaceChildren(...stage.childNodes);
    // Facing pages: the two-page view pairs them as in the bound document, first page on the right.
    preview.toggleAttribute('data-facing', state.mirrorMargins);
    preview.classList.remove('is-stale');
    disposePreviewer(activePreviewer);
    activePreviewer = previewer;
    status.textContent = flow.total > 1 ? t('{count} pages', { count: flow.total }) : t('1 page');
    applyView();
    enhanceResizables(preview, () => state.markdown, applyMarkdown);
    setMissingImages([...preview.querySelectorAll('.image-missing')].map(element => element.dataset.image));
  } catch (error) {
    disposePreviewer(previewer);
    if (token !== renderToken) return;
    console.error(error);
    status.textContent = t('Render error');
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

// Changes made from the preview, so they can be undone from the preview too: Ctrl+Z in the editor only works
// while the editor has the focus, and not at all for a change made while it was hidden.
const HISTORY_LIMIT = 100;
const undone = [];
const done = [];
let historyBound = false;

function writeMarkdown(markdown) {
  const editor = document.getElementById('markdown');
  // A textarea holds line breaks as "\n" whatever the source used.
  const next = markdown.replace(/\r\n?/g, '\n');
  if (editor && editor.value !== next && !editInPlace(editor, next)) editor.value = next;
  state.markdown = editor ? editor.value : markdown;
  scheduleRender();
}

// Undoes (or redoes) the last change made from the preview, unless the source was edited since.
function travel(from, to, source, target) {
  const entry = from.at(-1);
  if (!entry || entry[source] !== state.markdown) return false;
  from.pop();
  to.push(entry);
  writeMarkdown(entry[target]);
  return true;
}

function bindHistory() {
  if (historyBound) return;
  historyBound = true;
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const redo = key === 'y' || (key === 'z' && event.shiftKey);
    if (!redo && key !== 'z') return;
    // Text fields keep their own undo.
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const moved = redo ? travel(undone, done, 'before', 'after') : travel(done, undone, 'after', 'before');
    if (moved) event.preventDefault();
  });
}

// Replaces the Markdown source (used when the preview edits it), keeps the editor in sync and re-renders.
function applyMarkdown(markdown) {
  if (markdown === state.markdown) return;
  bindHistory();
  const before = state.markdown;
  writeMarkdown(markdown);
  done.push({ before, after: state.markdown });
  if (done.length > HISTORY_LIMIT) done.shift();
  undone.length = 0;
}

// Debounced re-render after a state change; also schedules the autosave.
export function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 220);
  // The displayed pages no longer match the source: their diagram tools point at outdated lines.
  document.getElementById('preview').classList.add('is-stale');
  schedulePersist();
}
