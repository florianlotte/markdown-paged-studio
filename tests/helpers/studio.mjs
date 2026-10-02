// Shared helpers of the web integration tests (tests/studio-*.spec.js): they drive the real studio in a
// headless Chromium. Paged.js only runs in a browser, so the rendering pipeline has no unit tests.
import { expect } from '@playwright/test';
import { png } from './png.mjs';

export const STATUS_DONE = /^\d+ pages?$/;

export const status = page => page.locator('#status');

export const pages = page => page.locator('#preview .pagedjs_page');

// Fresh studio: no saved document, no saved view settings.
export async function openFreshStudio(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
}

export async function appendMarkdown(page, text) {
  await page.locator('#markdown').evaluate((el, value) => {
    el.value += value;
    el.dispatchEvent(new Event('input'));
  }, text);
}

// Text of a Paged.js margin box: it is rendered as CSS `content` on a pseudo-element.
export function marginBoxContent(page, pageIndex, box) {
  return pages(page)
    .nth(pageIndex)
    .locator(`.pagedjs_margin-${box} .pagedjs_margin-content`)
    .evaluate(el => getComputedStyle(el, '::after').content);
}

export const DIAGRAM = '```mermaid%ATTRS%\nflowchart LR\n  A[Markdown] --> B[HTML]\n  B --> C[Pages]\n```\n';

export async function setMarkdown(page, text) {
  await page.locator('#markdown').evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }, text);
}

// Width of the diagram as a share of its text column, and where it sits in it.
export function diagramGeometry(page) {
  return page.evaluate(() => {
    const diagram = document.querySelector('#preview .mermaid-diagram');
    const drawing = diagram?.querySelector(':scope > svg');
    if (!drawing) return null;
    const column = diagram.parentElement.getBoundingClientRect();
    const box = drawing.getBoundingClientRect();
    return {
      percent: Math.round((box.width / column.width) * 100),
      left: Math.round(((box.left - column.left) / column.width) * 100),
      right: Math.round(((column.right - box.right) / column.width) * 100),
    };
  });
}

export async function openDiagramDocument(page, title) {
  await openFreshStudio(page);
  await setMarkdown(page, `# ${title}\n\nText before.\n\n` + DIAGRAM.replace('%ATTRS%', ''));
  // Wait for the pages of the new source: the tools of outdated pages are disabled meanwhile.
  await expect(page.locator('#preview .document-content h1')).toHaveText(title);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(page.locator('#preview .mermaid-diagram > svg')).toBeVisible();
  // page.mouse works with viewport coordinates and does not scroll: bring the diagram into view first.
  await page.locator('#preview .document-content h1').scrollIntoViewIfNeeded();
  await page.locator('#preview .mermaid-diagram').scrollIntoViewIfNeeded();
}

export const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

export const upload = (page, files) => page.locator('#imageFiles').setInputFiles(files);

export const pngFile = (name, width = 300, height = 200) => ({
  name,
  mimeType: 'image/png',
  buffer: png(width, height),
});

export const imageItems = page => page.locator('#imageList li');

// Opens the studio on a document and waits for its pages; images uploaded by earlier tests are gone
// because every test runs in a fresh browser context.
export async function openDocument(page, markdown, title) {
  await openFreshStudio(page);
  await setMarkdown(page, markdown);
  await expect(page.locator('#preview .document-content h1').first()).toHaveText(title);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
}

// Width of an image as a share of its text column, and where it sits in it. The column is the content
// box of the nearest ancestor that is not inline, as in src/resize-controls.js.
export function imageGeometry(page, selector = '#preview .document-image') {
  return page.evaluate(target => {
    const wrapper = document.querySelector(target);
    const image = wrapper?.querySelector(':scope > img');
    if (!image) return null;
    let block = wrapper.parentElement;
    while (block.parentElement && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
    const zoom = Number(document.getElementById('preview').style.zoom) || 1;
    const style = getComputedStyle(block);
    const edge = side => (parseFloat(style[`padding${side}`]) + parseFloat(style[`border${side}Width`])) * zoom;
    const outer = block.getBoundingClientRect();
    const column = { left: outer.left + edge('Left'), right: outer.right - edge('Right') };
    column.width = column.right - column.left;
    const box = image.getBoundingClientRect();
    // `|| 0` turns the -0 of a tiny negative offset into 0.
    const share = pixels => Math.round((pixels / column.width) * 100) || 0;
    return {
      percent: share(box.width),
      left: share(box.left - column.left),
      right: share(column.right - box.right),
      float: getComputedStyle(wrapper).float,
      display: getComputedStyle(wrapper).display,
    };
  }, selector);
}

// Selects an image of the preview with a real click, and waits for the tools of fresh pages.
export async function selectImage(page, locator) {
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await locator.scrollIntoViewIfNeeded();
  const middle = centre(await locator.locator('> img').boundingBox());
  await page.mouse.click(middle.x, middle.y);
  await expect(locator).toHaveClass(/is-selected/);
}

export const position = async (page, selector) => {
  const { percent, left, right } = await imageGeometry(page, selector);
  return { percent, left, right };
};

// Triggers one entry of the Export menu (exportPdfProject, exportPdfOnly, exportHtml, exportMarkdown, exportProject).
export async function exportVia(page, id) {
  await page.locator('#exportMenu').click();
  await page.locator(`#${id}`).click();
}
