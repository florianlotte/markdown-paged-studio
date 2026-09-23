# Markdown Paged Studio

Application 100 % JavaScript côté navigateur pour écrire ou importer du Markdown, appliquer une CSS personnalisée et obtenir un aperçu paginé avec page de garde, en-têtes, pieds de page et compteur `Page X / Y`.

## Fonctionnalités

- éditeur Markdown ;
- diagrammes Mermaid (blocs de code `mermaid`) rendus en SVG, y compris dans l’export ;
- import/export `.md` ;
- import de logo local ;
- page de garde activable ;
- titre, sous-titre, auteur et date ;
- en-tête gauche/droite ;
- pied de page ;
- `Page X / Y` ;
- A4, A5 ou Letter ;
- marges configurables ;
- éditeur et import CSS ;
- configuration exportable/importable en JSON ;
- export d’un HTML autonome ;
- impression / export PDF via le navigateur.

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvre l’URL indiquée par Vite.

## Build statique

```bash
npm run build
```

Le dossier `dist/` peut être déployé sur GitHub Pages, Netlify, Cloudflare Pages, nginx, etc.

## Architecture

- `markdown-it` : Markdown → HTML
- `Paged.js` : pagination CSS dans le navigateur
- `Vite` : développement et build
- aucun backend nécessaire

## Ta CSS existante

Tu peux la coller dans l’onglet **Design > CSS personnalisée**, ou l’importer via **Importer .css**.

Le HTML du contenu est placé dans :

```html
<article class="document-content">...</article>
```

La page de garde utilise notamment :

- `.cover-page`
- `.cover-logo`
- `.cover-title`
- `.cover-subtitle`
- `.cover-meta`

Les diagrammes Mermaid sont rendus dans `.mermaid-diagram` (SVG inline) et une erreur de syntaxe s’affiche dans `.mermaid-error`.

Tu peux donc adapter facilement ta CSS existante.

## PDF

Le bouton **Imprimer / PDF** ouvre une version imprimable dans un nouvel onglet puis lance la boîte de dialogue d’impression du navigateur. Choisis ensuite **Enregistrer au format PDF**.

Pour un export PDF automatique sans boîte de dialogue, il faudrait ajouter un moteur hors navigateur (par exemple Chromium/Puppeteer côté Node). La version actuelle reste volontairement 100 % client.
