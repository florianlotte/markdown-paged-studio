import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORMAT, MARKER_KEY, firstHeading, markdownWithSources, sourcesOfMarkdown } from '../src/markdown-sources.js';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const project = {
  title: '42',
  subtitle: '# not a heading',
  author: 'Ada',
  date: '2026-10-02',
  pageSize: 'A4',
  marginTop: 24,
  cover: true,
  accentColor: '#2c2f73',
  markdown: '# Title\n\nBody with ![plan](plan.png)\n',
  customCss: '.document-content {\n  color: red;\n}\n',
  logoDataUrl: PNG,
  images: { 'plan.png': PNG },
};

const exported = () => markdownWithSources({ json: JSON.stringify(project), markdown: project.markdown });

test('the front matter opens with the marker, keeps the CSS readable and leaves the Markdown to the body', () => {
  const text = exported();
  assert.ok(text.startsWith(`---\n${MARKER_KEY}: ${FORMAT}\n`));
  assert.ok(text.includes('customCss: |\n  .document-content {\n'));
  assert.ok(text.includes(`\n  plan.png: ${PNG}\n`));
  assert.ok(!text.includes('\nmarkdown:'));
  assert.ok(text.endsWith(`---\n${project.markdown}`));
  // The heavy values come last.
  const keys = text
    .slice(0, text.indexOf('\n---\n'))
    .split('\n')
    .filter(line => /^[a-zA-Z]/.test(line))
    .map(line => line.split(':')[0]);
  assert.deepEqual(keys.slice(-3), ['customCss', 'logoDataUrl', 'images']);
});

test('a round trip restores the project, types included', () => {
  const { json, project: found } = sourcesOfMarkdown(exported());
  assert.equal(found, true);
  assert.deepEqual(JSON.parse(json), project);
});

test('a body that opens with a rule, or no body at all, survives', () => {
  for (const markdown of ['---\n\nAfter a rule\n', '', '---']) {
    const text = markdownWithSources({ json: JSON.stringify({ title: 'T' }), markdown });
    assert.deepEqual(JSON.parse(sourcesOfMarkdown(text).json), { title: 'T', images: {}, markdown });
  }
});

test('Windows line ends, trailing blanks on the fences and a BOM are tolerated', () => {
  const text = `\uFEFF--- \r\n${MARKER_KEY}: 1\r\ntitle: Win\r\n---\t\r\n# Hello\r\n\r\nWorld\r\n`;
  const { json, project: found } = sourcesOfMarkdown(text);
  assert.equal(found, true);
  assert.deepEqual(JSON.parse(json), { title: 'Win', markdown: '# Hello\n\nWorld\n' });
});

test('without the marker the whole text is the document: no front matter, another tool, two rules, bad YAML', () => {
  const samples = [
    ['# Plain\n\nText.\n', 'Plain'],
    ['---\ntitle: Jekyll\nlayout: post\n---\n# Post\n', 'Post'],
    ['---\nsome text\n---\nmore\n', null],
    [`---\n${MARKER_KEY}: 1\ntitle: [unclosed\n---\nbody\n`, null],
    ['---\n- a list\n---\nbody\n', null],
  ];
  for (const [sample, title] of samples) {
    const { json, project: found } = sourcesOfMarkdown(sample);
    assert.equal(found, false, sample);
    assert.deepEqual(JSON.parse(json), title === null ? { markdown: sample } : { markdown: sample, title });
  }
  assert.deepEqual(JSON.parse(sourcesOfMarkdown('a\r\nb').json), { markdown: 'a\nb' });
});

test('the first level 1 heading of a plain document gives the title', () => {
  assert.equal(firstHeading('Intro\n\n# First *one* #\n\n# Second\n'), 'First *one*');
  assert.equal(firstHeading('Setext title\n===\n\n# Later\n'), 'Setext title');
  assert.equal(firstHeading('## Only level two\n\n#NoSpace\n\n#\n'), null);
  assert.equal(firstHeading('```\n# In code\n```\n\n~~~md\n# Still code\n~~~\n\n# Real\n'), 'Real');
  assert.equal(firstHeading('````\n```\n# Inner fence\n```\n````\n   # Indented\n'), 'Indented');
  assert.equal(firstHeading(''), null);
});

test('the files of the document are named in the front matter and cut back from the body', () => {
  const files = [
    { name: 'intro.md', markdown: '# Intro\n\nFirst.\n' },
    { name: 'body.md', markdown: '---\n\n# Body' },
  ];
  const markdown = files.map(file => file.markdown).join('\n\n');
  const text = markdownWithSources({ json: JSON.stringify({ title: 'T', markdown, files }), markdown });
  assert.ok(text.includes('files:\n  - name: intro.md\n    lines: 4\n  - name: body.md\n    lines: 3\n'));
  assert.ok(text.endsWith(`---\n${markdown}`));
  assert.deepEqual(JSON.parse(sourcesOfMarkdown(text).json), { title: 'T', files, images: {}, markdown });
  // A body edited elsewhere no longer has the listed shape: it is one document, without files.
  const edited = JSON.parse(sourcesOfMarkdown(`${text}\n\nAdded later.\n`).json);
  assert.equal(edited.files, undefined);
  assert.equal(edited.markdown, `${markdown}\n\nAdded later.\n`);
  const broken = sourcesOfMarkdown(`---\n${MARKER_KEY}: 1\nfiles: nope\n---\nbody`);
  assert.deepEqual(JSON.parse(broken.json), { markdown: 'body' });
});

test('the images key is only kept when it is a map', () => {
  const without = sourcesOfMarkdown(`---\n${MARKER_KEY}: 1\ntitle: T\n---\nbody`);
  assert.deepEqual(JSON.parse(without.json), { title: 'T', markdown: 'body' });
  const list = sourcesOfMarkdown(`---\n${MARKER_KEY}: 1\nimages:\n  - a\n---\nbody`);
  assert.deepEqual(JSON.parse(list.json), { markdown: 'body' });
});
