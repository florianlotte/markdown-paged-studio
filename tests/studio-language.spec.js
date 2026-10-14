// Integration tests of the interface language: French by choice or from the browser, English otherwise.
import { test, expect } from '@playwright/test';
import { png } from './helpers/png.mjs';
import {
  expectMarkdown,
  markdownText,
  openDiagramDocument,
  openFreshStudio,
  resetDocument,
  setMarkdown,
  status,
  STATUS_DONE,
  toast,
  toastAction,
} from './helpers/studio.mjs';

test('the interface switches to French and back, and remembers the choice', async ({ page }) => {
  await openFreshStudio(page);
  const language = page.locator('#uiLanguage');
  await expect(language).toHaveValue('en');
  // In the fixed header of the sidebar, shown as a short code, whatever the tab.
  await expect(page.locator('.sidebar-header #uiLanguage')).toHaveCount(1);
  await expect(language.locator('option')).toHaveText(['EN', 'FR']);
  await expect(page.locator('#uiTheme option')).toHaveText(['Auto', 'Light', 'Dark']);
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(language).toBeVisible();
  await page.getByRole('tab', { name: 'Content' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(30, 20) });
  await expect(page.locator('#imageList button').first()).toHaveText('Insert');

  // Words of the document that are also words of the interface, put at the top of the sample document.
  await setMarkdown(page, `Export\n\nReset\n\n${await markdownText(page)}`);
  await expectMarkdown(page, /^Export\n\nReset\n\n# Introduction\n/);

  await language.selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.tabs').getByRole('tab')).toHaveText(['Contenu', 'Style', 'Page']);
  await expect(page.locator('#uiTheme option')).toHaveText(['Auto', 'Clair', 'Sombre']);
  await expect(page.locator('.theme-switch')).toHaveAttribute('title', 'Thème');
  // The text of the editor is the user's: never translated.
  await expect(page.locator('#markdown .cm-line').nth(0)).toHaveText('Export');
  await expect(page.locator('#markdown .cm-line').nth(2)).toHaveText('Reset');
  await expectMarkdown(page, /^Export\n\nReset\n\n# Introduction\n/);
  await expect(page.locator('label', { hasText: 'Sous-titre' })).toBeVisible();
  await expect(page.locator('label.check').first()).toHaveText('Afficher la page de couverture');
  await expect(page.locator('#exportDefault')).toHaveText('Exporter');
  await expect(page.locator('#exportOptions [role="menuitem"] strong')).toHaveText([
    'PDF avec projet',
    'PDF seul',
    'HTML avec projet',
    'Markdown avec projet',
    'Fichiers Markdown (zip)',
    'Projet seul',
  ]);
  await expect(page.locator('#import')).toHaveText('Importer…');
  await expect(page.locator('#exportDefault')).toHaveAttribute('title', /PDF avec projet, dessiné/);
  await expect(page.locator('#exportPdfOnly span')).toHaveText(
    "Le document seul, par la boîte de dialogue d'impression",
  );
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-label', 'Masquer la barre latérale');
  await expect(page.locator('#zoomIn')).toHaveAttribute('aria-label', 'Zoom avant');
  // The workbench: mode buttons, editor bar and splitter.
  await expect(page.locator('.view-controls .segmented').first()).toHaveAttribute('aria-label', 'Mode d’affichage');
  await expect(page.locator('.mode-label')).toHaveText(['Édition', 'Côte à côte', 'Aperçu']);
  await expect(page.locator('#modeSplit')).toHaveAttribute('title', 'Éditeur et aperçu côte à côte');
  await expect(page.locator('#insertPageBreak')).toHaveText('Saut de page');
  await expect(page.locator('#loadMarkdown')).toHaveAttribute('title', 'Remplacer ce fichier par un fichier Markdown');
  await expect(page.locator('#addFile')).toHaveAttribute('aria-label', 'Nouveau fichier');
  await expect(page.locator('#fileTabs')).toHaveAttribute('aria-label', 'Fichiers du document');
  // The notice of the export fallback is part of the interface.
  await expect(page.locator('#exportNotice')).toContainText('Ce navigateur ne peut pas dessiner le PDF', {
    useInnerText: false,
  });
  await expect(page.locator('#dismissExportNotice')).toHaveText('Compris', { useInnerText: false });
  // The search panel of the editor (Ctrl+F) speaks the language too.
  await page.locator('#markdown .cm-content').focus();
  await page.keyboard.press('Control+f');
  await expect(page.locator('#markdown .cm-search input[name="search"]')).toHaveAttribute('placeholder', 'Rechercher');
  await expect(page.locator('#markdown .cm-search button[name="next"]')).toHaveText('suivant');
  await page.keyboard.press('Escape');
  await expect(page.locator('#markdown .cm-search')).toHaveCount(0);
  await expect(page.locator('.splitter')).toHaveAttribute('aria-label', 'Largeur de l’éditeur');
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
  // Read once the render has caught up with the changes above, not while the previous count still shows.
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale|is-rendering/);
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
  await expect(page.locator('.tabs').getByRole('tab')).toHaveText(['Content', 'Design', 'Page']);
  await expect(page.locator('#exportDefault')).toHaveText('Export');
  await expect(page.locator('#toggleSidebar')).toHaveAttribute('aria-label', 'Hide sidebar');
  await expect(page.locator('.mode-label')).toHaveText(['Edit', 'Split', 'View']);
  await expect(page.locator('.splitter')).toHaveAttribute('aria-label', 'Editor width');
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
  await expectMarkdown(page, /```mermaid width=50%\n/);
  await expect(diagram.getByRole('button', { name: 'Aligner à gauche' })).toBeVisible();

  // The "more" menu and the toast of Reset speak French too.
  await expect(page.locator('#moreMenu')).toHaveAttribute('aria-label', 'Autres actions');
  await expect(page.locator('#resetDocument strong')).toHaveText('Réinitialiser le document');
  await resetDocument(page);
  await expect(toast(page)).toHaveText("Document réinitialisé : l'exemple est de retour");
  await expect(toastAction(page)).toHaveText('Annuler');
});

test.describe('with a French browser', () => {
  test.use({ locale: 'fr-FR' });

  test('the interface starts in French', async ({ page }) => {
    await openFreshStudio(page);
    await expect(page.locator('#uiLanguage')).toHaveValue('fr');
    await expect(page.locator('.tabs').getByRole('tab')).toHaveText(['Contenu', 'Style', 'Page']);
    await expect(page.locator('.toolbar-title strong')).toHaveText('Aperçu paginé');
  });
});

test.describe('with a browser in another language', () => {
  test.use({ locale: 'de-DE' });

  test('the interface starts in English', async ({ page }) => {
    await openFreshStudio(page);
    await expect(page.locator('#uiLanguage')).toHaveValue('en');
    await expect(page.locator('.tabs').getByRole('tab')).toHaveText(['Content', 'Design', 'Page']);
  });
});

test('switching the interface language relabels the preview tools without paginating again', async ({ page }) => {
  await openFreshStudio(page);
  const tools = page.locator('#preview .diagram-tools').first();
  await expect(tools).toHaveAttribute('aria-label', 'Diagram size and alignment');
  await page.evaluate(() => (document.querySelector('head style[data-pagedjs-inserted-styles]').dataset.kept = '1'));
  await page.locator('#uiLanguage').selectOption('fr');
  await expect(tools).toHaveAttribute('aria-label', 'Taille et alignement du diagramme');
  await expect(page.locator('head style[data-pagedjs-inserted-styles][data-kept]')).toHaveCount(1);
});
