// Integration tests of the images: library, upload, configuration file, size and alignment.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { png } from './helpers/png.mjs';
import {
  centre,
  cursorToEnd,
  expectMarkdown,
  expectNoMarkdown,
  exportVia,
  imageGeometry,
  imageItems,
  markdownText,
  openDocument,
  pngFile,
  position,
  selectImage,
  status,
  STATUS_DONE,
  upload,
} from './helpers/studio.mjs';

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

  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportProject')]);
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
  await page.locator('#importFile').setInputFiles({
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
  await cursorToEnd(page);
  await page.locator('#imageList').getByRole('button', { name: 'Insert' }).click();
  await expectMarkdown(page, /!\[My photo \(1\)\]\(My%20photo%20%281%29\.png\)\n$/);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);

  // Pasting an image from the clipboard adds it under its own name and references it.
  const bytes = [...png(40, 40)];
  await editor.locator('.cm-content').evaluate((el, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], 'image.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, bytes);
  await expectMarkdown(page, /!\[pasted-\d{14}\]\(pasted-\d{14}\.png\)\n$/);
  await expect(page.locator('#preview .document-image > img')).toHaveCount(2);
  await expect(imageItems(page)).toHaveCount(2);

  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, 'exportHtml')]);
  const html = readFileSync(await download.path(), 'utf8');
  expect(html.match(/<span class="document-image is-block"[^>]*><img src="data:image\/png;base64,/g)).toHaveLength(2);
  expect(html).not.toContain('diagram-tools');
  expect(html).not.toContain('resizable');
});

test('an image alone on its line is centered, resized and moved from the preview', async ({ page }) => {
  await openDocument(page, '# Block image\n\n![Plan](img/plan.png)\n\nNext paragraph.\n', 'Block image');
  await upload(page, pngFile('plan.png', 300, 200));
  const block = page.locator('#preview .document-image.is-block');
  const selector = '#preview .document-image.is-block';
  await expect(block.locator('> img')).toBeVisible();

  // Centered by default, like a diagram: no attribute is needed.
  await selectImage(page, block);
  await expect(block.getByRole('button', { name: 'Center' })).toHaveAttribute('aria-pressed', 'true');
  await expect(block.getByRole('button', { name: 'In the text' })).toHaveCount(0);
  await block.getByRole('button', { name: 'Width 50 %' }).click();
  await expectMarkdown(page, /!\[Plan\]\(img\/plan\.png\)\{width=50%\}\n/);
  await expect.poll(() => position(page, selector)).toEqual({ percent: 50, left: 25, right: 25 });

  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await block.getByRole('button', { name: 'Align left' }).click();
  await expectMarkdown(page, /\{width=50% align=left\}/);
  await expect.poll(() => position(page, selector)).toEqual({ percent: 50, left: 0, right: 50 });
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await block.getByRole('button', { name: 'Align right' }).click();
  await expectMarkdown(page, /\{width=50% align=right\}/);
  await expect.poll(() => position(page, selector)).toEqual({ percent: 50, left: 50, right: 0 });

  // Drag the handle (on the left edge of a right-aligned image) to make it wider.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const handle = centre(await block.locator('.diagram-handle').boundingBox());
  await page.mouse.move(handle.x, handle.y, { steps: 5 });
  await page.mouse.down();
  await page.mouse.move(handle.x - 140, handle.y, { steps: 8 });
  await page.mouse.up();
  await expectNoMarkdown(page, /width=50%/);
  const dragged = Number(/\{width=(\d+)% align=right\}/.exec(await markdownText(page))?.[1]);
  expect(dragged).toBeGreaterThan(50);
  await expect.poll(async () => (await position(page, selector)).percent).toBe(dragged);

  // Back to the centre: the attribute goes away.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await block.getByRole('button', { name: 'Center' }).click();
  await expectMarkdown(page, new RegExp(`\\{width=${dragged}%\\}\\n`));
});

test('an image inside text floats with the text around it, or takes a line of its own', async ({ page }) => {
  const sentence = 'This sentence is long enough to run over several lines next to the image. '.repeat(6);
  await openDocument(page, `# Wrap\n\n![Small](plan.png) ${sentence}\n\nNext paragraph.\n`, 'Wrap');
  await upload(page, pngFile('plan.png', 300, 200));
  const image = page.locator('#preview .document-image');
  await expect(image.locator('> img')).toBeVisible();

  await selectImage(page, image);
  await expect(image.getByRole('button', { name: 'In the text' })).toHaveAttribute('aria-pressed', 'true');
  await image.getByRole('button', { name: 'Width 25 %' }).click();
  await expectMarkdown(page, /!\[Small\]\(plan\.png\)\{width=25%\} This sentence/);
  await expect.poll(async () => (await imageGeometry(page))?.percent).toBe(25);

  // Right: the image goes to the edge and the text starts beside it, at the same height.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await image.getByRole('button', { name: 'Align right' }).click();
  await expectMarkdown(page, /\{width=25% align=right\} This sentence/);
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
  // The tools keep their screen size: zoomed out, without any render, they are placed again. They no longer
  // fit beside the image, nor quite in the page: they start at its left edge instead of being cut off there.
  const toolBoxes = () =>
    image.evaluate(element => {
      const sheet = element.closest('.pagedjs_page').getBoundingClientRect();
      const boxes = [...element.querySelectorAll('.diagram-tools button')].map(button =>
        button.getBoundingClientRect(),
      );
      return {
        startsInside: boxes.every(box => box.left >= sheet.left),
        inside: boxes.every(box => box.left >= sheet.left && box.right <= sheet.right),
      };
    });
  await page.locator('#zoomOut').click();
  await expect.poll(async () => (await toolBoxes()).startsInside).toBe(true);
  await page.locator('#zoomFit').click();
  await expect.poll(async () => (await toolBoxes()).inside).toBe(true);
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
  await expectMarkdown(page, /\{width=25% align=left\}/);
  await expect.poll(() => imageGeometry(page)).toMatchObject({ percent: 25, left: 0, float: 'left' });

  // Centre: a line of its own, no float.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await image.getByRole('button', { name: 'Center' }).click();
  await expectMarkdown(page, /\{width=25% align=center\}/);
  await expect.poll(() => imageGeometry(page)).toMatchObject({ percent: 25, float: 'none', display: 'block' });
  const centred = await imageGeometry(page);
  expect(Math.abs(centred.left - centred.right)).toBeLessThanOrEqual(1);

  // Back in the sentence: the alignment goes away, the width stays.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await image.getByRole('button', { name: 'In the text' }).click();
  await expectMarkdown(page, /!\[Small\]\(plan\.png\)\{width=25%\} This sentence/);
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
  const images = page.locator('#preview .document-image');
  await expect(images).toHaveCount(4);

  // Two images of one paragraph are handled independently.
  await selectImage(page, images.nth(1));
  await images.nth(1).getByRole('button', { name: 'Align right' }).click();
  await expectMarkdown(page, /!\[First\]\(plan\.png\)\n!\[Second\]\(plan\.png\)\{align=right\}\n/);
  await selectImage(page, images.nth(0));
  await images.nth(0).getByRole('button', { name: 'Width 25 %' }).click();
  await expectMarkdown(page, /!\[First\]\(plan\.png\)\{width=25%\}\n!\[Second\]\(plan\.png\)\{align=right\}\n/);

  // In a table the width is a share of the cell.
  const cell = page.locator('#preview td .document-image');
  await selectImage(page, cell);
  await cell.getByRole('button', { name: 'Width 50 %' }).click();
  await expectMarkdown(page, /\| one \| !\[Cell\]\(plan\.png\)\{width=50%\} \|/);
  await expect.poll(async () => (await imageGeometry(page, '#preview td .document-image'))?.percent).toBe(50);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await cell.getByRole('button', { name: 'Align left' }).click();
  await expectMarkdown(page, /!\[Cell\]\(plan\.png\)\{width=50% align=left\} \|/);
  await expect.poll(async () => (await imageGeometry(page, '#preview td .document-image'))?.left).toBe(0);

  // Inside a link: selecting does not follow the link, and the width is a share of the paragraph.
  const linked = page.locator('#preview a .document-image');
  await selectImage(page, linked);
  expect(page.url()).not.toContain('example.com');
  await linked.getByRole('button', { name: 'Width 25 %' }).click();
  await expectMarkdown(page, /\[!\[Linked\]\(plan\.png\)\{width=25%\}\]\(https:\/\/example\.com\)/);
  await expect.poll(async () => (await imageGeometry(page, '#preview a .document-image'))?.percent).toBe(25);
  expect(page.url()).not.toContain('example.com');
});
