// Integration tests of the document features: page breaks, table of contents, captions, syntax
// highlighting, running header, facing pages, cover templates, formulas, alerts, numbering and references.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  cursorToEnd,
  expectMarkdown,
  exportVia,
  marginBoxContent,
  openDocument,
  pages,
  setMarkdown,
  status,
} from './helpers/studio.mjs';

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

  // The page number of an entry on several lines sits on its last line.
  await setMarkdown(page, `${REPORT}\n\n## ${'A long heading that wraps in the table of contents. '.repeat(3)}\n`);
  await expect(entries).toHaveCount(4);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const long = await entries.nth(3).evaluate(link => {
    const text = link.querySelector('.toc-text');
    const range = document.createRange();
    range.selectNodeContents(text);
    const lines = [...range.getClientRects()];
    const dots = link.querySelector('.toc-dots').getBoundingClientRect();
    return {
      lines: new Set(lines.map(line => Math.round(line.top))).size,
      last: lines.at(-1).bottom,
      dots: dots.bottom,
    };
  });
  expect(long.lines).toBeGreaterThan(1);
  expect(Math.abs(long.dots - long.last)).toBeLessThan(6);
  await setMarkdown(page, REPORT);
  await expect(entries).toHaveCount(3);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

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
  await cursorToEnd(page);
  await page.locator('#insertPageBreak').click();
  await expectMarkdown(page, /Text\.\n\n\\newpage\n$/);
  await page.locator('#insertToc').click();
  await expectMarkdown(page, /\\newpage\n\n\[\[toc\]\]\n$/);
});

test('the exported document carries the page numbers of the table of contents', async ({ page, context }) => {
  await openDocument(page, REPORT, 'Report');
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
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

  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).codeTheme).toBe('none');
});

test('the running header can follow the sections, in the drawn PDF too', async ({ page }) => {
  const SECTIONS = [
    '# Report',
    'Intro.',
    '\\newpage',
    '# First chapter',
    'Opening.',
    '\\newpage',
    '## Details',
    'Text.',
    '\\newpage',
    '## More',
    'Text.',
  ].join('\n\n');
  await openDocument(page, SECTIONS, 'Report');
  await page.getByRole('tab', { name: 'Design' }).click();
  const level = page.locator('#runningHeaderLevel');
  await expect(level).toBeDisabled();
  await page.locator('#runningHeader').check();
  await expect(level).toBeEnabled();
  await expect(level).toHaveValue('h1');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(status(page)).toHaveText('5 pages');
  // Level 1: the chapter, on every page of the chapter.
  await expect.poll(() => marginBoxContent(page, 3, 'top-left')).toBe('"First chapter"');
  expect(await marginBoxContent(page, 4, 'top-left')).toBe('"First chapter"');
  // Level 2: the section, and the chapter title on the page where the chapter starts.
  await level.selectOption('h2');
  await expect.poll(() => marginBoxContent(page, 3, 'top-left')).toBe('"Details"');
  expect(await marginBoxContent(page, 2, 'top-left')).toBe('"First chapter"');
  expect(await marginBoxContent(page, 4, 'top-left')).toBe('"More"');
  await expect
    .poll(async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
      return JSON.parse(readFileSync(await download.path(), 'utf8')).runningHeaderLevel;
    })
    .toBe('h2');

  // The page drawn for "PDF with project" shows the header: dark pixels in the top-left margin box.
  const dark = await page.evaluate(async () => {
    const { pageImage } = await import('/src/pdf-render.js');
    const pages = [...document.querySelectorAll('#preview .pagedjs_page')];
    const sheet = pages[3];
    const image = await pageImage(pages, 3, '');
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.type }));
    const scale = bitmap.width / image.width;
    const zoom = Number(getComputedStyle(sheet).getPropertyValue('--view-zoom')) || 1;
    const box = sheet.querySelector('.pagedjs_margin-top-left').getBoundingClientRect();
    const origin = sheet.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const region = [box.left - origin.left, box.top - origin.top, box.width, box.height].map(v => (v / zoom) * scale);
    const data = context.getImageData(...region.map(Math.round)).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 200) count++;
    return count;
  });
  expect(dark).toBeGreaterThan(0);
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
  await expect(page.locator('#accentColor')).toHaveValue('#2c2f73');

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
  await page.locator('#importFile').setInputFiles({
    name: 'config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ coverTemplate: 'fancy', accentColor: 'red;}', codeTheme: 'neon' })),
  });
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(page.locator('#coverTemplate')).toHaveValue('minimal');
  await expect(page.locator('#accentColor')).toHaveValue('#aa3366');
});

test('footnotes go to the foot of the page that calls them, task lists show check boxes', async ({ page, context }) => {
  const filler = Array.from({ length: 30 }, () => 'Filler text to reach the next page. '.repeat(5)).join('\n\n');
  const markdown = [
    '# Notes',
    'A first claim[^a] and a second[^b], the first again[^a], and an inline one^[Written **in place**.].',
    '- [ ] to do\n- [x] done\n- plain',
    filler,
    'A claim further down[^c], see www.example.com.',
    '[^a]: The first note.\n[^b]: The second note.\n[^c]: A note on a later page.',
  ].join('\n\n');
  await openDocument(page, markdown, 'Notes');
  await page.locator('#cover').uncheck();
  await expect(page.locator('#preview .cover-page')).toHaveCount(0);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(status(page)).toHaveText(/^[2-9] pages$/);

  // Where the calls and the notes are, page by page, with the numbers Paged.js gives them.
  const layout = target =>
    target.locator('.pagedjs_page').evaluateAll(sheets =>
      sheets.map(sheet => ({
        calls: sheet.querySelectorAll('.pagedjs_page_content [data-footnote-call]').length,
        notes: [...sheet.querySelectorAll('.pagedjs_footnote_area [data-footnote-marker]')].map(note =>
          note.textContent.trim(),
        ),
        again: [...sheet.querySelectorAll('.footnote-ref')].map(ref => ref.textContent),
      })),
    );
  // First page: the three calls and their notes; last page: the fourth; nothing in between.
  const check = result => {
    expect(result[0]).toEqual({
      calls: 3,
      notes: ['The first note.', 'The second note.', 'Written in place.'],
      again: ['1'],
    });
    expect(result.at(-1)).toEqual({ calls: 1, notes: ['A note on a later page.'], again: [] });
    expect(result.slice(1, -1)).toEqual(result.slice(1, -1).map(() => ({ calls: 0, notes: [], again: [] })));
  };
  const expected = await layout(page.locator('#preview'));
  check(expected);

  // The notes sit inside the sheet, under the text and above the footer of the page.
  const first = pages(page).first();
  const boxes = await first.evaluate(sheet => {
    const box = selector => sheet.querySelector(selector).getBoundingClientRect();
    const notes = [...sheet.querySelectorAll('.pagedjs_footnote_area [data-footnote-marker]')];
    return {
      textBottom: [...sheet.querySelectorAll('.document-content > *')].at(-1).getBoundingClientRect().bottom,
      notesTop: notes[0].getBoundingClientRect().top,
      notesBottom: notes.at(-1).getBoundingClientRect().bottom,
      areaBottom: box('.pagedjs_area').bottom,
    };
  });
  expect(boxes.notesTop).toBeGreaterThan(boxes.textBottom);
  expect(boxes.notesBottom).toBeLessThanOrEqual(boxes.areaBottom + 1);

  // Check boxes of the document are those of the browser, not the form fields of the studio.
  const boxesOfList = page.locator('#preview .task-list-item input');
  await expect(boxesOfList).toHaveCount(2);
  await expect(boxesOfList.nth(1)).toBeChecked();
  await expect(boxesOfList.nth(0)).toBeDisabled();
  expect((await boxesOfList.nth(0).boundingBox()).width).toBeLessThan(30);
  await expect(page.locator('#preview .task-list-item').first()).toHaveCSS('list-style-type', 'none');
  await expect(page.locator('#preview a', { hasText: 'www.example.com' })).toHaveAttribute(
    'href',
    'http://www.example.com',
  );

  // The exported document lays the notes out the same way.
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  const exported = await context.newPage();
  await exported.setContent(readFileSync(await download.path(), 'utf8'));
  await expect(exported.locator('.pagedjs_page')).toHaveCount(expected.length);
  expect(await layout(exported.locator('body'))).toEqual(expected);
});

test('formulas are drawn by KaTeX with their fonts, alerts are titled in the language of the document', async ({
  page,
}) => {
  const katexFonts = () =>
    page.evaluate(() =>
      [...document.fonts]
        .filter(font => font.family.replace(/["']/g, '').startsWith('KaTeX_'))
        .map(font => `${font.family.replace(/["']/g, '')} ${font.status}`)
        .sort(),
    );
  await openDocument(page, '# Plain\n\nIt costs 5 $ or 10 $, H~2~O and ==marked==.\n', 'Plain');
  // Nothing of KaTeX is loaded for a document without formula, and nothing is added to its export.
  expect(await katexFonts()).toEqual([]);
  await expect(page.locator('#mathStyle')).toHaveCount(0);
  await expect(page.locator('#preview mark')).toHaveText('marked');
  await expect(page.locator('#preview mark')).toHaveCSS('background-color', 'rgb(255, 243, 163)');
  await expect(page.locator('#preview sub')).toHaveText('2');
  const [plain] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  expect(readFileSync(await plain.path(), 'utf8')).not.toContain('KaTeX_');

  await setMarkdown(
    page,
    [
      '# Formulas',
      'Energy is $E = mc^2$ with $\\alpha \\in \\mathbb{R}$, and this one is wrong: $\\frac{1}{$.',
      '$$\n\\begin{equation} \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2} \\end{equation}\n$$',
      '> [!WARNING]\n> Check the units.',
      '> An ordinary quote.',
      'Term\n: Its definition.',
    ].join('\n\n'),
  );
  await expect(page.locator('#preview .document-content h1')).toHaveText('Formulas');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  // Drawn by KaTeX, in the text and on a line of its own; the wrong one shows its source.
  await expect(page.locator('#preview .math-inline .katex')).toHaveCount(2);
  await expect(page.locator('#preview .math-block .katex-display')).toHaveCount(1);
  await expect(page.locator('#preview .math-block .eqn-num')).toHaveText('(1)');
  await expect(page.locator('#preview .math-error')).toHaveText('\\frac{1}{');
  await expect(page.locator('#preview .math-error')).toHaveCSS('color', 'rgb(179, 38, 30)');
  // The faces these formulas use were loaded before the pages were laid out, and only those.
  expect(await katexFonts()).toEqual([
    'KaTeX_AMS loaded',
    'KaTeX_Main loaded',
    'KaTeX_Math loaded',
    'KaTeX_Size2 loaded',
  ]);
  expect(
    await page
      .locator('#preview .math-inline .mathnormal')
      .first()
      .evaluate(element => getComputedStyle(element).fontFamily),
  ).toMatch(/KaTeX_Math/);
  // A formula is never cut by a page break.
  await expect(page.locator('#preview .math[data-split-from], #preview .math[data-split-to]')).toHaveCount(0);

  // The alert: a titled box in its own colour, the quote untouched, the definition list.
  const alert = page.locator('#preview .alert');
  await expect(alert).toHaveClass(/alert-warning/);
  await expect(alert.locator('.alert-title')).toHaveText('Warning');
  await expect(alert.locator('.alert-title')).toHaveCSS('color', 'rgb(154, 103, 0)');
  await expect(alert).toHaveCSS('border-left-color', 'rgb(154, 103, 0)');
  await expect(page.locator('#preview blockquote')).toHaveText('An ordinary quote.');
  await expect(page.locator('#preview dl dt')).toHaveText('Term');
  await page.getByRole('tab', { name: 'Page' }).click();
  await page.locator('#language').fill('fr');
  await expect(alert.locator('.alert-title')).toHaveText('Avertissement');

  // The export carries the rules of KaTeX and exactly these faces, and lays the formulas out by itself.
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  const html = readFileSync(await download.path(), 'utf8');
  const inlined = [...html.matchAll(/@font-face\{font-family:(KaTeX_\w+);[^}]*src:url\(data:font\/woff2;base64,/g)].map(
    match => match[1],
  );
  expect(inlined.sort()).toEqual(['KaTeX_AMS', 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size2']);
  expect(html).toContain('.katex{');
  const exported = await page.context().newPage();
  await exported.setContent(html);
  await expect(exported.locator('.pagedjs_page')).toHaveCount(2);
  await expect(exported.locator('.math-block .eqn-num')).toHaveText('(1)');
  expect(
    await exported
      .locator('.math-inline .mathnormal')
      .first()
      .evaluate(element => {
        const style = getComputedStyle(element);
        return document.fonts.check(`${style.fontStyle} ${style.fontSize} KaTeX_Math`);
      }),
  ).toBe(true);
  await exported.close();
});

test('figures, tables, equations and headings are numbered, and references lead to them', async ({ page }) => {
  await openDocument(
    page,
    [
      '# Report {#sec:report}',
      'See @fig:flow, @tab:costs, @eq:energy, @sec:details and @fig:nowhere.',
      '## Details {#sec:details}',
      '```mermaid #fig:flow caption="The flow"\nflowchart LR\n  A --> B\n```',
      '| Item | Cost |\n|---|---|\n| A | 1 |',
      'Table: Costs per item {#tab:costs}',
      '$$ E = mc^2 $$ {#eq:energy}',
      '\\newpage',
      '## Later',
      'Back to @fig:flow.',
    ].join('\n\n'),
    'Report',
  );
  const preview = page.locator('#preview');
  // Labelled elements are numbered without any setting, and the references say so.
  await expect(preview.locator('.diagram-caption')).toHaveText('Figure 1: The flow');
  await expect(preview.locator('.diagram-caption .caption-label')).toHaveText('Figure 1:');
  await expect(preview.locator('table.has-caption caption')).toHaveText('Table 1: Costs per item');
  await expect(preview.locator('#eq-energy .eqn-num')).toHaveText('(1)');
  const references = preview.locator('.document-content p').first().locator('.ref');
  await expect(references).toHaveText([
    'figure\u00a01',
    'table\u00a01',
    'equation\u00a0(1)',
    'Details',
    '@fig:nowhere',
  ]);
  await expect(references.nth(4)).toHaveClass(/ref-missing/);
  await expect(references.nth(0)).toHaveAttribute('href', '#fig-flow');
  // Headings are not numbered until asked.
  await expect(preview.locator('.heading-number')).toHaveCount(0);

  // A reference of the second page brings the figure of the first one into view.
  const back = preview.locator('a.ref-fig').last();
  await back.scrollIntoViewIfNeeded();
  await expect(preview.locator('#fig-flow')).not.toBeInViewport();
  await back.click();
  await expect(preview.locator('#fig-flow')).toBeInViewport();

  // Heading numbers: in the titles, in the references, and in the running header.
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.locator('#numberHeadings').selectOption('h1');
  await expect(preview.locator('.document-content :is(h1, h2)')).toHaveText(['1 Report', '1.1 Details', '1.2 Later']);
  await expect(references.nth(3)).toHaveText('section\u00a01.1');
  await page.locator('#runningHeader').check();
  await expect.poll(() => marginBoxContent(page, 1, 'top-left')).toBe('"1 Report"');
  await page.locator('#numberHeadings').selectOption('h2');
  await expect(preview.locator('.document-content :is(h1, h2)')).toHaveText(['Report', '1 Details', '2 Later']);
  await expect.poll(() => marginBoxContent(page, 1, 'top-left')).toBe('"Report"');

  // The settings travel with the project, and the exported document resolves the same references.
  const [project] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
  const saved = JSON.parse(readFileSync(await project.path(), 'utf8'));
  expect([saved.numberHeadings, saved.numberFigures]).toEqual(['h2', false]);
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  const exported = await page.context().newPage();
  await exported.setContent(readFileSync(await download.path(), 'utf8'));
  await expect(exported.locator('.pagedjs_page')).toHaveCount(3);
  await expect(exported.locator('#eq-energy .eqn-num')).toHaveText('(1)');
  await expect(exported.locator('a.ref-eq')).toHaveText('equation\u00a0(1)');
  await expect(exported.locator('#tab-costs caption')).toHaveText('Table 1: Costs per item');
  await exported.close();
});
