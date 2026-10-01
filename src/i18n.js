// Language of the studio interface. The code and the markup are written in English; this module holds the
// translations, keyed by the English text, and applies them. It is a setting of the studio (own localStorage
// key), not of the document: the language of the document is `state.language`.
//
// Static markup is translated in place: every text node and every `title`, `aria-label`, `placeholder` and
// `alt` attribute of the page whose English text has a translation. Text set from JavaScript goes through
// `t()`; what depends on it is rebuilt by the listeners of `onLanguageChange()`.

export const LANGUAGE_KEY = 'markdown-paged-studio:language';
export const LANGUAGES = { en: 'English', fr: 'Français' };

const TRANSLATIONS = {
  fr: {
    // Sidebar
    '100% in the browser': '100 % dans le navigateur',
    'Close settings': 'Fermer les réglages',
    Settings: 'Réglages',
    Content: 'Contenu',
    Design: 'Style',
    Page: 'Page',
    Title: 'Titre',
    Subtitle: 'Sous-titre',
    Author: 'Auteur',
    Date: 'Date',
    'Show cover page': 'Afficher la page de couverture',
    'Cover template': 'Modèle de couverture',
    Classic: 'Classique',
    Centered: 'Centré',
    'Colour band': 'Bandeau de couleur',
    Minimal: 'Minimal',
    'Accent colour': "Couleur d'accent",
    Logo: 'Logo',
    'Remove logo': 'Retirer le logo',
    Markdown: 'Markdown',
    'Page break': 'Saut de page',
    'Insert \\newpage at the cursor': 'Insérer \\newpage au curseur',
    'Table of contents': 'Table des matières',
    'Insert [[toc]] at the cursor': 'Insérer [[toc]] au curseur',
    'Import .md': 'Importer .md',
    'Download .md': 'Télécharger .md',
    Images: 'Images',
    'Add images': 'Ajouter des images',
    'Matched by file name, whatever the path:': 'Associées par nom de fichier, quel que soit le chemin :',
    'shows the uploaded': 'affiche le fichier importé',
    '. You can also drop or paste images into the editor.':
      '. Vous pouvez aussi déposer ou coller des images dans l’éditeur.',
    'Header title': "Titre d'en-tête",
    'Use the current chapter (first-level heading) as header title':
      "Utiliser le chapitre en cours (titre de niveau 1) comme titre d'en-tête",
    'Header name': "Nom d'en-tête",
    'Footer text': 'Texte de pied de page',
    'Code highlighting': 'Coloration du code',
    Light: 'Clair',
    Dark: 'Sombre',
    None: 'Aucune',
    'Custom CSS': 'CSS personnalisé',
    'Import .css': 'Importer .css',
    'Default CSS': 'CSS par défaut',
    'Page size': 'Format de page',
    'Language (hyphenation and quotes)': 'Langue (césure et guillemets)',
    'Top (mm)': 'Haut (mm)',
    'Right (mm)': 'Droite (mm)',
    'Bottom (mm)': 'Bas (mm)',
    'Left (mm)': 'Gauche (mm)',
    'Facing pages: mirror the left and right margins': 'Pages en vis-à-vis : marges gauche et droite en miroir',
    Pagination: 'Pagination',
    'The header, footer and': "L'en-tête, le pied de page et le compteur",
    'counter are computed by Paged.js.': 'sont calculés par Paged.js.',
    'Source code on GitHub': 'Code source sur GitHub',
    'Release notes': 'Notes de version',
    'Commit this build was made from': 'Commit dont provient cette version',
    'Interface language': "Langue de l'interface",
    'Florian LOTTE on LinkedIn': 'Florian LOTTE sur LinkedIn',

    // Toolbar
    'Hide sidebar': 'Masquer la barre latérale',
    'Show sidebar': 'Afficher la barre latérale',
    'Paged preview': 'Aperçu paginé',
    'Starting…': 'Démarrage…',
    'Rendering…': 'Rendu en cours…',
    'Render error': 'Erreur de rendu',
    'Paged.js error': 'Erreur Paged.js',
    '1 page': '1 page',
    '{count} pages': '{count} pages',
    'Page layout': 'Disposition des pages',
    'One continuous column': 'Une colonne continue',
    '2 pages': '2 pages',
    'Two pages side by side': 'Deux pages côte à côte',
    'Preview zoom': "Zoom de l'aperçu",
    'Zoom out (Ctrl + wheel)': 'Zoom arrière (Ctrl + molette)',
    'Zoom out': 'Zoom arrière',
    'Zoom in (Ctrl + wheel)': 'Zoom avant (Ctrl + molette)',
    'Zoom in': 'Zoom avant',
    Fit: 'Ajuster',
    'Fit to the available width': 'Ajuster à la largeur disponible',
    Reset: 'Réinitialiser',
    'Import…': 'Importer…',
    'A PDF, an HTML or a project exported by the studio': 'Un PDF, un HTML ou un projet exportés par le studio',
    Export: 'Exporter',
    'Export options': "Options d'export",
    'HTML with project': 'HTML avec projet',
    'One self-contained page that paginates itself, project included':
      'Une page autonome qui se pagine elle-même, projet inclus',
    'Project only': 'Projet seul',
    'Settings, Markdown and images as a JSON file': 'Réglages, Markdown et images dans un fichier JSON',
    'PDF with project: opens the print dialog, choose "Save as PDF"':
      "PDF avec projet : ouvre la boîte de dialogue d'impression, choisir « Enregistrer au format PDF »",
    'PDF saved': 'PDF enregistré',
    'PDF saved with its project': 'PDF enregistré avec son projet',
    'PDF saved without its project': 'PDF enregistré sans son projet',
    'PDF with project': 'PDF avec projet',
    'Settings, Markdown and images attached: the file reopens in the studio':
      'Réglages, Markdown et images joints : le fichier se rouvre dans le studio',
    'PDF only': 'PDF seul',
    'The document alone': 'Le document seul',
    'Saved the PDF? Choose it to add the project.': 'PDF enregistré ? Choisissez-le pour y ajouter le projet.',
    'Choose PDF…': 'Choisir le PDF…',
    'Not now': 'Plus tard',
    'Project attached': 'Projet joint',
    'The project could not be attached: {error}': "Le projet n'a pas pu être joint : {error}",
    'This file could not be opened: {error}': "Ce fichier n'a pas pu être ouvert : {error}",
    'this PDF holds no studio sources': 'ce PDF ne contient pas de sources du studio',
    'this HTML file holds no studio sources': 'ce fichier HTML ne contient pas de sources du studio',
    'not a valid JSON file': 'ce n’est pas un fichier JSON valide',

    // Messages
    'The logo could not be read: {error}': "Le logo n'a pas pu être lu : {error}",
    'Discard the current document and its images, and restore the sample?':
      "Abandonner le document en cours et ses images, et restaurer l'exemple ?",
    'The browser blocked the print window. Allow pop-ups for this site.':
      "Le navigateur a bloqué la fenêtre d'impression. Autorisez les fenêtres surgissantes pour ce site.",
    'PDF export failed: {error}': "L'export PDF a échoué : {error}",

    // Images
    '{name}: {error}.': '{name} : {error}.',
    '{name} added, scaled down to {width} px wide.': '{name} ajoutée, réduite à {width} px de large.',
    '{name} added.': '{name} ajoutée.',
    'Not an image': "Ce n'est pas une image",
    'The file is not a readable image': "Le fichier n'est pas une image lisible",
    'Unsupported image data': "Données d'image non prises en charge",
    ' · built in': ' · intégrée',
    Insert: 'Insérer',
    'Insert {name} at the cursor': 'Insérer {name} au curseur',
    Remove: 'Retirer',
    'Remove {name}': 'Retirer {name}',
    'Used in the document, not uploaded yet': 'Utilisée dans le document, pas encore importée',

    // Size and alignment tools of the preview
    'Diagram size and alignment': 'Taille et alignement du diagramme',
    'Image size and alignment': "Taille et alignement de l'image",
    'Diagram width': 'Largeur du diagramme',
    'Image width': "Largeur de l'image",
    'Width {percent} %': 'Largeur {percent} %',
    Auto: 'Auto',
    'Natural size': 'Taille naturelle',
    'In the text': 'Dans le texte',
    'Align left': 'Aligner à gauche',
    Center: 'Centrer',
    'Align right': 'Aligner à droite',
    'Drag to resize (arrow keys: 5 % steps)': 'Glisser pour redimensionner (flèches : pas de 5 %)',
  },
};

const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'];
// Never translated: the rendered document, what the user types, and anything marked data-no-i18n.
const SKIPPED = '#preview, .render-stage, textarea, script, style, [data-no-i18n]';

let language = 'en';
const listeners = new Set();
// English text of what was translated in place, to translate again after a change of language.
const originalText = new WeakMap();
const originalAttributes = new WeakMap();

export function currentLanguage() {
  return language;
}

// The translation of an English text, with its {placeholders} filled in. Unknown texts come back as written.
export function t(text, values = {}) {
  const table = TRANSLATIONS[language];
  const translated = table && Object.hasOwn(table, text) ? table[text] : text;
  return translated.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

function translateTextNode(node) {
  const original = originalText.get(node) ?? node.nodeValue;
  const key = original.trim().replace(/\s+/g, ' ');
  if (!key || !Object.hasOwn(TRANSLATIONS.fr, key)) return;
  originalText.set(node, original);
  const [, lead, tail] = /^(\s*)[^]*?(\s*)$/.exec(original);
  node.nodeValue = `${lead}${t(key)}${tail}`;
}

function translateAttributes(element) {
  for (const name of ATTRIBUTES) {
    if (!element.hasAttribute(name)) continue;
    const originals = originalAttributes.get(element) ?? {};
    const original = originals[name] ?? element.getAttribute(name);
    if (!Object.hasOwn(TRANSLATIONS.fr, original)) continue;
    originals[name] = original;
    originalAttributes.set(element, originals);
    element.setAttribute(name, t(original));
  }
}

// Translates the static markup under `root` in place.
export function translateDom(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(SKIPPED)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    else translateAttributes(node);
  }
}

// Listeners rebuild what was written with t(): status, tools of the preview, list of images.
export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function apply() {
  document.documentElement.lang = language;
  translateDom();
}

export function setLanguage(next) {
  if (!(next in LANGUAGES) || next === language) return;
  language = next;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Storage unavailable: the language still applies for this session.
  }
  apply();
  for (const listener of listeners) listener(language);
}

// The saved language, else the one of the browser when it is available, else English.
export function initLanguage() {
  let stored = null;
  try {
    stored = localStorage.getItem(LANGUAGE_KEY);
  } catch {
    // Storage unavailable: follow the browser.
  }
  const preferred = String(navigator.language ?? '')
    .slice(0, 2)
    .toLowerCase();
  language = [stored, preferred].find(candidate => candidate in LANGUAGES) ?? 'en';
  apply();
  return language;
}
