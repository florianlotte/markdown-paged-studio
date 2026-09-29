// The document font, Inter, ships with the studio so the preview, the print and every export look the same on
// any machine (it used to fall back to whatever the system had). The font comes in subsets (latin, cyrillic,
// greek...): only those the document needs are loaded in the preview and inlined in the exports.
import normalCss from '@fontsource-variable/inter/wght.css?raw';
import italicCss from '@fontsource-variable/inter/wght-italic.css?raw';
import { neededFaces, parseFontFaces } from './font-faces.js';

export const FONT_FAMILY = 'Inter';
const WEIGHTS = '100 900';
const FACES = [...parseFontFaces(normalCss), ...parseFontFaces(italicCss)];

const FILES = '../node_modules/@fontsource-variable/inter/files/inter-*-wght-*.woff2';
// Address of each file for the preview, and its content as a data URL (loaded on demand) for the exports.
const urls = import.meta.glob('../node_modules/@fontsource-variable/inter/files/inter-*-wght-*.woff2', {
  eager: true,
  query: '?url',
  import: 'default',
});
const dataUrls = import.meta.glob('../node_modules/@fontsource-variable/inter/files/inter-*-wght-*.woff2', {
  query: '?inline',
  import: 'default',
});
const pathOf = face => FILES.replace(/inter-\*-wght-\*\.woff2$/, face.file);

// Faces the document needs: the built-in rules always name the font (margin boxes, cover). Italic faces are
// skipped when neither the content nor the stylesheet can produce italic text.
function facesFor(html, css) {
  const italic = /<(em|i|cite|address|dfn|var)\b/i.test(html) || /italic|oblique/i.test(css);
  return neededFaces(FACES, `${html}${css}`, { italic }).filter(face => pathOf(face) in urls);
}

const loading = new Map(); // font file -> promise of its FontFace, registered in the studio page

// Preview: registers the faces the document needs and waits for them, so Paged.js measures the final text.
// A font that fails to load is reported and the document falls back to the next family, as before.
export async function loadPreviewFonts(html, css) {
  const faces = facesFor(html, css);
  await Promise.all(
    faces.map(face => {
      if (!loading.has(face.file)) {
        const font = new FontFace(FONT_FAMILY, `url("${urls[pathOf(face)]}") format("woff2")`, {
          style: face.style,
          weight: WEIGHTS,
          unicodeRange: face.unicodeRange,
        });
        document.fonts.add(font);
        loading.set(
          face.file,
          font.load().catch(error => {
            console.warn(`Could not load the font ${face.file}`, error);
            document.fonts.delete(font);
            loading.delete(face.file);
          }),
        );
      }
      return loading.get(face.file);
    }),
  );
}

// Exports: the same faces as @font-face rules with the files inlined, so the document works offline.
export async function inlineFontCss(html, css) {
  const rules = await Promise.all(
    facesFor(html, css).map(async face => {
      const data = await dataUrls[pathOf(face)]();
      return `@font-face{font-family:${FONT_FAMILY};font-style:${face.style};font-weight:${WEIGHTS};font-display:block;src:url(${data}) format("woff2");unicode-range:${face.unicodeRange}}`;
    }),
  );
  return rules.join('\n');
}
