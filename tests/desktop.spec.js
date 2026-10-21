// Tests of the Electron desktop build: the app starts once from dist/, renders the sample document, and the
// steps below run in order on that window (an early failure no longer hides the later checks).
import { test, expect, _electron as electron } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { png } from './helpers/png.mjs';
import { expectMarkdown, expectNoMarkdown, focusEditor, resetDocument, setMarkdown, toast } from './helpers/studio.mjs';
import { readSources } from '../src/pdf-sources.js';

let dir;
let app;
let page;
// Made in one step, read by a later one.
let withImages;
let image;
const send = command =>
  app.evaluate(
    ({ BrowserWindow }, name) => BrowserWindow.getAllWindows()[0].webContents.send('command', name),
    command,
  );

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'mps-desktop-'));
  app = await electron.launch({
    // The interface follows the system language: the test reads English labels.
    args: ['.', '--lang=en-US'],
    env: { ...process.env, MPS_USER_DATA: path.join(dir, 'user-data') },
  });
  // The print window would open the native print dialog once Paged.js is done.
  await app.context().addInitScript(() => {
    window.print = () => {};
  });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
});

test('renders the document and shows the build', async () => {
  const page = await app.firstWindow();
  // The first launch opens the welcome tour: dismissed for good here, shown again by the Help menu below.
  await expect(page.locator('#welcomeDialog')).toBeVisible();
  await page.locator('#welcomeHide').check();
  await page.locator('#closeWelcome').click();
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await expect(page.locator('#status')).toHaveText('3 pages');
  await expect(page.locator('#preview .pagedjs_page')).toHaveCount(3);
  expect(await page.title()).toBe('Markdown Paged Studio');
  await expect(page.locator('#exportDefault')).toBeVisible();

  // The footer shows what was built: the package version and, outside the dev server, the commit.
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  await expect(page.locator('#appVersion')).toHaveText(`v${version}`);
  const built = (process.env.GITHUB_SHA || execSync('git rev-parse --short=7 HEAD').toString()).trim().slice(0, 7);
  await expect(page.locator('#appCommit')).toHaveText(built);
  await expect(page.locator('#appCommit')).toHaveAttribute('href', new RegExp(`/commit/${built}$`));
});

test('exports a PDF directly and through the File menu', async () => {
  // Short-circuit the native save dialog so the export lands in the temp folder.
  const target = path.join(dir, 'document.pdf');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);

  await page.locator('#exportDefault').click();
  await expect(toast(page)).toHaveText('PDF saved with its project');
  await expect(page.locator('#status')).toHaveText('3 pages');
  // The lock shown meanwhile is gone.
  await expect(page.locator('#busy')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('app').inert)).toBe(false);
  expect(existsSync(target)).toBe(true);
  const pdf = readFileSync(target);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10_000);
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/gi) || []).length).toBe(3);

  // The File menu drives the same export through an IPC command.
  const viaMenu = path.join(dir, 'via-menu.pdf');
  await app.evaluate(({ dialog, BrowserWindow }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    BrowserWindow.getAllWindows()[0].webContents.send('command', 'export-pdf');
  }, viaMenu);
  await expect.poll(() => existsSync(viaMenu), { timeout: 30_000 }).toBe(true);
  expect(readFileSync(viaMenu).subarray(0, 5).toString()).toBe('%PDF-');
});

test('opens the links of the document in the system browser', async () => {
  // A link of the document goes to the system browser and the studio stays in place.
  await app.evaluate(({ shell }) => {
    globalThis.openedExternally = [];
    shell.openExternal = async url => void globalThis.openedExternally.push(url);
  });
  await setMarkdown(page, '# Links\n\n[External](https://example.com/page)\n');
  const link = page.locator('#preview .document-content a', { hasText: 'External' });
  await expect(link).toHaveCount(1);
  await link.click();
  await expect.poll(() => app.evaluate(() => globalThis.openedExternally)).toEqual(['https://example.com/page']);
  expect(page.url()).toBe('app://studio/');
  expect(app.windows()).toHaveLength(1);
});

test('carries images, logo and font into the PDF, with the sources attached', async () => {
  // Images, logo and the document font go through the app:// scheme and IndexedDB, and reach the PDF.
  await setMarkdown(page, '# Pictures\n\n![Plan](plan.png){width=50%}\n');
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(600, 400) });
  await page.locator('#logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: png(3000, 600) });
  image = page.locator('#preview .document-image > img');
  await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(600);
  await expect.poll(() => page.locator('#preview .cover-logo').evaluate(el => el.naturalWidth)).toBe(1200);
  expect(await page.evaluate(() => document.fonts.check('12px Inter'))).toBe(true);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  withImages = path.join(dir, 'with-images.pdf');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, withImages);
  await page.locator('#toastText').evaluate(el => (el.textContent = ''));
  await page.locator('#exportDefault').click();
  await expect(toast(page)).toHaveText('PDF saved with its project');
  const illustrated = readFileSync(withImages).toString('latin1');
  expect((illustrated.match(/\/Subtype\s*\/Image/g) || []).length).toBeGreaterThanOrEqual(2);
  expect(illustrated).toMatch(/\/FontName\s*\/[A-Z]{6}\+Inter/);
  // The PDF carries its sources, attached by the page before the file was written.
  const sources = JSON.parse((await readSources(readFileSync(withImages))).json);
  expect(sources.markdown).toContain('![Plan](plan.png){width=50%}');
  expect(Object.keys(sources.images)).toEqual(['plan.png']);
  expect(sources.logoDataUrl).toMatch(/^data:image\/png;base64,/);
  // "Export PDF without project…" of the File menu writes a plain PDF.
  const plain = path.join(dir, 'plain.pdf');
  await app.evaluate(({ dialog, BrowserWindow }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    BrowserWindow.getAllWindows()[0].webContents.send('command', 'export-pdf-plain');
  }, plain);
  await expect(toast(page)).toHaveText('PDF saved');
  expect(await readSources(readFileSync(plain))).toBe(null);
});

test('serves the other File menu entries and the View menu', async () => {
  // The other File menu entries: HTML, Markdown and project downloads, and the import file dialog.
  const send = command =>
    app.evaluate(
      ({ BrowserWindow }, name) => BrowserWindow.getAllWindows()[0].webContents.send('command', name),
      command,
    );
  // Downloads go through the session of the main process: record their names there and cancel them.
  await app.evaluate(({ session }) => {
    globalThis.downloads = [];
    session.defaultSession.on('will-download', (event, item) => {
      globalThis.downloads.push(item.getFilename());
      item.cancel();
    });
  });
  await send('export-html');
  await expect.poll(() => app.evaluate(() => globalThis.downloads)).toEqual(['Architecture Report.html']);
  await send('export-markdown');
  await expect
    .poll(() => app.evaluate(() => globalThis.downloads))
    .toEqual(['Architecture Report.html', 'Architecture Report.md']);
  await send('export-archive');
  await expect
    .poll(() => app.evaluate(() => globalThis.downloads))
    .toEqual(['Architecture Report.html', 'Architecture Report.md', 'Architecture Report.zip']);
  await send('export-project');
  await expect
    .poll(() => app.evaluate(() => globalThis.downloads))
    .toEqual([
      'Architecture Report.html',
      'Architecture Report.md',
      'Architecture Report.zip',
      'markdown-paged-studio-project.json',
    ]);
  // The Word file is built by the page and downloaded the same way.
  await send('export-docx');
  await expect
    .poll(() => app.evaluate(() => globalThis.downloads), { timeout: 30000 })
    .toEqual([
      'Architecture Report.html',
      'Architecture Report.md',
      'Architecture Report.zip',
      'markdown-paged-studio-project.json',
      'Architecture Report.docx',
    ]);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), send('import')]);
  expect(chooser.isMultiple()).toBe(false);
  // The View menu switches the workbench mode.
  await send('mode-view');
  await expect(page.locator('#markdown')).toBeHidden();
  await send('mode-split');
  await expect(page.locator('#markdown')).toBeVisible();
});

test('reopens such a PDF, and undoes from the preview without the Edit menu in the way', async () => {
  // Such a PDF reopens the document.
  await resetDocument(page);
  await expect(page.locator('#imageList li')).toHaveCount(0);
  await page.locator('#importFile').setInputFiles(withImages);
  await expectMarkdown(page, /!\[Plan\]\(plan\.png\)\{width=50%\}/);
  await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(600);

  // Undo from the preview: the Edit menu of the application must not swallow the shortcut.
  const picture = page.locator('#preview .document-image');
  await picture.scrollIntoViewIfNeeded();
  await picture.click();
  await picture.getByRole('button', { name: 'Width 25 %' }).click();
  await expectMarkdown(page, /\{width=25%\}/);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  await page.locator('.preview-shell').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expectMarkdown(page, /\{width=50%\}/);
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expectNoMarkdown(page, /\{width=50%\}\n$/);
  await setMarkdown(page, '# Pictures\n\n![Plan](plan.png){width=50%}\n');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
});

test('keeps the image and the logo after a restart', async () => {
  // After a restart the image and the logo are still there.
  await page.reload();
  await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(600);
  await expect.poll(() => page.locator('#preview .cover-logo').evaluate(el => el.naturalWidth)).toBe(1200);
});

test('the View menu toggles the sidebar, the Edit mode and the theme', async () => {
  await send('toggle-sidebar');
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-expanded', 'false');
  await send('toggle-sidebar');
  await expect(page.locator('#sidebar')).toBeVisible();
  await send('mode-edit');
  await expect(page.locator('#modeEdit')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.preview-shell')).toBeHidden();
  await send('mode-split');
  await expect(page.locator('.preview-shell')).toBeVisible();
  await send('theme-dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#uiTheme')).toHaveValue('dark');
  await send('theme-light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await send('theme-system');
  await expect(page.locator('#uiTheme')).toHaveValue('system');
  // The Help menu opens the welcome tour and the panel of the shortcuts, with the entries of the desktop app.
  await send('welcome');
  await expect(page.locator('#welcomeDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#welcomeDialog')).toBeHidden();
  await send('shortcuts');
  const dialog = page.locator('#shortcutsDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('dt', { hasText: 'Import a file' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Print opens the print-ready document in a second window of the app', async () => {
  const [printWindow] = await Promise.all([app.waitForEvent('window'), send('print')]);
  await expect.poll(() => printWindow.url()).toMatch(/^blob:/);
  await expect(printWindow.locator('.pagedjs_page').first()).toBeVisible();
  expect(app.windows()).toHaveLength(2);
  await printWindow.close();
  await expect.poll(() => app.windows().length).toBe(1);
});

test('a cancelled save dialog ends the export quietly, and the bytes of a PDF go only where a token points', async () => {
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true });
  });
  await page.locator('#toast').evaluate(el => (el.hidden = true));
  await page.locator('#exportDefault').click();
  await expect(page.locator('#busy')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('app').inert)).toBe(false);
  await expect(page.locator('#toast')).toBeHidden();
  await expect(page.locator('#notice')).toBeHidden();
  await expect(
    page.evaluate(() => window.desktop.writePdf('no-such-token', new Uint8Array([37, 80, 68, 70]))),
  ).rejects.toThrow(/No PDF export is waiting/);
});
