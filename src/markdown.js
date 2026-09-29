// Markdown parsing and Mermaid diagrams. Diagrams are rendered to inline SVG before pagination because
// Paged.js needs their final size to lay out pages.
import MarkdownIt from 'markdown-it';
import { escapeHtml } from './escape.js';

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
  const attributes = new Map();
  for (const part of match[3].trim().split(/\s+/).filter(Boolean)) {
    const separator = part.indexOf('=');
    attributes.set(separator < 1 ? part : part.slice(0, separator), separator < 1 ? null : part.slice(separator + 1));
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined) attributes.delete(key);
    else attributes.set(key, String(value));
  }
  const suffix = [...attributes].map(([key, value]) => (value === null ? ` ${key}` : ` ${key}=${value}`)).join('');
  lines[line] = `${match[1]}${match[2]}${suffix}${carriageReturn}`;
  return lines.join('\n');
}

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
