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
    Cover: 'Couverture',
    "Write today's date": 'Écrire la date du jour',
    Today: "Aujourd'hui",
    'Pick a date': 'Choisir une date',
    'Document language': 'Langue du document',
    'Language tag': 'Code de langue',
    'Drives the hyphenation and the quotes of the document.': 'Détermine la césure et les guillemets du document.',
    'Other…': 'Autre…',
    'Drop a logo here, or choose a file': 'Déposez un logo ici, ou choisissez un fichier',
    'Current logo': 'Logo actuel',
    'PNG, JPEG or SVG; shown on the cover page, up to 55 mm wide.':
      'PNG, JPEG ou SVG ; affiché sur la page de couverture, jusqu’à 55 mm de large.',
    '{count} missing': '{count} manquante(s)',
    Markdown: 'Markdown',
    'Insert a block at the cursor': 'Insérer un bloc au curseur',
    Table: 'Tableau',
    'Two columns and a caption': 'Deux colonnes et une légende',
    'Image…': 'Image…',
    'Choose image files: added to the library and referenced here':
      'Choisir des fichiers image : ajoutés à la bibliothèque et référencés ici',
    Diagram: 'Diagramme',
    'A Mermaid flowchart with a caption': 'Un organigramme Mermaid avec une légende',
    Formula: 'Formule',
    'A displayed equation between $$ signs': 'Une équation hors texte entre signes $$',
    Alert: 'Alerte',
    'A titled box: note, tip, warning…': 'Un encadré titré : note, conseil, avertissement…',
    Footnote: 'Note de bas de page',
    'A call in the text and its note at the foot of the page': 'Un appel dans le texte et sa note au bas de la page',
    'Page break': 'Saut de page',
    '\\newpage: what follows starts on a new page': '\\newpage : ce qui suit commence sur une nouvelle page',
    'Table of contents': 'Table des matières',
    '[[toc]]: the headings that follow, with their page numbers':
      '[[toc]] : les titres qui suivent, avec leurs numéros de page',
    'Write your Markdown here. The Insert menu above adds a table, a diagram, a formula, an alert…':
      'Écrivez votre Markdown ici. Le menu Insérer, au-dessus, ajoute un tableau, un diagramme, une formule, une alerte…',
    Images: 'Images',
    'Add images': 'Ajouter des images',
    'Matched by file name, whatever the path:': 'Associées par nom de fichier, quel que soit le chemin :',
    'shows the uploaded': 'affiche le fichier importé',
    '. You can also drop or paste images into the editor.':
      '. Vous pouvez aussi déposer ou coller des images dans l’éditeur.',
    'Headers and footers': 'En-têtes et pieds de page',
    Numbering: 'Numérotation',
    'Code and stylesheet': 'Code et feuille de style',
    'Header title': "Titre d'en-tête",
    'Use the current heading as header title': "Utiliser le titre en cours comme titre d'en-tête",
    'Running header level': 'Niveau du titre en en-tête',
    'Level 1 (chapters)': 'Niveau 1 (chapitres)',
    'Level 2 (sections)': 'Niveau 2 (sections)',
    'Level 3': 'Niveau 3',
    'Heading numbering': 'Numérotation des titres',
    'From level 1 (1, 1.1, 1.1.1)': 'À partir du niveau 1 (1, 1.1, 1.1.1)',
    'From level 2 (level 1 is the title)': 'À partir du niveau 2 (le niveau 1 est le titre)',
    'Number figures and tables': 'Numéroter les figures et les tableaux',
    'Figure 1, Table 1, and the references written with @fig: and @tab:.':
      'Figure 1, Tableau 1, et les références écrites avec @fig: et @tab:.',
    'Header name': "Nom d'en-tête",
    'Footer text': 'Texte de pied de page',
    'Code highlighting': 'Coloration du code',
    Light: 'Clair',
    Dark: 'Sombre',
    None: 'Aucune',
    'Custom CSS': 'CSS personnalisé',
    'Import .css': 'Importer .css',
    'Default CSS': 'CSS par défaut',
    Paper: 'Papier',
    'Page size': 'Format de page',
    Margins: 'Marges',
    Preset: 'Préréglage',
    Narrow: 'Étroites',
    Normal: 'Normales',
    Wide: 'Larges',
    Custom: 'Personnalisées',
    'Same on all sides': 'Identiques sur les quatre côtés',
    'Top (mm)': 'Haut (mm)',
    'Right (mm)': 'Droite (mm)',
    'Bottom (mm)': 'Bas (mm)',
    'Left (mm)': 'Gauche (mm)',
    'Mirror margins on facing pages': 'Marges en miroir sur les pages en vis-à-vis',
    'The left and right margins swap on even pages, for binding. The running header and the footer sit inside the top and bottom margins: keep room for them there.':
      "Les marges gauche et droite s'échangent sur les pages paires, pour la reliure. L'en-tête courant et le pied de page occupent les marges haute et basse : gardez-leur de la place.",
    'Source code on GitHub': 'Code source sur GitHub',
    'Release notes': 'Notes de version',
    'Commit this build was made from': 'Commit dont provient cette version',
    'Interface language': "Langue de l'interface",
    Theme: 'Thème',
    'Florian LOTTE on LinkedIn': 'Florian LOTTE sur LinkedIn',

    // Toolbar
    'Hide sidebar': 'Masquer la barre latérale',
    'Show sidebar': 'Afficher la barre latérale',
    'Paged preview': 'Aperçu paginé',
    'Starting…': 'Démarrage…',
    'Render error': 'Erreur de rendu',
    'Paged.js error': 'Erreur Paged.js',
    '1 page': '1 page',
    '{count} pages': '{count} pages',
    'Page layout': 'Disposition des pages',
    'One continuous column': 'Une colonne continue',
    '2 pages': '2 pages',
    'Two pages side by side': 'Deux pages côte à côte',
    'Preview zoom': "Zoom de l'aperçu",
    'Zoom out': 'Zoom arrière',
    'Zoom in': 'Zoom avant',
    Fit: 'Ajuster',
    'Fit to the available width': 'Ajuster à la largeur disponible',
    'View mode': 'Mode d’affichage',
    Edit: 'Édition',
    'Markdown only': 'Markdown seul',
    Split: 'Côte à côte',
    'Editor and preview side by side': 'Éditeur et aperçu côte à côte',
    View: 'Aperçu',
    'Preview only': 'Aperçu seul',
    'Markdown editor': 'Éditeur Markdown',
    'Files of the document': 'Fichiers du document',
    'New file': 'Nouveau fichier',
    'Add Markdown files to the document': 'Ajouter des fichiers Markdown au document',
    'Scroll the editor and the preview together': 'Faire défiler l’éditeur et l’aperçu ensemble',
    'Replace this file with a Markdown file': 'Remplacer ce fichier par un fichier Markdown',
    'Download this file': 'Télécharger ce fichier',
    Prettify: 'Mettre en forme',
    Letter: 'Lettre US',
    'current match': 'correspondance courante',
    'on line': 'à la ligne',
    'replaced $ matches': '$ correspondances remplacées',
    'replaced match on line $': 'correspondance remplacée à la ligne $',
    'Control character': 'Caractère de contrôle',
    'Format this file: one space after #, - lists, _emphasis_, aligned tables (Prettier)':
      'Mettre en forme ce fichier : une espace après #, listes en -, _emphase_, tableaux alignés (Prettier)',
    'This file could not be formatted: {error}': 'Ce fichier n’a pas pu être mis en forme : {error}',
    'File name': 'Nom du fichier',
    chapter: 'chapitre',
    '{name} removed from the document': '{name} retiré du document',
    '{name}: right-click for the actions, double-click to rename, drag to move':
      '{name} : clic droit pour les actions, double-clic pour renommer, glisser pour déplacer',
    'All the files': 'Tous les fichiers',
    File: 'Fichier',
    Rename: 'Renommer',
    'Move left': 'Déplacer à gauche',
    'Move right': 'Déplacer à droite',
    Download: 'Télécharger',
    // Where the document lives (editor bar).
    'Autosave in this browser': 'Enregistrement automatique dans ce navigateur',
    'Saving…': 'Enregistrement…',
    'Saved in this browser': 'Enregistré dans ce navigateur',
    'just now': "à l'instant",
    'Not saved: the browser storage is full or disabled':
      'Non enregistré : le stockage du navigateur est plein ou désactivé',
    'The document is saved in this browser only: export a PDF with project to keep a copy you can reopen anywhere':
      'Le document n’est enregistré que dans ce navigateur : exportez un PDF avec projet pour garder une copie que vous pourrez rouvrir partout',
    // Keys and the panel of the shortcuts (src/shortcuts.js).
    wheel: 'molette',
    'double-click': 'double-clic',
    drag: 'glisser',
    arrows: 'flèches',
    'right-click': 'clic droit',
    Delete: 'Suppr',
    Enter: 'Entrée',
    Escape: 'Échap',
    Home: 'Début',
    End: 'Fin',
    or: 'ou',
    Document: 'Document',
    Workspace: 'Espace de travail',
    Editor: 'Éditeur',
    Files: 'Fichiers',
    Preview: 'Aperçu',
    'Export the PDF with the project': 'Exporter le PDF avec le projet',
    'Print the document': 'Imprimer le document',
    'Import a file': 'Importer un fichier',
    'Hide or show the sidebar': 'Masquer ou afficher la barre latérale',
    'Undo or redo a change made from the preview': 'Annuler ou rétablir une modification faite depuis l’aperçu',
    'Editor alone': 'Éditeur seul',
    'Preview alone': 'Aperçu seul',
    'Zoom the preview': 'Zoomer l’aperçu',
    'Editor width, on the splitter': 'Largeur de l’éditeur, sur le séparateur',
    'Find and replace': 'Rechercher et remplacer',
    'Next or previous match': 'Correspondance suivante ou précédente',
    'Select the next occurrence': 'Sélectionner l’occurrence suivante',
    'Go to a line': 'Aller à une ligne',
    'Undo or redo': 'Annuler ou rétablir',
    'Actions of a file, on its tab': 'Actions d’un fichier, sur son onglet',
    Move: 'Déplacer',
    'Previous or next file': 'Fichier précédent ou suivant',
    'First or last file': 'Premier ou dernier fichier',
    'Back to the text': 'Retour au texte',
    'Show the source of a block': 'Afficher la source d’un bloc',
    'Resize a figure, on its handle': 'Redimensionner une figure, sur sa poignée',
    'Leave the tools of a figure': 'Quitter les outils d’une figure',
    // Search panel of the editor.
    Find: 'Rechercher',
    Replace: 'Remplacer',
    next: 'suivant',
    previous: 'précédent',
    all: 'tout',
    'match case': 'respecter la casse',
    'by word': 'mot entier',
    regexp: 'expression régulière',
    replace: 'remplacer',
    'replace all': 'tout remplacer',
    close: 'fermer',
    'Go to line': 'Aller à la ligne',
    go: 'aller',
    'Editor width': 'Largeur de l’éditeur',
    'Drag to resize the editor (arrow keys: 2 % steps, double-click: half)':
      'Glisser pour redimensionner l’éditeur (flèches : pas de 2 %, double-clic : moitié)',
    'More actions': 'Autres actions',
    'Welcome tour': 'Visite guidée',
    'How the studio works, in six short panels': 'Le fonctionnement du studio, en six panneaux',
    'Welcome to Markdown Paged Studio': 'Bienvenue dans Markdown Paged Studio',
    'Three zones, one document': 'Trois zones, un document',
    'The settings live in the sidebar on the left, your Markdown in the editor, and the pages on the right, laid out exactly as they print. The sample document is a tutorial: edit it, or replace it with yours.':
      'Les réglages sont dans la barre latérale à gauche, votre Markdown dans l’éditeur, et les pages à droite, mises en page exactement comme elles s’impriment. Le document d’exemple est un tutoriel : modifiez-le, ou remplacez-le par le vôtre.',
    'Write in Markdown': 'Écrire en Markdown',
    'Headings, tables, footnotes, task lists, formulas between $ signs, Mermaid diagrams and alerts. Write \\newpage for a page break and [[toc]] for the table of contents. A long document can be several files, as tabs above the editor; drop or paste images into the text, they are matched by file name.':
      'Titres, tableaux, notes de bas de page, listes de tâches, formules entre signes $, diagrammes Mermaid et alertes. Écrivez \\newpage pour un saut de page et [[toc]] pour la table des matières. Un long document peut être plusieurs fichiers, en onglets au-dessus de l’éditeur ; déposez ou collez des images dans le texte, elles sont reconnues par leur nom.',
    'Set up the document': 'Régler le document',
    'Content holds the document fields, its language, the cover page with its logo, and the image library. Design holds the running headers, the footer, the numbering, the code theme and your own CSS. Page holds the paper size and the margins, with presets.':
      'Contenu regroupe les champs du document, sa langue, la page de couverture avec son logo, et la bibliothèque d’images. Style regroupe les en-têtes courants, le pied de page, la numérotation, le thème du code et votre CSS. Page regroupe le format du papier et les marges, avec des préréglages.',
    'Read the preview': 'Lire l’aperçu',
    'Edit, Split and View share the window between the editor and the pages; zoom them, or fit them to the width. Click a diagram or an image to resize or align it. Double-click a block to jump to its source: the editor and the pages scroll together.':
      'Édition, Côte à côte et Aperçu partagent la fenêtre entre l’éditeur et les pages ; zoomez-les, ou ajustez-les à la largeur. Cliquez un diagramme ou une image pour le redimensionner ou l’aligner. Double-cliquez un bloc pour rejoindre sa source : l’éditeur et les pages défilent ensemble.',
    'Save and export': 'Enregistrer et exporter',
    'The document is saved in this browser only. Export writes a PDF with the project attached: it prints anywhere and reopens here with everything. The menu also offers HTML, Markdown and a zip of the files; Import… opens any of them.':
      'Le document n’est enregistré que dans ce navigateur. Exporter écrit un PDF avec le projet attaché : il s’imprime partout et se rouvre ici avec tout. Le menu propose aussi HTML, Markdown et un zip des fichiers ; Importer… les rouvre tous.',
    'Go further': 'Aller plus loin',
    'Press ? for the keyboard shortcuts, right-click a tab for the actions of a file, and use the ⋯ menu to reset the document or to see this tour again.':
      'Appuyez sur ? pour les raccourcis clavier, faites un clic droit sur un onglet pour les actions d’un fichier, et utilisez le menu ⋯ pour réinitialiser le document ou revoir cette visite.',
    'The writing guide': 'Le guide d’écriture',
    'describes every syntax.': 'décrit toutes les syntaxes.',
    "Don't show this again": 'Ne plus afficher',
    Previous: 'Précédent',
    Next: 'Suivant',
    '{step} / {count}': '{step} / {count}',
    'Keyboard shortcuts': 'Raccourcis clavier',
    'Everything the keyboard and the mouse can do in the studio':
      'Tout ce que le clavier et la souris font dans le studio',
    'Reset the document': 'Réinitialiser le document',
    'Discard the document and its images and restore the sample; Undo is offered for ten seconds':
      "Abandonne le document et ses images et restaure l'exemple ; Annuler est proposé pendant dix secondes",
    'Document reset: the sample is back': "Document réinitialisé : l'exemple est de retour",
    Undo: 'Annuler',
    'Import…': 'Importer…',
    'A PDF, an HTML, a Markdown, a zip or a project exported by the studio':
      'Un PDF, un HTML, un Markdown, un zip ou un projet exportés par le studio',
    'Markdown files (zip)': 'Fichiers Markdown (zip)',
    'The files of the document, the stylesheet and the images side by side':
      'Les fichiers du document, la feuille de style et les images côte à côte',
    'this archive holds no Markdown file': 'cette archive ne contient aucun fichier Markdown',
    'this archive could not be read': 'cette archive est illisible',
    Export: 'Exporter',
    'Export options': "Options d'export",
    'HTML with project': 'HTML avec projet',
    'One self-contained page that paginates itself, project included':
      'Une page autonome qui se pagine elle-même, projet inclus',
    'Markdown with project': 'Markdown avec projet',
    'The Markdown with the settings and images in a YAML front matter':
      'Le Markdown avec les réglages et les images en en-tête YAML',
    'Project only': 'Projet seul',
    'Settings, Markdown and images as a JSON file': 'Réglages, Markdown et images dans un fichier JSON',
    'PDF with project, drawn from the preview (pages as images with a text layer)':
      "PDF avec projet, dessiné depuis l'aperçu (pages en images avec une couche de texte)",
    'The document alone, through the print dialog': "Le document seul, par la boîte de dialogue d'impression",
    'PDF through the print dialog: this browser cannot draw the PDF that carries the project':
      "PDF par la boîte de dialogue d'impression : ce navigateur ne peut pas dessiner le PDF qui contient le projet",
    'Not available in this browser. To keep the project, export HTML, Markdown or the zip':
      'Indisponible dans ce navigateur. Pour garder le projet, exportez en HTML, en Markdown ou en zip',
    'Print dialog opened: this PDF does not carry the project':
      "Boîte d'impression ouverte : ce PDF ne contient pas le projet",
    'This browser cannot draw the PDF that carries the project, so Export opens the print dialog. A PDF saved there cannot be reopened in the studio: use HTML with project, Markdown with project or Markdown files (zip) to keep an editable copy.':
      "Ce navigateur ne peut pas dessiner le PDF qui contient le projet : Exporter ouvre donc la boîte de dialogue d'impression. Un PDF enregistré ainsi ne peut pas être rouvert dans le studio : utilisez HTML avec projet, Markdown avec projet ou Fichiers Markdown (zip) pour garder une copie modifiable.",
    'Got it': 'Compris',
    Close: 'Fermer',
    'Export failed: {error}': 'L’export a échoué : {error}',
    'Images could not be added: {error}': 'Les images n’ont pas pu être ajoutées : {error}',
    'This file could not be read: {error}': 'Ce fichier n’a pas pu être lu : {error}',
    'Autosave failed: the browser storage is full or disabled':
      'L’enregistrement automatique a échoué : le stockage du navigateur est plein ou désactivé',
    'Images are kept for this session only: the browser storage is full or disabled':
      'Les images ne sont gardées que pour cette session : le stockage du navigateur est plein ou désactivé',
    'this browser could not draw the pages. Use PDF only (print dialog), or export HTML, Markdown or the zip to keep the project':
      "ce navigateur n'a pas pu dessiner les pages. Utilisez PDF seul (boîte de dialogue d'impression), ou exportez en HTML, en Markdown ou en zip pour garder le projet",
    'Drawing page {done} of {total}…': 'Dessin de la page {done} sur {total}…',
    'Exporting the PDF…': 'Export du PDF…',
    'The studio is locked until the file is ready.': "Le studio est verrouillé jusqu'à ce que le fichier soit prêt.",
    'Writing the file…': 'Écriture du fichier…',
    'Choose where to save it, then the pages are printed…':
      "Choisissez où l'enregistrer, puis les pages sont imprimées…",
    'the preview is still rendering, try again in a moment':
      "l'aperçu est encore en cours de rendu, réessayez dans un instant",
    'PDF saved': 'PDF enregistré',
    'PDF saved with its project': 'PDF enregistré avec son projet',
    'PDF saved without its project': 'PDF enregistré sans son projet',
    'PDF with project': 'PDF avec projet',
    'Settings, Markdown and images attached: the file reopens in the studio':
      'Réglages, Markdown et images joints : le fichier se rouvre dans le studio',
    'PDF only': 'PDF seul',
    'The document alone': 'Le document seul',
    'This file could not be opened: {error}': "Ce fichier n'a pas pu être ouvert : {error}",
    'this PDF holds no project: import a PDF exported with its project':
      'ce PDF ne contient pas de projet : importez un PDF exporté avec son projet',
    'this HTML file holds no studio sources': 'ce fichier HTML ne contient pas de sources du studio',
    'not a valid JSON file': 'ce n’est pas un fichier JSON valide',

    // Messages
    'The logo could not be read: {error}': "Le logo n'a pas pu être lu : {error}",
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
// The editor holds the user's text and translates its own panels (see setEditorPhrases).
const SKIPPED = '#preview, .render-stage, .cm-editor, textarea, script, style, [data-no-i18n]';

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
