// Integration tests of the studio chrome: preview scrolling, layouts and zoom, sidebar, tabs, phone layout.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { STATUS_DONE, openFreshStudio, pages, status } from './helpers/studio.mjs';

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

test('the sidebar header stays fixed while the settings scroll in a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 520 });
  await openFreshStudio(page);
  const body = page.locator('.sidebar-body');
  expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  const before = await page.locator('.sidebar-header').boundingBox();
  const tabsBefore = await page.locator('#tab-design').boundingBox();
  await body.evaluate(el => {
    el.scrollTop = 300;
  });
  expect(await body.evaluate(el => el.scrollTop)).toBe(300);
  expect(await page.locator('.sidebar-header').boundingBox()).toEqual(before);
  expect(await page.locator('#tab-design').boundingBox()).toEqual(tabsBefore);
  await expect(page.locator('.brand-mark')).toBeInViewport();
  // The page itself must not scroll: only the panels moved.
  expect(await page.evaluate(() => document.querySelector('.shell').scrollTop)).toBe(0);
});

test('the sidebar can be hidden and the choice is remembered', async ({ page }) => {
  await openFreshStudio(page);
  const toggle = page.locator('#toggleSidebar');
  const sidebar = page.locator('#sidebar');
  const previewWidth = () => page.locator('.preview-shell').evaluate(el => el.clientWidth);
  const widthBefore = await previewWidth();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The drawer close button belongs to the phone layout only.
  await expect(page.locator('#closeSidebar')).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Show sidebar');
  await expect.poll(previewWidth).toBeGreaterThan(widthBefore + 300);
  // Fit mode follows the wider preview.
  await expect(page.locator('#zoomValue')).not.toHaveText('119 %');

  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(sidebar).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(page.locator('#title')).toBeVisible();
  expect(await previewWidth()).toBe(widthBefore);
});

test('on a phone the settings are a closed drawer and the preview fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshStudio(page);
  const sidebar = page.locator('#sidebar');
  await expect(sidebar).toBeHidden();
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-expanded', 'false');
  // The page fits the width of the phone and the toolbar does not push the preview off-screen.
  const pageBox = await page.locator('#preview .pagedjs_page').first().boundingBox();
  expect(pageBox.width).toBeLessThanOrEqual(390);
  expect(pageBox.y).toBeLessThan(200);
  await expect(page.locator('#exportPdf')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.locator('#toggleSidebar').click();
  await expect(sidebar).toBeVisible();
  const drawer = await sidebar.boundingBox();
  expect(drawer.x).toBe(0);
  expect(drawer.width).toBe(390);
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#closeSidebar')).toBeVisible();
  // The language selector shares the header line with the close button, without overlapping it.
  await expect(page.locator('#uiLanguage')).toBeVisible();
  const language = await page.locator('.language-switch').boundingBox();
  const close = await page.locator('#closeSidebar').boundingBox();
  expect(language.x + language.width).toBeLessThanOrEqual(close.x);

  await page.locator('#closeSidebar').click();
  await expect(sidebar).toBeHidden();
  await expect(page.locator('#preview .pagedjs_page').first()).toBeVisible();
});

test('the sidebar footer shows the running version and stays at the bottom', async ({ page }) => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  await page.setViewportSize({ width: 1200, height: 520 });
  await openFreshStudio(page);
  const footer = page.locator('.sidebar-footer');
  await expect(footer).toBeVisible();
  // The GitHub mark in front of the version leads to the repository.
  const repository = footer.locator('#appRepository');
  await expect(repository).toHaveAttribute('href', 'https://github.com/florianlotte/markdown-paged-studio');
  await expect(repository).toHaveAttribute('target', '_blank');
  await expect(repository.locator('svg')).toHaveCount(1);
  // The author on the same line as the version: the name is the link, opening outside the studio.
  const author = footer.locator('a.sidebar-author');
  await expect(author).toHaveText(/^\s*Florian LOTTE\s*$/);
  await expect(author.locator('svg')).toHaveCount(1);
  await expect(author).toHaveAttribute('href', 'https://www.linkedin.com/in/florianlotte');
  await expect(author).toHaveAttribute('target', '_blank');
  await expect(author).toHaveAttribute('rel', 'noopener');
  expect((await footer.boundingBox()).height).toBeLessThan(40);
  await expect(footer.locator('select')).toHaveCount(0);
  await expect(page.locator('#appVersion')).toHaveText(`v${version}`);
  await expect(page.locator('#appVersion')).toHaveAttribute(
    'href',
    `https://github.com/florianlotte/markdown-paged-studio/releases/tag/v${version}`,
  );
  // The dev server does not claim a commit: the working tree may differ from HEAD.
  await expect(page.locator('#appCommit')).toHaveText('dev');
  await expect(page.locator('#appCommit')).not.toHaveAttribute('href', /.*/);

  // Pinned under the scrolling settings, flush with the bottom of the window.
  const before = await footer.boundingBox();
  expect(Math.round(before.y + before.height)).toBe(520);
  await page.locator('.sidebar-body').evaluate(el => {
    el.scrollTop = 300;
  });
  expect(await footer.boundingBox()).toEqual(before);
  await expect(footer).toBeInViewport();
});
