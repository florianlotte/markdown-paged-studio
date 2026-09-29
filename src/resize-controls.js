// Studio-only controls to resize Mermaid diagrams and images directly in the preview. They are added
// after pagination, so they never reach the exported document. The size is not kept here: every change
// rewrites the attributes in the Markdown source (```mermaid width=60% or ![Alt](photo.png){width=60%}).
import { DIAGRAM_WIDTH_MAX, DIAGRAM_WIDTH_MIN, updateFenceAttributes, updateImageAttributes } from './markdown.js';

// What can be resized: where it is, what is drawn, which CSS property previews the width, how it is
// identified across renders, and how a change is written back to the source.
const TARGETS = [
  {
    label: 'Diagram',
    selector: '.mermaid-diagram[data-line]',
    drawing: ':scope > svg',
    widthProperty: '--diagram-width',
    defaultAlign: 'center',
    canAlign: () => true,
    key: element => `diagram:${element.dataset.line}`,
    rewrite: (markdown, data, changes) => updateFenceAttributes(markdown, Number(data.line), changes),
  },
  {
    label: 'Image',
    selector: '.document-image[data-line]',
    drawing: ':scope > img',
    widthProperty: '--image-width',
    defaultAlign: 'left',
    // Only an image alone in its paragraph is a block that can be moved sideways.
    canAlign: element => element.classList.contains('is-block'),
    key: element => `image:${element.dataset.line}:${element.dataset.index}`,
    rewrite: (markdown, data, changes) =>
      updateImageAttributes(markdown, Number(data.line), Number(data.lineEnd), Number(data.index), changes),
  },
];

const PRESETS = [25, 50, 75, 100];
const KEYBOARD_STEP = 5;
const ALIGNMENTS = [
  ['left', 'Align left', 'M3 4h14M3 8h8M3 12h14M3 16h8'],
  ['center', 'Center', 'M3 4h14M6 8h8M3 12h14M6 16h8'],
  ['right', 'Align right', 'M3 4h14M9 8h8M3 12h14M9 16h8'],
];

// Key of the element whose tools stay open without hovering (clicked, or just edited). It is kept across
// renders: attribute changes never move a diagram or an image to another line.
let selectedKey = null;
let listening = false;

function applySelection(preview) {
  for (const element of preview.querySelectorAll('.resizable')) {
    element.classList.toggle('is-selected', element.dataset.resizeKey === selectedKey);
  }
}

function select(preview, key) {
  selectedKey = key;
  applySelection(preview);
}

// Clicking outside a diagram, or Escape, closes the tools of the selected one.
function listenForDeselection(preview) {
  if (listening) return;
  listening = true;
  const clear = () => select(preview, null);
  (preview.closest('.preview-shell') ?? preview).addEventListener('pointerdown', event => {
    if (!event.target.closest('.resizable')) clear();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selectedKey !== null) clear();
  });
}

const clamp = percent => Math.min(DIAGRAM_WIDTH_MAX, Math.max(DIAGRAM_WIDTH_MIN, Math.round(percent)));

function button(label, title, onClick, { pressed } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.title = title;
  el.setAttribute('aria-label', title);
  if (pressed !== undefined) el.setAttribute('aria-pressed', String(pressed));
  if (label instanceof Node) el.append(label);
  else el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

function icon(path) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', path);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.8');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(line);
  return svg;
}

// Width of the drawing as a share of the text column, measured on screen (zoom cancels out in the ratio).
function currentPercent(diagram, drawing) {
  return clamp((drawing.getBoundingClientRect().width / diagram.parentElement.getBoundingClientRect().width) * 100);
}

function enhance(diagram, target, commit, onSelect) {
  const drawing = diagram.querySelector(target.drawing);
  if (!drawing || diagram.querySelector(':scope > .diagram-tools')) return;
  const align = diagram.dataset.align ?? target.defaultAlign;
  const sized = diagram.classList.contains('is-sized');

  const tools = document.createElement('span');
  tools.className = 'diagram-tools';
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', `${target.label} size and alignment`);
  const percent = currentPercent(diagram, drawing);
  for (const preset of PRESETS) {
    tools.append(
      button(`${preset}%`, `Width ${preset} %`, () => commit({ width: `${preset}%` }), {
        pressed: sized && percent === preset,
      }),
    );
  }
  tools.append(button('Auto', 'Natural size', () => commit({ width: null }), { pressed: !sized }));
  if (target.canAlign(diagram)) {
    const separator = document.createElement('span');
    separator.className = 'diagram-tools-separator';
    tools.append(separator);
    for (const [value, title, path] of ALIGNMENTS) {
      tools.append(
        button(icon(path), title, () => commit({ align: value === target.defaultAlign ? null : value }), {
          pressed: align === value,
        }),
      );
    }
  }

  const handle = document.createElement('span');
  handle.className = 'diagram-handle';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', `${target.label} width`);
  handle.setAttribute('aria-valuemin', String(DIAGRAM_WIDTH_MIN));
  handle.setAttribute('aria-valuemax', String(DIAGRAM_WIDTH_MAX));
  handle.setAttribute('aria-valuenow', String(percent));
  handle.setAttribute('aria-valuetext', `${percent} %`);
  handle.title = 'Drag to resize (arrow keys: 5 % steps)';

  // The drawing can be narrower than its container (natural size): place the tools on its edges.
  // Shares of the container width are zoom-independent.
  const place = () => {
    const box = diagram.getBoundingClientRect();
    const inner = drawing.getBoundingClientRect();
    const left = ((inner.left - box.left) / box.width) * 100;
    const right = ((inner.right - box.left) / box.width) * 100;
    handle.style.left = `${align === 'right' ? left : right}%`;
    tools.style.left = `${left}%`;
  };
  place();

  const preview = percentValue => {
    diagram.classList.add('is-sized', 'is-resizing');
    diagram.style.setProperty(target.widthProperty, `${percentValue}%`);
    handle.dataset.value = `${percentValue} %`;
    handle.setAttribute('aria-valuenow', String(percentValue));
    handle.setAttribute('aria-valuetext', `${percentValue} %`);
    place();
  };

  handle.addEventListener('pointerdown', event => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const column = diagram.parentElement.getBoundingClientRect();
    let value = currentPercent(diagram, drawing);
    const move = moveEvent => {
      let pixels;
      if (align === 'left') pixels = moveEvent.clientX - column.left;
      else if (align === 'right') pixels = column.right - moveEvent.clientX;
      else pixels = 2 * Math.abs(moveEvent.clientX - (column.left + column.width / 2));
      value = clamp((pixels / column.width) * 100);
      preview(value);
    };
    const release = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', release);
      handle.removeEventListener('pointercancel', release);
      diagram.classList.remove('is-resizing');
      commit({ width: `${value}%` });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
  });

  handle.addEventListener('keydown', event => {
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    commit({ width: `${clamp(currentPercent(diagram, drawing) + direction * KEYBOARD_STEP)}%` });
  });

  diagram.addEventListener('pointerdown', onSelect);
  diagram.classList.add('resizable');
  diagram.append(tools, handle);
}

// Adds the controls to every rendered diagram and image of the preview. `getMarkdown` returns the current
// source and `applyMarkdown` stores the rewritten one (and triggers a render).
export function enhanceResizables(preview, getMarkdown, applyMarkdown) {
  for (const target of TARGETS) {
    for (const element of preview.querySelectorAll(target.selector)) {
      if (!Number.isInteger(Number(element.dataset.line))) continue;
      const key = target.key(element);
      const data = { ...element.dataset };
      element.dataset.resizeKey = key;
      enhance(
        element,
        target,
        changes => {
          // Keep the tools open on this element after the render triggered by the change.
          select(preview, key);
          applyMarkdown(target.rewrite(getMarkdown(), data, changes));
        },
        () => select(preview, key),
      );
    }
  }
  applySelection(preview);
  listenForDeselection(preview);
}
