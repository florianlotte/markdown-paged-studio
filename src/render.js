// The live preview: paginates the document with Paged.js into a hidden, attached stage (Paged.js needs
// layout to measure overflow), then swaps the pages into #preview in one step. The previous pages stay
// visible meanwhile, so typing never flashes an empty preview, and two renders never write into the same
// element. Each Previewer injects a <style> into <head>; disposePreviewer() removes it.
import { Previewer } from 'pagedjs';
import { schedulePersist } from './config.js';
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
    disposePreviewer(activePreviewer);
    activePreviewer = previewer;
    status.textContent = `${flow.total} page${flow.total > 1 ? 's' : ''}`;
    applyView();
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

// Debounced re-render after a state change; also schedules the autosave.
export function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 220);
  schedulePersist();
}
