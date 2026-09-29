// Integration tests of what the preview does to the editor: links, undo, keyboard resizing.
import { test, expect } from '@playwright/test';
import { png } from './helpers/png.mjs';
import {
  appendMarkdown,
  diagramGeometry,
  openDiagramDocument,
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
  await editor.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Typed words');
  await expect(page.locator('#preview .document-content')).toContainText('Typed words');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  await editor.evaluate(el => {
    el.setSelectionRange(2, 6);
    el.scrollTop = 0;
  });
  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 75 %' }).click();
  await expect(editor).toHaveValue(/```mermaid width=75%\n[^]*Typed words$/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(75);
  // The caret of the editor stays where it was, and the focus stays in the preview.
  expect(await editor.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([2, 6]);
  await expect(editor).not.toBeFocused();

  await editor.focus();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/```mermaid\n[^]*Typed words$/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).not.toBe(75);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(/```mermaid width=75%\n/);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(editor).not.toHaveValue(/Typed words/);
  await expect(page.locator('#preview .document-content')).not.toContainText('Typed words');
});

test('the resize handle keeps the focus across renders, and works with the sidebar hidden', async ({ page }) => {
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
  await expect(editor).toHaveValue(/width=55%/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(55);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(handle).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(editor).toHaveValue(/width=60%/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(60);
  await expect(handle).toBeFocused();

  // Hidden sidebar: the editor cannot take the edit, the source is replaced directly.
  await page.locator('#toggleSidebar').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 25 %' }).click();
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(25);
  await expect(editor).toHaveValue(/width=25%/);
});

test('a change made with the editor hidden is undone and redone from the preview', async ({ page }) => {
  await openDiagramDocument(page, 'Hidden');
  const editor = page.locator('#markdown');
  const diagram = page.locator('#preview .mermaid-diagram');
  await page.locator('#toggleSidebar').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 50 %' }).click();
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(50);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await diagram.getByRole('button', { name: 'Align left' }).click();
  await expect(editor).toHaveValue(/```mermaid width=50% align=left\n/);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/```mermaid width=50%\n/);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/```mermaid\n/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).not.toBe(50);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+y');
  await expect(editor).toHaveValue(/```mermaid width=50% align=left\n/);

  // Once the source was edited by hand, the history of the preview no longer applies.
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/```mermaid width=50%\n/);
  await appendMarkdown(page, '\nTyped since.\n');
  await page.locator('#preview').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/```mermaid width=50%\n[^]*Typed since\.\n$/);
});

test('what the insert buttons and pasted images write can be undone in the editor', async ({ page }) => {
  await openFreshStudio(page);
  const editor = page.locator('#markdown');
  await editor.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Typed.');
  await expect(editor).toHaveValue(/Typed\.$/);

  await page.locator('#insertPageBreak').click();
  await expect(editor).toHaveValue(/Typed\.\n\n\\newpage\n$/);
  // The cursor sits after the inserted block: the next insertion follows it.
  await page.locator('#insertToc').click();
  await expect(editor).toHaveValue(/\\newpage\n\n\[\[toc\]\]\n$/);
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(30, 20) });
  await page.locator('#imageList button', { hasText: 'Insert' }).click();
  await expect(editor).toHaveValue(/\[\[toc\]\]\n\n!\[plan\]\(plan\.png\)\n$/);
  await expect(page.locator('#preview .document-image')).toHaveCount(1);

  await editor.focus();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/\[\[toc\]\]\n$/);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/Typed\.\n\n\\newpage\n$/);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(/Typed\.$/);
  // Only the page break of the sample document is left.
  await expect(page.locator('#preview .page-break')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(/Typed\.\n\n\\newpage\n$/);

  // With the editor out of sight the text is still written.
  await page.getByRole('tab', { name: 'Design' }).click();
  await editor.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.evaluate(() => document.getElementById('insertToc').click());
  await expect(editor).toHaveValue(/\\newpage\n\n\[\[toc\]\]\n$/);
  await expect(page.locator('#preview .toc')).toHaveCount(2);
});
