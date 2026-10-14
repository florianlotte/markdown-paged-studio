// The headings of the document, for the outline of the editor: the same parse as the preview, so the levels,
// the texts, the numbers and the ids match what the pages show. Pure, shared with the tests.
import { md } from './markdown.js';

// `[{ level, text, number, id, line }]` for the given Markdown, in document order; `line` counts from 0 in
// the assembled document and `number` is the text of the number ('1.2') when the heading is numbered, else
// null. `numberHeadings` is the setting of the document ('none', 'h1' or 'h2').
export function headingsOf(markdown, { numberHeadings = 'none' } = {}) {
  const env = { numberHeadings };
  try {
    md.parse(markdown, env);
  } catch {
    return [];
  }
  return (env.headings ?? []).map(({ level, text, number, id, line }) => ({
    level,
    text: text || '',
    number: number ?? null,
    id,
    line,
  }));
}

// Whether a heading matches the words typed in the filter of the outline: every word, anywhere in its text
// or its number, case and accents ignored.
export function headingMatches(heading, filter) {
  const words = fold(filter).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(`${heading.number ?? ''} ${heading.text}`);
  return words.every(word => haystack.includes(word));
}

const fold = text =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// The heading that holds a line of the document: the last one that starts at or before it, or null.
export function headingAt(headings, line) {
  let found = null;
  for (const heading of headings) {
    if (heading.line > line) break;
    found = heading;
  }
  return found;
}
