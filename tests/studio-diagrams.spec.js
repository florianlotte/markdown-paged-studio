// Integration tests of the Mermaid diagrams: size and alignment, and their controls in the preview.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  DIAGRAM,
  centre,
  diagramGeometry,
  openDiagramDocument,
  openFreshStudio,
  setMarkdown,
  exportVia,
} from './helpers/studio.mjs';

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
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  const html = readFileSync(await download.path(), 'utf8');
  expect(html).toContain('--diagram-width: 55%');
  expect(html).not.toContain('diagram-tools');
  expect(html).not.toContain('diagram-handle');
});

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
