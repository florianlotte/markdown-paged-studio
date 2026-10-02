// Browser-side PDF of the paginated preview, for "PDF with project" where no print engine is at hand: each
// page of the preview is drawn by the browser itself (the page's HTML inside an SVG image, with the fonts
// and the Paged.js styles inlined), stored as an image in the PDF, and covered with an invisible text layer
// so the text can be selected and searched. Links of the document become link annotations. The desktop
// app and the MCP server print real vector PDFs instead; the browser keeps that for "PDF only" (print dialog).
import { PDFDocument, PDFString, StandardFonts, TextRenderingMode, rgb, setTextRenderingMode } from 'pdf-lib';
import { inlineFontCss } from './fonts.js';
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
        if (range.getClientRects().length <= 1) {
          end = middle;
          low = middle + 1;
        } else high = middle - 1;
      }
      range.setStart(node, start);
      range.setEnd(node, end);
      const [box] = range.getClientRects();
      const content = text.slice(start, end);
      if (box && box.width > 0 && content.trim()) {
        lines.push({
          text: content,
          x: (box.left - origin.left) / zoom,
          top: (box.top - origin.top) / zoom,
          width: box.width / zoom,
          height: box.height / zoom,
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

// Characters the standard font cannot show are replaced: the layer is only there for selection and search.
const encodable = (font, text) => {
  let out = '';
  for (const character of text) {
    try {
      font.encodeText(character);
      out += character;
    } catch {
      out += ' ';
    }
  }
  return out;
};

// Renders the pages of the preview into a PDF (Uint8Array). `onProgress(done, total)` reports the pages.
export async function renderPreviewToPdf({ preview, title, html, css, onProgress = () => {} }) {
  const pages = [...preview.querySelectorAll('.pagedjs_page')];
  if (!pages.length) throw new Error('Nothing to export: the preview is empty');
  const fonts = await inlineFontCss(html, css).catch(() => '');
  const document_ = await PDFDocument.create();
  document_.setTitle(title);
  document_.setCreator('Markdown Paged Studio');
  const font = await document_.embedFont(StandardFonts.Helvetica);
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
    pdfPage.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
    for (const line of textLines(pages[index])) {
      const size = line.size * PT_PER_PX;
      const text = encodable(font, line.text);
      const natural = font.widthOfTextAtSize(text, size) || 1;
      pdfPage.drawText(text, {
        x: line.x * PT_PER_PX,
        // Baseline near the bottom of the line box: close enough for selection.
        y: pageHeight - (line.top + line.height * 0.8) * PT_PER_PX,
        size,
        font,
        color: rgb(0, 0, 0),
        // Stretched to the width the page used, so a selection follows the words.
        wordBreaks: [],
        ...(natural ? { horizontalScale: ((line.width * PT_PER_PX) / natural) * 100 } : {}),
      });
    }
    pdfPage.pushOperators(setTextRenderingMode(TextRenderingMode.Fill));

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
