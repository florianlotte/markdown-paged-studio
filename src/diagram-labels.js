// HTML tags in the labels of Mermaid diagrams. The diagrams are drawn as SVG text (no HTML labels, which print
// less reliably), and in that mode Mermaid only understands `<br>`: every other tag comes out as text. Before
// the render, `markLabels()` turns the bold and italic tags into invisible marks glued to the words, so Mermaid
// measures and wraps the visible text alone, and drops the other tags; after the render, `styleLabels()` turns
// the marks back into styled `<tspan>` elements. Nothing here touches the browser at import time.

// Default-ignorable characters: zero width when measured, never typed in a label. Bold and italic each have an
// opening and a closing mark.
export const MARKS = { boldOpen: '⁡', boldClose: '⁢', italicOpen: '⁣', italicClose: '⁤' };
const MARK_CHARS = /[⁡-⁤]/g;
const SPLIT_AT_MARKS = /([⁡-⁤])/;
const BREAK = /(<br\s*\/?>)/i;
// Italic first, so a bold tag wrapping an italic one is seen once the inner pair is gone.
const STYLES = [
  { tags: 'i|em', open: MARKS.italicOpen, close: MARKS.italicClose },
  { tags: 'b|strong', open: MARKS.boldOpen, close: MARKS.boldClose },
];
// Any other tag, opening or closing, with or without attributes; `<br>` stays for Mermaid. Arrows (`-->`,
// `<-->`), comparisons (`a < b`) and entities (`&lt;`) do not match.
const OTHER_TAG = /<\/?(?!br\b)[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi;

// Marks the bold and italic pairs of one line and drops the other tags. A pair must close on its line; a `<br>`
// inside it closes and reopens the marks, because some diagrams draw one `<text>` per line.
function markLine(line) {
  let text = line.replace(MARK_CHARS, '');
  for (const { tags, open, close } of STYLES) {
    const pair = new RegExp(`<(${tags})>(.*?)</\\1>`, 'gi');
    let previous;
    do {
      previous = text;
      text = text.replace(pair, (_, tag, inner) =>
        inner
          .split(BREAK)
          .map((part, index) => (index % 2 === 0 && part ? `${open}${part}${close}` : part))
          .join(''),
      );
    } while (text !== previous);
  }
  return text.replace(OTHER_TAG, '');
}

// The Mermaid source with its HTML tags replaced by marks (bold, italic) or dropped (the rest).
export function markLabels(source) {
  if (!source.includes('<')) return source;
  return source.split('\n').map(markLine).join('\n');
}

export const stripMarks = text => text.replace(MARK_CHARS, '');

const textNodes = node => [...node.childNodes].flatMap(child => (child.nodeType === 3 ? [child] : textNodes(child)));

const styleOf = state =>
  [state.bold ? 'font-weight: bold' : '', state.italic ? 'font-style: italic' : ''].filter(Boolean).join('; ');

// Replaces the marks of every `<text>` of a rendered SVG with styled `<tspan>` elements. Inline styles: the
// tspans of Mermaid carry `font-weight="normal"` as an attribute and its stylesheet styles them by class.
export function styleLabels(root) {
  const doc = root.ownerDocument;
  for (const text of root.querySelectorAll('text')) {
    const state = { bold: false, italic: false };
    for (const node of textNodes(text)) {
      if (!SPLIT_AT_MARKS.test(node.data) && !state.bold && !state.italic) continue;
      const fragment = doc.createDocumentFragment();
      for (const part of node.data.split(SPLIT_AT_MARKS)) {
        if (part === MARKS.boldOpen) state.bold = true;
        else if (part === MARKS.boldClose) state.bold = false;
        else if (part === MARKS.italicOpen) state.italic = true;
        else if (part === MARKS.italicClose) state.italic = false;
        else if (part && (state.bold || state.italic)) {
          const span = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          span.setAttribute('style', styleOf(state));
          span.textContent = part;
          fragment.append(span);
        } else if (part) fragment.append(doc.createTextNode(part));
      }
      node.replaceWith(fragment);
    }
  }
}
