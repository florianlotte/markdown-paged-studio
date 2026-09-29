// Smoke test of the Electron desktop build: the app starts from dist/, renders the sample document,
// and the desktop-only "Export PDF" button writes a real PDF through Chromium's print-to-PDF.
import { test, expect, _electron as electron } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { png } from './helpers/png.mjs';

test('the desktop app renders the document and exports a PDF directly', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mps-desktop-'));
  const app = await electron.launch({
    // The interface follows the system language: the test reads English labels.
    args: ['.', '--lang=en-US'],
    env: { ...process.env, MPS_USER_DATA: path.join(dir, 'user-data') },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('#status')).toHaveText('3 pages');
    await expect(page.locator('#preview .pagedjs_page')).toHaveCount(3);
    expect(await page.title()).toBe('Markdown Paged Studio');
    await expect(page.locator('#exportPdf')).toBeVisible();

    // The footer shows what was built: the package version and, outside the dev server, the commit.
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
    await expect(page.locator('#appVersion')).toHaveText(`v${version}`);
    const built = (process.env.GITHUB_SHA || execSync('git rev-parse --short=7 HEAD').toString()).trim().slice(0, 7);
    await expect(page.locator('#appCommit')).toHaveText(built);
    await expect(page.locator('#appCommit')).toHaveAttribute('href', new RegExp(`/commit/${built}$`));

    // Short-circuit the native save dialog so the export lands in the temp folder.
    const target = path.join(dir, 'document.pdf');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, target);

    await page.locator('#exportPdf').click();
    await expect(page.locator('#status')).toHaveText('PDF saved');
    expect(existsSync(target)).toBe(true);
    const pdf = readFileSync(target);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10_000);
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/gi) || []).length).toBe(3);
    await expect(page.locator('#printPdf')).toHaveCount(0);

    // The File menu drives the same export through an IPC command.
    const viaMenu = path.join(dir, 'via-menu.pdf');
    await app.evaluate(({ dialog, BrowserWindow }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      BrowserWindow.getAllWindows()[0].webContents.send('command', 'export-pdf');
    }, viaMenu);
    await expect.poll(() => existsSync(viaMenu), { timeout: 30_000 }).toBe(true);
    expect(readFileSync(viaMenu).subarray(0, 5).toString()).toBe('%PDF-');

    // A link of the document goes to the system browser and the studio stays in place.
    await app.evaluate(({ shell }) => {
      globalThis.openedExternally = [];
      shell.openExternal = async url => void globalThis.openedExternally.push(url);
    });
    await page.locator('#markdown').fill('# Links\n\n[External](https://example.com/page)\n');
    const link = page.locator('#preview .document-content a');
    await expect(link).toHaveText('External');
    await link.click();
    await expect.poll(() => app.evaluate(() => globalThis.openedExternally)).toEqual(['https://example.com/page']);
    expect(page.url()).toBe('app://studio/');
    expect(app.windows()).toHaveLength(1);

    // Images, logo and the document font go through the app:// scheme and IndexedDB, and reach the PDF.
    await page.locator('#markdown').fill('# Pictures\n\n![Plan](plan.png){width=50%}\n');
    await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(600, 400) });
    await page.locator('#logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: png(3000, 600) });
    const image = page.locator('#preview .document-image > img');
    await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(600);
    await expect.poll(() => page.locator('#preview .cover-logo').evaluate(el => el.naturalWidth)).toBe(1200);
    expect(await page.evaluate(() => document.fonts.check('12px Inter'))).toBe(true);
    await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
    const withImages = path.join(dir, 'with-images.pdf');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, withImages);
    await page.locator('#status').evaluate(el => (el.textContent = ''));
    await page.locator('#exportPdf').click();
    await expect(page.locator('#status')).toHaveText('PDF saved');
    const illustrated = readFileSync(withImages).toString('latin1');
    expect((illustrated.match(/\/Subtype\s*\/Image/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(illustrated).toMatch(/\/FontName\s*\/[A-Z]{6}\+Inter/);

    // After a restart the image and the logo are still there.
    await page.reload();
    await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(600);
    await expect.poll(() => page.locator('#preview .cover-logo').evaluate(el => el.naturalWidth)).toBe(1200);
  } finally {
    await app.close();
  }
});
