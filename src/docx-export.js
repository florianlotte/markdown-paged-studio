// The Word export: the HTML of the document (the same one the PDF gets, every feature resolved) is walked
// and rebuilt as a native .docx with the `docx` library, loaded on demand. Headings, lists, tables, notes
// of the foot of the page, the running headers and the page counter, the table of contents (a field Word
// fills on opening), images, diagrams (SVG with a PNG for older versions) and formulas (Office Math) are
// Word objects; the custom CSS of the document is not read: the values of the default stylesheet become
// the styles of the document.
import { bytesOfDataUrl } from './archive.js';
import { state } from './config.js';
import { CODE_COLORS, documentHtml, documentLanguage } from './document.js';
import { fitDrawing, halfPoints, pageGeometry, twips } from './docx-units.js';
import { unescapeHtml } from './escape.js';
import { ommlOf } from './mathml-omml.js';
import { lazy } from './util.js';

const loadDocx = lazy(() => import('docx'));
const loadKatex = lazy(() => import('katex').then(module => module.default));

const FONT = 'Inter';
const MONO = 'Consolas';
const TEXT_COLOR = '202124';
const MUTED = '5f6368';
const ERROR_COLOR = 'b3261e';
const LINK_COLOR = '1a4fb3';
const ALERT_COLORS = { note: '1f5fbf', tip: '1a7f37', important: '6f42c1', warning: '9a6700', caution: 'b3261e' };
// Classes of highlight.js and the colour they take in codeCss() (an index of CODE_COLORS).
const CODE_CLASSES = {
  comment: 2,
  quote: 2,
  meta: 2,
  keyword: 3,
  'selector-tag': 3,
  doctag: 3,
  'template-tag': 3,
  deletion: 3,
  string: 4,
  regexp: 4,
  link: 4,
  number: 5,
  literal: 5,
  variable: 5,
  'template-variable': 5,
  symbol: 5,
  bullet: 5,
  title: 6,
  section: 6,
  'selector-id': 6,
  'selector-class': 6,
  attr: 7,
  attribute: 7,
  name: 7,
  tag: 7,
  addition: 7,
  built_in: 8,
  type: 8,
  params: 8,
};
const BULLETS = ['•', '◦', '▪'];
// Line spacing of the text (1.45) in 240ths, and the space after a paragraph (one line of 8.5 pt).
const LINE = 348;
const AFTER = 170;

const hex = color =>
  String(color ?? '')
    .replace('#', '')
    .toLowerCase() || TEXT_COLOR;
const classes = node => (node.getAttribute?.('class') ?? '').split(/\s+/).filter(Boolean);
const has = (node, name) => classes(node).includes(name);
const tag = node => (node.nodeType === 1 ? node.tagName.toLowerCase() : '');

// ---- Media: images, logo and diagrams are decoded before the walk, which is synchronous.

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image could not be decoded'));
    image.src = url;
  });
}

// A PNG of `url` (an image or an SVG data URL) drawn at `width` × `height` px, twice as fine.
async function rasterize(url, width, height) {
  const image = await loadImage(url);
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('the drawing could not be converted');
  return new Uint8Array(await blob.arrayBuffer());
}

const DOCX_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };

// The bytes and natural size of an image given as a data URL, in a form the Word file takes: PNG, JPEG,
// GIF and BMP as they are, an SVG with a PNG beside it, anything else converted to PNG.
async function mediaOfDataUrl(dataUrl) {
  const { type, bytes } = bytesOfDataUrl(dataUrl);
  const image = await loadImage(dataUrl);
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  if (type === 'image/svg+xml') {
    if (!width || !height) {
      const viewBox = /viewBox="[^"]*?([\d.]+)\s+([\d.]+)"/.exec(new TextDecoder().decode(bytes));
      width = Number(viewBox?.[1]) || 300;
      height = Number(viewBox?.[2]) || 150;
    }
    return { type: 'svg', bytes, width, height, fallback: await rasterize(dataUrl, width, height) };
  }
  if (DOCX_TYPES[type]) return { type: DOCX_TYPES[type], bytes, width, height };
  return { type: 'png', bytes: await rasterize(dataUrl, width, height), width, height };
}

// The properties Mermaid sets through the stylesheet of its SVG, written on each element instead: Word and
// LibreOffice draw an SVG without reading its <style>.
const SVG_STYLE_PROPERTIES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
];

// Writes the computed style of every element of `svg` as attributes, in the live page so the stylesheet of
// the drawing applies, then drops that stylesheet. Hidden elements are removed.
function inlineSvgStyles(svg) {
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;left:-10000px;top:0;width:1px;height:1px;overflow:hidden';
  stage.append(svg);
  document.body.append(stage);
  try {
    // Every style is read before anything changes: the rules select through the classes of the parents.
    const elements = [...svg.querySelectorAll('*')].map(element => {
      const computed = getComputedStyle(element);
      return {
        element,
        hidden: computed.display === 'none' || computed.visibility === 'hidden',
        values: SVG_STYLE_PROPERTIES.map(property => [property, computed.getPropertyValue(property)]),
      };
    });
    for (const { element, hidden, values } of elements) {
      if (hidden) {
        element.remove();
        continue;
      }
      for (const [property, value] of values) {
        if (value && value !== 'normal' && value !== 'none' && value !== 'auto') element.setAttribute(property, value);
        else if (value === 'none' && (property === 'fill' || property === 'stroke'))
          element.setAttribute(property, 'none');
      }
      element.removeAttribute('class');
    }
    for (const style of svg.querySelectorAll('style')) style.remove();
  } finally {
    svg.remove();
    stage.remove();
  }
  return svg;
}

// A Mermaid drawing: its SVG, sized by its viewBox so Word and the canvas agree on its proportions, its
// styles inlined.
async function mediaOfSvg(svg) {
  const clone = svg.cloneNode(true);
  const viewBox = clone.viewBox?.baseVal;
  const width = Math.round(viewBox?.width || parseFloat(clone.getAttribute('width')) || 600);
  const height = Math.round(viewBox?.height || parseFloat(clone.getAttribute('height')) || 400);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('style');
  inlineSvgStyles(clone);
  const text = new XMLSerializer().serializeToString(clone);
  const bytes = new TextEncoder().encode(text);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  return { type: 'svg', bytes, width, height, fallback: await rasterize(url, width, height) };
}

// ---- The builder.

class DocxBuilder {
  constructor(docx, { geometry, media, formulas }) {
    this.docx = docx;
    this.geometry = geometry;
    this.media = media;
    this.formulas = formulas;
    this.footnotes = {};
    this.footnoteCount = 0;
    this.lists = 0;
    this.bookmarks = new Map();
    this.lang = documentLanguage();
  }

  // Word wants bookmark names made of letters, digits and underscores, 40 characters at most, unique.
  bookmarkName(id) {
    if (!this.bookmarks.has(id)) {
      let name = `b_${id.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 36);
      const taken = new Set(this.bookmarks.values());
      for (let rank = 2; taken.has(name); rank++) name = `${name.slice(0, 32)}_${rank}`;
      this.bookmarks.set(id, name);
    }
    return this.bookmarks.get(id);
  }

  // A piece of raw OOXML (Office Math) as a paragraph child: fromXmlString() wraps the parsed element in a
  // nameless component, which would be written as an element itself.
  imported(xml) {
    return this.docx.ImportedXmlComponent.fromXmlString(xml).root[0];
  }

  // ---- Inline content: items first (text with its format, or a ready child), runs after, so the spaces of
  // the HTML can be collapsed across nodes and trimmed at the ends.

  collect(node, format, items) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const text = format.pre ? child.data : child.data.replace(/[ \t\r\n]+/g, ' ');
        if (text) items.push({ text, format });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const name = tag(child);
      const next = { ...format };
      switch (name) {
        case 'br':
          items.push({ child: new this.docx.TextRun({ break: 1 }) });
          continue;
        case 'strong':
        case 'b':
          next.bold = true;
          break;
        case 'em':
        case 'i':
          next.italics = true;
          break;
        case 's':
        case 'del':
          next.strike = true;
          break;
        case 'mark':
          next.highlight = 'yellow';
          break;
        case 'sub':
          next.subScript = true;
          break;
        case 'sup':
          if (has(child, 'footnote-ref')) {
            items.push({ text: child.textContent.trim(), format: { ...format, superScript: true } });
            continue;
          }
          next.superScript = true;
          break;
        case 'code':
          if (!format.pre) {
            next.font = MONO;
            next.shading = 'f1f3f5';
          }
          break;
        case 'input':
          if (child.getAttribute('type') === 'checkbox')
            items.push({ text: child.hasAttribute('checked') ? '☑ ' : '☐ ', format });
          continue;
        case 'img':
          this.collectImage(child, format, items);
          continue;
        case 'a':
          this.collectLink(child, format, items);
          continue;
        case 'span':
          if (has(child, 'footnote')) {
            items.push({ child: this.footnote(child) });
            continue;
          }
          if (has(child, 'math')) {
            this.collectMath(child, format, items, false);
            continue;
          }
          if (has(child, 'image-missing') || has(child, 'ref-missing')) {
            items.push({ text: child.textContent, format: { ...format, color: ERROR_COLOR } });
            continue;
          }
          if (has(child, 'document-image')) {
            this.collectImage(child.querySelector('img'), format, items, child);
            continue;
          }
          if (has(child, 'image-caption')) continue;
          if (has(child, 'caption-label')) next.bold = true;
          if (format.pre) {
            const color = classes(child)
              .map(name => CODE_CLASSES[name.replace(/^hljs-/, '')])
              .find(index => index !== undefined);
            if (color !== undefined) next.color = hex(this.codeColors[color]);
            if (has(child, 'hljs-strong')) next.bold = true;
          }
          break;
        default:
          break;
      }
      this.collect(child, next, items);
    }
    return items;
  }

  collectLink(link, format, items) {
    const href = link.getAttribute('href') ?? '';
    const inner = this.runs(this.collect(link, { ...format, color: LINK_COLOR, underline: true }, []));
    if (!inner.length) return;
    if (/^(https?:|mailto:)/i.test(href))
      items.push({ child: new this.docx.ExternalHyperlink({ children: inner, link: href }) });
    else if (href.startsWith('#'))
      items.push({
        child: new this.docx.InternalHyperlink({ children: inner, anchor: this.bookmarkName(href.slice(1)) }),
      });
    else items.push(...inner.map(child => ({ child })));
  }

  collectImage(img, format, items, wrapper = img) {
    const media = img && this.media.get(img);
    if (!media) return;
    const wanted = wrapper?.style?.getPropertyValue('--image-width')?.trim() || null;
    const size = fitDrawing(media, wanted, this.geometry);
    const run = this.imageRun(media, size, img.getAttribute('alt') ?? '');
    const id = wrapper?.id;
    items.push({ child: id ? new this.docx.Bookmark({ id: this.bookmarkName(id), children: [run] }) : run });
  }

  imageRun(media, size, alt) {
    const { ImageRun } = this.docx;
    const transformation = { width: size.width, height: size.height };
    const altText = alt ? { title: alt, description: alt, name: alt } : undefined;
    if (media.type === 'svg')
      return new ImageRun({
        type: 'svg',
        data: media.bytes,
        fallback: { type: 'png', data: media.fallback },
        transformation,
        altText,
      });
    return new ImageRun({ type: media.type, data: media.bytes, transformation, altText });
  }

  collectMath(node, format, items, block) {
    const omml = this.formulas.get(node);
    if (omml) items.push({ child: this.imported(omml.inline) });
    else {
      const tex = unescapeHtml(node.getAttribute('aria-label') ?? node.textContent);
      items.push({ text: block ? tex : `$${tex}$`, format: { ...format, font: MONO } });
    }
  }

  footnote(span) {
    const number = ++this.footnoteCount;
    const runs = this.runs(this.collect(span, {}, []));
    this.footnotes[number] = { children: [new this.docx.Paragraph({ children: runs, style: 'FootnoteText' })] };
    return new this.docx.FootnoteReferenceRun(number);
  }

  // The runs of collected items: spaces collapsed across neighbours, none at the ends.
  runs(items) {
    const out = [];
    let previousSpace = true;
    items.forEach((item, index) => {
      if (item.child) {
        out.push(item.child);
        previousSpace = false;
        return;
      }
      let text = item.text;
      if (!item.format.pre) {
        if (previousSpace) text = text.replace(/^ /, '');
        const last = items.slice(index + 1).every(later => later.child === undefined && !later.text.trim());
        if (last) text = text.replace(/ $/, '');
      }
      if (!text) return;
      previousSpace = text.endsWith(' ');
      out.push(this.textRun(text, item.format));
    });
    return out;
  }

  textRun(text, format) {
    const { TextRun } = this.docx;
    const options = { text };
    if (format.bold) options.bold = true;
    if (format.italics) options.italics = true;
    if (format.strike) options.strike = true;
    if (format.subScript) options.subScript = true;
    if (format.superScript) options.superScript = true;
    if (format.highlight) options.highlight = format.highlight;
    if (format.color) options.color = format.color;
    if (format.font) options.font = format.font;
    if (format.size) options.size = halfPoints(format.size);
    if (format.underline) options.underline = {};
    if (format.shading) options.shading = { type: 'clear', fill: format.shading };
    return new TextRun(options);
  }

  // ---- Blocks.

  paragraph(node, properties = {}, format = {}) {
    const children = this.runs(this.collect(node, properties.run?.bold ? { bold: true, ...format } : format, []));
    return new this.docx.Paragraph({ children, ...properties });
  }

  // The Word blocks of the children of `node`. `context` carries what encloses them: a list level, a quote
  // or alert border, an indent.
  blocks(node, context = {}) {
    const out = [];
    const inline = [];
    const flush = () => {
      if (!inline.length) return;
      const runs = this.runs(this.collect({ childNodes: inline }, context.bold ? { bold: true } : {}, []));
      if (runs.length) out.push(new this.docx.Paragraph({ children: runs, ...this.paragraphProperties(context) }));
      inline.length = 0;
    };
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        if (child.data.trim()) inline.push(child);
        continue;
      }
      if (child.nodeType !== 1) continue;
      const blocks = this.block(child, context);
      if (blocks === null) {
        inline.push(child);
        continue;
      }
      flush();
      out.push(...blocks);
    }
    flush();
    return out;
  }

  // The properties of a paragraph in `context`: the first paragraph of a list item carries the marker
  // (`context.marker` remembers it), the ones after it are indented under it.
  paragraphProperties(context, extra = {}) {
    const properties = { spacing: { after: AFTER, line: LINE }, ...extra };
    if (context.numbering && context.marker && !context.marker.used) {
      properties.numbering = context.numbering;
      context.marker.used = true;
    } else if (context.indent) properties.indent = { left: context.indent };
    if (context.border) properties.border = { left: context.border };
    if (context.color) properties.run = { color: context.color };
    if (context.alignment) properties.alignment = context.alignment;
    return properties;
  }

  // The blocks of one element, or null when the element is inline (it then joins the paragraph around it).
  block(node, context) {
    const { Paragraph, PageBreak, TableOfContents, HeadingLevel } = this.docx;
    const name = tag(node);
    switch (name) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = Number(name[1]);
        const runs = this.runs(this.collect(node, {}, []));
        const children = node.id ? [new this.docx.Bookmark({ id: this.bookmarkName(node.id), children: runs })] : runs;
        return [new Paragraph({ heading: HeadingLevel[`HEADING_${level}`], children, keepNext: true })];
      }
      case 'p': {
        if (has(node, 'alert-title')) return [this.paragraph(node, this.paragraphProperties(context), { bold: true })];
        const figure = node.querySelector(':scope > .document-image.is-block, :scope > a > .document-image.is-block');
        if (!figure) return [this.paragraph(node, this.paragraphProperties(context))];
        const align = figure.getAttribute('data-align');
        const alignment = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
        const out = [this.paragraph(node, this.paragraphProperties(context, { alignment, keepNext: true }))];
        const caption = figure.querySelector(':scope > .image-caption');
        if (caption) out.push(new Paragraph({ children: this.runs(this.collect(caption, {}, [])), style: 'Caption' }));
        return out;
      }
      case 'ul':
      case 'ol':
        return this.list(node, context);
      case 'li':
        return this.blocks(node, context);
      case 'blockquote':
        return this.blocks(node, {
          ...context,
          border: { style: 'single', size: 24, color: 'c8cdd4', space: 14 },
          color: '555555',
        });
      case 'pre':
        return this.code(node, context);
      case 'hr':
        return [
          new Paragraph({
            border: { bottom: { style: 'single', size: 6, color: 'c8cdd4', space: 1 } },
            spacing: { after: AFTER },
          }),
        ];
      case 'table':
        return this.table(node);
      case 'dl':
        return this.definitions(node, context);
      case 'div':
      case 'section':
      case 'article':
      case 'nav':
      case 'figure':
      case 'details':
        if (has(node, 'page-break')) return [new Paragraph({ children: [new PageBreak()] })];
        if (has(node, 'toc')) {
          const levels = [...node.querySelectorAll('.toc-item')].map(item =>
            Number(/toc-level-(\d)/.exec(item.className)?.[1] ?? 3),
          );
          const depth = Math.min(6, Math.max(1, ...levels, 1));
          return [new TableOfContents('Table of contents', { hyperlink: true, headingStyleRange: `1-${depth}` })];
        }
        if (has(node, 'alert')) {
          const kind = classes(node)
            .find(name => name.startsWith('alert-'))
            ?.slice(6);
          const color = ALERT_COLORS[kind] ?? ALERT_COLORS.note;
          return this.blocks(node, { ...context, border: { style: 'single', size: 24, color, space: 14 } });
        }
        if (has(node, 'mermaid-diagram')) return this.diagram(node, context);
        if (has(node, 'math')) return this.mathBlock(node, context);
        if (has(node, 'cover-page')) return [];
        return this.blocks(node, context);
      case 'svg':
        return [];
      default:
        return null;
    }
  }

  list(node, context) {
    const { LevelFormat } = this.docx;
    const level = context.level ?? 0;
    const ordered = tag(node) === 'ol';
    const start = Number(node.getAttribute('start')) || 1;
    const tasks = has(node, 'contains-task-list');
    const instance = ++this.lists;
    const reference = ordered ? `ordered-${instance}` : 'bullets';
    const numbering = {
      reference: ordered
        ? {
            reference,
            levels: [0, 1, 2, 3, 4, 5].map(depth => ({
              level: depth,
              format: LevelFormat.DECIMAL,
              text: `%${depth + 1}.`,
              alignment: 'left',
              start: depth === level ? start : 1,
              style: { paragraph: { indent: { left: twips(7 * (depth + 1)), hanging: twips(5) } } },
            })),
          }
        : reference,
      level: Math.min(level, 5),
      instance,
    };
    const out = [];
    const indent = twips(7 * (level + 1));
    for (const item of node.children) {
      if (tag(item) !== 'li') continue;
      const itemContext = tasks
        ? { ...context, numbering: undefined, marker: undefined, indent, level: level + 1 }
        : { ...context, numbering, marker: { used: false }, indent, level: level + 1 };
      out.push(...this.blocks(item, itemContext));
    }
    return out;
  }

  definitions(node, context) {
    const out = [];
    for (const child of node.children) {
      if (tag(child) === 'dt')
        out.push(
          this.paragraph(
            child,
            this.paragraphProperties(context, { spacing: { before: twips(3), after: 0, line: LINE } }),
            { bold: true },
          ),
        );
      else if (tag(child) === 'dd')
        out.push(...this.blocks(child, { ...context, indent: (context.indent ?? 0) + twips(6) }));
    }
    return out;
  }

  code(node, context) {
    const { Paragraph } = this.docx;
    const theme = classes(node)
      .find(name => name.startsWith('code-') && name !== 'code-block')
      ?.slice(5);
    this.codeColors = CODE_COLORS[theme] ?? CODE_COLORS.light;
    const [text, background] = has(node, 'code-block') ? this.codeColors : [TEXT_COLOR, 'f5f6f8'];
    const items = this.collect(node, { pre: true, font: MONO, size: 8, color: hex(text) }, []);
    // One paragraph per line, so Word keeps the lines; the shading of each paragraph joins into one box.
    const lines = [[]];
    for (const item of items) {
      if (item.child) {
        lines.at(-1).push(item);
        continue;
      }
      const parts = item.text.split('\n');
      parts.forEach((part, index) => {
        if (index) lines.push([]);
        if (part) lines.at(-1).push({ text: part, format: item.format });
      });
    }
    if (lines.length > 1 && !lines.at(-1).length) lines.pop();
    return lines.map(
      (line, index) =>
        new Paragraph({
          children: line.map(item => item.child ?? this.textRun(item.text, item.format)),
          style: 'Code',
          shading: { type: 'clear', fill: hex(background) },
          spacing: { before: 0, after: index === lines.length - 1 ? AFTER : 0, line: 276 },
          indent: context.indent ? { left: context.indent } : undefined,
          keepLines: true,
        }),
    );
  }

  table(node) {
    const { Table, TableRow, TableCell, Paragraph, WidthType, BorderStyle } = this.docx;
    const rows = [...node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')];
    const columns = Math.max(1, ...rows.map(row => row.children.length));
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'd0d4da' };
    const out = [];
    const caption = node.querySelector(':scope > caption');
    if (caption) {
      const runs = this.runs(this.collect(caption, {}, []));
      const children = node.id ? [new this.docx.Bookmark({ id: this.bookmarkName(node.id), children: runs })] : runs;
      out.push(new Paragraph({ children, style: 'Caption', keepNext: true }));
    }
    const tableRows = rows.map(row => {
      const header = tag(row.parentElement) === 'thead';
      const cells = [...row.children].map(cell => {
        const align = /text-align:\s*(left|center|right)/.exec(cell.getAttribute('style') ?? '')?.[1];
        const blocks = this.blocks(cell, { alignment: align, bold: header });
        const children = blocks.length ? blocks : [new Paragraph({})];
        return new TableCell({
          children,
          shading: header ? { type: 'clear', fill: 'f5f6f8' } : undefined,
          margins: { top: twips(2.5), bottom: twips(2.5), left: twips(3), right: twips(3) },
          width: { size: Math.floor(100 / columns), type: WidthType.PERCENTAGE },
        });
      });
      return new TableRow({ children: cells, tableHeader: header, cantSplit: true });
    });
    const table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: border,
        bottom: border,
        left: border,
        right: border,
        insideHorizontal: border,
        insideVertical: border,
      },
    });
    out.push(table);
    out.push(new Paragraph({ spacing: { after: 0 } }));
    return out;
  }

  diagram(node, context) {
    const { Paragraph } = this.docx;
    const svg = node.querySelector(':scope > svg');
    const media = svg && this.media.get(svg);
    const out = [];
    if (media) {
      const wanted = node.style.getPropertyValue('--diagram-width').trim() || null;
      const size = fitDrawing(media, wanted, this.geometry);
      const run = this.imageRun(media, size, node.querySelector('.diagram-caption')?.textContent ?? 'Diagram');
      const children = node.id ? [new this.docx.Bookmark({ id: this.bookmarkName(node.id), children: [run] })] : [run];
      const align = node.getAttribute('data-align');
      out.push(
        new Paragraph({
          children,
          alignment: align === 'left' ? 'left' : align === 'right' ? 'right' : 'center',
          spacing: { before: twips(3), after: twips(2) },
          keepNext: true,
        }),
      );
    } else {
      const error = node.querySelector('.mermaid-error');
      if (error) out.push(...this.code(error, context));
    }
    const caption = node.querySelector(':scope > .diagram-caption');
    if (caption) out.push(new Paragraph({ children: this.runs(this.collect(caption, {}, [])), style: 'Caption' }));
    return out;
  }

  mathBlock(node, context) {
    const { Paragraph, TextRun, Tab, TabStopType } = this.docx;
    const omml = this.formulas.get(node);
    const number = node.querySelector('.eqn-num')?.textContent.trim();
    if (!omml) {
      const tex = unescapeHtml(node.getAttribute('aria-label') ?? node.textContent);
      return [
        new Paragraph({
          children: [this.textRun(tex, { font: MONO })],
          alignment: 'center',
          ...this.paragraphProperties(context),
        }),
      ];
    }
    const math = this.imported(omml.inline);
    const bookmark = node.id ? new this.docx.Bookmark({ id: this.bookmarkName(node.id), children: [] }) : null;
    if (!number) {
      const block = this.imported(omml.block);
      return [new Paragraph({ children: bookmark ? [bookmark, block] : [block], spacing: { after: AFTER } })];
    }
    // A numbered equation: centred by a tab, its number against the right margin.
    const column = twips(this.geometry.column);
    return [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: Math.round(column / 2) },
          { type: TabStopType.RIGHT, position: column },
        ],
        children: [
          ...(bookmark ? [bookmark] : []),
          new TextRun({ children: [new Tab()] }),
          math,
          new TextRun({ children: [new Tab(), number] }),
        ],
        spacing: { after: AFTER },
      }),
    ];
  }

  // ---- The cover and the sections.

  cover(section) {
    const { Paragraph, Table, TableRow, TableCell, WidthType, BorderStyle } = this.docx;
    const template = state.coverTemplate;
    const centered = template === 'centered';
    const minimal = template === 'minimal';
    const accent = hex(state.accentColor);
    const alignment = centered ? 'center' : 'left';
    const band =
      template === 'band' ? { left: { style: BorderStyle.SINGLE, size: 48, color: accent, space: 20 } } : undefined;
    const children = [];
    const logo = section.querySelector('.cover-logo');
    const media = logo && this.media.get(logo);
    if (media) {
      const box = minimal ? { column: 40, textHeight: 20 } : { column: 55, textHeight: 28 };
      const size = fitDrawing(media, null, box, { reserve: 0 });
      children.push(
        new Paragraph({
          children: [this.imageRun(media, size, 'Logo')],
          alignment,
          spacing: { after: twips(minimal ? 60 : 20) },
          border: band,
        }),
      );
    }
    const title = section.querySelector('.cover-title');
    children.push(
      new Paragraph({
        children: this.runs(this.collect(title, { bold: true, size: minimal ? 24 : 32, color: '17191c' }, [])),
        alignment,
        spacing: { after: 0, line: 264 },
        border: minimal ? { top: { style: BorderStyle.SINGLE, size: 14, color: accent, space: 17 } } : band,
      }),
    );
    if (centered)
      children.push(
        new Table({
          alignment: 'center',
          width: { size: twips(30), type: WidthType.DXA },
          rows: [
            new TableRow({
              height: { value: twips(1.2), rule: 'exact' },
              children: [
                new TableCell({
                  children: [new Paragraph({})],
                  shading: { type: 'clear', fill: accent },
                  width: { size: twips(30), type: WidthType.DXA },
                }),
              ],
            }),
          ],
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
        }),
      );
    const subtitle = section.querySelector('.cover-subtitle');
    if (subtitle)
      children.push(
        new Paragraph({
          children: this.runs(this.collect(subtitle, { size: minimal ? 12 : 15, color: MUTED }, [])),
          alignment,
          spacing: { before: twips(minimal ? 4 : 7), after: 0 },
          border: band,
        }),
      );
    const meta = section.querySelectorAll('.cover-meta > div');
    meta.forEach((line, index) =>
      children.push(
        new Paragraph({
          children: this.runs(this.collect(line, { size: minimal ? 9.5 : 10.5, color: '6d7278' }, [])),
          alignment,
          spacing: { before: index === 0 ? twips(minimal ? 10 : 18) : 0, after: 0, line: 384 },
          border: band,
        }),
      ),
    );
    return children;
  }

  // One line of a header or footer: `left` and `right` are paragraph children (runs, or a field), the
  // right part against the right margin through a tab.
  headerParagraph(left, right, size) {
    const { Paragraph, TextRun, Tab, TabStopType } = this.docx;
    return new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: twips(this.geometry.column) }],
      children: [...left, new TextRun({ children: [new Tab()] }), ...right],
      spacing: { after: 0 },
      run: { size: halfPoints(size), color: size === 8.5 ? MUTED : '6f7378' },
    });
  }

  headersAndFooters() {
    const { Header, Footer, PageNumber, SimpleField, TextRun } = this.docx;
    const level = Math.max(1, ['h1', 'h2', 'h3'].indexOf(state.runningHeaderLevel) + 1);
    const run = (children, size) =>
      new TextRun({ children, size: halfPoints(size), color: size === 8.5 ? MUTED : '6f7378' });
    // The running header is the last heading of the chosen level Word finds: a STYLEREF field.
    const title = state.runningHeader
      ? [new SimpleField(`STYLEREF ${level} \\* MERGEFORMAT`, '')]
      : [run([state.headerTitle], 8.5)];
    const name = [run([state.headerName], 8.5)];
    const footer = [run([state.footerText], 8)];
    const counter = [run(['Page ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], 8)];
    const headers = { default: new Header({ children: [this.headerParagraph(title, name, 8.5)] }) };
    const footers = { default: new Footer({ children: [this.headerParagraph(footer, counter, 8)] }) };
    if (state.mirrorMargins) {
      headers.even = new Header({ children: [this.headerParagraph(name, title, 8.5)] });
      footers.even = new Footer({ children: [this.headerParagraph(counter, footer, 8)] });
    }
    return { headers, footers };
  }

  page() {
    const g = this.geometry;
    return {
      size: { width: twips(g.width), height: twips(g.height) },
      margin: {
        top: twips(g.marginTop),
        right: twips(g.marginRight),
        bottom: twips(g.marginBottom),
        left: twips(g.marginLeft),
        header: twips(Math.max(5, g.marginTop / 2)),
        footer: twips(Math.max(5, g.marginBottom / 2)),
      },
    };
  }

  build(root) {
    const { Document, Header, Footer, Paragraph, VerticalAlignSection, LevelFormat } = this.docx;
    const sections = [];
    const cover = root.querySelector('.cover-page');
    if (cover) {
      sections.push({
        properties: {
          page: this.page(),
          titlePage: true,
          verticalAlign: state.coverTemplate === 'minimal' ? VerticalAlignSection.BOTTOM : VerticalAlignSection.CENTER,
        },
        headers: { default: new Header({ children: [new Paragraph({})] }) },
        footers: { default: new Footer({ children: [new Paragraph({})] }) },
        children: this.cover(cover),
      });
    }
    const content = root.querySelector('.document-content') ?? root;
    sections.push({
      properties: { page: this.page() },
      ...this.headersAndFooters(),
      children: this.blocks(content),
    });
    const size = halfPoints(8.5);
    const heading = (pt, before, after) => ({
      run: { font: FONT, size: halfPoints(pt), bold: true, color: TEXT_COLOR },
      paragraph: { spacing: { before: twips(before), after: twips(after), line: 264 }, keepNext: true },
    });
    return new Document({
      title: state.title,
      subject: state.subtitle,
      creator: state.author,
      lastModifiedBy: 'Markdown Paged Studio',
      evenAndOddHeaderAndFooters: Boolean(state.mirrorMargins),
      features: { updateFields: true },
      hyphenation: { autoHyphenation: true },
      styles: {
        default: {
          document: {
            run: { font: FONT, size, color: TEXT_COLOR, language: { value: this.lang } },
            paragraph: { spacing: { after: AFTER, line: LINE } },
          },
          heading1: heading(22, 0, 8),
          heading2: heading(15, 10, 3),
          heading3: heading(11, 7, 2),
          heading4: heading(10, 5, 2),
          heading5: heading(9.5, 4, 1),
          heading6: heading(9, 4, 1),
        },
        paragraphStyles: [
          {
            id: 'Code',
            name: 'Code',
            basedOn: 'Normal',
            next: 'Normal',
            run: { font: MONO, size: halfPoints(8) },
            paragraph: { spacing: { after: 0, line: 276 } },
          },
          {
            id: 'Caption',
            name: 'caption',
            basedOn: 'Normal',
            next: 'Normal',
            run: { size: halfPoints(9), color: MUTED },
            paragraph: { alignment: 'center', spacing: { before: twips(2), after: twips(4), line: 324 } },
          },
          {
            id: 'FootnoteText',
            name: 'footnote text',
            basedOn: 'Normal',
            run: { size: halfPoints(8.5), color: '3c4043' },
            paragraph: { spacing: { after: 0, line: 336 } },
          },
        ],
      },
      numbering: {
        config: [
          {
            reference: 'bullets',
            levels: [0, 1, 2, 3, 4, 5].map(depth => ({
              level: depth,
              format: LevelFormat.BULLET,
              text: BULLETS[depth % 3],
              alignment: 'left',
              style: { paragraph: { indent: { left: twips(7 * (depth + 1)), hanging: twips(4) } } },
            })),
          },
        ],
      },
      footnotes: this.footnotes,
      sections,
    });
  }
}

// ---- The entry point.

// The formulas of the page, as Office Math: KaTeX writes their MathML, mathml-omml.js the rest. A formula
// that fails keeps its TeX (the builder writes it as text).
async function prepareFormulas(root) {
  const formulas = new Map();
  const nodes = [...root.querySelectorAll('.math')];
  if (!nodes.length) return formulas;
  let katex;
  try {
    katex = await loadKatex();
  } catch (error) {
    console.error(error);
    return formulas;
  }
  const parser = new DOMParser();
  for (const node of nodes) {
    if (has(node, 'math-error')) continue;
    const tex = unescapeHtml(node.getAttribute('aria-label') ?? node.textContent);
    const block = has(node, 'math-block');
    try {
      const html = katex.renderToString(tex, {
        displayMode: block,
        output: 'mathml',
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        maxExpand: 1000,
        maxSize: 100,
        macros: {},
      });
      const math = parser.parseFromString(html, 'text/html').querySelector('math');
      if (!math) continue;
      // Inline, and as a paragraph of its own for a displayed formula without a number.
      formulas.set(node, { inline: ommlOf(math), block: ommlOf(math, { block: true }) });
    } catch (error) {
      console.warn('formula kept as text', error);
    }
  }
  return formulas;
}

async function prepareMedia(root) {
  const media = new Map();
  const jobs = [];
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (!src.startsWith('data:image/')) continue;
    jobs.push(
      mediaOfDataUrl(src)
        .then(found => media.set(img, found))
        .catch(error => console.warn('image left out', error)),
    );
  }
  for (const svg of root.querySelectorAll('.mermaid-diagram > svg'))
    jobs.push(
      mediaOfSvg(svg)
        .then(found => media.set(svg, found))
        .catch(error => console.warn('diagram left out', error)),
    );
  await Promise.all(jobs);
  return media;
}

// The Word document of the current state, as bytes.
export async function documentDocx() {
  const docx = await loadDocx();
  const html = await documentHtml();
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const geometry = pageGeometry(state);
  const [media, formulas] = await Promise.all([prepareMedia(root), prepareFormulas(root)]);
  const builder = new DocxBuilder(docx, { geometry, media, formulas });
  const document = builder.build(root);
  const blob = await docx.Packer.toBlob(document);
  return new Uint8Array(await blob.arrayBuffer());
}
