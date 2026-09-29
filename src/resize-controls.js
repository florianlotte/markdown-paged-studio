// Studio-only controls to resize Mermaid diagrams and images directly in the preview. They are added
// after pagination, so they never reach the exported document. The size is not kept here: every change
// rewrites the attributes in the Markdown source (```mermaid width=60% or ![Alt](photo.png){width=60%}).
import { t } from './i18n.js';
import { DIAGRAM_WIDTH_MAX, DIAGRAM_WIDTH_MIN, updateFenceAttributes, updateImageAttributes } from './markdown.js';

const BLOCK_ALIGNMENTS = { options: ['left', 'center', 'right'], fallback: 'center' };
const INLINE_ALIGNMENTS = { options: ['inline', 'left', 'center', 'right'], fallback: 'inline' };

// What can be resized: where it is, what is drawn, which CSS property previews the width, how it is
// identified across renders, and how a change is written back to the source.
const TARGETS = [
  {
    label: 'Diagram',
    selector: '.mermaid-diagram[data-line]',
    drawing: ':scope > svg',
    widthProperty: '--diagram-width',
    alignments: () => BLOCK_ALIGNMENTS,
    key: element => `diagram:${element.dataset.line}`,
    rewrite: (markdown, data, changes) => updateFenceAttributes(markdown, Number(data.line), changes),
  },
  {
    label: 'Image',
    selector: '.document-image[data-line]',
    drawing: ':scope > img',
    widthProperty: '--image-width',
    // Alone on its line an image is a block, centered by default. Inside text it stays in the sentence
    // unless it is floated left or right (the text wraps around it) or centered on a line of its own.
    alignments: element => (element.classList.contains('is-block') ? BLOCK_ALIGNMENTS : INLINE_ALIGNMENTS),
    key: element => `image:${element.dataset.line}:${element.dataset.index}`,
    rewrite: (markdown, data, changes) =>
      updateImageAttributes(markdown, Number(data.line), Number(data.lineEnd), Number(data.index), changes),
  },
];

const PRESETS = [25, 50, 75, 100];
const KEYBOARD_STEP = 5;
const ALIGNMENT_BUTTONS = {
  inline: ['In the text', 'M3 4h14M3 16h14M3 10h3M14 10h3M8 8h4v4H8z'],
  left: ['Align left', 'M3 4h14M3 8h8M3 12h14M3 16h8'],
  center: ['Center', 'M3 4h14M6 8h8M3 12h14M6 16h8'],
  right: ['Align right', 'M3 4h14M9 8h8M3 12h14M9 16h8'],
};

// Key of the element whose tools stay open without hovering (clicked, or just edited). It is kept across
// renders: attribute changes never move a diagram or an image to another line.
let selectedKey = null;
let listening = false;
// Key of the element whose handle was driven from the keyboard: the render that follows replaces the
// handle, and the new one takes the focus so the arrow keys can go on.
let keyboardKey = null;

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
  const clear = () => {
    keyboardKey = null;
    select(preview, null);
  };
  (preview.closest('.preview-shell') ?? preview).addEventListener('pointerdown', event => {
    if (!event.target.closest('.resizable')) clear();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && selectedKey !== null) clear();
  });
  // Any click ends the keyboard session of a handle.
  document.addEventListener('pointerdown', () => (keyboardKey = null), true);
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

// The text column an element is laid out in: the content box of its nearest ancestor that is not inline
// (a paragraph, a list item, a table cell...), in screen pixels. Links and emphasis around an image are
// inline and do not count. Computed paddings are layout pixels: the preview zoom scales them on screen.
function columnBox(element) {
  let block = element.parentElement;
  while (block?.parentElement && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
  const zoom = Number(getComputedStyle(element).getPropertyValue('--view-zoom')) || 1;
  const style = getComputedStyle(block);
  const edge = side => (parseFloat(style[`padding${side}`]) + parseFloat(style[`border${side}Width`])) * zoom;
  const box = block.getBoundingClientRect();
  const left = box.left + edge('Left');
  const right = box.right - edge('Right');
  return { left, right, width: right - left };
}

// Width of the drawing as a share of the text column, measured on screen (zoom cancels out in the ratio).
function currentPercent(diagram, drawing) {
  return clamp((drawing.getBoundingClientRect().width / columnBox(diagram).width) * 100);
}

function enhance(diagram, target, commit, onSelect) {
  const drawing = diagram.querySelector(target.drawing);
  if (!drawing || diagram.querySelector(':scope > .diagram-tools')) return;
  const { options, fallback } = target.alignments(diagram);
  const align = diagram.dataset.align ?? fallback;
  const sized = diagram.classList.contains('is-sized');

  const tools = document.createElement('span');
  tools.className = 'diagram-tools';
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', t(`${target.label} size and alignment`));
  const percent = currentPercent(diagram, drawing);
  for (const preset of PRESETS) {
    tools.append(
      button(`${preset}%`, t('Width {percent} %', { percent: preset }), () => commit({ width: `${preset}%` }), {
        pressed: sized && percent === preset,
      }),
    );
  }
  tools.append(button(t('Auto'), t('Natural size'), () => commit({ width: null }), { pressed: !sized }));
  const separator = document.createElement('span');
  separator.className = 'diagram-tools-separator';
  tools.append(separator);
  for (const value of options) {
    const [title, path] = ALIGNMENT_BUTTONS[value];
    // The default position is the absence of attribute.
    tools.append(
      button(icon(path), t(title), () => commit({ align: value === fallback ? null : value }), {
        pressed: align === value,
      }),
    );
  }

  const handle = document.createElement('span');
  handle.className = 'diagram-handle';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', t(`${target.label} width`));
  handle.setAttribute('aria-valuemin', String(DIAGRAM_WIDTH_MIN));
  handle.setAttribute('aria-valuemax', String(DIAGRAM_WIDTH_MAX));
  handle.setAttribute('aria-valuenow', String(percent));
  handle.setAttribute('aria-valuetext', `${percent} %`);
  handle.title = t('Drag to resize (arrow keys: 5 % steps)');

  // The drawing can be narrower than its container (natural size): place the tools on its edges.
  // Shares of the container width are zoom-independent.
  const place = () => {
    const box = diagram.getBoundingClientRect();
    const inner = drawing.getBoundingClientRect();
    const left = ((inner.left - box.left) / box.width) * 100;
    const right = ((inner.right - box.left) / box.width) * 100;
    handle.style.left = `${align === 'right' ? left : right}%`;
    // Halfway up the drawing, not the container: a caption makes the container taller.
    handle.style.top = `${((inner.top - box.top + inner.height / 2) / box.height) * 100}%`;
    // The toolbar starts at the left edge of the drawing, unless it would then stick out of the page:
    // in that case it ends at the right edge of the drawing instead.
    tools.style.right = 'auto';
    tools.style.left = `${left}%`;
    const sheet = diagram.closest('.pagedjs_page')?.getBoundingClientRect();
    if (sheet && tools.getBoundingClientRect().right > sheet.right - 4) {
      tools.style.left = 'auto';
      tools.style.right = `${100 - right}%`;
    }
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
    const column = columnBox(diagram);
    const start = drawing.getBoundingClientRect();
    let value = currentPercent(diagram, drawing);
    const move = moveEvent => {
      let pixels;
      if (align === 'left') pixels = moveEvent.clientX - column.left;
      else if (align === 'right') pixels = column.right - moveEvent.clientX;
      // In the text the left edge stays where the sentence put it.
      else if (align === 'inline') pixels = moveEvent.clientX - start.left;
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
    // After the commit: writing the change into the editor takes the focus away for an instant.
    keyboardKey = diagram.dataset.resizeKey;
  });
  handle.addEventListener('blur', event => {
    // Moving the focus elsewhere ends the keyboard session. A handle replaced by a render also loses the
    // focus, but to nothing.
    if (event.relatedTarget) keyboardKey = null;
  });

  diagram.addEventListener('pointerdown', onSelect);
  // Selecting an image that is inside a link must not follow the link.
  if (diagram.closest('a')) diagram.addEventListener('click', event => event.preventDefault());
  diagram.classList.add('resizable');
  diagram.append(tools, handle);
  // Now that the toolbar is laid out, its width is known: check that it fits in the page.
  place();
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
  // Once selected, the handle is visible and can take the focus.
  if (keyboardKey !== null) {
    const handle = [...preview.querySelectorAll('.resizable')]
      .find(element => element.dataset.resizeKey === keyboardKey)
      ?.querySelector(':scope > .diagram-handle');
    if (handle) handle.focus({ preventScroll: true });
    else keyboardKey = null;
  }
}
