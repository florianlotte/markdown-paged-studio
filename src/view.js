// Preview view settings: page layout (one column or two pages side by side) and zoom. Stored apart from the
// document, they are not part of the config JSON. Zoom uses the CSS `zoom` property so the scrollable area
// follows the scale.
const VIEW_KEY = 'markdown-paged-studio:view';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const PAGE_GAP_PX = 24; // must match the `gap` of `.preview .pagedjs_pages` in ui.css

const view = { layout: 'single', zoom: 1, fit: true, sidebar: true };

function loadView() {
  try {
    const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
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
  const zoom = available / (pageWidth * columns + PAGE_GAP_PX * (columns - 1));
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

// Applies layout and zoom to the preview and the controls. Must run after every successful render.
export function applyView() {
  document.querySelector('.shell').classList.toggle('sidebar-hidden', !view.sidebar);
  const toggle = document.getElementById('toggleSidebar');
  toggle.setAttribute('aria-expanded', String(view.sidebar));
  toggle.setAttribute('aria-label', view.sidebar ? 'Hide sidebar' : 'Show sidebar');
  toggle.title = toggle.getAttribute('aria-label');
  const preview = document.getElementById('preview');
  preview.dataset.layout = view.layout;
  if (view.fit) view.zoom = fitZoom();
  preview.style.zoom = String(view.zoom);
  document.getElementById('zoomValue').textContent = `${Math.round(view.zoom * 100)} %`;
  const single = view.layout === 'single';
  document.getElementById('layoutSingle').classList.toggle('active', single);
  document.getElementById('layoutSingle').setAttribute('aria-pressed', String(single));
  document.getElementById('layoutSpread').classList.toggle('active', !single);
  document.getElementById('layoutSpread').setAttribute('aria-pressed', String(!single));
  document.getElementById('zoomFit').classList.toggle('active', view.fit);
  document.getElementById('zoomFit').setAttribute('aria-pressed', String(view.fit));
  saveView();
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

// Shows or hides the settings sidebar; in fit mode the ResizeObserver then refits the pages.
export function toggleSidebar() {
  view.sidebar = !view.sidebar;
  applyView();
}

// Restores the saved view and wires the toolbar controls, Ctrl + wheel and the fit-on-resize behaviour.
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
