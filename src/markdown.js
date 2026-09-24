// Markdown parsing and Mermaid diagrams. Diagrams are rendered to inline SVG before pagination because
// Paged.js needs their final size to lay out pages.
import MarkdownIt from 'markdown-it';
import { escapeHtml } from './escape.js';

export const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

// ```mermaid fences become placeholders; renderDiagrams() turns them into inline SVG.
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim().toLowerCase() === 'mermaid') {
    return `<div class="mermaid-diagram" data-source="${escapeHtml(token.content)}"></div>\n`;
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
  if (!html.includes('class="mermaid-diagram"')) return html;
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
