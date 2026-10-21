// Integration tests of the Mermaid diagrams: size and alignment, and their controls in the preview.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  centre,
  DIAGRAM,
  diagramGeometry,
  expectMarkdown,
  expectNoMarkdown,
  exportVia,
  markdownText,
  openDiagramDocument,
  openFreshStudio,
  setMarkdown,
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
  // Wait for the pages of the new source: the tools of outdated pages are disabled meanwhile.
  await expect(page.locator('#preview .document-content h1')).toHaveText('Resize');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(diagram.locator('> svg')).toBeVisible();

  // Presets
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 75 %' }).click();
  await expectMarkdown(page, /```mermaid width=75%\n/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(75);

  // Drag the handle towards the centre: the diagram shrinks and the source is rewritten.
  await diagram.hover();
  const handle = await diagram.locator('.diagram-handle').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 120, handle.y + handle.height / 2, { steps: 6 });
  await page.mouse.up();
  await expectNoMarkdown(page, /width=75%/);
  const dragged = Number(/```mermaid width=(\d+)%/.exec(await markdownText(page))?.[1]);
  expect(dragged).toBeGreaterThanOrEqual(10);
  expect(dragged).toBeLessThan(75);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(dragged);

  // Alignment, then back to the natural size
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Align right' }).click();
  await expectMarkdown(page, new RegExp('```mermaid width=' + dragged + '% align=right\\n'));
  await expect.poll(async () => (await diagramGeometry(page))?.right).toBe(0);
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Natural size' }).click();
  await expectMarkdown(page, /```mermaid align=right\n/);

  // Keyboard on the handle: 5 % steps
  await diagram.hover();
  await diagram.getByRole('button', { name: 'Width 50 %' }).click();
  await expectMarkdown(page, /width=50%/);
  await expect.poll(async () => (await diagramGeometry(page))?.percent).toBe(50);
  await diagram.locator('.diagram-handle').focus();
  await page.keyboard.press('ArrowRight');
  await expectMarkdown(page, /width=55%/);

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
  await expectMarkdown(page, /```mermaid align=left\n/);
});

test('a clicked diagram keeps its tools until another click or Escape', async ({ page }) => {
  await openDiagramDocument(page, 'Select');
  const diagram = page.locator('#preview .mermaid-diagram');
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
  // Longer than the grace delay after which unselected tools hide: the wait is the scenario itself.
  await page.waitForTimeout(800);
  await expect(tools).toBeVisible();

  const half = centre(await diagram.getByRole('button', { name: 'Width 50 %' }).boundingBox());
  await page.mouse.click(half.x, half.y);
  await expectMarkdown(page, /```mermaid width=50%\n/);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await page.mouse.move(away.x, away.y, { steps: 5 });
  await expect(diagram).toHaveClass(/is-selected/);
  await expect(tools).toBeVisible();
  const right = centre(await diagram.getByRole('button', { name: 'Align right' }).boundingBox());
  await page.mouse.click(right.x, right.y);
  await expectMarkdown(page, /```mermaid width=50% align=right\n/);
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

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a tap opens the tools of a figure, a second tap closes them, a scroll does not open them', async ({ page }) => {
    await openDiagramDocument(page, 'Tap');
    const diagram = page.locator('#preview .mermaid-diagram');
    const tools = diagram.locator('.diagram-tools');
    const handle = diagram.locator('.diagram-handle');
    const drawing = async () => centre(await diagram.locator('> svg').boundingBox());
    // A finger has no hover: the engine says so through the media query, which the handle size follows.
    const hoverless = await page.evaluate(() => matchMedia('(hover: none)').matches);

    // A press alone (the start of a scroll) selects nothing; the tap does.
    await diagram.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 2, isPrimary: true, bubbles: true });
    await expect(diagram).not.toHaveClass(/is-selected/);
    let point = await drawing();
    await page.touchscreen.tap(point.x, point.y);
    await expect(diagram).toHaveClass(/is-selected/);
    await expect(tools).toBeVisible();
    await expect(handle).toBeVisible();
    if (hoverless) {
      const box = await handle.boundingBox();
      // 28 × 44 px, give or take the rounding of the zoom.
      expect(box.width).toBeGreaterThanOrEqual(27);
      expect(box.height).toBeGreaterThanOrEqual(43);
    }
    // The tools fit the narrow page.
    const bar = await tools.boundingBox();
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(390);

    // A tap on a preset writes the width and keeps the figure selected after the render.
    const half = centre(await diagram.getByRole('button', { name: 'Width 50 %' }).boundingBox());
    await page.touchscreen.tap(half.x, half.y);
    await expectMarkdown(page, /```mermaid width=50%\n/);
    await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
    await expect(diagram).toHaveClass(/is-selected/);
    await expect(tools).toBeVisible();

    // A second tap on the figure closes its tools; a tap on the text does too.
    point = await drawing();
    await page.touchscreen.tap(point.x, point.y);
    await expect(diagram).not.toHaveClass(/is-selected/);
    if (hoverless) await expect(tools).toBeHidden();
    point = await drawing();
    await page.touchscreen.tap(point.x, point.y);
    await expect(diagram).toHaveClass(/is-selected/);
    // The heading above is under the tools bar: the page below the figure is free.
    const box = await diagram.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 40);
    await expect(diagram).not.toHaveClass(/is-selected/);
  });
});

test('HTML tags in diagram labels are formatted or dropped', async ({ page }) => {
  await openFreshStudio(page);
  await setMarkdown(
    page,
    '# Tags\n\n```mermaid\nflowchart LR\n  A["<b>Bold</b> plain<br><i>soft</i>"] --> B[<u>Under</u> <span class="x">in</span>]\n```\n\n' +
      '```mermaid\nsequenceDiagram\n  Alice->>Bob: <b>Hi</b> <u>there</u>\n```\n',
  );
  await expect(page.locator('#preview .document-content h1')).toHaveText('Tags');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const drawings = page.locator('#preview .mermaid-diagram > svg');
  await expect(drawings).toHaveCount(2);

  // The text of the labels, without tags nor marks, and the styled runs.
  const labels = await drawings.evaluateAll(svgs =>
    svgs.map(svg => ({
      // One tspan per line in a flowchart label: joined with a space.
      text: [...svg.querySelectorAll('text')].map(text =>
        [...text.childNodes]
          .map(line => line.textContent)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
      bold: [...svg.querySelectorAll('tspan[style*="font-weight: bold"]')].map(span => span.textContent),
      italic: [...svg.querySelectorAll('tspan[style*="font-style: italic"]')].map(span => span.textContent),
      marks: [...svg.querySelectorAll('text')].some(text => /[\u2061-\u2064<>]/.test(text.textContent)),
    })),
  );
  expect(labels[0].text).toContain('Bold plain soft');
  expect(labels[0].text).toContain('Under in');
  expect(labels[0].bold).toEqual(['Bold']);
  expect(labels[0].italic).toEqual(['soft']);
  expect(labels[1].text).toContain('Hi there');
  expect(labels[1].bold).toEqual(['Hi']);
  expect(labels.map(label => label.marks)).toEqual([false, false]);
});

// A drawing of the preview: its text size and stroke width in whole pixels (Firefox computes a size under
// the zoom of the preview as 16.0083px), the size it was drawn at, the fill of its first node. Mermaid gives
// short labels a uniform node width, so a larger text shows in the height of the drawing and the spacing in
// its width.
function drawingStyle(page, index = 0) {
  return page.evaluate(index => {
    const svg = document.querySelectorAll('#preview .mermaid-diagram > svg')[index];
    const node = svg.querySelector('.node rect, .node path, .node polygon');
    const edge = svg.querySelector('.edgePath .path, .flowchart-link');
    const pixels = value => Math.round(parseFloat(value));
    return {
      fontSize: pixels(getComputedStyle(svg).fontSize),
      width: svg.viewBox.baseVal.width,
      height: svg.viewBox.baseVal.height,
      fill: node ? getComputedStyle(node).fill : null,
      stroke: edge ? pixels(getComputedStyle(edge).strokeWidth) : null,
    };
  }, index);
}

test('the diagram settings and the font attribute change the drawings', async ({ page }) => {
  await openFreshStudio(page);
  await setMarkdown(
    page,
    '# Settings\n\n' + DIAGRAM.replace('%ATTRS%', '') + '\n' + DIAGRAM.replace('%ATTRS%', ' font=24'),
  );
  await expect(page.locator('#preview .document-content h1')).toHaveText('Settings');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await expect(page.locator('#preview .mermaid-diagram > svg')).toHaveCount(2);
  const initial = await drawingStyle(page);
  expect(initial).toMatchObject({ fontSize: 16, stroke: 1 });
  // The second diagram keeps the size of its fence line whatever the document asks.
  expect(await drawingStyle(page, 1)).toMatchObject({ fontSize: 24 });

  await page.locator('#tabDesign').click();
  await page.locator('#diagramFontSize').fill('32');
  await expect.poll(async () => (await drawingStyle(page)).fontSize).toBe(32);
  const larger = await drawingStyle(page);
  expect(larger.height).toBeGreaterThan(initial.height);
  expect(await drawingStyle(page, 1)).toMatchObject({ fontSize: 24 });

  await page.locator('#diagramSpacing').selectOption('compact');
  await expect.poll(async () => (await drawingStyle(page)).width).toBeLessThan(larger.width);

  await page.locator('#diagramTheme').selectOption('forest');
  await expect.poll(async () => (await drawingStyle(page)).fill).not.toBe(initial.fill);

  await page.locator('#diagramLineWidth').fill('4');
  await expect.poll(async () => (await drawingStyle(page)).stroke).toBe(4);
  expect(await drawingStyle(page, 1)).toMatchObject({ stroke: 4 });

  // A typed size is clamped like an imported one.
  await page.locator('#diagramFontSize').fill('99');
  await expect.poll(async () => (await drawingStyle(page)).fontSize).toBe(40);
});
