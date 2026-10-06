// Formulas, the part that needs no browser: turning the placeholders left by the Markdown rules into
// KaTeX output, and finding in KaTeX's own stylesheet which font files a document needs. KaTeX picks its
// fonts by class (`.mathnormal`, `.delimsizing.size2`…), so the classes of the rendered formulas tell
// exactly which faces are used; nothing here lists KaTeX's classes by hand, an upgrade cannot silently
// drop a face. Shared with the tests.
import { escapeHtml, unescapeHtml } from './escape.js';

const PLACEHOLDER = /<(span|div) class="math math-(inline|block)"([^>]*)>([^<]*)<\/\1>/g;
// Around the output of KaTeX, so the text of formulas can be told apart from the text of the document.
const OPEN = '<!--math-->';
const CLOSE = '<!--/math-->';
const CACHE_LIMIT = 500;
const cache = new Map();

export const hasMath = html => html.includes('class="math ');

// The HTML without what KaTeX drew: the text of the document proper (for the choice of its own fonts).
export const withoutMath = html => html.replaceAll(/<!--math-->[^]*?<!--\/math-->/g, '');

function formula(katex, tex, displayMode) {
  const key = `${displayMode ? 'b' : 'i'}${tex}`;
  if (!cache.has(key)) {
    let html;
    let failed;
    try {
      html = katex.renderToString(tex, {
        displayMode,
        output: 'html',
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        errorColor: '#b3261e',
        macros: {},
      });
      failed = html.includes('katex-error');
    } catch (error) {
      html = `<span class="katex-error" title="${escapeHtml(error?.message ?? error)}">${escapeHtml(tex)}</span>`;
      failed = true;
    }
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, { html, failed });
  }
  return cache.get(key);
}

// Replaces every placeholder of `html` with the formula drawn by `katex`. A formula that KaTeX cannot read
// shows its source, marked `.math-error`, with the reason as a tooltip. Numbered equations get their number
// as text, in the order of the document; this is the one place where equations are counted, so labelled
// formulas and the references to them (written by the Markdown rules) are completed here.
export function renderFormulas(html, katex) {
  let equation = 0;
  const numbers = new Map(); // id of a labelled formula -> the number it shows, "(3)"
  const drawn = html.replace(PLACEHOLDER, (_, tag, kind, attributes, escaped) => {
    const tex = unescapeHtml(escaped);
    const id = /\sid="(eq-[^"]*)"/.exec(attributes)?.[1];
    let result = formula(katex, tex, kind === 'block');
    // A labelled formula ({#eq:name}) must show a number to be referred to: when the author neither used a
    // numbering environment nor gave a \tag, it is drawn as an equation. The line breaks keep a comment at
    // the end of the TeX from swallowing \end.
    const numberedByKatex = result.html.includes('class="eqn-num"') || result.html.includes('class="tag"');
    if (id && kind === 'block' && !result.failed && !numberedByKatex) {
      const wrapped = formula(katex, `\\begin{equation}\n${tex}\n\\end{equation}`, true);
      if (!wrapped.failed) result = wrapped;
    }
    let first = null;
    const numbered = result.html.replaceAll('<span class="eqn-num"></span>', () => {
      const number = `(${++equation})`;
      first ??= number;
      return `<span class="eqn-num">${number}</span>`;
    });
    // The number a reference shows: the first one of the formula, or the tag the author wrote.
    const tagged = /\\tag(\*?)\{([^{}]*)\}/.exec(tex);
    if (id) numbers.set(id, first ?? (tagged ? (tagged[1] ? tagged[2] : `(${tagged[2]})`) : null));
    const classes = `math math-${kind}${result.failed ? ' math-error' : ''}`;
    return `<${tag} class="${classes}" role="math" aria-label="${escapeHtml(tex)}"${attributes}>${OPEN}${numbered}${CLOSE}</${tag}>`;
  });
  // The references to equations were written with "(?)": the numbers are known now.
  return drawn.replace(
    /(<(a|span) class="ref ref-eq"[^>]*data-eq="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g,
    (whole, open, _tag, id, text, close) =>
      numbers.get(id) ? `${open}${text.replace('(?)', escapeHtml(numbers.get(id)))}${close}` : whole,
  );
}

const declaration = (block, name) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(block)?.[1].trim();
const weightOf = value => (/^(bold|[6-9]00)$/i.test(value ?? '') ? 700 : 400);
const styleOf = value => (/italic|oblique/i.test(value ?? '') ? 'italic' : 'normal');

// Classes of the last compound selector that names any (".katex .delimsizing.mult .delim-size1>span" ->
// ["delim-size1"]), without the root class; null when the selector names none.
function classesOf(selector) {
  const compounds = selector
    .trim()
    .split(/\s*[\s>+~]\s*/)
    .map(compound => [...compound.matchAll(/\.([\w-]+)/g)].map(match => match[1]).filter(name => name !== 'katex'));
  return compounds.findLast(classes => classes.length) ?? null;
}

// What KaTeX's stylesheet says about fonts:
// - `faces`: its @font-face rules, { family, style, weight, file } with `file` the woff2 name;
// - `rules`: the class sets that select a KaTeX family, { classes, family, weight, style };
// - `bold`, `italic`: the class sets that only change the weight or the style of the inherited family;
// - `sheet`: the stylesheet without the @font-face rules and without the page-wide counter of equations.
export function parseMathCss(css) {
  const faces = [];
  const sheet = css
    .replace(/@font-face\s*\{([^}]*)\}/g, (_, block) => {
      const file = /url\((?:["']?)(?:[^)"']*\/)?([^/)"']+\.woff2)/.exec(block)?.[1];
      const family = declaration(block, 'font-family')?.replace(/["']/g, '');
      if (file && family)
        faces.push({
          family,
          style: styleOf(declaration(block, 'font-style')),
          weight: weightOf(declaration(block, 'font-weight')),
          file,
        });
      return '';
    })
    .replace(/(^|\})\s*body\s*\{[^}]*\}/g, '$1');
  const rules = [];
  const bold = [];
  const italic = [];
  for (const [, selectors, block] of sheet.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const family = /^KaTeX_\w+/.exec(declaration(block, 'font-family') ?? '')?.[0];
    const weight = declaration(block, 'font-weight');
    const style = declaration(block, 'font-style');
    if (!family && !weight && !style) continue;
    for (const selector of selectors.split(',')) {
      const classes = classesOf(selector);
      if (!classes) continue;
      if (family)
        rules.push({ classes, family, weight: weight ? weightOf(weight) : null, style: style ? styleOf(style) : null });
      else {
        if (weight && weightOf(weight) === 700) bold.push(classes);
        if (style && styleOf(style) === 'italic') italic.push(classes);
      }
    }
  }
  return { faces, rules, bold, italic, sheet };
}

// The font faces the formulas of `html` are drawn with. The main face always; a family as soon as an
// element carries the classes that select it; the bold and italic cuts of those families when a class that
// changes the weight or the style is used anywhere (a small, bounded excess).
export function neededMathFaces(parsed, html) {
  const used = [...html.matchAll(/class="([^"]*)"/g)].map(match => new Set(match[1].split(/\s+/)));
  const present = classes => used.some(set => classes.every(name => set.has(name)));
  const wanted = new Map(); // "family|weight|style"
  const want = (family, weight, style) => wanted.set(`${family}|${weight}|${style}`, { family, weight, style });
  want('KaTeX_Main', 400, 'normal');
  for (const rule of parsed.rules)
    if (present(rule.classes)) want(rule.family, rule.weight ?? 400, rule.style ?? 'normal');
  const families = new Set([...wanted.values()].map(face => face.family));
  const anyBold = parsed.bold.some(present) || [...wanted.values()].some(face => face.weight === 700);
  const anyItalic = parsed.italic.some(present);
  for (const family of families) {
    if (anyBold) want(family, 700, 'normal');
    if (anyItalic) want(family, 400, 'italic');
    if (anyBold && anyItalic) want(family, 700, 'italic');
  }
  return parsed.faces.filter(face => wanted.has(`${face.family}|${face.weight}|${face.style}`));
}
