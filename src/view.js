// The workspace view: the view mode (editor alone, editor and preview side by side, preview alone), the
// width of the editor, the page layout (one column or two pages side by side), the zoom and the sidebar.
// Stored apart from the document, they are not part of the config JSON. Zoom uses the CSS `zoom` property
// so the scrollable area follows the scale.
import { t } from './i18n.js';
import { placeResizables } from './resize-controls.js';

const VIEW_KEY = 'markdown-paged-studio:view';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const PAGE_GAP_PX = 24; // must match the `gap` of `.preview .pagedjs_pages` in ui.css

const MODES = ['edit', 'split', 'view'];
const EDITOR_WIDTH_MIN = 0.2;
const EDITOR_WIDTH_MAX = 0.8;
const EDITOR_WIDTH_STEP = 0.02;
// Ctrl+Alt is AltGr on European keyboards (AltGr+3 types `#`), and Cmd+Shift+3/4/5 take screenshots on
// macOS: the mode shortcuts are Ctrl+Shift+1/2/3, Cmd+Alt+1/2/3 on a Mac, matched on the physical keys.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

// On phones the settings are a drawer over the preview, closed until the user opens it.
const NARROW = matchMedia('(max-width: 760px)');
const view = { mode: 'split', editorWidth: 0.5, layout: 'single', zoom: 1, fit: true, sidebar: !NARROW.matches };

const clampWidth = width => Math.min(EDITOR_WIDTH_MAX, Math.max(EDITOR_WIDTH_MIN, Math.round(width * 1000) / 1000));

function loadView() {
  try {
    const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    if (MODES.includes(stored.mode)) view.mode = stored.mode;
    const editorWidth = Number(stored.editorWidth);
    if (Number.isFinite(editorWidth)) view.editorWidth = clampWidth(editorWidth);
    if (stored.layout === 'single' || stored.layout === 'spread') view.layout = stored.layout;
    const zoom = Number(stored.zoom);
    if (Number.isFinite(zoom)) view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
    if (typeof stored.fit === 'boolean') view.fit = stored.fit;
    if (typeof stored.sidebar === 'boolean') view.sidebar = stored.sidebar;
  } catch {
    // Storage unavailable or corrupt: keep the defaults.
  }
}

let saveViewTimer = null;
function saveViewNow() {
  clearTimeout(saveViewTimer);
  saveViewTimer = null;
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Storage unavailable: the view still applies for this session.
  }
}

// Debounced: in fit mode the ResizeObserver calls applyView() on every frame of a window resize.
function saveView() {
  clearTimeout(saveViewTimer);
  saveViewTimer = setTimeout(saveViewNow, 300);
}

// Writes a pending view save immediately (used when the page is closed or reloaded).
export function flushView() {
  if (saveViewTimer !== null) saveViewNow();
}

// Width of one rendered page at zoom 1. getBoundingClientRect() reports the zoomed size, so divide it out.
function pageNaturalWidth() {
  const page = document.querySelector('#preview .pagedjs_page');
  if (!page) return null;
  const currentZoom = Number(document.getElementById('preview').style.zoom) || 1;
  return page.getBoundingClientRect().width / currentZoom;
}

function fitZoom() {
  const shell = document.querySelector('.preview-shell');
  const pageWidth = pageNaturalWidth();
  if (!pageWidth) return view.zoom;
  const columns = view.layout === 'spread' ? 2 : 1;
  const shellStyle = getComputedStyle(shell);
  const available = shell.clientWidth - parseFloat(shellStyle.paddingLeft) - parseFloat(shellStyle.paddingRight);
  // The preview is hidden (Edit mode): keep the zoom instead of fitting into nothing.
  if (available <= 0) return view.zoom;
  const zoom = available / (pageWidth * columns + PAGE_GAP_PX * (columns - 1));
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

// The mode the workbench shows: a phone has no room for the two panes side by side, so a remembered
// `split` shows the preview there, and comes back when the window grows. Edit or View chosen on the phone
// are explicit choices, kept at any width.
export function effectiveMode() {
  return NARROW.matches && view.mode === 'split' ? 'view' : view.mode;
}

// Applies the mode, the editor width, the layout and the zoom to the workbench and the controls. Must run
// after every successful render.
export function applyView() {
  document.querySelector('.shell').classList.toggle('sidebar-hidden', !view.sidebar);
  const toggle = document.getElementById('toggleSidebar');
  toggle.setAttribute('aria-expanded', String(view.sidebar));
  toggle.setAttribute('aria-label', t(view.sidebar ? 'Hide sidebar' : 'Show sidebar'));
  toggle.title = toggle.getAttribute('aria-label');
  const workbench = document.querySelector('.workbench');
  const mode = effectiveMode();
  workbench.dataset.mode = mode;
  workbench.style.setProperty('--editor-width', String(view.editorWidth));
  for (const name of MODES) {
    const button = document.getElementById(`mode${name[0].toUpperCase()}${name.slice(1)}`);
    button.classList.toggle('active', name === mode);
    button.setAttribute('aria-pressed', String(name === mode));
  }
  const splitter = document.querySelector('.splitter');
  splitter.setAttribute('aria-valuenow', String(Math.round(view.editorWidth * 100)));
  splitter.setAttribute('aria-label', t('Editor width'));
  splitter.title = t('Drag to resize the editor (arrow keys: 2 % steps, double-click: half)');
  const preview = document.getElementById('preview');
  preview.dataset.layout = view.layout;
  if (view.fit) view.zoom = fitZoom();
  preview.style.zoom = String(view.zoom);
  preview.style.setProperty('--view-zoom', String(view.zoom));
  document.getElementById('zoomValue').textContent = `${Math.round(view.zoom * 100)} %`;
  const single = view.layout === 'single';
  document.getElementById('layoutSingle').classList.toggle('active', single);
  document.getElementById('layoutSingle').setAttribute('aria-pressed', String(single));
  document.getElementById('layoutSpread').classList.toggle('active', !single);
  document.getElementById('layoutSpread').setAttribute('aria-pressed', String(!single));
  document.getElementById('zoomFit').classList.toggle('active', view.fit);
  document.getElementById('zoomFit').setAttribute('aria-pressed', String(view.fit));
  schedulePlacement(preview);
  saveView();
}

// The tools of diagrams and images keep their screen size: once the zoom is applied, they are placed again
// in their page. One pass per frame, however often the view changes (fit mode follows every resize).
let placementFrame = null;
function schedulePlacement(preview) {
  if (placementFrame !== null) return;
  placementFrame = requestAnimationFrame(() => {
    placementFrame = null;
    placeResizables(preview);
  });
}

function setZoom(zoom) {
  view.fit = false;
  view.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
  applyView();
}

function setLayout(layout) {
  view.layout = layout;
  applyView();
}

export function setMode(mode) {
  if (!MODES.includes(mode)) return;
  view.mode = mode;
  applyView();
}

// Shows the editor when the preview is alone, so an insert lands in a visible editor and keeps its undo
// history. Returns whether the mode changed.
export function revealEditor() {
  if (effectiveMode() !== 'view') return false;
  setMode(NARROW.matches ? 'edit' : 'split');
  return true;
}

export function setEditorWidth(width) {
  view.editorWidth = clampWidth(width);
  applyView();
}

// The splitter between the editor and the preview: dragged with the pointer, moved with the keyboard, reset
// to the half with a double click. The ResizeObserver on the preview refits the zoom as it moves.
function bindSplitter() {
  const workbench = document.querySelector('.workbench');
  const splitter = document.querySelector('.splitter');
  const stop = () => workbench.classList.remove('is-resizing');
  splitter.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
    workbench.classList.add('is-resizing');
  });
  splitter.addEventListener('pointermove', event => {
    if (!workbench.classList.contains('is-resizing')) return;
    const box = workbench.getBoundingClientRect();
    if (box.width > 0) setEditorWidth((event.clientX - box.left) / box.width);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) splitter.addEventListener(type, stop);
  splitter.addEventListener('dblclick', () => setEditorWidth(0.5));
  splitter.addEventListener('keydown', event => {
    const steps = { ArrowLeft: -EDITOR_WIDTH_STEP, ArrowRight: EDITOR_WIDTH_STEP };
    let width = null;
    if (event.key in steps) width = view.editorWidth + steps[event.key];
    else if (event.key === 'Home') width = EDITOR_WIDTH_MIN;
    else if (event.key === 'End') width = EDITOR_WIDTH_MAX;
    if (width === null) return;
    event.preventDefault();
    setEditorWidth(width);
  });
}

// Ctrl+Shift+1/2/3 (Cmd+Alt+1/2/3 on macOS) switch the mode, from anywhere in the studio.
function bindModeShortcuts() {
  document.addEventListener('keydown', event => {
    const chord = IS_MAC
      ? event.metaKey && event.altKey && !event.shiftKey
      : event.ctrlKey && event.shiftKey && !event.altKey;
    const match = /^Digit([123])$/.exec(event.code);
    if (!chord || !match) return;
    event.preventDefault();
    setMode(MODES[Number(match[1]) - 1]);
  });
}

// Shows or hides the settings sidebar; in fit mode the ResizeObserver then refits the pages.
export function toggleSidebar() {
  view.sidebar = !view.sidebar;
  applyView();
}

// Restores the saved view and wires the toolbar controls, the splitter, the shortcuts, Ctrl + wheel and the
// fit-on-resize behaviour.
export function initView() {
  document.getElementById('layoutSingle').addEventListener('click', () => setLayout('single'));
  document.getElementById('layoutSpread').addEventListener('click', () => setLayout('spread'));
  document.getElementById('zoomIn').addEventListener('click', () => setZoom(view.zoom + ZOOM_STEP));
  document.getElementById('zoomOut').addEventListener('click', () => setZoom(view.zoom - ZOOM_STEP));
  document.getElementById('zoomFit').addEventListener('click', () => {
    view.fit = true;
    applyView();
  });
  document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);
  document.getElementById('closeSidebar').addEventListener('click', toggleSidebar);
  for (const mode of MODES) {
    const button = document.getElementById(`mode${mode[0].toUpperCase()}${mode.slice(1)}`);
    button.addEventListener('click', () => setMode(mode));
  }
  bindSplitter();
  bindModeShortcuts();
  // Crossing the phone breakpoint changes the effective mode without any resize of the preview. The sidebar
  // becomes a full-screen drawer there: it closes when the window narrows, and comes back as it was (or
  // stays open if it was opened meanwhile) when the window grows.
  let wideSidebar = null;
  NARROW.addEventListener('change', () => {
    if (NARROW.matches) {
      wideSidebar = view.sidebar;
      view.sidebar = false;
    } else if (wideSidebar !== null) {
      view.sidebar = wideSidebar || view.sidebar;
      wideSidebar = null;
    }
    applyView();
  });

  // Ctrl + wheel over the preview zooms the pages instead of the whole studio.
  const shell = document.querySelector('.preview-shell');
  shell.addEventListener(
    'wheel',
    event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
    { passive: false },
  );

  // In fit mode, follow the available width when the window or the sidebar changes size.
  new ResizeObserver(() => {
    if (view.fit) applyView();
  }).observe(shell);

  loadView();
  applyView();
}
