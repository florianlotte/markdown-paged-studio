// Guards the Markdown conformance measured by scripts/conformance.mjs: the engine passes CommonMark, and
// every difference of the studio is one of its deliberate choices (see docs/markdown-support.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CAUSES, documentWithFigures, measure, normalize, stripProjectAdditions } from '../scripts/conformance.mjs';

const result = measure();
const numbers = examples => examples.map(example => example.number);

test('markdown-it alone passes every CommonMark example', () => {
  assert.deepEqual(numbers(result.reference.failures), []);
  assert.equal(result.reference.total, 652);
});

test('every difference of the studio with CommonMark has a known cause', () => {
  // An example listed here means a rule of the studio changed a basic syntax: fix the rule, or, if the
  // change is wanted, add its cause to scripts/conformance.mjs and to docs/markdown-support.md.
  assert.deepEqual(numbers(result.causes.get('unexplained')), []);
});

test('the differences are the recorded ones', () => {
  const counts = Object.fromEntries([...result.causes].map(([key, examples]) => [key, examples.length]));
  assert.deepEqual(counts, { html: 72, image: 22, typographer: 21, linkify: 4, extensions: 0, unexplained: 0 });
  assert.equal(result.project.pass, 533);
  assert.equal(result.asIs.pass, 493);
  assert.deepEqual(
    CAUSES.map(cause => cause.key),
    ['html', 'image', 'typographer', 'linkify', 'extensions'],
  );
});

test('the GFM extensions and the other syntaxes are in the documented state', () => {
  const support = Object.fromEntries([...result.extensions].map(([name, entry]) => [name, entry.supported]));
  assert.deepEqual(support, {
    Tables: 'yes',
    'Task list items': 'no',
    Strikethrough: 'yes',
    Autolinks: 'partly',
    'Disallowed Raw HTML': 'yes',
  });
  // Supporting one of these is good news: update docs/markdown-support.md with it.
  assert.deepEqual(
    result.probes.filter(probe => probe.supported).map(probe => probe.name),
    [],
  );
});

test('the helpers compare what a browser would show', () => {
  assert.equal(normalize('<p>a</p>\n<hr />\n<p>b<br />\nc</p>\n'), normalize('<p>a</p><hr><p>b<br> c</p>'));
  assert.notEqual(normalize('<p>a b</p>'), normalize('<p>ab</p>'));
  assert.equal(
    stripProjectAdditions(
      '<h1 id="sec-title">Title</h1><p><span class="document-image is-block has-caption" data-line="0"><img src="https://x/y.png" alt="a"><span class="image-caption">Caption</span></span></p>',
    ),
    '<h1>Title</h1><p><img src="https://x/y.png" alt="a"></p>',
  );
});

test('the figures of docs/markdown-support.md are the measured ones', () => {
  const page = readFileSync(new URL('../docs/markdown-support.md', import.meta.url), 'utf8');
  // Compared without the padding Prettier gives to the tables. Refresh with: npm run conformance -- --write
  const compact = text => text.replace(/-{3,}/g, '---').replace(/ +/g, ' ');
  assert.equal(compact(page), compact(documentWithFigures(result)));
});
