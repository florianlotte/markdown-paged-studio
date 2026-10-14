// The attributes the studio writes into the Markdown source for a diagram or an image: `width`, `align`,
// `caption` and the label on a ```mermaid fence line, the same words in braces after an image. Pure:
// parsing, and the rewriting of one line or one image of a text (what the preview controls do).
import { parseLabel } from './crossref.js';
import { clamp } from './util.js';

// A caption is one line of text: longer ones are cut.
export const CAPTION_MAX_LENGTH = 300;

const WIDTH_PERCENT = /^(\d{1,3}(?:\.\d+)?)%$/;
const WIDTH_MM = /^(\d{1,3}(?:\.\d+)?)mm$/;
const ALIGNMENTS = ['left', 'center', 'right'];
// One attribute: key=value or key="a value with spaces"; or a bare word.
const ATTRIBUTE = /([\w-]+)=("[^"]*"|\S+)|\S+/g;
export const DIAGRAM_WIDTH_MIN = 10;
export const DIAGRAM_WIDTH_MAX = 100;

// Attributes after the language on the fence line: "width=60% align=left" -> { width: '60%', align: 'left' }.
// `width` is a share of the text column (10 to 100 %) or an absolute size in mm, `caption` a text shown
// under the drawing (in double quotes when it holds spaces), `#fig:name` its label for cross-references;
// anything else is ignored.
export function parseDiagramAttributes(text) {
  const out = {};
  for (const [word, key, value] of String(text ?? '').matchAll(ATTRIBUTE)) {
    if (!key) {
      // A bare word: the label of the figure, #fig:name.
      const label = parseLabel(word);
      if (label?.kind === 'fig') out.label = label.name;
      continue;
    }
    if (key === 'caption') {
      const caption = value.replace(/^"|"$/g, '').trim().slice(0, CAPTION_MAX_LENGTH);
      if (caption) out.caption = caption;
    } else if (key === 'width') {
      const percent = WIDTH_PERCENT.exec(value);
      const mm = WIDTH_MM.exec(value);
      if (percent) out.width = `${clamp(Number(percent[1]), DIAGRAM_WIDTH_MIN, DIAGRAM_WIDTH_MAX)}%`;
      else if (mm) out.width = `${clamp(Number(mm[1]), 10, 400)}mm`;
    } else if (key === 'align' && ALIGNMENTS.includes(value)) {
      out.align = value;
    }
  }
  return out;
}

// Rewrites the attributes of the mermaid fence opening at `line` (0-based) in `markdown`. A value of null
// removes the attribute. Attributes this function does not know are kept. Returns `markdown` unchanged when
// the line is not a mermaid fence.
export function updateFenceAttributes(markdown, line, changes) {
  const lines = String(markdown).split('\n');
  const raw = lines[line];
  if (raw === undefined) return markdown;
  const carriageReturn = raw.endsWith('\r') ? '\r' : '';
  const match = /^(.*?(?:`{3,}|~{3,})[ \t]*)(\S+)(.*)$/.exec(carriageReturn ? raw.slice(0, -1) : raw);
  if (!match || match[2].toLowerCase() !== 'mermaid') return markdown;
  const suffix = mergeAttributes(match[3], changes)
    .map(part => ` ${part}`)
    .join('');
  lines[line] = `${match[1]}${match[2]}${suffix}${carriageReturn}`;
  return lines.join('\n');
}

// "width=30% theme=dark" + { width: '60%', align: 'left' } -> ['width=60%', 'theme=dark', 'align=left'].
// A change of null removes the attribute; attributes that are not changed are kept as written.
function mergeAttributes(text, changes) {
  const attributes = new Map();
  for (const [part] of String(text ?? '').matchAll(ATTRIBUTE)) {
    const separator = part.indexOf('=');
    attributes.set(separator < 1 ? part : part.slice(0, separator), separator < 1 ? null : part.slice(separator + 1));
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined) attributes.delete(key);
    else attributes.set(key, String(value));
  }
  return [...attributes].map(([key, value]) => (value === null ? key : `${key}=${value}`));
}

// ---- Images: ![Alt](any/path/photo.png){width=60% align=left}

// Index of the bracket closing the one at `start`, honouring nesting and backslash escapes; -1 if none.
function matchBracket(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') i++;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return i;
  }
  return -1;
}

// Positions of the images written in a block of Markdown source, in order, skipping inline code.
// `end` is the offset just after the image; `attributes` the text between the braces that follow, if any.
function scanImages(block, references) {
  const found = [];
  let i = 0;
  while (i < block.length) {
    const char = block[i];
    if (char === '\\') {
      i += 2;
    } else if (char === '`') {
      let run = 1;
      while (block[i + run] === '`') run++;
      const close = block.indexOf('`'.repeat(run), i + run);
      i = close === -1 ? i + run : close + run;
    } else if (char === '!' && block[i + 1] === '[') {
      const label = matchBracket(block, i + 1, '[', ']');
      let end = -1;
      if (label !== -1) {
        if (block[label + 1] === '(') end = matchBracket(block, label + 1, '(', ')');
        else if (block[label + 1] === '[') end = matchBracket(block, label + 1, '[', ']');
        else if (
          references.has(
            block
              .slice(i + 2, label)
              .trim()
              .toLowerCase(),
          )
        )
          end = label;
      }
      if (end === -1) {
        i += 2;
        continue;
      }
      const braces = /^\{([^{}\n]*)\}/.exec(block.slice(end + 1));
      found.push({ end: end + 1, attributes: braces ? braces[1] : '', length: braces ? braces[0].length : 0 });
      i = end + 1 + (braces ? braces[0].length : 0);
    } else {
      i++;
    }
  }
  return found;
}

// Rewrites the attributes of the image number `index` (0-based) of the block spanning the source lines
// [lineStart, lineEnd). Same rules as updateFenceAttributes; the braces disappear when nothing is left.
export function updateImageAttributes(markdown, lineStart, lineEnd, index, changes) {
  const lines = String(markdown).split('\n');
  if (!Number.isInteger(lineStart) || lineStart < 0 || lineStart >= lines.length) return markdown;
  const last = Math.min(lines.length, Math.max(lineStart + 1, Number.isInteger(lineEnd) ? lineEnd : lineStart + 1));
  const block = lines.slice(lineStart, last).join('\n');
  const references = new Set(
    [...String(markdown).matchAll(/^ {0,3}\[([^\]\n]+)\]:/gm)].map(match => match[1].trim().toLowerCase()),
  );
  const image = scanImages(block, references)[index];
  if (!image) return markdown;
  const attributes = mergeAttributes(image.attributes, changes);
  const braces = attributes.length ? `{${attributes.join(' ')}}` : '';
  const rewritten = block.slice(0, image.end) + braces + block.slice(image.end + image.length);
  lines.splice(lineStart, last - lineStart, ...rewritten.split('\n'));
  return lines.join('\n');
}
