// Measures the Markdown parser of the studio against the CommonMark specification and the GitHub Flavored
// Markdown extensions: `npm run conformance` prints the report, `npm run conformance -- --write` also
// refreshes the figures of docs/markdown-support.md. tests/conformance.test.mjs guards the result.
//
// Every difference with CommonMark must have a known cause, a deliberate choice of the project. A
// difference without one means a rule of the project broke a basic syntax.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { isExternalSource } from '../src/images.js';
import { md } from '../src/markdown.js';

const require = createRequire(import.meta.url);
export const COMMONMARK_VERSION = require('commonmark-spec/package.json').version;
// The package writes a tab as "→", like the text of the specification.
const commonmark = require('commonmark-spec').tests.map(example => ({
  ...example,
  markdown: example.markdown.replaceAll('→', '\t'),
  html: example.html.replaceAll('→', '\t'),
}));
const gfm = JSON.parse(readFileSync(new URL('../tests/fixtures/gfm-extensions.json', import.meta.url), 'utf8'));
const DOCUMENT = new URL('../docs/markdown-support.md', import.meta.url);

// Two HTML texts that a browser shows the same way compare equal.
export function normalize(html) {
  return html.replace(/\s+/g, ' ').replace(/> </g, '><').replace(/ ?\/>/g, '>').trim();
}

// What the studio adds to the HTML without changing what the Markdown means: the anchors of the headings
// and the wrapper of the images, with its caption.
export function stripProjectAdditions(html) {
  return html
    .replace(/ id="sec-[^"]*"/g, '')
    .replace(
      /<span class="document-image[^>]*>(<img[^>]*>)(?:<span class="image-caption">[^<]*<\/span>)?<\/span>/g,
      '$1',
    );
}

const matches = (example, html) => normalize(html) === normalize(example.html);
const strict = () => new MarkdownIt('commonmark');

// The deliberate choices of the project, in the order they are tried. The first three and the last are
// options of the parser: an example belongs to one when strict CommonMark with that single option fails it.
export const CAUSES = [
  {
    key: 'html',
    label: 'Raw HTML is not rendered',
    applies: example => !matches(example, strict().set({ html: false }).render(example.markdown)),
  },
  {
    key: 'image',
    label: 'Images are found by file name in the image library',
    applies: example =>
      [...example.html.matchAll(/<img src="([^"]*)"/g)].some(([, source]) => !isExternalSource(source)),
  },
  {
    key: 'typographer',
    label: 'Typographic replacements (quotes, dashes, ellipsis)',
    applies: example =>
      !matches(
        example,
        strict().set({ typographer: true }).enable(['replacements', 'smartquotes']).render(example.markdown),
      ),
  },
  {
    key: 'linkify',
    label: 'Addresses written in the text become links',
    applies: example => !matches(example, strict().set({ linkify: true }).enable('linkify').render(example.markdown)),
  },
  {
    key: 'extensions',
    label: 'Tables and strikethrough are enabled',
    applies: example => !matches(example, strict().enable(['table', 'strikethrough']).render(example.markdown)),
  },
];

function tally(examples, render) {
  const sections = new Map();
  const failures = [];
  for (const example of examples) {
    const section = sections.get(example.section) ?? { pass: 0, total: 0 };
    section.total++;
    if (matches(example, render(example.markdown))) section.pass++;
    else failures.push(example);
    sections.set(example.section, section);
  }
  return { pass: examples.length - failures.length, total: examples.length, sections, failures };
}

// Syntaxes outside both specifications that people expect from Markdown tools, with what would show that
// the parser understands them.
const PROBES = [
  ['Task lists', '- [ ] todo\n- [x] done\n', /type="checkbox"/],
  ['Footnotes', 'Text[^1]\n\n[^1]: Note\n', /<span class="footnote">Note<\/span>/],
  ['Definition lists', 'Term\n: Definition\n', /<dl>/],
  ['Subscript and superscript', 'H~2~O and x^2^\n', /<sub>|<sup>/],
  ['Math formulas', '$a^2 + b^2$\n', /katex|<math/],
  ['Highlighted text', '==marked==\n', /<mark>/],
  ['Alerts', '> [!NOTE]\n> text\n', /class="[^"]*(alert|note)/i],
  ['Heading identifiers', '# Title {#custom}\n', /id="custom"/],
  ['Abbreviations', '*[HTML]: Hyper Text\n\nHTML\n', /<abbr/],
  ['Emoji shortcodes', ':smile:\n', /😄/u],
];

// Plain uses of each GFM extension, and what shows that the parser understands them. The examples of the
// specification are compared too, but their HTML differs from the one of markdown-it in details (alignment
// written as a style, <s> for <del>), so equality is reported, not required.
const GFM_PROBES = {
  Tables: [['| a | b |\n| --- | --- |\n| 1 | 2 |\n', /<table>/]],
  'Task list items': [['- [ ] todo\n- [x] done\n', /type="checkbox"/]],
  Strikethrough: [['~~gone~~\n', /<s>gone<\/s>|<del>gone<\/del>/]],
  Autolinks: [
    ['Visit https://example.com today.\n', /<a href="https:\/\/example\.com"/],
    ['Write to me@example.com.\n', /<a href="mailto:me@example\.com"/],
    ['Visit www.example.com today.\n', /<a href="http:\/\/www\.example\.com"/],
  ],
  // Raw HTML is never rendered at all, which covers the tags this extension filters out.
  'Disallowed Raw HTML': [['<script>alert(1)</script>\n', /&lt;script&gt;/]],
};

function support(extension) {
  const understood = GFM_PROBES[extension].filter(([source, expected]) => expected.test(md.render(source)));
  if (understood.length === GFM_PROBES[extension].length) return 'yes';
  return understood.length ? 'partly' : 'no';
}

export function measure() {
  const reference = tally(commonmark, source => strict().render(source));
  const asIs = tally(commonmark, source => md.render(source));
  const project = tally(commonmark, source => stripProjectAdditions(md.render(source)));

  const causes = new Map([...CAUSES.map(cause => [cause.key, []]), ['unexplained', []]]);
  for (const example of project.failures) {
    const cause = CAUSES.find(candidate => candidate.applies(example));
    causes.get(cause?.key ?? 'unexplained').push(example);
  }

  const extensions = new Map();
  for (const example of gfm.examples) {
    const entry = extensions.get(example.extension) ?? {
      supported: support(example.extension),
      identical: 0,
      total: 0,
    };
    entry.total++;
    if (matches(example, stripProjectAdditions(md.render(example.markdown)))) entry.identical++;
    extensions.set(example.extension, entry);
  }

  const probes = PROBES.map(([name, source, expected]) => ({ name, supported: expected.test(md.render(source)) }));
  return { reference, asIs, project, causes, extensions, probes };
}

const label = key => CAUSES.find(cause => cause.key === key)?.label ?? 'No known cause';
const percent = ({ pass, total }) => `${((pass / total) * 100).toFixed(1)} %`;

// The figures of the documentation page, as Markdown tables.
export function figures(result = measure()) {
  const rows = [
    ['markdown-it alone, in CommonMark mode', result.reference],
    ['The studio, its additions set aside (heading anchors, image wrapper)', result.project],
    ['The studio, as it is', result.asIs],
  ].map(([name, tallied]) => `| ${name} | ${tallied.pass} / ${tallied.total} | ${percent(tallied)} |`);
  const causes = [...result.causes]
    .filter(([, examples]) => examples.length)
    .map(([key, examples]) => `| ${label(key)} | ${examples.length} |`);
  const extensions = [...result.extensions].map(
    ([name, entry]) => `| ${name} | ${entry.supported} | ${entry.identical} / ${entry.total} |`,
  );
  return [
    `CommonMark ${COMMONMARK_VERSION}, ${result.reference.total} examples:`,
    '',
    '| Parser | Examples passed | Share |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'Differences of the studio, by cause:',
    '',
    '| Cause | Examples |',
    '| --- | --- |',
    ...causes,
    '',
    'GitHub Flavored Markdown extensions:',
    '',
    '| Extension | Supported | Same HTML as the specification |',
    '| --- | --- | --- |',
    ...extensions,
  ].join('\n');
}

function report(result) {
  const lines = [figures(result), '', 'Sections of CommonMark with differences (additions set aside):', ''];
  for (const [name, section] of result.project.sections) {
    if (section.pass !== section.total) lines.push(`  ${String(section.pass).padStart(3)} / ${section.total}  ${name}`);
  }
  lines.push('', 'Examples by cause:', '');
  for (const [key, examples] of result.causes) {
    if (examples.length) lines.push(`  ${label(key)}: ${examples.map(example => example.number).join(', ')}`);
  }
  lines.push('', 'Other common syntaxes:', '');
  for (const probe of result.probes) lines.push(`  ${probe.supported ? 'yes' : 'no '}  ${probe.name}`);
  return lines.join('\n');
}

const START = '<!-- conformance:start -->';
const END = '<!-- conformance:end -->';

// The documentation page with its figures replaced by the current ones.
export function documentWithFigures(result = measure()) {
  const page = readFileSync(DOCUMENT, 'utf8');
  const start = page.indexOf(START);
  const end = page.indexOf(END);
  if (start === -1 || end === -1) throw new Error(`${START} and ${END} are missing from docs/markdown-support.md`);
  return `${page.slice(0, start + START.length)}\n\n${figures(result)}\n\n${page.slice(end)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = measure();
  console.log(report(result));
  if (process.argv.includes('--write')) {
    writeFileSync(DOCUMENT, documentWithFigures(result));
    console.log('\ndocs/markdown-support.md updated (run the formatter on it).');
  }
  if (result.causes.get('unexplained').length) process.exitCode = 1;
}
