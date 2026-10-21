// Markdown parsing, images and Mermaid diagrams. Diagrams are rendered to inline SVG before pagination
// because Paged.js needs their final size to lay out pages; images are resolved by file name from the
// image library and inlined as data URLs.
import MarkdownIt from 'markdown-it';
import definitionLists from 'markdown-it-deflist';
import footnotes from 'markdown-it-footnote';
import highlightedText from 'markdown-it-mark';
import subscript from 'markdown-it-sub';
import superscript from 'markdown-it-sup';
import {
  anchorId,
  captionLabel,
  headingAttributes,
  headingCounter,
  parseLabel,
  parseReference,
  referenceText,
  trailingLabel,
  missingImageLabel,
} from './crossref.js';
import { escapeHtml } from './escape.js';
import { findImage, imageName, isExternalSource } from './images.js';
import { CAPTION_MAX_LENGTH, parseDiagramAttributes } from './source-attributes.js';

export const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

// ---- Links: an address starting with "www." is a link, as on GitHub. Other bare names (readme.md) are not:
// too many file names look like a domain.

const WWW_ADDRESS = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[/?#][^\s<]*)?/i;

md.linkify.add('www.', {
  validate(text, position) {
    // "www." must start a word.
    const before = text[position - 'www.'.length - 1];
    if (before !== undefined && !/[\s([{"'«“‘*_~]/.test(before)) return 0;
    const match = WWW_ADDRESS.exec(text.slice(position));
    if (!match) return 0;
    let address = match[0];
    // The punctuation of the sentence is not part of the address, nor a bracket that closes the sentence.
    for (let previous = ''; previous !== address;) {
      previous = address;
      address = address.replace(/[.,;:!?'"*_~]+$/, '');
      if (address.endsWith(')') && address.split(')').length > address.split('(').length)
        address = address.slice(0, -1);
    }
    return address.length;
  },
  normalize(match) {
    match.url = `http://${match.url}`;
  },
});

// ---- Small additions to the text: ==highlighted==, H~2~O, x^2^, and definition lists (a term, then lines
// starting with ": "). Official markdown-it plugins.

md.use(subscript).use(superscript).use(highlightedText).use(definitionLists);

// A caret right after "[" belongs to a footnote call. When the note does not exist the call stays as text,
// and its caret must not open a superscript that would swallow what follows.
md.inline.ruler.before('sup', 'caret_after_bracket', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x5e || state.src.charCodeAt(state.pos - 1) !== 0x5b) return false;
  if (!silent) state.pending += '^';
  state.pos++;
  return true;
});

// ---- Alerts, as on GitHub: a quote whose first line is [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or
// [!CAUTION] becomes a titled box. The title is written in the language of the document.

const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;
const ALERT_TITLES = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  fr: { note: 'Note', tip: 'Astuce', important: 'Important', warning: 'Avertissement', caution: 'Attention' },
  de: { note: 'Hinweis', tip: 'Tipp', important: 'Wichtig', warning: 'Warnung', caution: 'Vorsicht' },
  es: { note: 'Nota', tip: 'Consejo', important: 'Importante', warning: 'Advertencia', caution: 'Precaución' },
  it: { note: 'Nota', tip: 'Suggerimento', important: 'Importante', warning: 'Avviso', caution: 'Attenzione' },
  pt: { note: 'Nota', tip: 'Dica', important: 'Importante', warning: 'Aviso', caution: 'Cuidado' },
  nl: { note: 'Opmerking', tip: 'Tip', important: 'Belangrijk', warning: 'Waarschuwing', caution: 'Let op' },
};

md.core.ruler.after('block', 'alerts', state => {
  const { tokens } = state;
  const language = String(state.env?.language ?? 'en')
    .split('-')[0]
    .toLowerCase();
  const titles = ALERT_TITLES[language] ?? ALERT_TITLES.en;
  for (let index = 0; index < tokens.length; index++) {
    const open = tokens[index];
    const inline = tokens[index + 2];
    if (open.type !== 'blockquote_open' || tokens[index + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline')
      continue;
    const match = ALERT.exec(inline.content);
    if (!match) continue;
    let close = index + 1;
    while (close < tokens.length && !(tokens[close].type === 'blockquote_close' && tokens[close].level === open.level))
      close++;
    const text = inline.content.slice(match[0].length);
    // The marker alone, with nothing to say: an ordinary quote.
    if (!text.trim() && close === index + 4) continue;

    const type = match[1].toLowerCase();
    open.type = 'alert_open';
    open.tag = 'div';
    open.attrJoin('class', `alert alert-${type}`);
    tokens[close].type = 'alert_close';
    tokens[close].tag = 'div';

    const title = [
      new state.Token('paragraph_open', 'p', 1),
      new state.Token('inline', '', 0),
      new state.Token('paragraph_close', 'p', -1),
    ];
    title[0].attrSet('class', 'alert-title');
    title[0].block = true;
    title[2].block = true;
    title[1].content = titles[type];
    title[1].children = [];
    for (const token of title) token.level = open.level + 1;
    title[1].level = open.level + 2;
    // The first paragraph loses its marker line; it goes away when nothing else was in it.
    if (text.trim()) {
      inline.content = text;
      if (inline.map) inline.map = [inline.map[0] + 1, inline.map[1]];
      tokens.splice(index + 1, 0, ...title);
    } else tokens.splice(index + 1, 3, ...title);
  }
});

// ---- Formulas, written in TeX: $…$ inside a sentence, $$…$$ on lines of their own, or a ```math block.
// The rules only keep the TeX apart from the Markdown; renderMath() (src/math.js) draws it with KaTeX.
// An opening $ is followed by something that is not a space and does not follow a letter or a digit; a
// closing $ follows something that is not a space and is not followed by a digit. "5 $ and 10 $", "$5-$10"
// and "US$5" stay text, and \$ is always a plain dollar.

const mathPlaceholder = (tag, kind, tex, attributes = '') =>
  `<${tag} class="math math-${kind}"${attributes}>${escapeHtml(tex)}</${tag}>`;

md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
  const { src, pos, posMax } = state;
  if (src.charCodeAt(pos) !== 0x24 || src.charCodeAt(pos + 1) === 0x24) return false;
  const next = src[pos + 1];
  if (!next || /\s/.test(next) || (pos > 0 && /[\p{L}\p{N}$]/u.test(src[pos - 1]))) return false;
  let end = pos + 1;
  for (;;) {
    end = src.indexOf('$', end);
    if (end === -1 || end >= posMax) return false;
    let backslashes = 0;
    while (src[end - 1 - backslashes] === '\\') backslashes++;
    if (backslashes % 2 === 0) break;
    end++;
  }
  const tex = src.slice(pos + 1, end);
  if (/\s$/.test(tex) || /[\d$]/.test(src[end + 1] ?? '')) return false;
  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.content = tex;
    token.markup = '$';
  }
  state.pos = end + 1;
  return true;
});

md.renderer.rules.math_inline = (tokens, idx) => mathPlaceholder('span', 'inline', tokens[idx].content);

md.block.ruler.after(
  'fence',
  'math_block',
  (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const lineText = line => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
    const first = lineText(startLine);
    if (!first.startsWith('$$')) return false;
    const rest = first.slice(2).trim();
    // The closing $$ may be followed by the label of the formula: $$ {#eq:energy}.
    const closing = text => /^([^]*?)\$\$[ \t]*(?:\{(#eq:[^{}\s]+)\})?[ \t]*$/.exec(text);
    let tex;
    let label;
    let next = startLine + 1;
    const oneLine = rest ? closing(rest) : null;
    if (oneLine && oneLine[1].trim() && (!oneLine[2] || parseLabel(oneLine[2]))) {
      tex = oneLine[1].trim();
      label = parseLabel(oneLine[2]);
    } else if (rest === '') {
      // Up to a line holding only $$ (and a label); without one, this is not a formula.
      const end = line => {
        const match = closing(lineText(line).trim());
        return match && !match[1] && (!match[2] || parseLabel(match[2])) ? match : null;
      };
      while (next < endLine && state.sCount[next] >= state.blkIndent && !end(next)) next++;
      if (next >= endLine || state.sCount[next] < state.blkIndent) return false;
      label = parseLabel(end(next)[2]);
      tex = state.getLines(startLine + 1, next, state.blkIndent, false).trim();
      next++;
    } else return false;
    if (!tex) return false;
    if (silent) return true;
    const token = state.push('math_block', 'div', 0);
    token.block = true;
    token.content = tex;
    token.markup = '$$';
    if (label) token.attrSet('id', anchorId('eq', label.name));
    token.map = [startLine, next];
    state.line = next;
    return true;
  },
  { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
);

md.renderer.rules.math_block = (tokens, idx, options, env, self) =>
  `${mathPlaceholder('div', 'block', tokens[idx].content, self.renderAttrs(tokens[idx]))}\n`;

// ---- Numbering and cross-references (see src/crossref.js). Labels: {#fig:plan} in the braces of an image,
// #fig:flow on a Mermaid fence, {#eq:energy} after the closing $$ of a formula, {#sec:intro} or {#intro}
// at the end of a heading, {#tab:costs} at the end of a table caption. A table caption is a paragraph
// "Table: text" (or ": text") right after the table, or right before it. A reference is @fig:plan.

const TABLE_CAPTION = /^(?:Table)?:[ \t]+(\S[^]*)$/;
const captionLabelSpan = text => `<span class="caption-label">${escapeHtml(text)}</span>`;
// The number of a heading ends with a dot ("1.", "1.1."), as in print; a reference keeps the bare number.
const headingNumber = number => `<span class="heading-number">${escapeHtml(number)}.</span>`;

md.core.ruler.after('block', 'structure_attributes', state => {
  const { tokens } = state;
  const paragraphAt = index =>
    tokens[index]?.type === 'paragraph_open' &&
    tokens[index + 1]?.type === 'inline' &&
    tokens[index + 2]?.type === 'paragraph_close'
      ? tokens[index + 1]
      : null;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open' && tokens[index + 1]?.type === 'inline') {
      const found = headingAttributes(tokens[index + 1].content);
      if (!found) continue;
      tokens[index + 1].content = found.text;
      token.meta = { name: found.name?.toLowerCase() ?? null, unnumbered: found.unnumbered };
    } else if (token.type === 'table_open') {
      let close = index + 1;
      while (close < tokens.length && !(tokens[close].type === 'table_close' && tokens[close].level === token.level))
        close++;
      // The paragraph right after the table, else the one right before it, at the same level.
      const captionOf = at => {
        const inline = paragraphAt(at);
        const match = inline && tokens[at].level === token.level ? TABLE_CAPTION.exec(inline.content) : null;
        return match ? match[1].trim() : null;
      };
      let text = captionOf(close + 1);
      if (text !== null) tokens.splice(close + 1, 3);
      else {
        text = captionOf(index - 3);
        if (text === null) continue;
        tokens.splice(index - 3, 3);
        index -= 3;
      }
      const labelled = trailingLabel(text, 'tab');
      const caption = [
        new state.Token('caption_open', 'caption', 1),
        new state.Token('inline', '', 0),
        new state.Token('caption_close', 'caption', -1),
      ];
      caption[0].attrSet('class', 'table-caption');
      caption[0].block = true;
      caption[2].block = true;
      caption[1].content = (labelled ? labelled.text : text).slice(0, CAPTION_MAX_LENGTH);
      caption[1].children = [];
      for (const part of caption) part.level = token.level + 1;
      caption[1].level = token.level + 2;
      token.meta = { caption: true, label: labelled?.name ?? null };
      token.attrJoin('class', 'has-caption');
      if (labelled) token.attrSet('id', anchorId('tab', labelled.name));
      tokens.splice(index + 1, 0, ...caption);
    }
  }
});

// A reference: @fig:plan, @Tab:costs to open a sentence, -@eq:energy for the number alone. The "@" must not
// follow a letter, a digit or an underscore, so e-mail addresses are left alone.
md.inline.ruler.after('escape', 'cross_ref', (state, silent) => {
  const { src, pos } = state;
  const code = src.charCodeAt(pos);
  if (code !== 0x40 && !(code === 0x2d && src.charCodeAt(pos + 1) === 0x40)) return false;
  if (pos > 0 && /[\p{L}\p{N}_@-]/u.test(src[pos - 1])) return false;
  const reference = parseReference(src.slice(pos, state.posMax));
  if (!reference) return false;
  if (!silent) {
    const token = state.push('cross_ref', '', 0);
    token.content = src.slice(pos, pos + reference.length);
    token.meta = { ...reference, linked: state.linkLevel > 0, target: null };
  }
  state.pos += reference.length;
  return true;
});

md.renderer.rules.cross_ref = (tokens, idx) => {
  const { kind, target, linked } = tokens[idx].meta;
  if (!target) return `<span class="ref ref-missing">${escapeHtml(tokens[idx].content)}</span>`;
  // The number of an equation is only known once KaTeX has drawn it: renderFormulas() fills it in.
  const pending = kind === 'eq' ? ` data-eq="${escapeHtml(target.id)}"` : '';
  const text = escapeHtml(target.text);
  // Inside a link the reference is only its text: links do not nest.
  if (linked) return pending ? `<span class="ref ref-eq"${pending}>${text}</span>` : text;
  return `<a class="ref ref-${kind}" href="#${escapeHtml(target.id)}"${pending}>${text}</a>`;
};

md.renderer.rules.heading_number = (tokens, idx) => `${headingNumber(tokens[idx].content)} `;

// ---- Footnotes: Text[^1] with "[^1]: The note" anywhere in the document, or an inline note^[like this].
// The text of a note is written where it is called: Paged.js moves it to the foot of the page holding the
// call and numbers both. A note called again shows the number of its first call.

md.use(footnotes);

md.core.ruler.after('footnote_tail', 'footnote_notes', state => {
  const notes = new Map();
  const kept = [];
  let inside = false;
  let current = null;
  for (const token of state.tokens) {
    if (token.type === 'footnote_block_open') inside = true;
    else if (token.type === 'footnote_block_close') inside = false;
    else if (!inside) kept.push(token);
    else if (token.type === 'footnote_open') notes.set(token.meta.id, (current = []));
    else if (token.type === 'inline')
      // One entry per paragraph of the note, without the back-links of the plugin.
      current?.push((token.children ?? []).filter(child => child.type !== 'footnote_anchor'));
  }
  state.tokens.splice(0, state.tokens.length, ...kept);
  state.env.footnoteNotes = notes;
});

md.renderer.rules.footnote_ref = (tokens, idx, options, env, self) => {
  const { id, subId } = tokens[idx].meta;
  const paragraphs = env.footnoteNotes?.get(id);
  if (subId > 0 || !paragraphs) return `<sup class="footnote-ref">${id + 1}</sup>`;
  const text = paragraphs.map(children => self.renderInline(children, options, env)).join(' ');
  return `<span class="footnote">${text}</span>`;
};

// ---- Task lists: "- [ ] to do" and "- [x] done" become check boxes, as on GitHub.

md.core.ruler.after('inline', 'task_lists', state => {
  const { tokens } = state;
  for (let index = 2; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'inline' || tokens[index - 1].type !== 'paragraph_open') continue;
    const item = tokens[index - 2];
    const first = token.children?.[0];
    const box = first?.type === 'text' ? /^\[([ xX])\] (?=\S)/.exec(first.content) : null;
    if (item.type !== 'list_item_open' || !box) continue;
    first.content = first.content.slice(box[0].length);
    token.content = token.content.slice(box[0].length);
    const input = new state.Token('html_inline', '', 0);
    input.content = `<input${box[1] === ' ' ? '' : ' checked=""'} disabled="" type="checkbox"> `;
    token.children.unshift(input);
    item.attrJoin('class', 'task-list-item');
    for (let back = index - 3; back >= 0; back--) {
      if (tokens[back].level === item.level - 1 && /^(bullet|ordered)_list_open$/.test(tokens[back].type)) {
        if (!/\bcontains-task-list\b/.test(tokens[back].attrGet('class') ?? '')) {
          tokens[back].attrJoin('class', 'contains-task-list');
        }
        break;
      }
    }
  }
});

// Gives every image its position in the source (block lines, rank in the block) and consumes the
// {attributes} written right after it. Runs before the typographic replacements touch that text.
// Table cells carry no position: their images are located on the line of their row, and ranked across
// the whole row, which is what updateImageAttributes() scans.
md.core.ruler.after('inline', 'image_attributes', state => {
  let row = null;
  let rank = 0;
  for (const block of state.tokens) {
    if (block.type === 'tr_open') {
      row = block.map;
      rank = 0;
    } else if (block.type === 'tr_close') {
      row = null;
    }
    if (block.type !== 'inline' || !block.children) continue;
    const map = block.map ?? row;
    if (block.map) rank = 0;
    block.children.forEach((child, position) => {
      if (child.type !== 'image') return;
      child.meta = { line: map?.[0] ?? null, lineEnd: map?.[1] ?? null, index: rank++ };
      const next = block.children[position + 1];
      const braces = next?.type === 'text' ? /^\{([^{}\n]*)\}/.exec(next.content) : null;
      if (!braces) return;
      Object.assign(child.meta, parseDiagramAttributes(braces[1]));
      next.content = next.content.slice(braces[0].length);
    });
    // An image alone in its paragraph, possibly inside a link, behaves as a block.
    const content = block.children.filter(
      child => !(child.type === 'text' && !child.content.trim()) && !/^link_(open|close)$/.test(child.type),
    );
    if (content.length === 1 && content[0].type === 'image') content[0].meta.alone = true;
  }
});

// ---- Page breaks and table of contents: a line holding only \\newpage or [[toc]] (or [[toc depth=2]]).

const PAGE_BREAK = /^\\newpage$/;
const TOC = /^\[\[toc(?:\s+depth=([1-6]))?\]\]$/i;
const TOC_DEPTH = 3;
// Prefix of the heading ids: the preview lives in the page of the studio, whose own ids must stay unique.
export const ANCHOR_PREFIX = 'sec-';

// Block rule for a marker alone on its line; `build` fills the token from the match.
function markerRule(name, pattern, build) {
  md.block.ruler.before(
    'paragraph',
    name,
    (state, startLine, endLine, silent) => {
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const match = pattern.exec(state.src.slice(start, state.eMarks[startLine]).trim());
      if (!match) return false;
      if (silent) return true;
      state.line = startLine + 1;
      const token = state.push(name, 'div', 0);
      token.map = [startLine, state.line];
      token.markup = match[0];
      build?.(token, match);
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );
}

markerRule('page_break', PAGE_BREAK);
markerRule('toc', TOC, (token, match) => {
  token.meta = { depth: Number(match[1]) || TOC_DEPTH };
});

md.renderer.rules.page_break = () => '<div class="page-break"></div>\n';

// "Étude & coûts (2026)" -> "etude-couts-2026", the way GitHub names its anchors.
export function slugify(text) {
  const slug = String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

// Gives every heading an id, lists the headings for the table of contents, and points the links written
// as [text](#my-heading) to the prefixed id.
md.core.ruler.push('heading_anchors', state => {
  // Ids written by the author ({#intro}) are taken first, so no automatic anchor gets in their way.
  const used = new Set(
    state.tokens.filter(token => token.type === 'heading_open' && token.meta?.name).map(token => token.meta.name),
  );
  const headings = [];
  state.tokens.forEach((token, index) => {
    if (token.type !== 'heading_open') return;
    const parts = (state.tokens[index + 1]?.children ?? []).filter(child =>
      ['text', 'code_inline', 'math_inline'].includes(child.type),
    );
    const text = parts
      .map(child => child.content)
      .join('')
      .trim();
    // For the table of contents: the same text, with the formulas kept as formulas.
    const html = parts
      .map(child =>
        child.type === 'math_inline' ? mathPlaceholder('span', 'inline', child.content) : escapeHtml(child.content),
      )
      .join('')
      .trim();
    const base = slugify(text);
    let slug = token.meta?.name ?? base;
    if (!token.meta?.name) for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    token.attrSet('id', `${ANCHOR_PREFIX}${slug}`);
    headings.push({
      level: Number(token.tag.slice(1)),
      id: `${ANCHOR_PREFIX}${slug}`,
      text,
      html,
      line: token.map?.[0] ?? 0,
    });
  });
  state.env.headings = headings;
  for (const block of state.tokens) {
    for (const child of block.children ?? []) {
      const href = child.type === 'link_open' ? child.attrGet('href') : null;
      if (!href?.startsWith('#')) continue;
      let target = href.slice(1);
      try {
        target = decodeURIComponent(target);
      } catch {
        // Not valid percent-encoding: use the text as written.
      }
      if (used.has(target.toLowerCase())) child.attrSet('href', `#${ANCHOR_PREFIX}${target.toLowerCase()}`);
    }
  }
});

// Numbers the headings, the figures and the tables in the order of the document, then resolves the
// references (so a reference may come before its target). Written as text: CSS counters restart on every
// page. `env.numberHeadings` is 'h1' or 'h2' (the level numbering starts at), `env.numberFigures` numbers
// every captioned figure and table; an element that carries a label is always numbered.
md.core.ruler.after('heading_anchors', 'numbering', state => {
  const { tokens, env } = state;
  const count = headingCounter(env.numberHeadings);
  const targets = new Map(); // id -> { kind, number, text }
  let heading = 0;
  let figures = 0;
  let tables = 0;
  const figure = (meta, caption) => {
    if (!meta.label && !(env.numberFigures && caption)) return;
    meta.number = ++figures;
    if (meta.label) targets.set(anchorId('fig', meta.label), { kind: 'fig', number: meta.number });
  };
  tokens.forEach((token, index) => {
    if (token.type === 'heading_open') {
      const entry = env.headings[heading++];
      const number = token.meta?.unnumbered ? null : count(entry.level);
      if (number) {
        entry.number = number;
        const mark = new state.Token('heading_number', '', 0);
        mark.content = number;
        tokens[index + 1]?.children?.unshift(mark);
      }
      targets.set(entry.id, { kind: 'sec', number, text: entry.text });
    } else if (token.type === 'inline') {
      for (const child of token.children ?? []) {
        if (child.type === 'image' && child.meta)
          figure(child.meta, child.meta.caption ?? child.attrGet('title')?.trim());
      }
    } else if (token.type === 'fence') {
      const [language = '', ...rest] = token.info.trim().split(/\s+/);
      if (language.toLowerCase() === 'mermaid') {
        const attributes = parseDiagramAttributes(rest.join(' '));
        figure(attributes, attributes.caption);
        // Kept for the renderer of the fence, which would otherwise parse the attributes again.
        token.meta = { attributes, number: attributes.number };
      } else if (language.toLowerCase() === 'math') {
        const label = rest.map(parseLabel).find(found => found?.kind === 'eq');
        if (label) token.attrSet('id', anchorId('eq', label.name));
      }
    } else if (token.type === 'table_open' && token.meta?.caption) {
      if (!token.meta.label && !env.numberFigures) return;
      const number = ++tables;
      if (token.meta.label) targets.set(anchorId('tab', token.meta.label), { kind: 'tab', number });
      const mark = new state.Token('html_inline', '', 0);
      mark.content = captionLabelSpan(
        captionLabel('tab', number, env.language, { alone: !tokens[index + 2]?.content }),
      );
      tokens[index + 2]?.children?.unshift(mark);
    }
    // A labelled formula: its number comes later, from KaTeX; the reference only needs to know it exists.
    const id = token.type === 'math_block' || token.type === 'fence' ? token.attrGet('id') : null;
    if (id?.startsWith('eq-')) targets.set(id, { kind: 'eq', number: '(?)' });
  });

  const resolve = children => {
    for (const child of children ?? []) {
      if (child.type !== 'cross_ref') continue;
      const { kind, name, capital, bare } = child.meta;
      const id = anchorId(kind, name);
      const target = targets.get(id);
      if (!target || target.kind !== kind) continue;
      // A heading without a number is named by its title.
      const text =
        target.number === null || target.number === undefined
          ? target.text
          : referenceText(kind, target.number, env.language, { capital, bare });
      child.meta.target = { id, text };
    }
  };
  for (const token of tokens) resolve(token.children);
  for (const paragraphs of env.footnoteNotes?.values() ?? []) paragraphs.forEach(resolve);
});

// The table lists the headings that follow it, down to its depth. Page numbers are added by the stylesheet
// (target-counter), which Paged.js resolves once the pages exist.
md.renderer.rules.toc = (tokens, idx, options, env) => {
  const { meta, map } = tokens[idx];
  const items = (env.headings ?? [])
    .filter(heading => heading.line >= (map?.[1] ?? 0) && heading.level <= meta.depth)
    .map(
      heading =>
        `<li class="toc-item toc-level-${heading.level}"><a href="#${escapeHtml(heading.id)}"><span class="toc-text">${heading.number ? `${headingNumber(heading.number)} ` : ''}${heading.html ?? escapeHtml(heading.text)}</span><span class="toc-dots"></span></a></li>`,
    );
  return `<nav class="toc"><ol class="toc-list">${items.join('')}</ol></nav>\n`;
};

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const source = token.attrGet('src') ?? '';
  const meta = token.meta ?? {};
  let resolved = source;
  if (!isExternalSource(source)) {
    const image = findImage(source);
    if (!image) {
      const name = escapeHtml(imageName(source) || source);
      const id = meta.label ? ` id="${escapeHtml(anchorId('fig', meta.label))}"` : '';
      return `<span class="image-missing"${id} data-image="${name}">${missingImageLabel(env?.language)}: ${name}</span>`;
    }
    resolved = image.dataUrl;
  }
  // The caption is the title of the image, ![Alt](photo.png "Caption"), or the caption attribute.
  const caption = meta.caption ?? token.attrGet('title')?.trim().slice(0, CAPTION_MAX_LENGTH);
  // A numbered figure opens its caption with "Figure 1: "; without a caption text the number stands alone.
  const numbered = meta.number ? captionLabel('fig', meta.number, env.language, { alone: !caption }) : '';
  const classes = [
    'document-image',
    meta.width ? 'is-sized' : '',
    meta.alone ? 'is-block' : '',
    caption || numbered ? 'has-caption' : '',
  ];
  const attributes = [
    `class="${classes.filter(Boolean).join(' ')}"`,
    meta.label ? `id="${escapeHtml(anchorId('fig', meta.label))}"` : '',
    Number.isInteger(meta.line) ? `data-line="${meta.line}" data-line-end="${meta.lineEnd}"` : '',
    Number.isInteger(meta.line) ? `data-index="${meta.index}"` : '',
    meta.width ? `style="--image-width: ${meta.width}"` : '',
    meta.align ? `data-align="${meta.align}"` : '',
  ];
  const alt = self.renderInlineAsText(token.children ?? [], options, env);
  const image = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}">`;
  const legend =
    caption || numbered
      ? `<span class="image-caption">${numbered ? captionLabelSpan(numbered) : ''}${escapeHtml(caption ?? '')}</span>`
      : '';
  return `<span ${attributes.filter(Boolean).join(' ')}>${image}${legend}</span>`;
};

// ```mermaid fences become placeholders; renderDiagrams() turns them into inline SVG. The placeholder keeps
// the size and alignment asked on the fence line, and the source line so the preview can rewrite it.
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const [language = '', ...rest] = token.info.trim().split(/\s+/);
  if (language.toLowerCase() === 'mermaid') {
    const { width, align, caption, label, font } = token.meta?.attributes ?? parseDiagramAttributes(rest.join(' '));
    const number = token.meta?.number;
    const attributes = [
      `class="mermaid-diagram${width ? ' is-sized' : ''}"`,
      label ? `id="${escapeHtml(anchorId('fig', label))}"` : '',
      `data-source="${escapeHtml(token.content)}"`,
      token.map ? `data-line="${token.map[0]}"` : '',
      width ? `style="--diagram-width: ${width}"` : '',
      align ? `data-align="${align}"` : '',
      font ? `data-font="${font}"` : '',
      caption ? `data-caption="${escapeHtml(caption)}"` : '',
      number
        ? `data-caption-label="${escapeHtml(captionLabel('fig', number, env.language, { alone: !caption }))}"`
        : '',
    ];
    return `<div ${attributes.filter(Boolean).join(' ')}></div>\n`;
  }
  if (language.toLowerCase() === 'math' && token.content.trim())
    return `${mathPlaceholder('div', 'block', token.content.trim(), self.renderAttrs(token))}\n`;
  return defaultFence(tokens, idx, options, env, self);
};

// For the preview only (`env.sourceLines`): every block carries the line of the Markdown it comes from, so
// the studio can scroll the editor and the preview together and jump from a block to its source.
md.core.ruler.push('source_lines', state => {
  if (!state.env?.sourceLines) return;
  for (const token of state.tokens) {
    if (token.map && token.nesting >= 0 && token.type !== 'inline')
      token.attrSet('data-source-line', String(token.map[0]));
  }
});
