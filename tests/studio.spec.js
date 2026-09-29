// Elementary integration tests: they drive the real studio in a headless Chromium and check that the
// essential flows still work end to end. Paged.js only runs in a browser, so there are no unit tests
// for the rendering pipeline.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { png } from './helpers/png.mjs';

const STATUS_DONE = /^\d+ pages?$/;
const status = page => page.locator('#status');
const pages = page => page.locator('#preview .pagedjs_page');

// Fresh studio: no saved document, no saved view settings.
async function openFreshStudio(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
}

async function appendMarkdown(page, text) {
  await page.locator('#markdown').evaluate((el, value) => {
    el.value += value;
    el.dispatchEvent(new Event('input'));
  }, text);
}

// Text of a Paged.js margin box: it is rendered as CSS `content` on a pseudo-element.
function marginBoxContent(page, pageIndex, box) {
  return pages(page)
    .nth(pageIndex)
    .locator(`.pagedjs_margin-${box} .pagedjs_margin-content`)
    .evaluate(el => getComputedStyle(el, '::after').content);
}

test('renders the sample document as pages with cover, header, footer and counter', async ({ page }) => {
  await openFreshStudio(page);
  await expect(status(page)).toHaveText('3 pages');
  await expect(pages(page)).toHaveCount(3);
  await expect(pages(page).nth(0).locator('.cover-title')).toHaveText('Architecture Report');
  await expect(pages(page).nth(1).locator('.document-content h1').first()).toHaveText('Introduction');
  expect(await marginBoxContent(page, 1, 'top-left')).toBe('"Architecture Report"');
  expect(await marginBoxContent(page, 1, 'top-right')).toBe('"Jane Doe"');
  expect(await marginBoxContent(page, 1, 'bottom-left')).toBe('"Confidential"');
  expect(await marginBoxContent(page, 1, 'bottom-right')).toContain('counter(page)');
  await expect(pages(page).nth(1).locator('.pagedjs_margin-bottom-right')).toHaveClass(/hasContent/);
  // The cover page suppresses header and footer (`content: none` in `@page cover`).
  expect(await marginBoxContent(page, 0, 'top-left')).toBe('none');
  expect(await marginBoxContent(page, 0, 'bottom-right')).toBe('none');
});

test('the preview scrolls inside its own container', async ({ page }) => {
  await openFreshStudio(page);
  const metrics = await page.locator('.preview-shell').evaluate(el => {
    el.scrollTop = 400;
    return { scrollable: el.scrollHeight > el.clientHeight, scrollTop: el.scrollTop };
  });
  expect(metrics.scrollable).toBe(true);
  expect(metrics.scrollTop).toBe(400);
  const shell = await page.locator('.shell').evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(shell.scroll).toBe(shell.client);
});

test('edits re-render the document without leaking styles or render stages', async ({ page }) => {
  await openFreshStudio(page);
  const stylesBefore = await page.locator('head style').count();
  for (let i = 0; i < 5; i++) {
    await appendMarkdown(page, `\n\nParagraph ${i} of a fast burst of edits.\n`);
    await page.waitForTimeout(60);
  }
  await appendMarkdown(page, '\n\n## Extra section\n\n' + 'More text. '.repeat(400));
  await expect(status(page)).toHaveText('4 pages');
  await expect(page.locator('head style')).toHaveCount(stylesBefore);
  await expect(page.locator('.render-stage')).toHaveCount(0);
  await expect(page.locator('#preview .pagedjs_pages')).toHaveCount(1);
});

test('renders Mermaid diagrams and reports invalid ones in place', async ({ page }) => {
  await openFreshStudio(page);
  const diagram = page.locator('#preview .mermaid-diagram > svg');
  await expect(diagram).toHaveCount(1);
  await expect(diagram.locator('text')).toContainText(['Markdown', 'HTML', 'Pages']);
  await expect(page.locator('#preview foreignObject')).toHaveCount(0);

  await appendMarkdown(
    page,
    '\n\n```mermaid\nflowchart LR\n  A --> \n  ((broken\n```\n\n```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```\n',
  );
  await expect(page.locator('#preview .mermaid-error')).toHaveCount(1);
  await expect(page.locator('#preview .mermaid-error')).toContainText('Parse error');
  await expect(page.locator('#preview .mermaid-diagram > svg')).toHaveCount(2);
  await expect(status(page)).toHaveText(STATUS_DONE);
});

test('autosaves the document, restores it on reload, and Reset brings the sample back', async ({ page }) => {
  await openFreshStudio(page);
  await page.locator('#title').fill('Edited title');
  await expect(pages(page).nth(0).locator('.cover-title')).toHaveText('Edited title');
  await page.waitForTimeout(700); // autosave debounce
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(page.locator('#title')).toHaveValue('Edited title');
  await expect(pages(page).nth(0).locator('.cover-title')).toHaveText('Edited title');

  page.on('dialog', dialog => dialog.accept());
  await page.locator('#resetDocument').click();
  await expect(page.locator('#title')).toHaveValue('Architecture Report');
  await expect(pages(page).nth(0).locator('.cover-title')).toHaveText('Architecture Report');
});

test('ignores unknown keys and invalid values in a stored configuration', async ({ page }) => {
  await openFreshStudio(page);
  await page.evaluate(() =>
    localStorage.setItem(
      'markdown-paged-studio:document',
      JSON.stringify({
        title: 'Kept',
        marginTop: '999abc',
        marginLeft: '50',
        pageSize: 'Tabloid',
        logoDataUrl: 'javascript:alert(1)',
        cover: 0,
        unknown: 'dropped',
      }),
    ),
  );
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(page.locator('#title')).toHaveValue('Kept');
  await expect(page.locator('#marginTop')).toHaveValue('24');
  await expect(page.locator('#marginLeft')).toHaveValue('50');
  await expect(page.locator('#pageSize')).toHaveValue('A4');
  await expect(page.locator('#cover')).not.toBeChecked();
  await expect(page.locator('#preview .cover-page')).toHaveCount(0);
  await expect(page.locator('#preview .cover-logo')).toHaveCount(0);
});

test('switches between one and two page layouts, zooms, and remembers the view', async ({ page }) => {
  await openFreshStudio(page);
  const box = async index => pages(page).nth(index).boundingBox();
  const fitZoom = await page.locator('#preview').evaluate(el => Number(el.style.zoom));
  expect(fitZoom).toBeGreaterThan(0);
  await expect(page.locator('#zoomFit')).toHaveClass(/active/);

  await page.locator('#layoutSpread').click();
  const [first, second] = [await box(0), await box(1)];
  expect(second.y).toBe(first.y);
  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(await page.locator('#preview').evaluate(el => Number(el.style.zoom))).toBeLessThan(fitZoom);

  const widthBefore = (await box(0)).width;
  await page.locator('#zoomIn').click();
  await page.locator('#zoomIn').click();
  await expect(page.locator('#zoomFit')).not.toHaveClass(/active/);
  const widthZoomed = (await box(0)).width;
  expect(widthZoomed).toBeGreaterThan(widthBefore);

  // Ctrl + wheel down zooms out.
  await page
    .locator('.preview-shell')
    .evaluate(el =>
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true })),
    );
  expect((await box(0)).width).toBeLessThan(widthZoomed);

  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(page.locator('#layoutSpread')).toHaveClass(/active/);
  await expect(page.locator('#zoomFit')).not.toHaveClass(/active/);

  await page.locator('#layoutSingle').click();
  await page.locator('#zoomFit').click();
  expect(await page.locator('#preview').evaluate(el => Number(el.style.zoom))).toBeCloseTo(fitZoom, 2);
});

test('exports a standalone HTML file that paginates offline', async ({ page, context }) => {
  await openFreshStudio(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportHtml').click()]);
  expect(download.suggestedFilename()).toBe('document.html');
  const html = readFileSync(await download.path(), 'utf8');
  expect(html).not.toContain('unpkg.com');
  expect(html).toContain('window.PagedConfig={auto:true}');
  expect(html).not.toContain('window.print');
  expect(html).not.toContain('data-source=');
  expect(html).toMatch(/class="mermaid-diagram"[^>]*><svg/);
  expect(html).not.toContain('diagram-tools');
  expect(html).toContain('<article class="document-content" lang="en">');

  const offline = await context.newPage();
  await offline.setContent(html);
  await expect(offline.locator('.pagedjs_page')).toHaveCount(3);
  await expect(offline.locator('.cover-title')).toHaveText('Architecture Report');
});

test('Export PDF in the browser opens the print window inside the gesture and prints when paginated', async ({
  page,
}) => {
  await openFreshStudio(page);
  await expect(page.locator('#printPdf')).toHaveCount(0);
  await expect(page.locator('#exportPdf')).toBeVisible();
  const stubWindowOpen = () =>
    page.evaluate(() => {
      window.__print = { openedSync: false, url: null };
      window.open = () => {
        window.__print.openedSync = true;
        return {
          set location(value) {
            window.__print.url = value;
          },
        };
      };
    });

  await stubWindowOpen();
  await page.locator('#exportPdf').click();
  await expect.poll(() => page.evaluate(() => window.__print.url)).toMatch(/^blob:/);
  expect(await page.evaluate(() => window.__print.openedSync)).toBe(true);
  const html = await page.evaluate(() => fetch(window.__print.url).then(r => r.text()));
  expect(html).toContain('after:()=>setTimeout(()=>window.print()');
  expect(html).toContain('<article class="document-content" lang="en">');

  // Ctrl+P prints the document, not the studio page.
  await stubWindowOpen();
  await page.locator('#title').focus();
  await page.keyboard.press('Control+p');
  await expect.poll(() => page.evaluate(() => window.__print.url)).toMatch(/^blob:/);
});

test('saves and loads the configuration as JSON', async ({ page }) => {
  await openFreshStudio(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#saveConfig').click()]);
  const saved = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(saved).toMatchObject({ title: 'Architecture Report', pageSize: 'A4', cover: true });
  expect(saved.customCss).toContain('.document-content');

  const modified = { ...saved, title: 'From JSON', marginTop: 40, footerText: 'Loaded' };
  await page.locator('#configFile').setInputFiles({
    name: 'config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(modified)),
  });
  await expect(page.locator('#title')).toHaveValue('From JSON');
  await expect(page.locator('#marginTop')).toHaveValue('40');
  await expect(pages(page).nth(0).locator('.cover-title')).toHaveText('From JSON');
  expect(await marginBoxContent(page, 1, 'bottom-left')).toBe('"Loaded"');
});

test('sidebar tabs follow the ARIA tabs pattern with keyboard navigation', async ({ page }) => {
  await openFreshStudio(page);
  const contentTab = page.locator('#tab-content');
  const designTab = page.locator('#tab-design');
  await expect(contentTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-content')).toBeVisible();
  await expect(page.locator('#panel-design')).toBeHidden();

  await designTab.click();
  await expect(designTab).toHaveAttribute('aria-selected', 'true');
  await expect(contentTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#panel-design')).toBeVisible();
  await expect(page.locator('#customCss')).toBeVisible();

  await designTab.press('ArrowRight');
  await expect(page.locator('#tab-page')).toBeFocused();
  await expect(page.locator('#panel-page')).toBeVisible();
  await page.locator('#tab-page').press('ArrowRight');
  await expect(contentTab).toBeFocused();
  await expect(page.locator('#panel-content')).toBeVisible();
  await contentTab.press('End');
  await expect(page.locator('#tab-page')).toBeFocused();
});

test('the document language drives lang attributes and typographic quotes', async ({ page }) => {
  await openFreshStudio(page);
  await expect(page.locator('#preview .document-content').first()).toHaveAttribute('lang', 'en');

  await page.locator('#tab-page').click();
  await page.locator('#language').fill('fr');
  await appendMarkdown(page, '\n\nIl a dit "bonjour".\n');
  await expect(page.locator('#preview .document-content').first()).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#preview .cover-page')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#preview')).toContainText('« bonjour »');

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportHtml').click()]);
  expect(readFileSync(await download.path(), 'utf8')).toContain('<html lang="fr">');

  // An invalid tag falls back to "en" in the document and is dropped from the saved configuration.
  await page.locator('#language').fill('not a tag');
  await expect(page.locator('#preview .document-content').first()).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(page.locator('#language')).toHaveValue('en');
});

test('the cover page matches the selected paper height', async ({ page }) => {
  await openFreshStudio(page);
  await page.locator('#tab-page').click();
  const pageHeightMm = () =>
    page.evaluate(() => {
      const box = document.querySelector('#preview .pagedjs_page');
      const zoom = Number(document.getElementById('preview').style.zoom) || 1;
      return box ? (box.getBoundingClientRect().height / zoom) * (25.4 / 96) : null;
    });
  const coverToPageRatio = () =>
    page.evaluate(() => {
      const cover = document.querySelector('#preview .cover-page');
      const pageBox = cover?.closest('.pagedjs_page');
      return cover && pageBox ? cover.getBoundingClientRect().height / pageBox.getBoundingClientRect().height : null;
    });
  for (const [size, expectedMm] of [
    ['A5', 210],
    ['Letter', 279.4],
    ['A4', 297],
  ]) {
    await page.locator('#pageSize').selectOption(size);
    // The change re-renders after a debounce: wait for pages of the new size before measuring the cover.
    await expect.poll(pageHeightMm).toBeCloseTo(expectedMm, 0);
    await expect(status(page)).toHaveText(STATUS_DONE);
    expect(await coverToPageRatio()).toBeCloseTo(1, 1);
  }
});

test('the sidebar header stays fixed while the settings scroll in a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 520 });
  await openFreshStudio(page);
  const body = page.locator('.sidebar-body');
  expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  const before = await page.locator('.sidebar-header').boundingBox();
  const tabsBefore = await page.locator('#tab-design').boundingBox();
  await body.evaluate(el => {
    el.scrollTop = 300;
  });
  expect(await body.evaluate(el => el.scrollTop)).toBe(300);
  expect(await page.locator('.sidebar-header').boundingBox()).toEqual(before);
  expect(await page.locator('#tab-design').boundingBox()).toEqual(tabsBefore);
  await expect(page.locator('.brand-mark')).toBeInViewport();
  // The page itself must not scroll: only the panels moved.
  expect(await page.evaluate(() => document.querySelector('.shell').scrollTop)).toBe(0);
});

test('the sidebar can be hidden and the choice is remembered', async ({ page }) => {
  await openFreshStudio(page);
  const toggle = page.locator('#toggleSidebar');
  const sidebar = page.locator('#sidebar');
  const previewWidth = () => page.locator('.preview-shell').evaluate(el => el.clientWidth);
  const widthBefore = await previewWidth();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The drawer close button belongs to the phone layout only.
  await expect(page.locator('#closeSidebar')).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Show sidebar');
  await expect.poll(previewWidth).toBeGreaterThan(widthBefore + 300);
  // Fit mode follows the wider preview.
  await expect(page.locator('#zoomValue')).not.toHaveText('119 %');

  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(sidebar).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(page.locator('#title')).toBeVisible();
  expect(await previewWidth()).toBe(widthBefore);
});

test('on a phone the settings are a closed drawer and the preview fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshStudio(page);
  const sidebar = page.locator('#sidebar');
  await expect(sidebar).toBeHidden();
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-expanded', 'false');
  // The page fits the width of the phone and the toolbar does not push the preview off-screen.
  const pageBox = await page.locator('#preview .pagedjs_page').first().boundingBox();
  expect(pageBox.width).toBeLessThanOrEqual(390);
  expect(pageBox.y).toBeLessThan(200);
  await expect(page.locator('#exportPdf')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.locator('#toggleSidebar').click();
  await expect(sidebar).toBeVisible();
  const drawer = await sidebar.boundingBox();
  expect(drawer.x).toBe(0);
  expect(drawer.width).toBe(390);
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#closeSidebar')).toBeVisible();

  await page.locator('#closeSidebar').click();
  await expect(sidebar).toBeHidden();
  await expect(page.locator('#preview .pagedjs_page').first()).toBeVisible();
});

const DIAGRAM = '```mermaid%ATTRS%\nflowchart LR\n  A[Markdown] --> B[HTML]\n  B --> C[Pages]\n```\n';

async function setMarkdown(page, text) {
  await page.locator('#markdown').evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }, text);
}

// Width of the diagram as a share of its text column, and where it sits in it.
function diagramGeometry(page) {
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

test('a diagram takes the width and alignment written on its fence line', async ({ page }) => {
  await openFreshStudio(page);
  await setMarkdown(page, '# Sized\n\n' + DIAGRAM.replace('%ATTRS%', ' width=50% align=left'));
  await expect.poll(() => diagramGeometry(page)).toEqual({ percent: 50, left: 0, right: 50 });

  await setMarkdown(page, '# Sized\n\n' + DIAGRAM.replace('%ATTRS%', ' width=100%'));
  await expect.poll(() => diagramGeometry(page)).toEqual({ percent: 100, left: 0, right: 0 });

  // Without attributes the diagram keeps its natural size, centered.
  await setMarkdown(page, '# Natural\n\n' + DIAGRAM.replace('%ATTRS%', ''));
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBeLessThan(100);
  const natural = await diagramGeometry(page);
  expect(Math.abs(natural.left - natural.right)).toBeLessThanOrEqual(1);
});

test('diagrams are resized from the preview and the Markdown follows', async ({ page }) => {
  await openFreshStudio(page);
  await setMarkdown(page, '# Resize\n\nText before.\n\n' + DIAGRAM.replace('%ATTRS%', ''));
  const diagram = page.locator('#preview .mermaid-diagram');
  const editor = page.locator('#markdown');
  // Wait for the pages of the new source: the tools of outdated pages are disabled meanwhile.
  await expect(page.locator('#preview .document-content h1')).toHaveText('Resize');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(diagram.locator('> svg')).toBeVisible();

  // Presets
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 75 %' }).click();
  await expect(editor).toHaveValue(/```mermaid width=75%\n/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(75);

  // Drag the handle towards the centre: the diagram shrinks and the source is rewritten.
  await diagram.hover();
  const handle = await diagram.locator('.diagram-handle').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 120, handle.y + handle.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(editor).not.toHaveValue(/width=75%/);
  const dragged = Number(/```mermaid width=(\d+)%/.exec(await editor.inputValue())?.[1]);
  expect(dragged).toBeGreaterThanOrEqual(10);
  expect(dragged).toBeLessThan(75);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(dragged);

  // Alignment, then back to the natural size
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Align right' }).click();
  await expect(editor).toHaveValue(new RegExp('```mermaid width=' + dragged + '% align=right\\n'));
  await expect.poll(async () => (await diagramGeometry(page))?.right).toBe(0);
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Natural size' }).click();
  await expect(editor).toHaveValue(/```mermaid align=right\n/);

  // Keyboard on the handle: 5 % steps
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 50 %' }).click();
  await expect(editor).toHaveValue(/width=50%/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(50);
  await diagram.locator('.diagram-handle').focus();
  await page.keyboard.press('ArrowRight');
  await expect(editor).toHaveValue(/width=55%/);

  // The controls belong to the studio only: the export carries the size, not the tools.
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(55);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportHtml').click()]);
  const html = readFileSync(await download.path(), 'utf8');
  expect(html).toContain('--diagram-width: 55%');
  expect(html).not.toContain('diagram-tools');
  expect(html).not.toContain('diagram-handle');
});

async function openDiagramDocument(page, title) {
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

const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

test('the diagram toolbar stays reachable while the pointer travels to it', async ({ page }) => {
  await openDiagramDocument(page, 'Travel');
  const diagram = page.locator('#preview .mermaid-diagram');
  const editor = page.locator('#markdown');
  const tools = diagram.locator('.diagram-tools');

  // Straight up from the drawing to a button, step by step through the gap between them.
  const drawing = centre(await diagram.locator('> svg').boundingBox());
  await page.mouse.move(drawing.x, drawing.y, { steps: 5 });
  await expect(tools).toBeVisible();
  const center = centre(await diagram.getByRole('button', { name: 'Center' }).boundingBox());
  await page.mouse.move(center.x, center.y, { steps: 30 });
  await expect(tools).toBeVisible();
  const left = centre(await diagram.getByRole('button', { name: 'Align left' }).boundingBox());
  await page.mouse.move(left.x, left.y, { steps: 10 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(editor).toHaveValue(/```mermaid align=left\n/);
});

test('a clicked diagram keeps its tools until another click or Escape', async ({ page }) => {
  await openDiagramDocument(page, 'Select');
  const diagram = page.locator('#preview .mermaid-diagram');
  const editor = page.locator('#markdown');
  const tools = diagram.locator('.diagram-tools');
  const away = { x: 700, y: 30 }; // the studio toolbar, far from the diagram

  // Without a click the tools go away shortly after the pointer leaves.
  const drawing = centre(await diagram.locator('> svg').boundingBox());
  await page.mouse.move(drawing.x, drawing.y, { steps: 5 });
  await expect(tools).toBeVisible();
  await page.mouse.move(away.x, away.y, { steps: 5 });
  await expect(tools).toBeHidden();

  // A click selects: the tools stay, and survive the re-render of each change.
  await page.mouse.click(drawing.x, drawing.y);
  await expect(diagram).toHaveClass(/is-selected/);
  await page.mouse.move(away.x, away.y, { steps: 5 });
  await page.waitForTimeout(800);
  await expect(tools).toBeVisible();

  const half = centre(await diagram.getByRole('button', { name: 'Width 50 %' }).boundingBox());
  await page.mouse.click(half.x, half.y);
  await expect(editor).toHaveValue(/```mermaid width=50%\n/);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await page.mouse.move(away.x, away.y, { steps: 5 });
  await expect(diagram).toHaveClass(/is-selected/);
  await expect(tools).toBeVisible();
  const right = centre(await diagram.getByRole('button', { name: 'Align right' }).boundingBox());
  await page.mouse.click(right.x, right.y);
  await expect(editor).toHaveValue(/```mermaid width=50% align=right\n/);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await page.mouse.move(away.x, away.y, { steps: 5 });
  await expect(tools).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(diagram).not.toHaveClass(/is-selected/);
  await expect(tools).toBeHidden();

  // Clicking elsewhere in the preview deselects too.
  const again = centre(await diagram.locator('> svg').boundingBox());
  await page.mouse.click(again.x, again.y);
  await expect(diagram).toHaveClass(/is-selected/);
  const heading = centre(await page.locator('#preview .document-content h1').boundingBox());
  await page.mouse.click(heading.x, heading.y);
  await expect(diagram).not.toHaveClass(/is-selected/);
  await page.mouse.move(away.x, away.y, { steps: 5 });
  await expect(tools).toBeHidden();
});

test('the sidebar footer shows the running version and stays at the bottom', async ({ page }) => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  await page.setViewportSize({ width: 1200, height: 520 });
  await openFreshStudio(page);
  const footer = page.locator('.sidebar-footer');
  await expect(footer).toBeVisible();
  await expect(page.locator('#appVersion')).toHaveText(`v${version}`);
  await expect(page.locator('#appVersion')).toHaveAttribute(
    'href',
    `https://github.com/florianlotte/markdown-paged-studio/releases/tag/v${version}`,
  );
  // The dev server does not claim a commit: the working tree may differ from HEAD.
  await expect(page.locator('#appCommit')).toHaveText('dev');
  await expect(page.locator('#appCommit')).not.toHaveAttribute('href', /.*/);

  // Pinned under the scrolling settings, flush with the bottom of the window.
  const before = await footer.boundingBox();
  expect(Math.round(before.y + before.height)).toBe(520);
  await page.locator('.sidebar-body').evaluate(el => {
    el.scrollTop = 300;
  });
  expect(await footer.boundingBox()).toEqual(before);
  await expect(footer).toBeInViewport();
});

// ---- Images

const upload = (page, files) => page.locator('#imageFiles').setInputFiles(files);
const pngFile = (name, width = 300, height = 200) => ({ name, mimeType: 'image/png', buffer: png(width, height) });
const imageItems = page => page.locator('#imageList li');

// Opens the studio on a document and waits for its pages; images uploaded by earlier tests are gone
// because every test runs in a fresh browser context.
async function openDocument(page, markdown, title) {
  await openFreshStudio(page);
  await setMarkdown(page, markdown);
  await expect(page.locator('#preview .document-content h1')).toHaveText(title);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
}

test('images are matched by file name whatever the path, and kept across reloads', async ({ page }) => {
  await openDocument(
    page,
    '# Names\n\n![Plan](./docs/img/Plan.PNG)\n\nInline ![Again](C:\\\\work\\\\plan.png) and ![Other](other.png).\n',
    'Names',
  );
  await expect(page.locator('#preview .image-missing')).toHaveCount(3);
  await expect(page.locator('#preview .image-missing').first()).toHaveText('Missing image: Plan.PNG');
  await expect(imageItems(page)).toHaveCount(3);
  await expect(page.locator('#imageList li.is-missing')).toHaveCount(3);

  await upload(page, pngFile('plan.png'));
  await expect(page.locator('#imagesStatus')).toHaveText('plan.png added.');
  const images = page.locator('#preview .document-image > img');
  await expect(images).toHaveCount(2);
  await expect(images.first()).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(images.first()).toHaveAttribute('alt', 'Plan');
  expect(await images.first().evaluate(el => el.complete && el.naturalWidth)).toBe(300);
  await expect(page.locator('#preview .image-missing')).toHaveText('Missing image: other.png');
  await expect(page.locator('#imageList li.is-missing .image-name')).toHaveText('other.png');
  await expect(page.locator('#imageList li:not(.is-missing) .image-name')).toHaveText('plan.png');
  await expect(page.locator('#imageList li:not(.is-missing) .image-details')).toHaveText(/^300 × 200 · \d+ (B|kB)$/);

  // IndexedDB keeps the library.
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(2);
  await expect(page.locator('#imageList li:not(.is-missing) .image-name')).toHaveText('plan.png');

  // A file of the same name replaces the image; removing it brings the placeholders back.
  await upload(page, pngFile('PLAN.png', 120, 60));
  await expect(page.locator('#imageList li:not(.is-missing)')).toHaveCount(1);
  await expect(page.locator('#imageList li:not(.is-missing) .image-details')).toHaveText(/^120 × 60/);
  await page.locator('#imageList').getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('#preview .image-missing')).toHaveCount(3);
});

test('large raster images are scaled down on upload, vector images are left alone', async ({ page }) => {
  await openDocument(page, '# Sizes\n\n![Wide](wide.png)\n\n![Icon](icon.svg)\n', 'Sizes');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4000 100" width="4000" height="100"><rect width="4000" height="100" fill="#1d4ed8"/></svg>';
  await upload(page, [
    pngFile('wide.png', 3000, 150),
    { name: 'icon.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) },
  ]);
  await expect(page.locator('#imagesStatus')).toHaveText(
    'wide.png added, scaled down to 2400 px wide. icon.svg added.',
  );
  await expect(
    page.locator('#imageList li:not(.is-missing)', { hasText: 'wide.png' }).locator('.image-details'),
  ).toHaveText(/^2400 × 120/);
  const wide = page.locator('#preview .document-image > img[alt="Wide"]');
  await expect(wide).toBeVisible();
  expect(await wide.evaluate(el => el.naturalWidth)).toBe(2400);
  await expect(page.locator('#preview .document-image > img[alt="Icon"]')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml;base64,/,
  );
  // Whatever its pixel size, an image never exceeds the text column.
  const geometry = await wide.evaluate(el => {
    const column = el.closest('p').getBoundingClientRect();
    return el.getBoundingClientRect().width <= column.width + 0.5;
  });
  expect(geometry).toBe(true);
});

test('the configuration file carries the images, Reset removes them', async ({ page }) => {
  await openDocument(page, '# Config\n\n![Plan](plan.png)\n', 'Config');
  await upload(page, pngFile('plan.png'));
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#saveConfig').click()]);
  const saved = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(Object.keys(saved.images)).toEqual(['plan.png']);
  expect(saved.images['plan.png']).toMatch(/^data:image\/png;base64,/);

  page.on('dialog', dialog => dialog.accept());
  await page.locator('#resetDocument').click();
  await expect(imageItems(page)).toHaveCount(0);
  await expect(page.locator('#title')).toHaveValue('Architecture Report');

  const hostile = {
    ...saved,
    images: { ...saved.images, 'bad.png': 'javascript:alert(1)', 'page.html': 'data:text/html,x' },
  };
  await page.locator('#configFile').setInputFiles({
    name: 'config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hostile)),
  });
  await expect(page.locator('#preview .document-content h1')).toHaveText('Config');
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);
  await expect(imageItems(page)).toHaveCount(1);
  await expect(page.locator('#imageList .image-name')).toHaveText('plan.png');
});

test('images are inserted from the list, by pasting, and exported inline', async ({ page }) => {
  await openDocument(page, '# Insert\n\nFirst paragraph.\n', 'Insert');
  const editor = page.locator('#markdown');
  await upload(page, pngFile('My photo (1).png'));
  await editor.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.locator('#imageList').getByRole('button', { name: 'Insert' }).click();
  await expect(editor).toHaveValue(/!\[My photo \(1\)\]\(My%20photo%20%281%29\.png\)\n$/);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);

  // Pasting an image from the clipboard adds it under its own name and references it.
  const bytes = [...png(40, 40)];
  await editor.evaluate((el, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'image.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, bytes);
  await expect(editor).toHaveValue(/!\[pasted-\d{14}\]\(pasted-\d{14}\.png\)\n$/);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(2);
  await expect(imageItems(page)).toHaveCount(2);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportHtml').click()]);
  const html = readFileSync(await download.path(), 'utf8');
  expect(html.match(/<span class="document-image is-block"[^>]*><img src="data:image\/png;base64,/g)).toHaveLength(2);
  expect(html).not.toContain('diagram-tools');
  expect(html).not.toContain('resizable');
});

// Width of an image as a share of its text column, and where it sits in it. The column is the content
// box of the nearest ancestor that is not inline, as in src/resize-controls.js.
function imageGeometry(page, selector = '#preview .document-image') {
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
async function selectImage(page, locator) {
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await locator.scrollIntoViewIfNeeded();
  const middle = centre(await locator.locator('> img').boundingBox());
  await page.mouse.click(middle.x, middle.y);
  await expect(locator).toHaveClass(/is-selected/);
}

const position = async (page, selector) => {
  const { percent, left, right } = await imageGeometry(page, selector);
  return { percent, left, right };
};

test('an image alone on its line is centered, resized and moved from the preview', async ({ page }) => {
  await openDocument(page, '# Block image\n\n![Plan](img/plan.png)\n\nNext paragraph.\n', 'Block image');
  await upload(page, pngFile('plan.png', 300, 200));
  const editor = page.locator('#markdown');
  const block = page.locator('#preview .document-image.is-block');
  const selector = '#preview .document-image.is-block';
  await expect(block.locator('> img')).toBeVisible();

  // Centered by default, like a diagram: no attribute is needed.
  await selectImage(page, block);
  await expect(block.getByRole('button', { name: 'Center' })).toHaveAttribute('aria-pressed', 'true');
  await expect(block.getByRole('button', { name: 'In the text' })).toHaveCount(0);
  await block.getByRole('button', { name: 'Width 50 %' }).click();
  await expect(editor).toHaveValue(/!\[Plan\]\(img\/plan\.png\)\{width=50%\}\n/);
  await expect.poll(() => position(page, selector)).toEqual({ percent: 50, left: 25, right: 25 });

  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await block.getByRole('button', { name: 'Align left' }).click();
  await expect(editor).toHaveValue(/\{width=50% align=left\}/);
  await expect.poll(() => position(page, selector)).toEqual({ percent: 50, left: 0, right: 50 });
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await block.getByRole('button', { name: 'Align right' }).click();
  await expect(editor).toHaveValue(/\{width=50% align=right\}/);
  await expect.poll(() => position(page, selector)).toEqual({ percent: 50, left: 50, right: 0 });

  // Drag the handle (on the left edge of a right-aligned image) to make it wider.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const handle = centre(await block.locator('.diagram-handle').boundingBox());
  await page.mouse.move(handle.x, handle.y, { steps: 5 });
  await page.mouse.down();
  await page.mouse.move(handle.x - 140, handle.y, { steps: 8 });
  await page.mouse.up();
  await expect(editor).not.toHaveValue(/width=50%/);
  const dragged = Number(/\{width=(\d+)% align=right\}/.exec(await editor.inputValue())?.[1]);
  expect(dragged).toBeGreaterThan(50);
  await expect.poll(async () => (await position(page, selector)).percent).toBe(dragged);

  // Back to the centre: the attribute goes away.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await block.getByRole('button', { name: 'Center' }).click();
  await expect(editor).toHaveValue(new RegExp(`\\{width=${dragged}%\\}\\n`));
});

test('an image inside text floats with the text around it, or takes a line of its own', async ({ page }) => {
  const sentence = 'This sentence is long enough to run over several lines next to the image. '.repeat(6);
  await openDocument(page, `# Wrap\n\n![Small](plan.png) ${sentence}\n\nNext paragraph.\n`, 'Wrap');
  await upload(page, pngFile('plan.png', 300, 200));
  const editor = page.locator('#markdown');
  const image = page.locator('#preview .document-image');
  await expect(image.locator('> img')).toBeVisible();

  await selectImage(page, image);
  await expect(image.getByRole('button', { name: 'In the text' })).toHaveAttribute('aria-pressed', 'true');
  await image.getByRole('button', { name: 'Width 25 %' }).click();
  await expect(editor).toHaveValue(/!\[Small\]\(plan\.png\)\{width=25%\} This sentence/);
  await expect.poll(async () => (await imageGeometry(page))?.percent).toBe(25);

  // Right: the image goes to the edge and the text starts beside it, at the same height.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await image.getByRole('button', { name: 'Align right' }).click();
  await expect(editor).toHaveValue(/\{width=25% align=right\} This sentence/);
  await expect.poll(() => imageGeometry(page)).toMatchObject({ percent: 25, right: 0, float: 'right' });
  // Against the right edge, the toolbar must stay inside the page with every button reachable.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const inside = await image.evaluate(element => {
    const sheet = element.closest('.pagedjs_page').getBoundingClientRect();
    const buttons = [...element.querySelectorAll('.diagram-tools button')].map(button =>
      button.getBoundingClientRect(),
    );
    return buttons.length === 9 && buttons.every(box => box.left >= sheet.left && box.right <= sheet.right);
  });
  expect(inside).toBe(true);
  const beside = await page.evaluate(() => {
    const wrapper = document.querySelector('#preview .document-image');
    const paragraph = wrapper.closest('p');
    const range = document.createRange();
    range.selectNodeContents([...paragraph.childNodes].find(node => node.nodeType === 3 && node.textContent.trim()));
    const firstLine = range.getClientRects()[0];
    const box = wrapper.getBoundingClientRect();
    return firstLine.top < box.bottom && firstLine.bottom > box.top && firstLine.right <= box.left + 1;
  });
  expect(beside).toBe(true);

  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await image.getByRole('button', { name: 'Align left' }).click();
  await expect(editor).toHaveValue(/\{width=25% align=left\}/);
  await expect.poll(() => imageGeometry(page)).toMatchObject({ percent: 25, left: 0, float: 'left' });

  // Centre: a line of its own, no float.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await image.getByRole('button', { name: 'Center' }).click();
  await expect(editor).toHaveValue(/\{width=25% align=center\}/);
  await expect.poll(() => imageGeometry(page)).toMatchObject({ percent: 25, float: 'none', display: 'block' });
  const centred = await imageGeometry(page);
  expect(Math.abs(centred.left - centred.right)).toBeLessThanOrEqual(1);

  // Back in the sentence: the alignment goes away, the width stays.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await image.getByRole('button', { name: 'In the text' }).click();
  await expect(editor).toHaveValue(/!\[Small\]\(plan\.png\)\{width=25%\} This sentence/);
  await expect.poll(() => imageGeometry(page)).toMatchObject({ percent: 25, float: 'none', display: 'inline-block' });
});

test('every image can be sized and aligned: same paragraph, table cell, link', async ({ page }) => {
  const markdown = [
    '# Everywhere',
    '![First](plan.png)\n![Second](plan.png)',
    '| Name | Picture |\n|---|---|\n| one | ![Cell](plan.png) |',
    '[![Linked](plan.png)](https://example.com)',
  ].join('\n\n');
  await openDocument(page, `${markdown}\n`, 'Everywhere');
  await upload(page, pngFile('plan.png', 300, 200));
  const editor = page.locator('#markdown');
  const images = page.locator('#preview .document-image');
  await expect(images).toHaveCount(4);

  // Two images of one paragraph are handled independently.
  await selectImage(page, images.nth(1));
  await images.nth(1).getByRole('button', { name: 'Align right' }).click();
  await expect(editor).toHaveValue(/!\[First\]\(plan\.png\)\n!\[Second\]\(plan\.png\)\{align=right\}\n/);
  await selectImage(page, images.nth(0));
  await images.nth(0).getByRole('button', { name: 'Width 25 %' }).click();
  await expect(editor).toHaveValue(/!\[First\]\(plan\.png\)\{width=25%\}\n!\[Second\]\(plan\.png\)\{align=right\}\n/);

  // In a table the width is a share of the cell.
  const cell = page.locator('#preview td .document-image');
  await selectImage(page, cell);
  await cell.getByRole('button', { name: 'Width 50 %' }).click();
  await expect(editor).toHaveValue(/\| one \| !\[Cell\]\(plan\.png\)\{width=50%\} \|/);
  await expect.poll(async () => (await imageGeometry(page, '#preview td .document-image'))?.percent).toBe(50);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await cell.getByRole('button', { name: 'Align left' }).click();
  await expect(editor).toHaveValue(/!\[Cell\]\(plan\.png\)\{width=50% align=left\} \|/);
  await expect.poll(async () => (await imageGeometry(page, '#preview td .document-image'))?.left).toBe(0);

  // Inside a link: selecting does not follow the link, and the width is a share of the paragraph.
  const linked = page.locator('#preview a .document-image');
  await selectImage(page, linked);
  expect(page.url()).not.toContain('example.com');
  await linked.getByRole('button', { name: 'Width 25 %' }).click();
  await expect(editor).toHaveValue(/\[!\[Linked\]\(plan\.png\)\{width=25%\}\]\(https:\/\/example\.com\)/);
  await expect.poll(async () => (await imageGeometry(page, '#preview a .document-image'))?.percent).toBe(25);
  expect(page.url()).not.toContain('example.com');
});
