// Integration tests of the document features: page breaks, table of contents, captions, syntax
// highlighting, running header, facing pages and cover templates.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { marginBoxContent, openDocument, pages, status } from './helpers/studio.mjs';

const REPORT = [
  '# Report',
  '[[toc]]',
  '\\newpage',
  '# First chapter',
  'See the [details](#details).',
  '## Details',
  '```js\n// A comment\nconst answer = 42;\n```',
  '```nolanguage\nplain\n```',
  '```mermaid width=50% caption="The flow of data"\nflowchart LR\n  A --> B\n```',
  '\\newpage',
  '# Second chapter',
  'Text.',
].join('\n\n');

// Page number (1-based) of the page holding the element.
const pageOf = locator =>
  locator.evaluate(
    el => [...document.querySelectorAll('#preview .pagedjs_page')].indexOf(el.closest('.pagedjs_page')) + 1,
  );

// Page numbers of the table of contents: Paged.js resolves target-counter() into a counter set on each link.
const tocNumbers = links =>
  links.evaluateAll(elements =>
    elements.map(element => Number(/(\d+)\s*$/.exec(getComputedStyle(element, '::after').counterReset)?.[1])),
  );

test('page breaks split the document and the table of contents shows the page numbers', async ({ page }) => {
  await openDocument(page, REPORT, 'Report');
  await expect(status(page)).toHaveText('4 pages');
  const content = page.locator('#preview .document-content');
  expect(await pageOf(content.locator('h1', { hasText: 'Report' }))).toBe(2);
  expect(await pageOf(content.locator('h1', { hasText: 'First chapter' }))).toBe(3);
  expect(await pageOf(content.locator('h1', { hasText: 'Second chapter' }))).toBe(4);

  const entries = page.locator('#preview .toc-item a');
  await expect(entries.locator('.toc-text')).toHaveText(['First chapter', 'Details', 'Second chapter']);
  expect(await tocNumbers(entries)).toEqual([3, 3, 4]);

  // The entries and the cross-references lead to their heading; the studio stays in place.
  const shell = page.locator('.preview-shell');
  await shell.evaluate(el => (el.scrollTop = 0));
  await entries.nth(2).click();
  await expect.poll(() => shell.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
  await expect(page.locator('#preview h1#sec-second-chapter')).toBeInViewport();
  await expect(page.locator('#preview .document-content p a', { hasText: 'details' })).toHaveAttribute(
    'href',
    '#sec-details',
  );
  expect(new URL(page.url()).hash).toBe('');

  // The buttons write the markers at the cursor.
  const editor = page.locator('#markdown');
  await editor.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.locator('#insertPageBreak').click();
  await expect(editor).toHaveValue(/Text\.\n\n\\newpage\n$/);
  await page.locator('#insertToc').click();
  await expect(editor).toHaveValue(/\\newpage\n\n\[\[toc\]\]\n$/);
});

test('the exported document carries the page numbers of the table of contents', async ({ page, context }) => {
  await openDocument(page, REPORT, 'Report');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportHtml').click()]);
  const exported = await context.newPage();
  await exported.setContent(readFileSync(await download.path(), 'utf8'));
  await expect(exported.locator('.pagedjs_page')).toHaveCount(4);
  expect(await tocNumbers(exported.locator('.toc-item a'))).toEqual([3, 3, 4]);
});

test('code blocks are highlighted with the chosen theme, diagrams and images take captions', async ({ page }) => {
  await openDocument(page, REPORT, 'Report');
  const blocks = page.locator('#preview .document-content pre');
  await expect(blocks.nth(0)).toHaveClass(/code-block code-light/);
  await expect(blocks.nth(0).locator('.hljs-comment')).toHaveText('// A comment');
  await expect(blocks.nth(0).locator('.hljs-keyword')).toHaveText('const');
  await expect(blocks.nth(0).locator('.hljs-number')).toHaveText('42');
  // Unknown or plain languages are left alone.
  await expect(blocks.nth(1)).not.toHaveClass(/code-block/);
  const color = locator => locator.evaluate(el => getComputedStyle(el).color);
  const background = locator => locator.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(await color(blocks.nth(0).locator('.hljs-keyword'))).toBe('rgb(207, 34, 46)');

  const caption = page.locator('#preview .mermaid-diagram .diagram-caption');
  await expect(caption).toHaveText('The flow of data');
  await expect(page.locator('#preview .mermaid-diagram')).not.toHaveAttribute('data-caption');

  await page.getByRole('tab', { name: 'Design' }).click();
  await page.locator('#codeTheme').selectOption('dark');
  await expect(blocks.nth(0)).toHaveClass(/code-dark/);
  expect(await background(blocks.nth(0))).toBe('rgb(22, 27, 34)');
  expect(await color(blocks.nth(0).locator('.hljs-keyword'))).toBe('rgb(255, 123, 114)');

  await page.locator('#codeTheme').selectOption('none');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(blocks.nth(0)).not.toHaveClass(/code-block/);
  await expect(blocks.nth(0).locator('span')).toHaveCount(0);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#saveConfig').click()]);
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).codeTheme).toBe('none');
});

test('the running header follows the chapters and facing pages mirror margins and margin boxes', async ({ page }) => {
  await openDocument(page, REPORT, 'Report');
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.locator('#runningHeader').check();
  await page.getByRole('tab', { name: 'Page' }).click();
  await page.locator('#marginLeft').fill('30');
  await page.locator('#marginRight').fill('10');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(status(page)).toHaveText('4 pages');
  expect(await marginBoxContent(page, 1, 'top-left')).toBe('"Report"');
  expect(await marginBoxContent(page, 2, 'top-left')).toBe('"First chapter"');
  expect(await marginBoxContent(page, 3, 'top-left')).toBe('"Second chapter"');

  const margins = index =>
    pages(page)
      .nth(index)
      .evaluate(sheet => {
        const box = sheet.getBoundingClientRect();
        const area = sheet.querySelector('.pagedjs_page_content').getBoundingClientRect();
        const mm = pixels => Math.round((pixels / box.width) * 210);
        return { left: mm(area.left - box.left), right: mm(box.right - area.right) };
      });
  expect(await margins(1)).toEqual({ left: 30, right: 10 });
  expect(await margins(2)).toEqual({ left: 30, right: 10 });

  await page.locator('#mirrorMargins').check();
  await expect(page.locator('#preview')).toHaveAttribute('data-facing', '');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  // Page 2 is a left-hand page: binding on the right, page number on the outer (left) edge.
  expect(await margins(1)).toEqual({ left: 10, right: 30 });
  expect(await margins(2)).toEqual({ left: 30, right: 10 });
  expect(await marginBoxContent(page, 1, 'top-right')).toBe('"Report"');
  expect(await marginBoxContent(page, 1, 'bottom-left')).toContain('counter(page)');
  expect(await marginBoxContent(page, 2, 'top-left')).toBe('"First chapter"');
  expect(await marginBoxContent(page, 2, 'bottom-right')).toContain('counter(page)');
  // The cover keeps the whole sheet.
  expect(await margins(0)).toEqual({ left: 0, right: 0 });
  expect(await marginBoxContent(page, 0, 'top-left')).toBe('none');

  // In the two-page view the first page sits on the right, as in the bound document.
  await page.locator('#layoutSpread').click();
  const columns = await pages(page).evaluateAll(sheets =>
    sheets.map(sheet => Math.round(sheet.getBoundingClientRect().left)),
  );
  expect(columns[0]).toBe(columns[2]);
  expect(columns[1]).toBeLessThan(columns[0]);
});

test('cover templates rearrange the same cover with the accent colour', async ({ page }) => {
  await openDocument(page, REPORT, 'Report');
  const cover = page.locator('#preview .cover-page');
  const title = page.locator('#preview .cover-title');
  const style = (locator, property) => locator.evaluate((el, name) => getComputedStyle(el)[name], property);
  expect(await style(cover, 'textAlign')).not.toBe('center');
  await expect(page.locator('#accentColor')).toHaveValue('#1d4ed8');

  await page.locator('#coverTemplate').selectOption('centered');
  await expect.poll(() => style(cover, 'textAlign')).toBe('center');

  await page.locator('#accentColor').fill('#aa3366');
  await page.locator('#coverTemplate').selectOption('band');
  await expect.poll(() => style(cover, 'backgroundImage')).toContain('rgb(170, 51, 102)');

  await page.locator('#coverTemplate').selectOption('minimal');
  await expect.poll(() => style(title, 'borderTopColor')).toBe('rgb(170, 51, 102)');
  await expect(status(page)).toHaveText('4 pages');
  await expect(cover.locator('.cover-title')).toHaveText('Architecture Report');

  // Unknown templates and colours of an imported configuration are ignored.
  await page.locator('#configFile').setInputFiles({
    name: 'config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ coverTemplate: 'fancy', accentColor: 'red;}', codeTheme: 'neon' })),
  });
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(page.locator('#coverTemplate')).toHaveValue('minimal');
  await expect(page.locator('#accentColor')).toHaveValue('#aa3366');
});
