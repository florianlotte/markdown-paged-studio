// Integration tests of the files of a document: the tabs above the editor, one editor state per file, and the
// assembled document that is rendered and exported.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { png } from './helpers/png.mjs';
import {
  DIAGRAM,
  STATUS_DONE,
  expectMarkdown,
  expectNoMarkdown,
  exportVia,
  focusEditor,
  openDocument,
  status,
} from './helpers/studio.mjs';

const tabs = page => page.locator('#fileTabs .file-tab');
const names = page => page.locator('#fileTabs .file-name');
const headings = page => page.locator('#preview .document-content h1');
const editorText = page => page.evaluate(() => window.studio.editor.text());
const md = (name, text) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) });

test('a document is written as several files: added, renamed, moved, removed, each with its own history', async ({
  page,
}) => {
  await openDocument(page, '# One\n\nFirst.\n', 'One');
  page.on('dialog', dialog => dialog.accept());
  await expect(names(page)).toHaveText(['document.md']);
  // A single file cannot be removed.
  await expect(page.locator('#fileTabs .file-close')).toHaveCount(0);

  // A new file comes after the current one, empty, with the focus in the editor.
  await page.locator('#addFile').click();
  await expect(names(page)).toHaveText(['document.md', 'chapter.md']);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(await editorText(page)).toBe('');
  await page.keyboard.type('# Two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second.');
  // The document is the files one after the other.
  await expectMarkdown(page, '# One\n\nFirst.\n\n\n# Two\n\nSecond.');
  await expect(headings(page)).toHaveText(['One', 'Two']);

  // Renamed in place: a Markdown name, unique in the document.
  await tabs(page).nth(1).dblclick();
  await page.locator('.file-rename').fill('annex');
  await page.keyboard.press('Enter');
  await expect(names(page)).toHaveText(['document.md', 'annex.md']);
  await tabs(page).nth(1).press('F2');
  await page.locator('.file-rename').fill('document');
  await page.keyboard.press('Enter');
  await expect(names(page)).toHaveText(['document.md', 'document-2.md']);

  // Each file keeps its text and its undo history across switches.
  await tabs(page).nth(0).click();
  expect(await editorText(page)).toBe('# One\n\nFirst.\n');
  await focusEditor(page);
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Added to one.');
  await tabs(page).nth(1).click();
  expect(await editorText(page)).toBe('# Two\n\nSecond.');
  await focusEditor(page);
  await page.keyboard.press('Control+z');
  await expectNoMarkdown(page, /Second\./);
  await expectMarkdown(page, /Added to one\./);
  await page.keyboard.press('Control+y');
  await expectMarkdown(page, /Added to one\.\n\n# Two\n\nSecond\.$/);

  // Moved with the keyboard, then by dragging: the document follows the order of the tabs.
  await tabs(page).nth(1).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(names(page)).toHaveText(['document-2.md', 'document.md']);
  await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(headings(page)).toHaveText(['Two', 'One']);
  await tabs(page).nth(0).dragTo(tabs(page).nth(1));
  await expect(names(page)).toHaveText(['document.md', 'document-2.md']);
  await expect(headings(page)).toHaveText(['One', 'Two']);
  // Arrows walk the tabs.
  await tabs(page).nth(1).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).nth(0)).toBeFocused();

  // The files are saved with the document.
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(names(page)).toHaveText(['document.md', 'document-2.md']);
  await expect(headings(page)).toHaveText(['One', 'Two']);

  // Removed after a confirmation: the document is one file again.
  await tabs(page).nth(1).locator('.file-close').click();
  await expect(names(page)).toHaveText(['document.md']);
  await expectMarkdown(page, '# One\n\nFirst.\nAdded to one.');
  await expect(headings(page)).toHaveText(['One']);
});

test('Markdown files are added as files of the document, and the preview edits the file that holds the source', async ({
  page,
}) => {
  await openDocument(page, '# One\n\nFirst.\n', 'One');
  await page
    .locator('#chapterFiles')
    .setInputFiles([
      md('two.md', `# Two\n\n${DIAGRAM.replace('%ATTRS%', '')}`),
      md('notes/three.markdown', '---\nmarkdown-paged-studio: 1\ntitle: Ignored\n---\n# Three\n\nEnd.\n'),
    ]);
  // Named after the files, after the current one; the front matter of a studio export stays out.
  await expect(names(page)).toHaveText(['document.md', 'two.md', 'three.md']);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(headings(page)).toHaveText(['One', 'Two', 'Three']);
  await expectMarkdown(page, /# Three\n\nEnd\.\n$/);
  await expect(page.locator('#title')).not.toHaveValue('Ignored');

  // The diagram lives in the second file: sized from the preview while the first file is shown.
  await tabs(page).nth(0).click();
  const diagram = page.locator('#preview .mermaid-diagram');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 50 %' }).click();
  await expectMarkdown(page, /# Two\n\n```mermaid width=50%\n/);
  expect(await editorText(page)).toBe('# One\n\nFirst.\n');
  // The edit belongs to the history of its file.
  await tabs(page).nth(1).click();
  expect(await editorText(page)).toMatch(/^# Two\n\n```mermaid width=50%\n/);
  await focusEditor(page);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /# Two\n\n```mermaid\n/);

  // The editor bar works on the current file: replaced by a Markdown file, downloaded under its name.
  await page.locator('#markdownFile').setInputFiles(md('other.md', '# Replaced\n'));
  await expectMarkdown(page, '# One\n\nFirst.\n\n\n# Replaced\n\n\n# Three\n\nEnd.\n');
  await expect(names(page)).toHaveText(['document.md', 'two.md', 'three.md']);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadMarkdown').click()]);
  expect(download.suggestedFilename()).toBe('two.md');
  expect(readFileSync(await download.path(), 'utf8')).toBe('# Replaced\n');
});

test('the files travel with the project and the Markdown export, a plain Markdown is one file', async ({ page }) => {
  await openDocument(page, '# One\n\nFirst.\n', 'One');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#chapterFiles').setInputFiles([md('two.md', '# Two\n\nSecond.\n')]);
  await expect(names(page)).toHaveText(['document.md', 'two.md']);
  const assembled = '# One\n\nFirst.\n\n\n# Two\n\nSecond.\n';

  const [project] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
  const saved = JSON.parse(readFileSync(await project.path(), 'utf8'));
  expect(saved.files).toEqual([
    { name: 'document.md', markdown: '# One\n\nFirst.\n' },
    { name: 'two.md', markdown: '# Two\n\nSecond.\n' },
  ]);
  expect(saved.markdown).toBe(assembled);

  const [markdown] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportMarkdown')]);
  const text = readFileSync(await markdown.path(), 'utf8');
  expect(text).toContain('\nfiles:\n  - name: document.md\n    lines: 4\n  - name: two.md\n    lines: 4\n');
  expect(text.endsWith(`\n---\n${assembled}`)).toBe(true);

  // Reset gives the sample back, as one file; the Markdown export brings the files again.
  await page.locator('#resetDocument').click();
  await expect(names(page)).toHaveText(['document.md']);
  await page.locator('#importFile').setInputFiles(md('document.md', text));
  await expect(names(page)).toHaveText(['document.md', 'two.md']);
  await expectMarkdown(page, assembled);
  await expect(headings(page)).toHaveText(['One', 'Two']);

  // So does the project file; a Markdown without front matter is a document of one file.
  await page.locator('#resetDocument').click();
  await page
    .locator('#importFile')
    .setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(names(page)).toHaveText(['document.md', 'two.md']);
  await page.locator('#importFile').setInputFiles(md('plain.md', '# Plain\n\nText.\n'));
  await expect(names(page)).toHaveText(['document.md']);
  await expectMarkdown(page, '# Plain\n\nText.\n');
});

test('the archive export holds the files, the stylesheet and the images, and reopens; any zip of Markdown opens', async ({
  page,
}) => {
  await openDocument(page, '# One\n\n![Plan](plan.png)\n', 'One');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(40, 30) });
  await page.locator('#chapterFiles').setInputFiles([md('two.md', '# Two\n\nSecond.\n')]);
  await page.locator('#title').fill('Zipped');
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);

  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportArchive')]);
  expect(download.suggestedFilename()).toBe('Zipped.zip');
  const bytes = readFileSync(await download.path());
  const entries = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(entries).sort()).toEqual([
    'document.md',
    'markdown-paged-studio.yaml',
    'plan.png',
    'style.css',
    'two.md',
  ]);
  expect(strFromU8(entries['two.md'])).toBe('# Two\n\nSecond.\n');
  expect(strFromU8(entries['markdown-paged-studio.yaml'])).toContain('title: Zipped\n');
  expect(strFromU8(entries['style.css'])).toContain('.document-content');

  await page.locator('#resetDocument').click();
  await expect(names(page)).toHaveText(['document.md']);
  await expect(page.locator('#imageList li')).toHaveCount(0);
  await page.locator('#importFile').setInputFiles({ name: 'Zipped.zip', mimeType: 'application/zip', buffer: bytes });
  await expect(page.locator('#title')).toHaveValue('Zipped');
  await expect(names(page)).toHaveText(['document.md', 'two.md']);
  await expect(headings(page)).toHaveText(['One', 'Two']);
  await expect(page.locator('#imageList li')).toHaveText([/plan\.png/]);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);

  // A zip made elsewhere: its Markdown files in the order of their names, its images, the first heading
  // as the title; the settings stay.
  const foreign = zipSync({
    'book/2-end.md': strToU8('# End\n'),
    'book/1-start.md': strToU8('# The book\n\n![Cover](cover.png)\n'),
    'book/art/cover.png': new Uint8Array(png(20, 20)),
  });
  await page
    .locator('#importFile')
    .setInputFiles({ name: 'book.zip', mimeType: 'application/zip', buffer: Buffer.from(foreign) });
  await expect(names(page)).toHaveText(['1-start.md', '2-end.md']);
  await expect(page.locator('#title')).toHaveValue('The book');
  await expect(page.locator('#imageList li')).toHaveText([/cover\.png/]);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);
  // A zip without Markdown is refused with a message.
  const messages = [];
  page.on('dialog', dialog => messages.push(dialog.message()));
  await page.locator('#importFile').setInputFiles({
    name: 'empty.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync({ 'readme.txt': strToU8('nothing') })),
  });
  await expect.poll(() => messages).toEqual(['This file could not be opened: this archive holds no Markdown file']);
});
