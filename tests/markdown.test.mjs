// Unit tests of the pure Markdown helpers behind diagram sizing (no browser needed).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { md, parseDiagramAttributes, updateFenceAttributes } from '../src/markdown.js';

test('parseDiagramAttributes keeps valid sizes and alignments only', () => {
  assert.deepEqual(parseDiagramAttributes('width=60% align=left'), { width: '60%', align: 'left' });
  assert.deepEqual(parseDiagramAttributes('width=120mm'), { width: '120mm' });
  assert.deepEqual(parseDiagramAttributes('width=250% align=middle'), { width: '100%' });
  assert.deepEqual(parseDiagramAttributes('width=2%'), { width: '10%' });
  assert.deepEqual(parseDiagramAttributes('width=60%;color:red align="left" onclick=x'), {});
  assert.deepEqual(parseDiagramAttributes(''), {});
});

test('the fence rule carries size, alignment and source line on the placeholder', () => {
  const html = md.render('Intro.\n\n```mermaid width=40% align=right\nflowchart LR\n  A --> B\n```\n');
  assert.match(html, /class="mermaid-diagram is-sized"/);
  assert.match(html, /data-line="2"/);
  assert.match(html, /style="--diagram-width: 40%"/);
  assert.match(html, /data-align="right"/);
  const plain = md.render('```mermaid\nflowchart LR\n  A --> B\n```\n');
  assert.match(plain, /class="mermaid-diagram" data-source=/);
  assert.doesNotMatch(plain, /style=/);
  // Other languages are untouched.
  assert.match(md.render('```js width=40%\nlet a;\n```\n'), /<pre><code class="language-js">/);
});

test('updateFenceAttributes rewrites only the targeted mermaid fence', () => {
  const source = '# T\n\n```mermaid\nflowchart LR\n```\n\n```mermaid width=30% theme=dark\nflowchart TD\n```\n';
  assert.equal(
    updateFenceAttributes(source, 2, { width: '60%' }),
    '# T\n\n```mermaid width=60%\nflowchart LR\n```\n\n```mermaid width=30% theme=dark\nflowchart TD\n```\n',
  );
  // Unknown attributes survive, null removes, new keys are appended.
  assert.equal(
    updateFenceAttributes(source, 6, { width: null, align: 'left' }),
    '# T\n\n```mermaid\nflowchart LR\n```\n\n```mermaid theme=dark align=left\nflowchart TD\n```\n',
  );
  // Not a mermaid fence, or out of range: unchanged.
  assert.equal(updateFenceAttributes(source, 3, { width: '60%' }), source);
  assert.equal(updateFenceAttributes(source, 99, { width: '60%' }), source);
  assert.equal(updateFenceAttributes('```js\nx\n```', 0, { width: '60%' }), '```js\nx\n```');
});

test('updateFenceAttributes keeps indentation, tildes, quotes prefixes and CRLF', () => {
  assert.equal(
    updateFenceAttributes('  ~~~mermaid\n  a\n  ~~~', 0, { width: '50%' }),
    '  ~~~mermaid width=50%\n  a\n  ~~~',
  );
  assert.equal(
    updateFenceAttributes('> ```mermaid\n> a\n> ```', 0, { width: '50%' }),
    '> ```mermaid width=50%\n> a\n> ```',
  );
  assert.equal(
    updateFenceAttributes('```mermaid\r\na\r\n```', 0, { width: '50%' }),
    '```mermaid width=50%\r\na\r\n```',
  );
});
