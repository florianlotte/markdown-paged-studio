// Integration tests of the document itself: rendering, autosave, configuration, exports, language, cover.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { png } from './helpers/png.mjs';
import { readSources } from '../src/pdf-sources.js';
import {
  STATUS_DONE,
  appendMarkdown,
  marginBoxContent,
  openFreshStudio,
  pages,
  setMarkdown,
  status,
  exportVia,
} from './helpers/studio.mjs';

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

test('exports a standalone HTML file that paginates offline', async ({ page, context }) => {
  await openFreshStudio(page);
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
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
  await expect(page.locator('#exportDefault')).toBeVisible();
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
  await page.locator('#exportDefault').click();
  await expect.poll(() => page.evaluate(() => window.__print.url)).toMatch(/^blob:/);
  expect(await page.evaluate(() => window.__print.openedSync)).toBe(true);
  const html = await page.evaluate(() => fetch(window.__print.url).then(r => r.text()));
  expect(html).toContain('after:()=>setTimeout(()=>window.print()');
  expect(html).toContain('<article class="document-content" lang="en">');
  // The default export is with the project: the banner asks for the saved PDF.
  const banner = page.locator('#projectBanner');
  await expect(banner).toBeVisible();
  await page.locator('#projectBannerClose').click();
  await expect(banner).toBeHidden();

  // The arrow opens the menu; "PDF only" prints without the banner. Escape and a click elsewhere close it.
  const menu = page.locator('#exportOptions');
  await page.locator('#exportMenu').click();
  await expect(menu).toBeVisible();
  await expect(page.locator('#exportPdfProject')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#exportPdfOnly')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('#exportMenu')).toBeFocused();
  await page.locator('#exportMenu').click();
  await expect(menu).toBeVisible();
  await page.locator('.preview-shell').click({ position: { x: 5, y: 5 } });
  await expect(menu).toBeHidden();
  await stubWindowOpen();
  await page.locator('#exportMenu').click();
  await page.locator('#exportPdfOnly').click();
  await expect(menu).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__print.url)).toMatch(/^blob:/);
  await expect(banner).toBeHidden();

  // The two other entries are plain downloads: the HTML page and the project file.
  const [htmlDownload] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  expect(htmlDownload.suggestedFilename()).toBe('document.html');
  const [project] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
  expect(project.suggestedFilename()).toBe('markdown-paged-studio-project.json');
  expect(JSON.parse(readFileSync(await project.path(), 'utf8')).title).toBe('Architecture Report');
  await expect(menu).toBeHidden();

  // Ctrl+P prints the document, not the studio page.
  await stubWindowOpen();
  await page.locator('#title').focus();
  await page.keyboard.press('Control+p');
  await expect.poll(() => page.evaluate(() => window.__print.url)).toMatch(/^blob:/);
  await expect(banner).toBeVisible();
});

test('saves and loads the configuration as JSON', async ({ page }) => {
  await openFreshStudio(page);
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
  const saved = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(saved).toMatchObject({ title: 'Architecture Report', pageSize: 'A4', cover: true });
  expect(saved.customCss).toContain('.document-content');

  const modified = { ...saved, title: 'From JSON', marginTop: 40, footerText: 'Loaded' };
  await page.locator('#importFile').setInputFiles({
    name: 'config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(modified)),
  });
  await expect(page.locator('#title')).toHaveValue('From JSON');
  await expect(page.locator('#marginTop')).toHaveValue('40');
  await expect(pages(page).nth(0).locator('.cover-title')).toHaveText('From JSON');
  expect(await marginBoxContent(page, 1, 'bottom-left')).toBe('"Loaded"');
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

  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
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

test('the document font is bundled: loaded for the preview, inlined in the export', async ({ page }) => {
  await openFreshStudio(page);
  const loaded = () =>
    page.evaluate(() =>
      [...document.fonts]
        .filter(font => font.family === 'Inter' && font.status === 'loaded')
        .map(font => `${font.style} ${font.unicodeRange.split(',')[0]}`)
        .sort(),
    );
  // The sample is plain Latin text with bold but no italic: one file is enough.
  expect(await loaded()).toEqual(['normal U+0-FF']);
  const rendered = page.locator('#preview .document-content p').first();
  expect(await rendered.evaluate(el => document.fonts.check(`${getComputedStyle(el).fontSize} Inter`))).toBe(true);

  // Italic and Cyrillic text bring their own files, before the pages are laid out.
  await setMarkdown(page, '# Fonts\n\nSome *emphasis* and Привет.\n');
  await expect(page.locator('#preview .document-content h1')).toHaveText('Fonts');
  expect(await loaded()).toEqual(['italic U+0-FF', 'italic U+301', 'normal U+0-FF', 'normal U+301']);

  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  const html = readFileSync(await download.path(), 'utf8');
  expect(html.match(/@font-face\{font-family:Inter;/g)).toHaveLength(4);
  expect(html).toContain('<style data-pagedjs-ignore>@font-face');
  expect(html).toContain('src:url(data:font/woff2;base64,');
  expect(html).not.toMatch(/url\(["']?\/?assets\//);
});

test('the logo is scaled down, saved outside localStorage and restored', async ({ page }) => {
  await openFreshStudio(page);
  await page.locator('#logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: png(3000, 600) });
  const logo = page.locator('#preview .cover-logo');
  await expect(logo).toHaveCount(1);
  await expect.poll(() => logo.evaluate(el => [el.naturalWidth, el.naturalHeight])).toEqual([1200, 240]);

  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('markdown-paged-studio:document')));
  await expect.poll(async () => (await stored())?.title).toBe('Architecture Report');
  expect(await stored()).not.toHaveProperty('logoDataUrl');

  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect.poll(() => logo.evaluate(el => el.naturalWidth)).toBe(1200);

  // The configuration file still carries the logo.
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).logoDataUrl).toMatch(/^data:image\/png;base64,/);

  await page.locator('#clearLogo').click();
  await expect(logo).toHaveCount(0);
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(logo).toHaveCount(0);
});

test('a logo saved in localStorage by an older version is moved to IndexedDB', async ({ page }) => {
  await openFreshStudio(page);
  const dataUrl = `data:image/png;base64,${png(200, 100).toString('base64')}`;
  await page.evaluate(
    value => localStorage.setItem('markdown-paged-studio:document', JSON.stringify({ logoDataUrl: value })),
    dataUrl,
  );
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  const logo = page.locator('#preview .cover-logo');
  await expect.poll(() => logo.evaluate(el => el.naturalWidth)).toBe(200);

  // The next autosave leaves it out of localStorage; the logo survives.
  await page.locator('#title').fill('Moved');
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('markdown-paged-studio:document')));
  await expect.poll(async () => (await stored())?.title).toBe('Moved');
  expect(await stored()).not.toHaveProperty('logoDataUrl');
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect.poll(() => logo.evaluate(el => el.naturalWidth)).toBe(200);
});

test('an exported HTML file carries the document and reopens with Load config', async ({ page }) => {
  await openFreshStudio(page);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(40, 30) });
  await page.locator('#title').fill('Round trip');
  await setMarkdown(page, '# Round trip\n\n![Plan](plan.png){width=50%}\n\nText.\n');
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  const html = readFileSync(await download.path(), 'utf8');
  expect(html).toContain('<script type="application/json" id="markdown-paged-studio-source">');
  expect(html).not.toMatch(/id="markdown-paged-studio-source">[^]*<\/script>[^]*<script type="application\/json"/);

  await page.locator('#resetDocument').click();
  await expect(page.locator('#title')).toHaveValue('Architecture Report');
  await expect(page.locator('#imageList li')).toHaveCount(0);
  await page
    .locator('#importFile')
    .setInputFiles({ name: 'document.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await expect(page.locator('#title')).toHaveValue('Round trip');
  await expect(page.locator('#markdown')).toHaveValue(/!\[Plan\]\(plan\.png\)\{width=50%\}/);
  await expect(page.locator('#imageList li')).toHaveText([/plan\.png/]);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);
});

test('the project is added to a saved PDF in the browser, and such a PDF reopens', async ({ page }) => {
  await openFreshStudio(page);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(40, 30) });
  await page.locator('#title').fill('From a PDF');
  await setMarkdown(page, '# From a PDF\n\n![Plan](plan.png)\n');
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);

  // Export PDF with the project: the print window opens, then the banner asks for the saved file.
  await page.evaluate(() => (window.open = () => ({ set location(value) {} })));
  await page.locator('#exportDefault').click();
  await expect(page.locator('#projectBanner')).toBeVisible();
  // The PDF the print dialog would have saved.
  const blank = await PDFDocument.create();
  blank.addPage();
  const printed = Buffer.from(await blank.save());
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#projectPdfChoose').click()]);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    chooser.setFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: printed }),
  ]);
  expect(download.suggestedFilename()).toBe('report-with-project.pdf');
  await expect(status(page)).toHaveText('Project attached');
  await expect(page.locator('#projectBanner')).toBeHidden();
  const editable = readFileSync(await download.path());
  const sources = JSON.parse((await readSources(editable)).json);
  expect(sources.title).toBe('From a PDF');
  expect(Object.keys(sources.images)).toEqual(['plan.png']);

  await page.locator('#resetDocument').click();
  await expect(page.locator('#title')).toHaveValue('Architecture Report');
  await page
    .locator('#importFile')
    .setInputFiles({ name: 'report-with-project.pdf', mimeType: 'application/pdf', buffer: editable });
  await expect(page.locator('#title')).toHaveValue('From a PDF');
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);

  // A PDF without sources is refused and the document is left alone.
  const messages = [];
  page.removeAllListeners('dialog');
  page.on('dialog', dialog => {
    messages.push(dialog.message());
    dialog.accept();
  });
  await page.locator('#importFile').setInputFiles({ name: 'plain.pdf', mimeType: 'application/pdf', buffer: printed });
  await expect.poll(() => messages).toEqual(['This file could not be opened: this PDF holds no studio sources']);
  await expect(page.locator('#title')).toHaveValue('From a PDF');
});
