// Studio-only controls to resize Mermaid diagrams directly in the preview. They are added after
// pagination, so they never reach the exported document. The size is not kept here: every change rewrites
// the attributes of the diagram's fence line in the Markdown source (```mermaid width=60% align=left).
import { DIAGRAM_WIDTH_MAX, DIAGRAM_WIDTH_MIN, updateFenceAttributes } from './markdown.js';

const PRESETS = [25, 50, 75, 100];
const KEYBOARD_STEP = 5;
const ALIGNMENTS = [
  ['left', 'Align left', 'M3 4h14M3 8h8M3 12h14M3 16h8'],
  ['center', 'Center', 'M3 4h14M6 8h8M3 12h14M6 16h8'],
  ['right', 'Align right', 'M3 4h14M9 8h8M3 12h14M9 16h8'],
];

// Source line of the diagram whose tools stay open without hovering (clicked, or just edited). It is
// kept across renders: attribute changes never move a fence to another line.
let selectedLine = null;
let listening = false;

function applySelection(preview) {
  for (const diagram of preview.querySelectorAll('.mermaid-diagram[data-line]')) {
    diagram.classList.toggle('is-selected', Number(diagram.dataset.line) === selectedLine);
  }
}

function select(preview, line) {
  selectedLine = line;
  applySelection(preview);
}

// Clicking outside a diagram, or Escape, closes the tools of the selected one.
function listenForDeselection(preview) {
  if (listening) return;
  listening = true;
  const clear = () => select(preview, null);
  (preview.closest('.preview-shell') ?? preview).addEventListener('pointerdown', event => {
    if (!event.target.closest('.mermaid-diagram')) clear();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selectedLine !== null) clear();
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

function enhance(diagram, commit, onSelect) {
  const drawing = diagram.querySelector(':scope > svg');
  if (!drawing || diagram.querySelector(':scope > .diagram-tools')) return;
  const align = diagram.dataset.align ?? 'center';
  const sized = diagram.classList.contains('is-sized');

  const tools = document.createElement('div');
  tools.className = 'diagram-tools';
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', 'Diagram size and alignment');
  const percent = currentPercent(diagram, drawing);
  for (const preset of PRESETS) {
    tools.append(
      button(`${preset}%`, `Width ${preset} %`, () => commit({ width: `${preset}%` }), {
        pressed: sized && percent === preset,
      }),
    );
  }
  tools.append(button('Auto', 'Natural size', () => commit({ width: null }), { pressed: !sized }));
  const separator = document.createElement('span');
  separator.className = 'diagram-tools-separator';
  tools.append(separator);
  for (const [value, title, path] of ALIGNMENTS) {
    tools.append(
      button(icon(path), title, () => commit({ align: value === 'center' ? null : value }), {
        pressed: align === value,
      }),
    );
  }

  const handle = document.createElement('span');
  handle.className = 'diagram-handle';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', 'Diagram width');
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
    diagram.style.setProperty('--diagram-width', `${percentValue}%`);
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
  diagram.append(tools, handle);
}

// Adds the controls to every rendered diagram of the preview. `getMarkdown` returns the current source and
// `applyMarkdown` stores the rewritten one (and triggers a render).
export function enhanceDiagrams(preview, getMarkdown, applyMarkdown) {
  for (const diagram of preview.querySelectorAll('.mermaid-diagram[data-line]')) {
    const line = Number(diagram.dataset.line);
    if (!Number.isInteger(line)) continue;
    enhance(
      diagram,
      changes => {
        // Keep the tools open on this diagram after the render triggered by the change.
        select(preview, line);
        applyMarkdown(updateFenceAttributes(getMarkdown(), line, changes));
      },
      () => select(preview, line),
    );
  }
  applySelection(preview);
  listenForDeselection(preview);
}
