// Formulas in the browser: KaTeX, its stylesheet and its fonts are loaded the first time a document holds
// a formula, never before. The stylesheet and the fonts stay out of Paged.js (it would parse the first and
// load every face of the second): the preview gets a <style> in the page and the faces it needs through
// the FontFace API; exports get the same rules and faces inlined. See math-core.js for the pure part.
import { hasMath, neededMathFaces, parseMathCss, renderFormulas } from './math-core.js';
import { lazy } from './util.js';

const fontUrls = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', {
  eager: true,
  query: '?url',
  import: 'default',
});
const fontDataUrls = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', {
  query: '?inline',
  import: 'default',
});
const pathOf = file => `/node_modules/katex/dist/fonts/${file}`;

// Our own rules on top of KaTeX's: equation numbers are written as text by renderFormulas(), because a page
// drawn alone (the PDF made by the browser) would restart a counter.
const OVERRIDES = '.katex .eqn-num::before{content:none;counter-increment:none}';

const loadKatex = lazy(() => import('katex').then(module => module.default));
const loadMathCss = lazy(() => import('katex/dist/katex.min.css?raw').then(module => parseMathCss(module.default)));

// Draws the formulas of `html` (the placeholders of the Markdown rules). Without a formula, nothing loads.
export async function renderMath(html) {
  if (!hasMath(html)) return html;
  try {
    return renderFormulas(html, await loadKatex());
  } catch (error) {
    // KaTeX could not be loaded: the formulas stay as their source.
    console.error(error);
    return html;
  }
}

const drawn = html => html.includes('class="katex');
const loading = new Map(); // file -> Promise<void>

// For the preview, before pagination: the rules of KaTeX in the page, and the font files the formulas of
// `html` need, loaded, so the text is measured with its real fonts.
export async function prepareMathPreview(html) {
  if (!drawn(html)) return;
  const parsed = await loadMathCss();
  if (!document.getElementById('mathStyle')) {
    const style = document.createElement('style');
    style.id = 'mathStyle';
    style.textContent = `${parsed.sheet}${OVERRIDES}`;
    document.head.append(style);
  }
  await Promise.all(
    neededMathFaces(parsed, html).map(face => {
      if (!loading.has(face.file)) {
        const font = new FontFace(face.family, `url(${fontUrls[pathOf(face.file)]}) format("woff2")`, {
          style: face.style,
          weight: String(face.weight),
        });
        document.fonts.add(font);
        loading.set(
          face.file,
          font.load().then(
            () => {},
            error => {
              loading.delete(face.file);
              console.warn(`Font ${face.file} could not be loaded`, error);
            },
          ),
        );
      }
      return loading.get(face.file);
    }),
  );
}

// For exports: the rules of KaTeX and the faces the formulas of `html` need, as one self-contained CSS
// text; empty when the document has no formula.
export async function inlineMathCss(html) {
  if (!drawn(html)) return '';
  const parsed = await loadMathCss();
  const faces = await Promise.all(
    neededMathFaces(parsed, html).map(async face => {
      const dataUrl = await fontDataUrls[pathOf(face.file)]();
      return `@font-face{font-family:${face.family};font-style:${face.style};font-weight:${face.weight};font-display:block;src:url(${dataUrl}) format("woff2")}`;
    }),
  );
  return `${faces.join('')}${parsed.sheet}${OVERRIDES}`;
}
