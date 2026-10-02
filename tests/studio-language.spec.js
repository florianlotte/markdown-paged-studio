// Integration tests of the interface language: French by choice or from the browser, English otherwise.
import { test, expect } from '@playwright/test';
import { png } from './helpers/png.mjs';
import { STATUS_DONE, openDiagramDocument, openFreshStudio, status } from './helpers/studio.mjs';

test('the interface switches to French and back, and remembers the choice', async ({ page }) => {
  await openFreshStudio(page);
  const language = page.locator('#uiLanguage');
  await expect(language).toHaveValue('en');
  // In the fixed header of the sidebar, shown as a short code, whatever the tab.
  await expect(page.locator('.sidebar-header #uiLanguage')).toHaveCount(1);
  await expect(language.locator('option')).toHaveText(['EN', 'FR']);
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(language).toBeVisible();
  await page.getByRole('tab', { name: 'Content' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(30, 20) });
  await expect(page.locator('#imageList button').first()).toHaveText('Insert');

  await language.selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('tab')).toHaveText(['Contenu', 'Style', 'Page']);
  await expect(page.locator('label', { hasText: 'Sous-titre' })).toBeVisible();
  await expect(page.locator('label.check').first()).toHaveText('Afficher la page de couverture');
  await expect(page.locator('#exportDefault')).toHaveText('Exporter');
  await expect(page.locator('#exportOptions [role="menuitem"] strong')).toHaveText([
    'PDF avec projet',
    'PDF seul',
    'HTML avec projet',
    'Markdown avec projet',
    'Projet seul',
  ]);
  await expect(page.locator('#import')).toHaveText('Importer…');
  await expect(page.locator('#exportDefault')).toHaveAttribute('title', /PDF avec projet, dessiné/);
  await expect(page.locator('#exportPdfOnly span')).toHaveText(
    "Le document seul, par la boîte de dialogue d'impression",
  );
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-label', 'Masquer la barre latérale');
  await expect(page.locator('#zoomIn')).toHaveAttribute('aria-label', 'Zoom avant');
  await expect(page.locator('.images-hint')).toHaveText(
    /Associées par nom de fichier[^]*photo\.png[^]*coller des images/,
  );
  await expect(page.locator('#imageList button')).toHaveText(['Insérer', 'Retirer']);
  await expect(page.locator('#coverTemplate option')).toHaveText([
    'Classique',
    'Centré',
    'Bandeau de couleur',
    'Minimal',
  ]);
  await expect(status(page)).toHaveText('3 pages');
  // What the user wrote and the document itself are left alone.
  await expect(page.locator('#title')).toHaveValue('Architecture Report');
  await expect(page.locator('#preview .cover-title')).toHaveText('Architecture Report');
  await expect(page.locator('#preview .document-content h1')).toHaveText('Introduction');

  await page.reload();
  await expect(status(page)).toHaveText(STATUS_DONE);
  await expect(language).toHaveValue('fr');
  await expect(page.getByRole('tab').first()).toHaveText('Contenu');
  // The document is not part of the choice: no language in its configuration.
  expect(await page.evaluate(() => localStorage.getItem('markdown-paged-studio:language'))).toBe('fr');

  await language.selectOption('en');
  await expect(page.getByRole('tab')).toHaveText(['Content', 'Design', 'Page']);
  await expect(page.locator('#exportDefault')).toHaveText('Export');
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-label', 'Hide sidebar');
  await expect(page.locator('#imageList button')).toHaveText(['Insert', 'Remove']);
});

test('the tools of the preview and the messages follow the language', async ({ page }) => {
  await openDiagramDocument(page, 'Langue');
  await page.locator('#uiLanguage').selectOption('fr');
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);
  const diagram = page.locator('#preview .mermaid-diagram');
  await diagram.scrollIntoViewIfNeeded();
  await diagram.hover();
  await expect(diagram.getByRole('toolbar')).toHaveAttribute('aria-label', 'Taille et alignement du diagramme');
  await diagram.getByRole('button', { name: 'Largeur 50 %' }).click();
  await expect(page.locator('#markdown')).toHaveValue(/```mermaid width=50%\n/);
  await expect(diagram.getByRole('button', { name: 'Aligner à gauche' })).toBeVisible();

  let message = '';
  page.once('dialog', dialog => {
    message = dialog.message();
    dialog.dismiss();
  });
  await page.locator('#resetDocument').click();
  expect(message).toBe("Abandonner le document en cours et ses images, et restaurer l'exemple ?");
});

test.describe('with a French browser', () => {
  test.use({ locale: 'fr-FR' });

  test('the interface starts in French', async ({ page }) => {
    await openFreshStudio(page);
    await expect(page.locator('#uiLanguage')).toHaveValue('fr');
    await expect(page.getByRole('tab')).toHaveText(['Contenu', 'Style', 'Page']);
    await expect(page.locator('.toolbar-title strong')).toHaveText('Aperçu paginé');
  });
});

test.describe('with a browser in another language', () => {
  test.use({ locale: 'de-DE' });

  test('the interface starts in English', async ({ page }) => {
    await openFreshStudio(page);
    await expect(page.locator('#uiLanguage')).toHaveValue('en');
    await expect(page.getByRole('tab')).toHaveText(['Content', 'Design', 'Page']);
  });
});
