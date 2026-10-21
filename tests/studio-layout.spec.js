// Integration tests of the studio chrome: preview scrolling, view modes and the splitter, layouts and zoom,
// sidebar, tabs, phone layout.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { png } from './helpers/png.mjs';
import {
  STATUS_DONE,
  WELCOME_KEY,
  cursorToEnd,
  expectMarkdown,
  focusEditor,
  openFreshStudio,
  pages,
  setMarkdown,
  status,
} from './helpers/studio.mjs';

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

test('the studio follows the system theme, remembers a choice and keeps the pages white', async ({ page }) => {
  const html = page.locator('html');
  const background = selector =>
    page
      .locator(selector)
      .first()
      .evaluate(el => getComputedStyle(el).backgroundColor);
  const luminance = rgb =>
    rgb
      .match(/\d+/g)
      .slice(0, 3)
      .reduce((sum, v) => sum + Number(v), 0) / 3;

  await page.emulateMedia({ colorScheme: 'dark' });
  await openFreshStudio(page);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#uiTheme')).toHaveValue('system');
  expect(luminance(await background('.sidebar'))).toBeLessThan(80);
  expect(luminance(await background('#markdown .cm-editor'))).toBeLessThan(80);
  // The document is shown as it prints.
  expect(await background('#preview .pagedjs_page')).toBe('rgb(255, 255, 255)');

  await page.locator('#uiTheme').selectOption('light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(luminance(await background('.sidebar'))).toBeGreaterThan(200);
  // Remembered, and applied before the page script runs (no flash): the attribute is there at load.
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#uiTheme')).toHaveValue('light');
  await expect(status(page)).toHaveText(STATUS_DONE);

  await page.locator('#uiTheme').selectOption('dark');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // Back to the system: follows the media query, live.
  await page.locator('#uiTheme').selectOption('system');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await background('#preview .pagedjs_page')).toBe('rgb(255, 255, 255)');
});

test('the selection of the editor stays visible on the active line, in both themes', async ({ page }) => {
  await openFreshStudio(page);
  const colour = selector =>
    page
      .locator(selector)
      .first()
      .evaluate(el => getComputedStyle(el).backgroundColor);
  const token = name =>
    page.evaluate(name => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), name);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    // A selection inside the line of the cursor, the editor focused.
    await page.evaluate(() => {
      window.studio.editor.select(2, 10);
      window.studio.editor.focus();
    });
    const selection = page.locator('.cm-selectionLayer .cm-selectionBackground');
    await expect(selection).toHaveCount(1);
    // The colour of the theme, not the one of CodeMirror's base theme for a focused editor (#d7d4f0).
    const expected = await page.evaluate(
      hex => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = hex;
        document.body.append(probe);
        const rgb = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return rgb;
      },
      await token('--code-selection'),
    );
    expect(await colour('.cm-selectionLayer .cm-selectionBackground')).toBe(expected);
    // The selection is painted behind the lines: the active line must let it through.
    expect(await colour('.cm-activeLine')).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
  }
});

test('sidebar tabs follow the ARIA tabs pattern with keyboard navigation', async ({ page }) => {
  await openFreshStudio(page);
  const contentTab = page.locator('#tabContent');
  const designTab = page.locator('#tabDesign');
  await expect(contentTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-content')).toBeVisible();
  await expect(page.locator('#panel-design')).toBeHidden();

  await designTab.click();
  await expect(designTab).toHaveAttribute('aria-selected', 'true');
  await expect(contentTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#panel-design')).toBeVisible();
  await expect(page.locator('#customCss')).toBeVisible();

  await designTab.press('ArrowRight');
  await expect(page.locator('#tabPage')).toBeFocused();
  await expect(page.locator('#panel-page')).toBeVisible();
  await page.locator('#tabPage').press('ArrowRight');
  await expect(contentTab).toBeFocused();
  await expect(page.locator('#panel-content')).toBeVisible();
  await contentTab.press('End');
  await expect(page.locator('#tabPage')).toBeFocused();
});

test('the settings are grouped by intent, a group folds and stays folded, and Images counts its files', async ({
  page,
}) => {
  await openFreshStudio(page);
  await expect(page.locator('#panel-content summary')).toHaveText(['Document', 'Cover', 'Images']);
  await expect(page.locator('#panel-design summary')).toHaveText([
    'Headers and footers',
    'Numbering',
    'Diagrams',
    'Code and stylesheet',
  ]);
  await expect(page.locator('#panel-page summary')).toHaveText(['Paper', 'Margins']);
  // The document language sits with the document fields, not with the paper.
  await expect(page.locator('details[data-group="document"] #language')).toBeVisible();
  const images = page.locator('details[data-group="images"]');
  await expect(images).toHaveAttribute('open', '');
  await expect(page.locator('#imagesCount')).toHaveText('');
  await images.locator('summary').click();
  await expect(images).not.toHaveAttribute('open', '');
  await expect(page.locator('#addImages')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('markdown-paged-studio:settings')))
    .toBe('{"closed":["images"]}');
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(images).not.toHaveAttribute('open', '');
  await expect(page.locator('details[data-group="document"]')).toHaveAttribute('open', '');
  await images.locator('summary').click();
  await expect(page.locator('#addImages')).toBeVisible();

  // The counter: files in the library, and names of the document that are not there.
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(30, 20) });
  await expect(page.locator('#imagesCount')).toHaveText('1');
  await setMarkdown(page, '# Pictures\n\n![Plan](plan.png)\n\n![Map](map.png)\n');
  await expect(page.locator('#imagesCount')).toHaveText('1 · 1 missing');
  await expect(page.locator('#imagesCount')).toHaveClass(/is-warning/);
  await page.locator('#imageFiles').setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: png(30, 20) });
  await expect(page.locator('#imagesCount')).toHaveText('2');
});

test('the sidebar header stays fixed while the settings scroll in a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 520 });
  await openFreshStudio(page);
  // The Design tab holds the tall CSS editor: its panel overflows the short window.
  await page.locator('#tabDesign').click();
  const body = page.locator('.sidebar-body');
  expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  const before = await page.locator('.sidebar-header').boundingBox();
  const tabsBefore = await page.locator('#tabDesign').boundingBox();
  await body.evaluate(el => {
    el.scrollTop = 300;
  });
  expect(await body.evaluate(el => el.scrollTop)).toBe(300);
  expect(await page.locator('.sidebar-header').boundingBox()).toEqual(before);
  expect(await page.locator('#tabDesign').boundingBox()).toEqual(tabsBefore);
  await expect(page.locator('.brand-mark')).toBeInViewport();
  // The page itself must not scroll: only the panels moved.
  expect(await page.evaluate(() => document.querySelector('.shell').scrollTop)).toBe(0);
});

test('the sidebar can be hidden and the choice is remembered', async ({ page }) => {
  await openFreshStudio(page);
  // Three commands beside the view controls: the toolbar is one line at this width.
  expect((await page.locator('.toolbar').boundingBox()).height).toBeLessThan(70);
  const toggle = page.locator('#toggleSidebar');
  const sidebar = page.locator('#sidebar');
  const previewWidth = () => page.locator('.preview-shell').evaluate(el => el.clientWidth);
  const workbenchWidth = () => page.locator('.workbench').evaluate(el => el.clientWidth);
  const widthBefore = await previewWidth();
  const workbenchBefore = await workbenchWidth();
  const zoomBefore = await page.locator('#zoomValue').textContent();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The drawer close button belongs to the phone layout only.
  await expect(page.locator('#closeSidebar')).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Show sidebar');
  // The workbench takes the whole width; the editor keeps its share, the preview gets the other half.
  await expect.poll(workbenchWidth).toBeGreaterThan(workbenchBefore + 300);
  await expect.poll(previewWidth).toBeGreaterThan(widthBefore + 150);
  // Fit mode follows the wider preview.
  await expect(page.locator('#zoomValue')).not.toHaveText(zoomBefore);

  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(sidebar).toBeHidden();

  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(page.locator('#title')).toBeVisible();
  expect(await previewWidth()).toBe(widthBefore);
});

test('under 1100 px the view controls take a row of their own and every action stays in the window', async ({
  page,
}) => {
  for (const width of [1100, 900, 770]) {
    await page.setViewportSize({ width, height: 700 });
    await openFreshStudio(page);
    const toolbar = page.locator('.toolbar');
    // Two rows, never three: the title and the actions on the first, the view controls on the second.
    const bar = await toolbar.boundingBox();
    expect(bar.height, `${width} px`).toBeLessThan(110);
    const controls = await page.locator('.view-controls').boundingBox();
    const actions = await page.locator('.toolbar-actions').boundingBox();
    expect(controls.y, `${width} px`).toBeGreaterThan(actions.y + actions.height - 1);
    // Nothing leaves the window: Export and the "more" menu are where they can be clicked.
    for (const id of ['#exportDefault', '#exportMenu', '#moreMenu', '#import', '#zoomFit', '#layoutSpread']) {
      await expect(page.locator(id), `${width} px`).toBeInViewport({ ratio: 0.99 });
    }
    expect(await toolbar.evaluate(el => el.scrollWidth <= el.clientWidth), `${width} px`).toBe(true);
  }
  // Back on a wide window the toolbar is one line again.
  await page.setViewportSize({ width: 1440, height: 800 });
  expect((await page.locator('.toolbar').boundingBox()).height).toBeLessThan(70);
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
  await expect(page.locator('#exportDefault')).toBeVisible();
  // One row: the sidebar toggle, the page count, Edit | View, Export and the ⋯ menu; the layout and zoom
  // groups and the Import button are gone (the pages are fit in one column, Import… is in the ⋯ menu).
  expect((await page.locator('.toolbar').boundingBox()).height).toBeLessThan(70);
  await expect(page.locator('#status')).toBeVisible();
  await expect(page.locator('#import')).toBeHidden();
  await expect(page.locator('#layoutSpread')).toBeHidden();
  await expect(page.locator('#zoomFit')).toBeHidden();
  await expect(page.locator('#exportDefault')).toBeInViewport({ ratio: 0.99 });
  await expect(page.locator('#moreMenu')).toBeInViewport({ ratio: 0.99 });
  await page.locator('#moreMenu').click();
  await expect(page.locator('#importEntry')).toBeVisible();
  await expect(page.locator('#importEntry')).toBeFocused();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#importEntry').click()]);
  expect(chooser.isMultiple()).toBe(false);
  await expect(page.locator('#moreOptions')).toBeHidden();
  // No room for two panes: Split gives way to a switch between Edit and View, View first.
  await expect(page.locator('#modeSplit')).toBeHidden();
  await expect(page.locator('#modeView')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#markdown')).toBeHidden();
  await page.locator('#modeEdit').click();
  await expect(page.locator('#markdown')).toBeVisible();
  await expect(page.locator('.preview-shell')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#modeView').click();
  await expect(page.locator('#preview .pagedjs_page').first()).toBeVisible();
  // The export menu opens in the phone toolbar too.
  await page.locator('#exportMenu').click();
  await expect(page.locator('#exportOptions')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.locator('#toggleSidebar').click();
  await expect(sidebar).toBeVisible();
  const drawer = await sidebar.boundingBox();
  expect(drawer.x).toBe(0);
  expect(drawer.width).toBe(390);
  // The drawer is a modal dialog: the focus goes in and stays, the workspace behind is inert.
  await expect(page.locator('#closeSidebar')).toBeFocused();
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  await expect(sidebar).toHaveAttribute('aria-label', 'Settings');
  expect(await page.evaluate(() => document.querySelector('main.workspace').inert)).toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#sidebar')))).toBe(true);
  }
  // Escape closes it and gives the focus back to the toggle.
  await page.keyboard.press('Escape');
  await expect(sidebar).toBeHidden();
  await expect(page.locator('#toggleSidebar')).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('main.workspace').inert)).toBe(false);
  await expect(sidebar).not.toHaveAttribute('role', 'dialog');
  await page.locator('#toggleSidebar').click();
  await expect(sidebar).toBeVisible();
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#closeSidebar')).toBeVisible();
  // The language and theme selectors share the header line with the close button, without overlapping it.
  await expect(page.locator('#uiLanguage')).toBeVisible();
  await expect(page.locator('#uiTheme')).toBeVisible();
  const language = await page.locator('.language-switch').boundingBox();
  const theme = await page.locator('.theme-switch').boundingBox();
  const close = await page.locator('#closeSidebar').boundingBox();
  expect(language.x + language.width).toBeLessThanOrEqual(theme.x);
  expect(theme.x + theme.width).toBeLessThanOrEqual(close.x);

  await page.locator('#closeSidebar').click();
  await expect(sidebar).toBeHidden();
  await expect(page.locator('#toggleSidebar')).toBeFocused();
  await expect(page.locator('#preview .pagedjs_page').first()).toBeVisible();

  // Back on a desktop the Import button is in the toolbar, the sidebar is a plain sidebar again (hidden,
  // as it was closed on the phone) and the ⋯ menu starts at the welcome tour.
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator('#import')).toBeVisible();
  await page.locator('#toggleSidebar').click();
  await expect(sidebar).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('main.workspace').inert)).toBe(false);
  await expect(sidebar).not.toHaveAttribute('role', 'dialog');
  await expect(page.locator('#closeSidebar')).toBeHidden();
  await page.locator('#moreMenu').click();
  await expect(page.locator('#importEntry')).toBeHidden();
  await expect(page.locator('#showWelcome')).toBeFocused();
  await page.keyboard.press('Escape');
});

test('the banner lies over the workbench without moving it, scrolls when long, and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshStudio(page);
  const bench = await page.locator('.workbench').boundingBox();
  const bar = await page.locator('.toolbar').boundingBox();
  await page.evaluate(() => {
    document.getElementById('noticeText').textContent = 'word '.repeat(600);
    document.getElementById('notice').hidden = false;
  });
  const notice = page.locator('#notice');
  await expect(notice).toBeVisible();
  const box = await notice.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(box.height).toBeLessThanOrEqual(0.4 * 844 + 1);
  expect(await notice.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(page.locator('#dismissNotice')).toBeInViewport();
  // Nothing moved under it.
  expect(await page.locator('.workbench').boundingBox()).toEqual(bench);
  await page.locator('#dismissNotice').click();
  await expect(notice).toBeHidden();
});

test('the editor shares the workspace: Edit, Split and View modes, the splitter and the phone', async ({ page }) => {
  await openFreshStudio(page);
  const editor = page.locator('#markdown');
  const pane = page.locator('.editor-pane');
  const shell = page.locator('.preview-shell');
  const splitter = page.locator('.splitter');
  const width = locator => locator.evaluate(el => el.getBoundingClientRect().width);
  const zoom = () => page.locator('#preview').evaluate(el => Number(el.style.zoom));
  // Split by default: both panes, the editor taking half of the workbench.
  await expect(page.locator('#modeSplit')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeVisible();
  await expect(page.locator('#preview .pagedjs_page').first()).toBeVisible();
  const workbench = await width(page.locator('.workbench'));
  expect(Math.abs((await width(pane)) - workbench / 2)).toBeLessThan(8);
  await expect(splitter).toHaveAttribute('aria-valuenow', '50');

  // The splitter is dragged, and the fit zoom follows the preview.
  const zoomBefore = await zoom();
  const box = await splitter.boundingBox();
  const bench = await page.locator('.workbench').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(bench.x + bench.width * 0.3, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(splitter).toHaveAttribute('aria-valuenow', '30');
  expect(Math.abs((await width(pane)) - workbench * 0.3)).toBeLessThan(8);
  await expect.poll(zoom).toBeGreaterThan(zoomBefore);
  // Keyboard on the separator: 2 % steps, Home and End, double-click resets the half.
  await splitter.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(splitter).toHaveAttribute('aria-valuenow', '40');
  await page.keyboard.press('Home');
  await expect(splitter).toHaveAttribute('aria-valuenow', '20');
  await page.keyboard.press('End');
  await expect(splitter).toHaveAttribute('aria-valuenow', '80');
  await splitter.dblclick();
  await expect(splitter).toHaveAttribute('aria-valuenow', '50');

  // View: the preview alone; Edit: the editor alone; Ctrl+Shift+2 brings the split back.
  await page.locator('#modeView').click();
  await expect(editor).toBeHidden();
  await expect(splitter).toBeHidden();
  expect(await width(shell)).toBe(workbench);
  await page.locator('#modeEdit').click();
  await expect(shell).toBeHidden();
  await expect(editor).toBeVisible();
  expect(await width(pane)).toBe(workbench);
  await page.keyboard.press('Control+Shift+Digit2');
  await expect(page.locator('#modeSplit')).toHaveAttribute('aria-pressed', 'true');
  await expect(shell).toBeVisible();

  // The mode and the editor width are remembered.
  await splitter.focus();
  await page.keyboard.press('Home');
  await page.locator('#modeView').click();
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(page.locator('#modeView')).toHaveAttribute('aria-pressed', 'true');
  await expect(splitter).toHaveAttribute('aria-valuenow', '20');
  await page.locator('#modeSplit').click();
  await expect(editor).toBeVisible();

  // On a phone a remembered Split shows the preview, and comes back when the window grows; an explicit
  // choice made on the phone is kept.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#modeSplit')).toBeHidden();
  await expect(page.locator('#modeView')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeHidden();
  // The sidebar would be a drawer over the whole screen: it closes as the window narrows, and comes back.
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#preview .pagedjs_page').first()).toBeVisible();
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#modeSplit')).toHaveAttribute('aria-pressed', 'true');
  await expect(editor).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.locator('#modeEdit').click();
  await expect(shell).toBeHidden();
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator('#modeEdit')).toHaveAttribute('aria-pressed', 'true');
  await expect(shell).toBeHidden();

  // A layout and a zoom chosen on the desktop give way to one fitted column on the phone, and come back.
  await page.locator('#modeView').click();
  await page.locator('#layoutSpread').click();
  await page.locator('#zoomIn').click();
  const zoomOnDesk = await page.locator('#zoomValue').textContent();
  await expect(page.locator('#preview')).toHaveAttribute('data-layout', 'spread');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#preview')).toHaveAttribute('data-layout', 'single');
  await expect
    .poll(async () => (await page.locator('#preview .pagedjs_page').first().boundingBox()).width)
    .toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator('#preview')).toHaveAttribute('data-layout', 'spread');
  await expect(page.locator('#zoomValue')).toHaveText(zoomOnDesk);
});

test('the sidebar footer shows the running version and stays at the bottom', async ({ page }) => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  await page.setViewportSize({ width: 1200, height: 520 });
  await openFreshStudio(page);
  await page.locator('#tabDesign').click();
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

test('Ctrl+Shift+1 and 3 switch to Edit and View, Ctrl + wheel up zooms in', async ({ page }) => {
  await openFreshStudio(page);
  await page.keyboard.press('Control+Shift+Digit1');
  await expect(page.locator('#modeEdit')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.preview-shell')).toBeHidden();
  await page.keyboard.press('Control+Shift+Digit3');
  await expect(page.locator('#modeView')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#markdown')).toBeHidden();
  await page.keyboard.press('Control+Shift+Digit2');
  await expect(page.locator('#modeSplit')).toHaveAttribute('aria-pressed', 'true');
  const zoom = async () => parseInt(await page.locator('#zoomValue').textContent(), 10);
  const before = await zoom();
  await page
    .locator('.preview-shell')
    .evaluate(el =>
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })),
    );
  await expect.poll(zoom).toBeGreaterThan(before);
});

test('tooltips show on hover and on keyboard focus with the shortcut, ? lists the shortcuts, Ctrl+B hides the sidebar', async ({
  page,
}) => {
  await openFreshStudio(page);
  const tooltip = page.locator('#tooltip');
  const text = tooltip.locator('.tooltip-text');
  await expect(tooltip).toBeHidden();
  // Hover: the title of the control, its shortcut next to it; the native tooltip is kept away meanwhile.
  await page.locator('#exportDefault').hover();
  await expect(tooltip).toBeVisible();
  await expect(text).toHaveText(/^PDF with project/);
  await expect(tooltip.locator('kbd')).toHaveText('Ctrl+Shift+E');
  await expect(page.locator('#exportDefault')).not.toHaveAttribute('title', /./);
  const button = await page.locator('#exportDefault').boundingBox();
  const box = await tooltip.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(button.y + button.height);
  await page.mouse.move(5, 400);
  await expect(tooltip).toBeHidden();
  await expect(page.locator('#exportDefault')).toHaveAttribute('title', /^PDF with project/);
  // A control without a shortcut shows its text alone.
  await page.locator('#import').hover();
  await expect(text).toHaveText(/^A PDF, a Word file, an HTML/);
  await expect(tooltip.locator('kbd')).toBeHidden();
  await page.mouse.move(5, 400);
  // Keyboard focus shows it at once; a click does not.
  await page.locator('#toggleSidebar').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#modeEdit')).toBeFocused();
  await expect(tooltip).toBeVisible();
  await expect(text).toHaveText('Markdown only');
  await expect(tooltip.locator('kbd')).toHaveText('Ctrl+Shift+1');
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await page.locator('#layoutSpread').click();
  await expect(tooltip).toBeHidden();
  await page.locator('#layoutSingle').click();
  // The entries of the menus carry their shortcut too.
  await page.locator('#exportMenu').click();
  await expect(page.locator('#exportPdfProject kbd')).toHaveText('Ctrl+Shift+E');
  await expect(page.locator('#exportPdfOnly kbd')).toHaveText('Ctrl+P');
  await page.keyboard.press('Escape');

  // ? opens the panel of the shortcuts, unless typed in a text field; Escape and the button close it.
  const dialog = page.locator('#shortcutsDialog');
  await page.locator('.preview-shell').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toHaveText('Keyboard shortcuts');
  await expect(dialog.locator('h3')).toHaveText(['Document', 'Workspace', 'Editor', 'Files', 'Preview']);
  await expect(dialog.locator('dt').first()).toHaveText('Export the PDF with the project');
  await expect(dialog.locator('dd').first().locator('kbd')).toHaveText('Ctrl+Shift+E');
  await expect(dialog.locator('dt', { hasText: 'Import a file' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.locator('#moreMenu').click();
  await page.locator('#showShortcuts').click();
  await expect(dialog).toBeVisible();
  await page.locator('#closeShortcuts').click();
  await expect(dialog).toBeHidden();
  await page.locator('#title').fill('');
  await page.locator('#title').press('?');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#title')).toHaveValue('?');
  await focusEditor(page);
  await cursorToEnd(page);
  await page.keyboard.type('?');
  await expect(dialog).toBeHidden();
  await expectMarkdown(page, /\?$/);

  // Ctrl+B hides and shows the sidebar, as the desktop menu does.
  await page.keyboard.press('Control+b');
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Control+b');
  await expect(page.locator('#sidebar')).toBeVisible();
});

test('the welcome tour opens on the first visit, pages through its panels and stays away once dismissed', async ({
  page,
}) => {
  await openFreshStudio(page);
  const dialog = page.locator('#welcomeDialog');
  await expect(dialog).toBeHidden();
  // A first visit: the tour opens over the pages, on its first panel.
  await page.evaluate(key => localStorage.removeItem(key), WELCOME_KEY);
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toHaveText('Welcome to Markdown Paged Studio');
  const shown = dialog.locator('.welcome-panel:not([hidden])');
  await expect(shown).toHaveCount(1);
  await expect(shown.locator('h3')).toHaveText('Three zones, one document');
  await expect(page.locator('#welcomeStep')).toHaveText('1 / 6');
  await expect(page.locator('#welcomePrev')).toBeDisabled();
  await expect(page.locator('#welcomeNext')).toBeFocused();
  // The arrows and the keyboard page through the panels; the last one has no next.
  await page.locator('#welcomeNext').click();
  await expect(shown.locator('h3')).toHaveText('Write in Markdown');
  await expect(page.locator('#welcomeStep')).toHaveText('2 / 6');
  await page.keyboard.press('ArrowRight');
  await expect(shown.locator('h3')).toHaveText('Set up the document');
  await page.keyboard.press('ArrowLeft');
  await expect(shown.locator('h3')).toHaveText('Write in Markdown');
  await page.locator('#welcomePrev').click();
  await expect(page.locator('#welcomePrev')).toBeDisabled();
  for (let i = 0; i < 5; i++) await page.locator('#welcomeNext').click();
  await expect(shown.locator('h3')).toHaveText('Go further');
  await expect(page.locator('#welcomeStep')).toHaveText('6 / 6');
  await expect(page.locator('#welcomeNext')).toBeDisabled();
  await expect(shown.locator('a')).toHaveAttribute('href', /docs\/writing\.md$/);
  // Escape without the box: the tour comes back next time.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(dialog).toBeVisible();
  // The box and Close: gone for good, and the choice survives a reload.
  await page.locator('#welcomeHide').check();
  await page.locator('#closeWelcome').click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(dialog).toBeHidden();
  // The ⋯ menu shows it again, from the first panel, the box reflecting the choice; unticking it brings the
  // tour back at the next start.
  await page.locator('#moreMenu').click();
  await page.locator('#showWelcome').click();
  await expect(dialog).toBeVisible();
  await expect(shown.locator('h3')).toHaveText('Three zones, one document');
  await expect(page.locator('#welcomeHide')).toBeChecked();
  await page.locator('#welcomeHide').uncheck();
  await page.locator('#dismissWelcome').click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(dialog).toBeVisible();
  await page.locator('#welcomeHide').check();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
