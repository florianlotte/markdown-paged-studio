// Elementary integration tests: they drive the real studio in a headless Chromium and check that the
// essential flows still work end to end. Paged.js only runs in a browser, so there are no unit tests
// for the rendering pipeline.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
  const diagram = page.locator('#preview .mermaid-diagram svg');
  await expect(diagram).toHaveCount(1);
  await expect(diagram.locator('text')).toContainText(['Markdown', 'HTML', 'Pages']);
  await expect(page.locator('#preview foreignObject')).toHaveCount(0);

  await appendMarkdown(
    page,
    '\n\n```mermaid\nflowchart LR\n  A --> \n  ((broken\n```\n\n```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```\n',
  );
  await expect(page.locator('#preview .mermaid-error')).toHaveCount(1);
  await expect(page.locator('#preview .mermaid-error')).toContainText('Parse error');
  await expect(page.locator('#preview .mermaid-diagram svg')).toHaveCount(2);
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
  expect(html).toContain('class="mermaid-diagram"><svg');
  expect(html).toContain('<article class="document-content">');

  const offline = await context.newPage();
  await offline.setContent(html);
  await expect(offline.locator('.pagedjs_page')).toHaveCount(3);
  await expect(offline.locator('.cover-title')).toHaveText('Architecture Report');
});

test('print opens the window inside the click and prints once pagination is done', async ({ page }) => {
  await openFreshStudio(page);
  await page.evaluate(() => {
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
  await page.locator('#printPdf').click();
  await expect.poll(() => page.evaluate(() => window.__print.url)).toMatch(/^blob:/);
  expect(await page.evaluate(() => window.__print.openedSync)).toBe(true);
  const html = await page.evaluate(() => fetch(window.__print.url).then(r => r.text()));
  expect(html).toContain('after:()=>setTimeout(()=>window.print()');
  expect(html).toContain('<article class="document-content">');
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
