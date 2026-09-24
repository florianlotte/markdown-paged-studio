// Smoke test of the Electron desktop build: the app starts from dist/, renders the sample document,
// and the desktop-only "Export PDF" button writes a real PDF through Chromium's print-to-PDF.
import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('the desktop app renders the document and exports a PDF directly', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mps-desktop-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, MPS_USER_DATA: path.join(dir, 'user-data') },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('#status')).toHaveText('3 pages');
    await expect(page.locator('#preview .pagedjs_page')).toHaveCount(3);
    expect(await page.title()).toBe('Markdown Paged Studio');
    await expect(page.locator('#exportPdf')).toBeVisible();

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
  } finally {
    await app.close();
  }
});
