// Mermaid diagrams: the ```mermaid placeholders of markdown.js become inline SVG here, before pagination,
// so the drawing is part of the HTML handed to Paged.js and to the exports. Mermaid itself is loaded on
// demand, the SVG of each source is cached, and the labels go through diagram-labels.js. The document
// settings (text size, spacing, theme) are Mermaid options: Mermaid has one site configuration, so it is
// initialised again whenever they change, and the cache is keyed by them too.
import { escapeHtml } from './escape.js';
import { markLabels, stripMarks, styleLabels } from './diagram-labels.js';
import { outputOf, rootOf } from './fragment.js';
import { lazy } from './util.js';

// Mermaid weighs several MB, so it is only loaded the first time a document contains a diagram.
const loadMermaid = lazy(() => import('mermaid').then(({ default: mermaid }) => mermaid));

// Space between the nodes and the ranks of a flowchart (Mermaid's defaults are 50/50; compact also halves
// the uniform width Mermaid gives the nodes of short labels), between the actors and the messages of a
// sequence diagram (50/35). `normal` leaves Mermaid's defaults untouched.
const SPACINGS = {
  compact: { nodeSpacing: 25, rankSpacing: 30, minNodeWidth: 60, actorMargin: 25, messageMargin: 20 },
  normal: {},
  wide: { nodeSpacing: 80, rankSpacing: 80, actorMargin: 80, messageMargin: 50 },
};
// Mermaid wraps the labels of flowcharts and state diagrams at 120 px and widens their nodes to 120 px,
// whatever the text size: at a larger size a word of eight letters would be cut in two. Both follow the
// text size here, so a label keeps its lines and a node its shape; 16 gives Mermaid's own values.
const LABEL_WIDTH = 120;

// The Mermaid configuration for a document: `fontSize` in px (16 is Mermaid's default), `spacing` one of
// SPACINGS or `normal`, `theme` a Mermaid theme name, `lineWidth` the stroke of the edges in px (1 by
// default: the theme variable `strokeWidth`, read by flowcharts, class and state diagrams). Mermaid keeps
// two sizes: the numeric `fontSize` it measures the text with and the `themeVariables.fontSize` its
// stylesheet writes; the actors and notes of sequence diagrams (14 by default) and Gantt charts (11)
// have their own, scaled here so 16 gives Mermaid's defaults everywhere.
export function mermaidConfig({ fontSize = 16, spacing = 'normal', theme = 'neutral', lineWidth = 1 } = {}) {
  const scaled = size => Math.round((fontSize * size) / 16);
  const config = {
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    fontFamily: 'Inter, Arial, sans-serif',
    // Pure SVG text instead of foreignObject labels: more reliable in print and in the exported file.
    htmlLabels: false,
    fontSize,
    themeVariables: { fontSize: `${fontSize}px`, strokeWidth: lineWidth },
    sequence: { actorFontSize: scaled(14), messageFontSize: fontSize, noteFontSize: scaled(14) },
    gantt: { fontSize: scaled(11) },
  };
  const {
    nodeSpacing,
    rankSpacing,
    minNodeWidth = LABEL_WIDTH,
    actorMargin,
    messageMargin,
  } = SPACINGS[spacing] ?? SPACINGS.normal;
  const labels = { wrappingWidth: scaled(LABEL_WIDTH), minNodeWidth: scaled(minNodeWidth) };
  config.flowchart = { ...labels };
  config.state = { ...labels };
  if (nodeSpacing) {
    Object.assign(config.flowchart, { nodeSpacing, rankSpacing });
    Object.assign(config.state, { nodeSpacing, rankSpacing });
    config.class = { nodeSpacing, rankSpacing };
    Object.assign(config.sequence, { actorMargin, messageMargin });
  }
  return config;
}

// Rendered SVG per configuration and diagram source, so retyping elsewhere in the document does not
// re-render every diagram.
const diagramCache = new Map();
let diagramCounter = 0;
// The configuration Mermaid currently holds, serialised; initialize() is only called when it changes.
let appliedConfig = '';

async function diagramSvg(mermaid, source, config) {
  const configKey = JSON.stringify(config);
  const cacheKey = `${configKey}\n${source}`;
  if (diagramCache.has(cacheKey)) return diagramCache.get(cacheKey);
  if (configKey !== appliedConfig) {
    mermaid.initialize(config);
    appliedConfig = configKey;
  }
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
  diagramCache.set(cacheKey, html);
  return html;
}

// Replaces every mermaid placeholder with its rendered SVG, in an HTML string or in a template made by
// fragmentOf() (returned as given). Nothing changes when there is no diagram. `options` are those of
// mermaidConfig(); a placeholder whose fence line sets `font=` carries it as `data-font` and keeps its own
// text size.
export async function renderDiagrams(html, options = {}) {
  const root = rootOf(html);
  if (!root.content.querySelector('.mermaid-diagram')) return html;
  const mermaid = await loadMermaid();
  const config = mermaidConfig(options);
  for (const node of root.content.querySelectorAll('.mermaid-diagram')) {
    const source = node.dataset.source ?? '';
    const font = Number(node.dataset.font);
    delete node.dataset.source;
    delete node.dataset.font;
    node.innerHTML = await diagramSvg(mermaid, source, font ? mermaidConfig({ ...options, fontSize: font }) : config);
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
