import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import katex from 'katex';
import { md } from '../src/markdown.js';
import { hasMath, neededMathFaces, parseMathCss, renderFormulas, withoutMath } from '../src/math-core.js';

const css = readFileSync(new URL('../node_modules/katex/dist/katex.min.css', import.meta.url), 'utf8');
const parsed = parseMathCss(css);
const draw = markdown => renderFormulas(md.render(markdown), katex);
const files = markdown =>
  neededMathFaces(parsed, draw(markdown))
    .map(face => face.file.replace(/^KaTeX_|\.woff2$/g, ''))
    .sort();

test('the placeholders become KaTeX output, inline or displayed', () => {
  assert.equal(hasMath(md.render('No formula, 5 $ and 10 $.')), false);
  const inline = draw('Energy $E = mc^2$.');
  assert.match(
    inline,
    /<span class="math math-inline" role="math" aria-label="E = mc\^2"><!--math--><span class="katex">/,
  );
  assert.doesNotMatch(inline, /katex-display|<math/);
  const block = draw('$$\n\\frac{a}{b} < 1\n$$\n');
  assert.match(
    block,
    /<div class="math math-block" role="math" aria-label="\\frac\{a\}\{b\} &lt; 1"><!--math--><span class="katex-display">/,
  );
  // The source line of the preview stays on the block.
  assert.match(
    renderFormulas(md.render('$$\nx\n$$\n', { sourceLines: true }), katex),
    /aria-label="x" data-source-line="0">/,
  );
  // The text of formulas can be left out, to look at the text of the document alone.
  assert.equal(
    withoutMath(draw('Before $\\alpha$ after.')),
    '<p>Before <span class="math math-inline" role="math" aria-label="\\alpha"></span> after.</p>\n',
  );
});

test('a formula KaTeX cannot read shows its source and is marked', () => {
  const broken = draw('Bad $\\frac{1}{$ here and good $x$.');
  assert.match(
    broken,
    /class="math math-inline math-error"[^>]*><!--math--><span class="katex-error" title="ParseError:[^"]*"[^>]*>\\frac\{1\}\{<\/span>/,
  );
  assert.equal((broken.match(/math-error/g) ?? []).length, 1);
  // Nothing can be injected through a formula: commands that write HTML or links are not trusted.
  const untrusted = draw('$\\href{javascript:alert(1)}{x}$ $\\htmlClass{evil}{y}$');
  assert.doesNotMatch(untrusted, /href=|class="evil"/);
});

test('numbered equations get their number as text, in the order of the document', () => {
  const html = draw(
    '$$\\begin{equation} a = b \\end{equation}$$\n\n$$x$$\n\n```math\n\\begin{equation} c = d \\end{equation}\n```\n',
  );
  assert.deepEqual(
    [...html.matchAll(/<span class="eqn-num">([^<]*)<\/span>/g)].map(match => match[1]),
    ['(1)', '(2)'],
  );
  // Rendered again, the numbers start again: nothing is kept between two documents.
  assert.match(draw('$$\\begin{equation} e = f \\end{equation}$$'), /<span class="eqn-num">\(1\)<\/span>/);
});

test("KaTeX's stylesheet is understood: every font rule gives classes, every face a file", () => {
  assert.equal(parsed.faces.length, 20);
  assert.ok(parsed.faces.every(face => /^KaTeX_\w+-\w+\.woff2$/.test(face.file) && face.family.startsWith('KaTeX_')));
  // Every rule of the sheet that names a KaTeX family was read, with all its selectors.
  const sheetRules = [...parsed.sheet.matchAll(/([^{}@]+)\{([^{}]*font-family:\s*KaTeX_[^{}]*)\}/g)];
  const selectors = sheetRules.flatMap(([, list]) => list.split(','));
  assert.ok(selectors.length >= 30);
  assert.equal(parsed.rules.length, selectors.length);
  assert.ok(parsed.rules.every(rule => rule.classes.length && !rule.classes.includes('katex')));
  // Every family of the faces is reachable: the main one by default, the others through a rule.
  const reachable = new Set(['KaTeX_Main', ...parsed.rules.map(rule => rule.family)]);
  assert.deepEqual(
    [...new Set(parsed.faces.map(face => face.family))].filter(family => !reachable.has(family)),
    [],
  );
  assert.ok(parsed.bold.length && parsed.italic.length);
  // What is handed to the page holds no font file and no page-wide rule.
  assert.doesNotMatch(parsed.sheet, /@font-face|(^|\})body\{/);
  assert.match(parsed.sheet, /\.katex\{/);
});

test('a document asks for the faces its formulas use, no more', () => {
  assert.deepEqual(files('Text only.'), ['Main-Regular']);
  assert.deepEqual(files('$x$'), ['Main-Regular', 'Math-Italic']);
  assert.deepEqual(files('$1 + 2$'), ['Main-Regular']);
  assert.deepEqual(files('$$\\sum_{i=1}^n i$$'), ['Main-Regular', 'Math-Italic', 'Size2-Regular']);
  assert.deepEqual(files('$\\mathbb{R}$'), ['AMS-Regular', 'Main-Regular']);
  assert.deepEqual(files('$\\mathcal{L}$'), ['Caligraphic-Regular', 'Main-Regular']);
  assert.deepEqual(files('$\\mathfrak{g}$ $\\mathscr{F}$ $\\mathtt{t}$ $\\mathsf{s}$'), [
    'Fraktur-Regular',
    'Main-Regular',
    'SansSerif-Regular',
    'Script-Regular',
    'Typewriter-Regular',
  ]);
  // Bold and italic text bring the cuts of the families in use.
  assert.deepEqual(files('$\\mathbf{v}$'), ['Main-Bold', 'Main-Regular']);
  assert.deepEqual(files('$\\textit{word}$'), ['Main-Italic', 'Main-Regular']);
  assert.deepEqual(files('$\\boldsymbol{x}$'), ['Main-Bold', 'Main-Regular', 'Math-BoldItalic']);
  // Tall delimiters use the size fonts.
  const tall = files('$$\\left(\\frac{\\frac{a}{b}}{\\frac{c}{d}}\\right)$$');
  assert.ok(
    tall.some(name => /^Size\d-Regular$/.test(name)),
    tall.join(' '),
  );
});
