// Integration tests of what the preview does to the editor: links, undo, keyboard resizing.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { png } from './helpers/png.mjs';
import {
  appendMarkdown,
  cursorToEnd,
  diagramGeometry,
  expectMarkdown,
  expectNoMarkdown,
  exportVia,
  focusEditor,
  openDiagramDocument,
  openDocument,
  openFreshStudio,
  pages,
  setMarkdown,
} from './helpers/studio.mjs';

test('links of the preview open in a new tab and never replace the studio', async ({ page, context }) => {
  await context.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: 'ok' }));
  await openFreshStudio(page);
  await setMarkdown(
    page,
    '# Links\n\n[External](https://example.com/page) and [anchor](#links) and [file](other.md).\n',
  );
  const links = page.locator('#preview .document-content a');
  await expect(links).toHaveCount(3);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const studio = page.url();

  const [opened] = await Promise.all([context.waitForEvent('page'), links.nth(0).click()]);
  await expect(opened).toHaveURL('https://example.com/page');
  expect(await opened.evaluate(() => window.opener)).toBeNull();
  await opened.close();
  expect(page.url()).toBe(studio);

  // Anchors and relative links have no destination in the preview: nothing opens, nothing navigates.
  await links.nth(1).click();
  await links.nth(2).click();
  await expect(pages(page)).not.toHaveCount(0);
  expect(page.url()).toBe(studio);
  expect(context.pages()).toHaveLength(1);
});

test('a change made from the preview can be undone in the editor, with what was typed before', async ({ page }) => {
  await openDiagramDocument(page, 'Undo');
  const editor = page.locator('#markdown');
  const diagram = page.locator('#preview .mermaid-diagram');
  await focusEditor(page);
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Typed words');
  await expect(page.locator('#preview .document-content')).toContainText('Typed words');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  await page.evaluate(() => window.studio.editor.select(2, 6));
  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 75 %' }).click();
  await expectMarkdown(page, /```mermaid width=75%\n[^]*Typed words$/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(75);
  // The caret of the editor stays where it was, and the focus stays in the preview.
  expect(await page.evaluate(() => window.studio.editor.selection())).toEqual([2, 6]);
  await expect(editor.locator('.cm-content')).not.toBeFocused();

  await focusEditor(page);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /```mermaid\n[^]*Typed words$/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).not.toBe(75);
  await page.keyboard.press('Control+Shift+Z');
  await expectMarkdown(page, /```mermaid width=75%\n/);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expectNoMarkdown(page, /Typed words/);
  await expect(page.locator('#preview .document-content')).not.toContainText('Typed words');
});

test('the resize handle keeps the focus across renders, and works with the editor hidden', async ({ page }) => {
  await openDiagramDocument(page, 'Keyboard');
  const editor = page.locator('#markdown');
  const diagram = page.locator('#preview .mermaid-diagram');
  const handle = diagram.locator('.diagram-handle');
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 50 %' }).click();
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(50);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expectMarkdown(page, /width=55%/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(55);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(handle).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expectMarkdown(page, /width=60%/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(60);
  await expect(handle).toBeFocused();

  // Editor hidden (View mode): it cannot take the edit, the source is replaced directly.
  await page.locator('#modeView').click();
  await expect(editor).toBeHidden();
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 25 %' }).click();
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(25);
  await expectMarkdown(page, /width=25%/);
});

test('a change made with the editor hidden is undone and redone from the preview', async ({ page }) => {
  await openDiagramDocument(page, 'Hidden');
  const editor = page.locator('#markdown');
  const diagram = page.locator('#preview .mermaid-diagram');
  await page.locator('#modeView').click();
  await expect(editor).toBeHidden();
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 50 %' }).click();
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(50);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await diagram.getByRole('button', { name: 'Align left' }).click();
  await expectMarkdown(page, /```mermaid width=50% align=left\n/);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /```mermaid width=50%\n/);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /```mermaid\n/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).not.toBe(50);
  await page.keyboard.press('Control+Shift+Z');
  await page.keyboard.press('Control+y');
  await expectMarkdown(page, /```mermaid width=50% align=left\n/);

  // Once the source was edited by hand, the history of the preview no longer applies.
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /```mermaid width=50%\n/);
  await appendMarkdown(page, '\nTyped since.\n');
  await page.locator('#preview').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /```mermaid width=50%\n[^]*Typed since\.\n$/);
});

test('what the insert buttons and pasted images write can be undone in the editor', async ({ page }) => {
  await openFreshStudio(page);
  const editor = page.locator('#markdown');
  await focusEditor(page);
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Typed.');
  await expectMarkdown(page, /Typed\.$/);

  await page.locator('#insertPageBreak').click();
  await expectMarkdown(page, /Typed\.\n\n\\newpage\n$/);
  // The cursor sits after the inserted block: the next insertion follows it.
  await page.locator('#insertToc').click();
  await expectMarkdown(page, /\\newpage\n\n\[\[toc\]\]\n$/);
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(30, 20) });
  await page.locator('#imageList button', { hasText: 'Insert' }).click();
  await expectMarkdown(page, /\[\[toc\]\]\n\n!\[plan\]\(plan\.png\)\n$/);
  await expect(page.locator('#preview .document-image')).toHaveCount(1);

  await focusEditor(page);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /\[\[toc\]\]\n$/);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /Typed\.\n\n\\newpage\n$/);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /Typed\.$/);
  // Only the page break of the sample document is left.
  await expect(page.locator('#preview .page-break')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+Z');
  await expectMarkdown(page, /Typed\.\n\n\\newpage\n$/);

  // With the preview alone, an insert brings the editor back first, so the text is written in a visible
  // editor and stays undoable.
  await page.locator('#modeView').click();
  await expect(editor).toBeHidden();
  await cursorToEnd(page);
  await page.locator('#imageList button', { hasText: 'Insert' }).click();
  await expect(page.locator('#modeSplit')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeVisible();
  await expectMarkdown(page, /\\newpage\n\n!\[plan\]\(plan\.png\)\n$/);
  await focusEditor(page);
  await page.keyboard.press('Control+z');
  await expectMarkdown(page, /Typed\.\n\n\\newpage\n$/);
  await page.locator('#modeView').click();
  await page.evaluate(() => document.getElementById('insertToc').click());
  await expect(editor).toBeVisible();
  await expectMarkdown(page, /\\newpage\n\n\[\[toc\]\]\n$/);
  await expect(page.locator('#preview .toc')).toHaveCount(2);
});

test('the editor and the preview scroll together, and a double-click on a block shows its source', async ({ page }) => {
  const parts = Array.from(
    { length: 14 },
    (_, index) =>
      `## Part ${index + 1}\n\n${`Paragraph ${index + 1} of the long document. `.repeat(18)}\n\nMore of part ${index + 1}.\n`,
  );
  await openDocument(page, `# Long\n\n${parts.join('\n')}`, 'Long');
  const scroller = page.locator('#markdown .cm-scroller');
  const shell = page.locator('.preview-shell');
  const top = locator => locator.evaluate(element => element.scrollTop);
  // Source lines shown at the top of the editor.
  const visibleLines = () =>
    page.evaluate(() => {
      const edge = document.querySelector('#markdown .cm-scroller').getBoundingClientRect().top;
      return [...document.querySelectorAll('#markdown .cm-line')]
        .filter(line => line.getBoundingClientRect().bottom > edge)
        .slice(0, 6)
        .map(line => line.textContent);
    });
  // Headings of the preview shown in its window.
  const visibleHeadings = () =>
    page.evaluate(() => {
      const box = document.querySelector('.preview-shell').getBoundingClientRect();
      return [...document.querySelectorAll('#preview .document-content h2')]
        .filter(heading => {
          const rect = heading.getBoundingClientRect();
          return rect.top >= box.top && rect.bottom <= box.bottom;
        })
        .map(heading => heading.textContent);
    });
  const over = async locator => {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };
  await expect(page.locator('#syncScroll')).toHaveAttribute('aria-pressed', 'true');
  expect(await top(shell)).toBe(0);

  // The editor drives: the preview shows the part being read in the editor.
  await over(scroller);
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => top(shell)).toBeGreaterThan(300);
  const part = /^## (Part \d+)$/.exec((await visibleLines()).find(line => /^## Part/.test(line)) ?? '')?.[1];
  expect(part).toBeTruthy();
  await expect.poll(visibleHeadings).toContain(part);
  // To the end, and back to the start.
  await page.mouse.wheel(0, 100000);
  await expect.poll(visibleHeadings).toContain('Part 14');
  await page.mouse.wheel(0, -100000);
  await expect.poll(visibleHeadings).toContain('Part 1');

  // The preview drives: the editor follows it to the same part.
  await over(shell);
  await page
    .locator('#preview .document-content h2', { hasText: /^Part 9$/ })
    .evaluate(heading => heading.scrollIntoView());
  await expect.poll(async () => (await visibleLines()).join('\n')).toContain('## Part 9');
  await page.mouse.wheel(0, -100000);
  await expect.poll(() => top(scroller)).toBe(0);

  // Switched off: each pane scrolls alone.
  await page.locator('#syncScroll').click();
  await expect(page.locator('#syncScroll')).toHaveAttribute('aria-pressed', 'false');
  await over(scroller);
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => top(scroller)).toBeGreaterThan(300);
  expect(await top(shell)).toBe(0);
  await page.locator('#syncScroll').click();
  await expect.poll(() => top(shell)).toBeGreaterThan(300);

  // A double-click on a block of the preview puts the cursor on its line, in its file.
  await page.locator('#chapterFiles').setInputFiles({
    name: 'annex.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Annex\n\nAnnex text.\n'),
  });
  await page.locator('#fileTabs .file-tab').nth(0).click();
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const cursorLine = () =>
    page.evaluate(() => {
      const text = window.studio.editor.text();
      const [from] = window.studio.editor.selection();
      return text.split('\n')[text.slice(0, from).split('\n').length - 1];
    });
  await page.locator('#preview .document-content p', { hasText: 'More of part 5.' }).dblclick();
  await expect.poll(cursorLine).toBe('More of part 5.');
  await expect(page.locator('#markdown .cm-content')).toBeFocused();
  await page.locator('#preview .document-content p', { hasText: 'Annex text.' }).dblclick();
  await expect(page.locator('#fileTabs .file-tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect.poll(cursorLine).toBe('Annex text.');

  // The marks of the source lines stay in the studio.
  expect(await page.locator('#preview [data-source-line]').count()).toBeGreaterThan(20);
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  expect(readFileSync(await download.path(), 'utf8')).not.toContain('data-source-line');
});
