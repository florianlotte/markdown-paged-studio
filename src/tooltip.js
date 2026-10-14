// Tooltips of the studio chrome: the `title` of a control, shown under it on hover and on keyboard focus
// (the native tooltip only shows on hover, and never on a touch screen), with the shortcut of the control
// when it has one (`data-shortcut`, see shortcuts.js). The `title` attribute stays the source of the text:
// it is taken away while the mouse is over the control, so the native tooltip does not show as well, and
// put back when the mouse leaves.
import { shortcutOf } from './shortcuts.js';

const SHOW_DELAY_MS = 400;
const GAP_PX = 6;
// The document in the preview keeps its native tooltips (a link written with a title); the tools laid over
// the pages are chrome. A dialog sits in the top layer, above the tooltip box: its controls keep the native
// tooltip (they all carry an aria-label).
const CHROME_TOOL = '.diagram-tools, .diagram-handle';

let box = null;
let shown = null;
let stashed = null;
let timer = 0;

const target = node => {
  const element = node?.closest?.('[title], [data-tooltip-stash]');
  if (!element || !element.isConnected) return null;
  if (element.closest('#preview') && !element.closest(CHROME_TOOL)) return null;
  if (element.closest('dialog[open]')) return null;
  return element;
};

const textOf = element => element.dataset.tooltipStash ?? element.getAttribute('title') ?? '';

function place(element) {
  const anchor = element.getBoundingClientRect();
  const tip = box.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - tip.width / 2, innerWidth - tip.width - 8));
  const below = anchor.bottom + GAP_PX;
  const top = below + tip.height > innerHeight - 8 ? anchor.top - GAP_PX - tip.height : below;
  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(Math.max(8, top))}px`;
}

function show(element) {
  const text = textOf(element);
  if (!text) return;
  shown = element;
  box.querySelector('.tooltip-text').textContent = text;
  const kbd = box.querySelector('kbd');
  const shortcut = shortcutOf(element);
  kbd.textContent = shortcut;
  kbd.hidden = !shortcut;
  box.hidden = false;
  place(element);
}

function hide() {
  clearTimeout(timer);
  timer = 0;
  if (shown) box.hidden = true;
  shown = null;
}

// The native tooltip is kept away by moving the title aside for the time the mouse is over the control.
function stash(element) {
  if (stashed === element) return;
  restore();
  if (!element.hasAttribute('title')) return;
  stashed = element;
  element.dataset.tooltipStash = element.getAttribute('title');
  element.removeAttribute('title');
}

function restore() {
  if (!stashed) return;
  if (stashed.dataset.tooltipStash !== undefined) {
    stashed.setAttribute('title', stashed.dataset.tooltipStash);
    delete stashed.dataset.tooltipStash;
  }
  stashed = null;
}

export function initTooltips() {
  box = document.getElementById('tooltip');
  document.addEventListener('mouseover', event => {
    // A tap synthesises a mouseover: no tooltip where nothing hovers.
    if (matchMedia('(hover: none)').matches) return;
    const element = target(event.target);
    if (!element) return;
    if (element === shown) return;
    stash(element);
    clearTimeout(timer);
    timer = setTimeout(() => show(element), SHOW_DELAY_MS);
  });
  document.addEventListener('mouseout', event => {
    const element = target(event.target);
    if (!element || element.contains(event.relatedTarget)) return;
    hide();
    restore();
  });
  // Keyboard focus shows the tooltip at once; a focus given by a click does not (focus-visible).
  document.addEventListener('focusin', event => {
    const element = target(event.target);
    if (!element || !element.matches(':focus-visible')) return;
    clearTimeout(timer);
    show(element);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  // The control may move (a render, a resize): the tooltip follows or goes.
  addEventListener('scroll', hide, true);
  addEventListener('resize', hide);
}
