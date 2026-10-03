// Browser-side PDF of the paginated preview, for "PDF with project" where no print engine is at hand: each
// page of the preview is drawn by the browser itself (the page's HTML inside an SVG image, with the fonts
// and the Paged.js styles inlined), stored as an image in the PDF, and covered with an invisible text layer
// so the text can be selected and searched, whatever its script. Links of the document become link annotations. The desktop
// app and the MCP server print real vector PDFs instead; the browser keeps that for "PDF only" (print dialog).
import {
  beginText,
  endText,
  PDFDocument,
  PDFHexString,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} from 'pdf-lib';
import { inlineFontCss } from './fonts.js';
import { GLYPH_WIDTH, GLYPHLESS_FONT, TO_UNICODE } from './glyphless-font.js';
import { previewCss } from './render.js';

// Pixels per CSS pixel of the page images: 2 gives 192 dpi, enough for screens and ordinary printing.
export const RENDER_SCALE = 2;
const PT_PER_PX = 0.75;
const STUDIO_ONLY = '.diagram-tools, .diagram-handle';

// The current CSS zoom of the preview: on-screen rectangles are measured through it.
function previewZoom(page) {
  return Number(getComputedStyle(page).getPropertyValue('--view-zoom')) || 1;
}

// Counters that run across pages (page number, footnotes): a page drawn alone must start from the values
// the earlier pages left.
function counterReset(pages, index) {
  let footnotes = 0;
  for (let i = 0; i < index; i++) footnotes += pages[i].querySelectorAll('[data-footnote-call]').length;
  return `counter-reset: page ${index} pages ${pages.length} footnote ${footnotes} footnote-marker ${footnotes}`;
}

// The page as an SVG image the browser renders exactly like the preview (same engine, same styles).
async function pageImage(pages, index, fonts) {
  const page = pages[index];
  const width = page.offsetWidth;
  const height = page.offsetHeight;
  const clone = page.cloneNode(true);
  for (const element of clone.querySelectorAll(STUDIO_ONLY)) element.remove();
  for (const element of clone.querySelectorAll('.is-selected')) element.classList.remove('is-selected');
  const wrapper = document.createElement('div');
  wrapper.className = 'pagedjs_pages';
  wrapper.setAttribute('style', `${page.parentElement.getAttribute('style') ?? ''}; ${counterReset(pages, index)}`);
  wrapper.append(clone);
  const html = new XMLSerializer().serializeToString(wrapper);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<style>${fonts}\n${previewCss()}\n.pagedjs_page{margin:0 !important;box-shadow:none !important}</style>` +
    `<foreignObject width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml">${html}</div></foreignObject></svg>`;
  const image = new Image();
  image.decoding = 'sync';
  // A data URL, not a blob URL: an SVG image from a blob URL taints the canvas, which then cannot be read.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Page ${index + 1} could not be drawn`));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * RENDER_SCALE);
    canvas.height = Math.round(height * RENDER_SCALE);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Photographs compress far better as JPEG; text and drawings stay sharp as PNG.
    const photo = Boolean(page.querySelector('.document-image > img:not([src^="data:image/svg"])'));
    const type = photo ? 'image/jpeg' : 'image/png';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type, width, height };
  }
}

// The boxes a range of text is drawn in. One line of text can come as several boxes (a change of font for
// another script, an empty box at a boundary): what tells lines apart is their vertical position.
const drawnRects = range => [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
const onOneLine = rects => rects.every(rect => Math.abs(rect.top - rects[0].top) < rects[0].height / 2);

// Lines of text of a page, each with its box in CSS pixels of the page and its style, from the live layout.
function textLines(page) {
  const zoom = previewZoom(page);
  const origin = page.getBoundingClientRect();
  const lines = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
    acceptNode: node =>
      node.parentElement?.closest(STUDIO_ONLY) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (!text.trim()) continue;
    const style = getComputedStyle(node.parentElement);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    let start = 0;
    while (start < text.length) {
      // The longest run from `start` that stays on one line, found by bisection on its end.
      let low = start + 1;
      let high = text.length;
      let end = high;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        range.setStart(node, start);
        range.setEnd(node, middle);
        if (onOneLine(drawnRects(range))) {
          end = middle;
          low = middle + 1;
        } else high = middle - 1;
      }
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = drawnRects(range);
      const content = text.slice(start, end);
      if (rects.length && content.trim()) {
        const left = Math.min(...rects.map(rect => rect.left));
        const top = Math.min(...rects.map(rect => rect.top));
        lines.push({
          text: content,
          x: (left - origin.left) / zoom,
          top: (top - origin.top) / zoom,
          width: (Math.max(...rects.map(rect => rect.right)) - left) / zoom,
          height: (Math.max(...rects.map(rect => rect.bottom)) - top) / zoom,
          size: parseFloat(style.fontSize),
        });
      }
      if (end <= start) break;
      start = end;
    }
  }
  return lines;
}

// Links of a page: where they are, and where they go (an address, or an element of another page).
function links(page) {
  const zoom = previewZoom(page);
  const origin = page.getBoundingClientRect();
  const found = [];
  for (const anchor of page.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    for (const box of anchor.getClientRects()) {
      if (box.width === 0 || box.height === 0) continue;
      found.push({
        href,
        x: (box.left - origin.left) / zoom,
        top: (box.top - origin.top) / zoom,
        width: box.width / zoom,
        height: box.height / zoom,
      });
    }
  }
  return found;
}

// Page index and vertical position (CSS pixels from the top of that page) of an anchor target.
function anchorTarget(pages, href) {
  const id = href.slice(1);
  for (let index = 0; index < pages.length; index++) {
    const target = [...pages[index].querySelectorAll('[id]')].find(element => element.id === id);
    if (target) {
      const zoom = previewZoom(pages[index]);
      const top = (target.getBoundingClientRect().top - pages[index].getBoundingClientRect().top) / zoom;
      return { index, top };
    }
  }
  return null;
}

// The font of the text layer: a composite font whose codes are UTF-16 code units, all drawn with the same
// empty glyph, so any script can be searched and copied. Returns the reference of the font dictionary.
function embedTextLayerFont(document_) {
  const { context } = document_;
  const fontFile = context.register(context.flateStream(GLYPHLESS_FONT, { Length1: GLYPHLESS_FONT.length }));
  // Two bytes per code: every code shows glyph 1.
  const glyphOfCode = new Uint8Array(2 * 65536);
  for (let index = 1; index < glyphOfCode.length; index += 2) glyphOfCode[index] = 1;
  const descriptor = context.register(
    context.obj({
      Type: 'FontDescriptor',
      FontName: 'GlyphLessFont',
      Flags: 5,
      FontBBox: [0, 0, GLYPH_WIDTH, 1000],
      ItalicAngle: 0,
      Ascent: 1000,
      Descent: -1,
      CapHeight: 1000,
      StemV: 80,
      FontFile2: fontFile,
    }),
  );
  const descendant = context.register(
    context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'GlyphLessFont',
      CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
      FontDescriptor: descriptor,
      DW: GLYPH_WIDTH,
      CIDToGIDMap: context.register(context.flateStream(glyphOfCode)),
    }),
  );
  return context.register(
    context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'GlyphLessFont',
      Encoding: 'Identity-H',
      DescendantFonts: [descendant],
      ToUnicode: context.register(context.flateStream(TO_UNICODE)),
    }),
  );
}

// The UTF-16 code units of a line, as the hexadecimal string the font expects. Control characters become
// spaces, and so do the characters outside the basic plane (their two halves cannot be mapped back).
function codeUnits(text) {
  let hex = '';
  let count = 0;
  for (const character of text) {
    const code = character.codePointAt(0);
    const unit = code < 0x20 || code > 0xffff ? 0x20 : code;
    hex += unit.toString(16).toUpperCase().padStart(4, '0');
    count++;
  }
  return { hex, count };
}

// Renders the pages of the preview into a PDF (Uint8Array). `onProgress(done, total)` reports the pages.
export async function renderPreviewToPdf({ preview, title, html, css, onProgress = () => {} }) {
  const pages = [...preview.querySelectorAll('.pagedjs_page')];
  if (!pages.length) throw new Error('Nothing to export: the preview is empty');
  const fonts = await inlineFontCss(html, css).catch(() => '');
  const document_ = await PDFDocument.create();
  document_.setTitle(title);
  document_.setCreator('Markdown Paged Studio');
  const textFont = embedTextLayerFont(document_);
  const pdfPages = [];
  const pending = []; // links to other pages, resolved once every page exists

  for (let index = 0; index < pages.length; index++) {
    const image = await pageImage(pages, index, fonts);
    const embedded =
      image.type === 'image/jpeg' ? await document_.embedJpg(image.bytes) : await document_.embedPng(image.bytes);
    const pageWidth = image.width * PT_PER_PX;
    const pageHeight = image.height * PT_PER_PX;
    const pdfPage = document_.addPage([pageWidth, pageHeight]);
    pdfPage.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });

    // Invisible text, line by line, where the page shows it.
    const fontKey = pdfPage.node.newFontDictionary('TextLayer', textFont);
    const operators = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
    for (const line of textLines(pages[index])) {
      const size = line.size * PT_PER_PX;
      const { hex, count } = codeUnits(line.text);
      const natural = (count * size * GLYPH_WIDTH) / 1000;
      if (!natural) continue;
      operators.push(
        setFontAndSize(fontKey, size),
        // Stretched to the width the page used, so a selection follows the words.
        setCharacterSqueeze(((line.width * PT_PER_PX) / natural) * 100),
        // Baseline near the bottom of the line box: close enough for selection.
        setTextMatrix(1, 0, 0, 1, line.x * PT_PER_PX, pageHeight - (line.top + line.height * 0.8) * PT_PER_PX),
        showText(PDFHexString.of(hex)),
      );
    }
    pdfPage.pushOperators(...operators, endText(), popGraphicsState());

    for (const link of links(pages[index])) {
      const rect = [
        link.x * PT_PER_PX,
        pageHeight - (link.top + link.height) * PT_PER_PX,
        (link.x + link.width) * PT_PER_PX,
        pageHeight - link.top * PT_PER_PX,
      ];
      if (/^(https?:|mailto:)/i.test(link.href)) {
        pdfPage.node.addAnnot(
          document_.context.register(
            document_.context.obj({
              Type: 'Annot',
              Subtype: 'Link',
              Rect: rect,
              Border: [0, 0, 0],
              A: { Type: 'Action', S: 'URI', URI: PDFString.of(link.href) },
            }),
          ),
        );
      } else if (link.href.startsWith('#')) {
        const target = anchorTarget(pages, link.href);
        if (target) pending.push({ pdfPage, rect, target });
      }
    }
    pdfPages.push(pdfPage);
    onProgress(index + 1, pages.length);
  }

  for (const { pdfPage, rect, target } of pending) {
    const destination = pdfPages[target.index];
    pdfPage.node.addAnnot(
      document_.context.register(
        document_.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: rect,
          Border: [0, 0, 0],
          Dest: [destination.ref, 'XYZ', null, destination.getHeight() - target.top * PT_PER_PX, null],
        }),
      ),
    );
  }

  return document_.save({ useObjectStreams: false });
}
