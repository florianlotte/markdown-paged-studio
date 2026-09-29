// Markdown parsing, images and Mermaid diagrams. Diagrams are rendered to inline SVG before pagination
// because Paged.js needs their final size to lay out pages; images are resolved by file name from the
// image library and inlined as data URLs.
import MarkdownIt from 'markdown-it';
import { escapeHtml } from './escape.js';
import { findImage, imageName, isExternalSource } from './images.js';

export const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

const WIDTH_PERCENT = /^(\d{1,3}(?:\.\d+)?)%$/;
const WIDTH_MM = /^(\d{1,3}(?:\.\d+)?)mm$/;
const ALIGNMENTS = ['left', 'center', 'right'];
export const DIAGRAM_WIDTH_MIN = 10;
export const DIAGRAM_WIDTH_MAX = 100;

// Attributes after the language on the fence line: "width=60% align=left" -> { width: '60%', align: 'left' }.
// `width` is a share of the text column (10 to 100 %) or an absolute size in mm; anything else is ignored.
export function parseDiagramAttributes(text) {
  const out = {};
  for (const part of String(text ?? '')
    .trim()
    .split(/\s+/)) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === 'width') {
      const percent = WIDTH_PERCENT.exec(value);
      const mm = WIDTH_MM.exec(value);
      if (percent) out.width = `${Math.min(DIAGRAM_WIDTH_MAX, Math.max(DIAGRAM_WIDTH_MIN, Number(percent[1])))}%`;
      else if (mm) out.width = `${Math.min(400, Math.max(10, Number(mm[1])))}mm`;
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
  for (const part of String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)) {
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

// Gives every image its position in the source (block lines, rank in the block) and consumes the
// {attributes} written right after it. Runs before the typographic replacements touch that text.
md.core.ruler.after('inline', 'image_attributes', state => {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    let index = 0;
    block.children.forEach((child, position) => {
      if (child.type !== 'image') return;
      child.meta = { line: block.map?.[0] ?? null, lineEnd: block.map?.[1] ?? null, index: index++ };
      const next = block.children[position + 1];
      const braces = next?.type === 'text' ? /^\{([^{}\n]*)\}/.exec(next.content) : null;
      if (!braces) return;
      Object.assign(child.meta, parseDiagramAttributes(braces[1]));
      next.content = next.content.slice(braces[0].length);
    });
    // An image alone in its paragraph behaves as a block: it can be aligned.
    const content = block.children.filter(child => !(child.type === 'text' && !child.content.trim()));
    if (content.length === 1 && content[0].type === 'image') content[0].meta.alone = true;
  }
});

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const source = token.attrGet('src') ?? '';
  const meta = token.meta ?? {};
  let resolved = source;
  if (!isExternalSource(source)) {
    const image = findImage(source);
    if (!image) {
      const name = escapeHtml(imageName(source) || source);
      return `<span class="image-missing" data-image="${name}">Missing image: ${name}</span>`;
    }
    resolved = image.dataUrl;
  }
  const classes = ['document-image', meta.width ? 'is-sized' : '', meta.alone ? 'is-block' : ''];
  const attributes = [
    `class="${classes.filter(Boolean).join(' ')}"`,
    Number.isInteger(meta.line) ? `data-line="${meta.line}" data-line-end="${meta.lineEnd}"` : '',
    Number.isInteger(meta.line) ? `data-index="${meta.index}"` : '',
    meta.width ? `style="--image-width: ${meta.width}"` : '',
    meta.align ? `data-align="${meta.align}"` : '',
  ];
  const title = token.attrGet('title');
  const alt = self.renderInlineAsText(token.children ?? [], options, env);
  const image = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`;
  return `<span ${attributes.filter(Boolean).join(' ')}>${image}</span>`;
};

// ```mermaid fences become placeholders; renderDiagrams() turns them into inline SVG. The placeholder keeps
// the size and alignment asked on the fence line, and the source line so the preview can rewrite it.
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const [language = '', ...rest] = token.info.trim().split(/\s+/);
  if (language.toLowerCase() === 'mermaid') {
    const { width, align } = parseDiagramAttributes(rest.join(' '));
    const attributes = [
      `class="mermaid-diagram${width ? ' is-sized' : ''}"`,
      `data-source="${escapeHtml(token.content)}"`,
      token.map ? `data-line="${token.map[0]}"` : '',
      width ? `style="--diagram-width: ${width}"` : '',
      align ? `data-align="${align}"` : '',
    ];
    return `<div ${attributes.filter(Boolean).join(' ')}></div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

let mermaidPromise = null;
// Mermaid weighs several MB, so it is only loaded the first time a document contains a diagram.
function loadMermaid() {
  mermaidPromise ??= import('mermaid')
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'Inter, Arial, sans-serif',
        // Pure SVG text instead of foreignObject labels: more reliable in print and in the exported file.
        htmlLabels: false,
      });
      return mermaid;
    })
    .catch(error => {
      mermaidPromise = null;
      throw error;
    });
  return mermaidPromise;
}

// Rendered SVG per diagram source, so retyping elsewhere in the document does not re-render every diagram.
const diagramCache = new Map();
let diagramCounter = 0;

async function diagramSvg(mermaid, source) {
  if (diagramCache.has(source)) return diagramCache.get(source);
  const id = `mermaid-${++diagramCounter}`;
  let html;
  try {
    // parse() reports syntax errors without touching the DOM; render() on bad input leaves temp nodes behind.
    await mermaid.parse(source);
    const { svg } = await mermaid.render(id, source);
    html = svg;
  } catch (error) {
    html = `<pre class="mermaid-error">${escapeHtml(error?.message || String(error))}\n\n${escapeHtml(source)}</pre>`;
  } finally {
    // Mermaid renders inside temporary containers named after the id; make sure none survives a failure.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(`i${id}`)?.remove();
  }
  if (diagramCache.size >= 100) diagramCache.clear();
  diagramCache.set(source, html);
  return html;
}

// Replace every mermaid placeholder in `html` with its rendered SVG. Returns `html` untouched when there is none.
export async function renderDiagrams(html) {
  if (!html.includes('class="mermaid-diagram')) return html;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const mermaid = await loadMermaid();
  for (const node of wrap.querySelectorAll('.mermaid-diagram')) {
    const source = node.dataset.source ?? '';
    delete node.dataset.source;
    node.innerHTML = await diagramSvg(mermaid, source);
  }
  return wrap.innerHTML;
}
