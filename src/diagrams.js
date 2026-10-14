// Mermaid diagrams: the ```mermaid placeholders of markdown.js become inline SVG here, before pagination,
// so the drawing is part of the HTML handed to Paged.js and to the exports. Mermaid itself is loaded on
// demand, the SVG of each source is cached, and the labels go through diagram-labels.js.
import { escapeHtml } from './escape.js';
import { markLabels, stripMarks, styleLabels } from './diagram-labels.js';
import { outputOf, rootOf } from './fragment.js';
import { lazy } from './util.js';

// Mermaid weighs several MB, so it is only loaded the first time a document contains a diagram.
const loadMermaid = lazy(() =>
  import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
      fontFamily: 'Inter, Arial, sans-serif',
      // Pure SVG text instead of foreignObject labels: more reliable in print and in the exported file.
      htmlLabels: false,
    });
    return mermaid;
  }),
);

// Rendered SVG per diagram source, so retyping elsewhere in the document does not re-render every diagram.
const diagramCache = new Map();
let diagramCounter = 0;

async function diagramSvg(mermaid, source) {
  if (diagramCache.has(source)) return diagramCache.get(source);
  const id = `mermaid-${++diagramCounter}`;
  // The HTML tags of the labels, which SVG text cannot show: bold and italic become marks, the rest is dropped.
  const text = markLabels(source);
  let html;
  try {
    // parse() reports syntax errors without touching the DOM; render() on bad input leaves temp nodes behind.
    await mermaid.parse(text);
    const { svg } = await mermaid.render(id, text);
    const drawing = document.createElement('div');
    drawing.innerHTML = svg;
    styleLabels(drawing);
    html = stripMarks(drawing.innerHTML);
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

// Replaces every mermaid placeholder with its rendered SVG, in an HTML string or in a template made by
// fragmentOf() (returned as given). Nothing changes when there is no diagram.
export async function renderDiagrams(html) {
  const root = rootOf(html);
  if (!root.content.querySelector('.mermaid-diagram')) return html;
  const mermaid = await loadMermaid();
  for (const node of root.content.querySelectorAll('.mermaid-diagram')) {
    const source = node.dataset.source ?? '';
    delete node.dataset.source;
    node.innerHTML = await diagramSvg(mermaid, source);
    if (node.dataset.caption || node.dataset.captionLabel) {
      const caption = document.createElement('div');
      caption.className = 'diagram-caption';
      if (node.dataset.captionLabel) {
        const label = document.createElement('span');
        label.className = 'caption-label';
        label.textContent = node.dataset.captionLabel;
        caption.append(label);
      }
      caption.append(node.dataset.caption ?? '');
      delete node.dataset.caption;
      delete node.dataset.captionLabel;
      node.append(caption);
    }
  }
  return outputOf(html, root);
}
