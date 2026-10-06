// Numbering and cross-references, the part that knows nothing of markdown-it: what a label looks like, the
// id it gives its element, how headings are counted, and the words written around a number in each
// language. A label is written {#fig:plan}, {#tab:costs}, {#eq:energy} or {#sec:intro}, as in
// pandoc-crossref, and a reference @fig:plan. Shared with the tests.

export const KINDS = ['fig', 'tab', 'eq', 'sec'];
// Letters, digits and underscores, with single dashes or dots inside: "see @fig:plan." leaves the full stop.
const NAME = String.raw`[\p{L}\p{N}_]+(?:[-.][\p{L}\p{N}_]+)*`;
const LABEL = new RegExp(`^#(fig|tab|eq|sec):(${NAME})$`, 'u');
const BARE_ID = new RegExp(`^#(${NAME})$`, 'u');
// A reference at the start of a text: optional "-" (number only), "@", the kind (capitalised to start a
// sentence), the name.
const REFERENCE = new RegExp(`^(-?)@(fig|tab|eq|sec|Fig|Tab|Eq|Sec):(${NAME})`, 'u');

// The label written as one word (#fig:plan), or null.
export function parseLabel(word) {
  const match = LABEL.exec(word ?? '');
  return match ? { kind: match[1], name: match[2] } : null;
}

// The label of a given kind held by a brace group at the end of a text ("… {#tab:costs}"): the text
// without the group and the name, or null when the text does not end with such a group.
export function trailingLabel(text, kind) {
  const match = /^([^]*?)[ \t]*\{([^{}\n]*)\}[ \t]*$/.exec(text);
  const label = match && parseLabel(match[2].trim());
  return label?.kind === kind ? { text: match[1], name: label.name } : null;
}

// The attributes a heading may end with: {#custom}, {#sec:intro}, {-}, {.unnumbered}, several at once.
// Returns the text without the group, the id name and the unnumbered flag; null when the text has no
// such group (any other word in the braces keeps them as text).
export function headingAttributes(text) {
  const match = /^([^]*?)[ \t]*\{([^{}\n]+)\}[ \t]*$/.exec(text);
  if (!match) return null;
  const found = { text: match[1], name: null, unnumbered: false };
  for (const word of match[2].trim().split(/\s+/)) {
    const label = parseLabel(word);
    const bare = BARE_ID.exec(word);
    if (label?.kind === 'sec') found.name = label.name;
    else if (bare) found.name = bare[1];
    else if (word === '-' || word === '.unnumbered') found.unnumbered = true;
    else return null;
  }
  return found;
}

// A reference at the start of `text`: its length, kind, name, whether it opens a sentence (@Fig:) and
// whether only the number is wanted (-@fig:); null otherwise.
export function parseReference(text) {
  const match = REFERENCE.exec(text);
  if (!match) return null;
  const kind = match[2].toLowerCase();
  return { length: match[0].length, kind, name: match[3], capital: kind !== match[2], bare: match[1] === '-' };
}

// The id of a labelled element in the document. Headings share the prefix of their automatic anchors.
export const anchorId = (kind, name) => `${kind}-${name.toLowerCase()}`;

// Counts headings: "1", "1.1", "1.1.1". `mode` is the level numbering starts at ('h1' or 'h2'); in 'h2'
// the first level is the title of the document, never numbered and never a reset.
export function headingCounter(mode) {
  const first = mode === 'h2' ? 2 : 1;
  const counts = [];
  return level => {
    if (mode !== 'h1' && mode !== 'h2') return null;
    const depth = level - first;
    if (depth < 0) return null;
    // A level skipped on the way down (h1 then h3) shows as 0.
    while (counts.length < depth) counts.push(0);
    counts[depth] = (counts[depth] ?? 0) + 1;
    counts.length = depth + 1;
    return counts.join('.');
  };
}

const WORDS = {
  en: { fig: 'Figure', tab: 'Table', eq: 'Equation', sec: 'Section', separator: ': ' },
  // French typography: a dash between the number and the caption, after a no-break space.
  fr: { fig: 'Figure', tab: 'Tableau', eq: 'Équation', sec: 'Section', separator: '\u00a0– ' },
  de: { fig: 'Abbildung', tab: 'Tabelle', eq: 'Gleichung', sec: 'Abschnitt', separator: ': ', nouns: true },
  es: { fig: 'Figura', tab: 'Tabla', eq: 'Ecuación', sec: 'Sección', separator: ': ' },
  it: { fig: 'Figura', tab: 'Tabella', eq: 'Equazione', sec: 'Sezione', separator: ': ' },
  pt: { fig: 'Figura', tab: 'Tabela', eq: 'Equação', sec: 'Secção', separator: ': ' },
  nl: { fig: 'Figuur', tab: 'Tabel', eq: 'Vergelijking', sec: 'Sectie', separator: ': ' },
};

const wordsOf = language => {
  const tag = String(language ?? 'en').toLowerCase();
  const words = WORDS[tag.split('-')[0]] ?? WORDS.en;
  return tag === 'pt-br' ? { ...words, sec: 'Seção' } : words;
};

// What opens a caption: "Figure 1: ", or "Figure 1" alone when the element has no caption text.
export function captionLabel(kind, number, language, { alone = false } = {}) {
  const words = wordsOf(language);
  return `${words[kind]} ${number}${alone ? '' : words.separator}`;
}

// The text of a reference: "figure 3", "Figure 3" to open a sentence (and always in German, where nouns
// are capitalised), "3" for the bare form. The word and the number stay on the same line.
export function referenceText(kind, number, language, { capital = false, bare = false } = {}) {
  if (bare) return String(number);
  const words = wordsOf(language);
  const word = capital || words.nouns ? words[kind] : words[kind].toLowerCase();
  return `${word}\u00a0${number}`;
}
