// The sources of a document inside a Markdown file: the project (settings, CSS, logo, images) is written as
// a YAML front matter above the Markdown, the convention Pandoc, Jekyll, Hugo or Obsidian use for metadata,
// so any Markdown tool opens the file and the studio reopens the whole document. Plain ESM around `yaml`,
// loaded on demand by the page and shared with the tests.
import { parse, stringify } from 'yaml';

// First key of the front matter; only its presence makes the studio read the block as its own project.
export const MARKER_KEY = 'markdown-paged-studio';
// Bump when the layout of the block changes.
export const FORMAT = 1;

// Short, readable settings first, the heavy values last.
const LAST_KEYS = ['customCss', 'logoDataUrl', 'images'];

const STRINGIFY_OPTIONS = {
  // No folding: a data URL stays on one line, and no line of the block can start with `---`.
  lineWidth: 0,
  // Multi-line strings (the CSS) as literal blocks, readable and diff-friendly.
  blockQuote: 'literal',
  indent: 2,
};

const PARSE_OPTIONS = { version: '1.2', uniqueKeys: true, maxAliasCount: 10 };

const FENCE = /^---[ \t]*$/;

const lf = text => text.replace(/\r\n?/g, '\n');

// The Markdown file: `json` is the project (the content of a project file), `markdown` the document. The
// body starts right after the closing fence, so a document that itself opens with `---` survives unchanged.
export function markdownWithSources({ json, markdown }) {
  const project = JSON.parse(json);
  const front = { [MARKER_KEY]: FORMAT };
  for (const [key, value] of Object.entries(project)) {
    if (key === 'markdown' || LAST_KEYS.includes(key)) continue;
    front[key] = value;
  }
  for (const key of LAST_KEYS) {
    if (key === 'images') front.images = project.images && typeof project.images === 'object' ? project.images : {};
    else if (key in project) front[key] = project[key];
  }
  return `---\n${stringify(front, STRINGIFY_OPTIONS)}---\n${lf(markdown)}`;
}

// The text of the first level 1 heading of a Markdown document (`# Title`, or a line underlined with `=`),
// outside fenced code blocks; null when it has none.
export function firstHeading(markdown) {
  const lines = lf(markdown).split('\n');
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length) fence = null;
      continue;
    }
    if (opening) {
      fence = opening[1];
      continue;
    }
    const atx = /^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (atx) return atx[1];
    if (line.trim() && /^ {0,3}=+[ \t]*$/.test(lines[index + 1] ?? '')) return line.trim();
  }
  return null;
}

// The project held by a Markdown file, as a configuration text, and whether the file carried one. A file
// without the studio's front matter (none, another tool's, invalid YAML) is a document alone: the whole text,
// front matter included, becomes the Markdown, and its first level 1 heading, if any, becomes the title.
export function sourcesOfMarkdown(text) {
  const source = lf(text.replace(/^\uFEFF/, ''));
  const lines = source.split('\n');
  if (FENCE.test(lines[0])) {
    const end = lines.findIndex((line, index) => index > 0 && FENCE.test(line));
    if (end > 0) {
      const found = parseBlock(lines.slice(1, end).join('\n'));
      if (found) {
        delete found[MARKER_KEY];
        if (!(found.images && typeof found.images === 'object' && !Array.isArray(found.images))) delete found.images;
        found.markdown = lines.slice(end + 1).join('\n');
        return { json: JSON.stringify(found), project: true };
      }
    }
  }
  const title = firstHeading(source);
  return { json: JSON.stringify(title === null ? { markdown: source } : { markdown: source, title }), project: false };
}

function parseBlock(block) {
  try {
    const parsed = parse(block, PARSE_OPTIONS);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !(MARKER_KEY in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
