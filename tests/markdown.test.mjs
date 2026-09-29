// Unit tests of the pure Markdown helpers behind diagram sizing (no browser needed).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { md, parseDiagramAttributes, slugify, updateFenceAttributes } from '../src/markdown.js';

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

test('a line holding only \\newpage becomes a page break', () => {
  assert.equal(
    md.render('Before.\n\\newpage\nAfter.\n'),
    '<p>Before.</p>\n<div class="page-break"></div>\n<p>After.</p>\n',
  );
  // Inside a sentence or a code block it is ordinary text.
  assert.doesNotMatch(md.render('Write \\newpage alone.\n'), /page-break/);
  assert.doesNotMatch(md.render('```\n\\newpage\n```\n'), /page-break/);
  assert.doesNotMatch(md.render('    \\newpage\n'), /page-break/);
});

test('headings get unique ids and anchor links follow them', () => {
  assert.equal(slugify('Étude & coûts (2026)'), 'etude-couts-2026');
  assert.equal(slugify('***'), 'section');
  const html = md.render('# Part\n\n## Part\n\n## `code` and *more*\n\n[a](#part) [b](#Part-2) [c](#unknown)\n');
  assert.match(html, /<h1 id="sec-part">/);
  assert.match(html, /<h2 id="sec-part-2">/);
  assert.match(html, /<h2 id="sec-code-and-more">/);
  assert.match(html, /<a href="#sec-part">a<\/a> <a href="#sec-part-2">b<\/a> <a href="#unknown">c<\/a>/);
});

test('[[toc]] lists the headings that follow it, down to its depth', () => {
  const source = '# Title\n\n[[toc]]\n\n# One\n\n## Two <b>\n\n### Three\n\n#### Four\n';
  const html = md.render(source);
  const items = [
    ...html.matchAll(/<li class="toc-item toc-level-(\d)"><a href="#([^"]+)"><span class="toc-text">([^<]*)</g),
  ];
  assert.deepEqual(
    items.map(([, level, id, text]) => [level, id, text]),
    [
      ['1', 'sec-one', 'One'],
      ['2', 'sec-two-b', 'Two &lt;b&gt;'],
      ['3', 'sec-three', 'Three'],
    ],
  );
  assert.equal([...md.render(source.replace('[[toc]]', '[[toc depth=1]]')).matchAll(/toc-item/g)].length, 1);
  assert.equal([...md.render(source.replace('[[toc]]', '[[TOC depth=6]]')).matchAll(/toc-item/g)].length, 4);
  // Not alone on its line: ordinary text.
  assert.doesNotMatch(md.render('See [[toc]] here.\n'), /class="toc"/);
});

test('captions come from the image title or the caption attribute', () => {
  const titled = md.render('![Plan](https://example.com/plan.png "The <plan>")\n');
  assert.match(titled, /class="document-image is-block has-caption"/);
  assert.match(
    titled,
    /<img src="https:\/\/example.com\/plan.png" alt="Plan"><span class="image-caption">The &lt;plan&gt;<\/span>/,
  );
  assert.doesNotMatch(titled, /title=/);
  const braces = md.render('![Plan](https://example.com/plan.png){width=50% caption="Two words"}\n');
  assert.match(braces, /<span class="image-caption">Two words<\/span>/);
  assert.match(braces, /--image-width: 50%/);
  assert.doesNotMatch(md.render('![Plan](https://example.com/plan.png)\n'), /caption/);

  assert.deepEqual(parseDiagramAttributes('caption="Flow of data" width=40%'), {
    caption: 'Flow of data',
    width: '40%',
  });
  assert.deepEqual(parseDiagramAttributes('caption=Flow'), { caption: 'Flow' });
  assert.match(md.render('```mermaid caption="A & B"\nflowchart LR\n```\n'), /data-caption="A &amp; B"/);
  // Rewriting the size keeps a caption with spaces in one piece.
  assert.equal(
    updateFenceAttributes('```mermaid caption="Flow of data" width=30%', 0, { width: '60%', align: 'left' }),
    '```mermaid caption="Flow of data" width=60% align=left',
  );
});

test('footnotes are written where they are called', () => {
  const html = md.render(
    'First[^a], second[^b], first again[^a], inline^[An *inline* note].\n\n' +
      '[^a]: The **first** note\n    on two lines.\n\n    Its second paragraph.\n[^b]: The second <note>.\n',
  );
  assert.equal(
    html,
    '<p>First<span class="footnote">The <strong>first</strong> note\non two lines. Its second paragraph.</span>, ' +
      'second<span class="footnote">The second &lt;note&gt;.</span>, first again<sup class="footnote-ref">1</sup>, ' +
      'inline<span class="footnote">An <em>inline</em> note</span>.</p>\n',
  );
  // A call without its note stays as written, and a note that is never called shows nowhere.
  assert.equal(md.render('Missing[^9] note.\n'), '<p>Missing[^9] note.</p>\n');
  assert.equal(md.render('Text.\n\n[^unused]: Never called.\n'), '<p>Text.</p>\n');
  assert.doesNotMatch(md.render('`code[^a]`\n\n[^a]: Note\n'), /footnote/);
});

test('task lists become check boxes', () => {
  const html = md.render('- [ ] to do\n- [x] done *now*\n- plain\n  - [X] nested\n\n1. [ ] numbered\n');
  assert.match(
    html,
    /^<ul class="contains-task-list">\n<li class="task-list-item"><input disabled="" type="checkbox"> to do<\/li>/,
  );
  assert.match(
    html,
    /<li class="task-list-item"><input checked="" disabled="" type="checkbox"> done <em>now<\/em><\/li>/,
  );
  assert.match(html, /<li>plain\n<ul class="contains-task-list">\n<li class="task-list-item"><input checked=""/);
  assert.match(html, /<ol class="contains-task-list">/);
  // Not a task: no space after the box, another letter, not at the start, not in a list.
  const plain = md.render('- [ ]no space\n- [y] other\n- then [ ] later\n\n[ ] paragraph\n');
  assert.doesNotMatch(plain, /checkbox|task-list/);
});

test('addresses starting with www. become links, other bare names do not', () => {
  const html = md.render(
    'Visit www.example.com/a_(b)?x=1. Or (www.example.org), "www.quoted.fr"; not awww.example.com nor readme.md.\n',
  );
  assert.match(html, /<a href="http:\/\/www\.example\.com\/a_\(b\)\?x=1">www\.example\.com\/a_\(b\)\?x=1<\/a>\. Or/);
  assert.match(html, /\(<a href="http:\/\/www\.example\.org">www\.example\.org<\/a>\)/);
  assert.match(html, /“<a href="http:\/\/www\.quoted\.fr">www\.quoted\.fr<\/a>”;/);
  assert.equal([...html.matchAll(/<a /g)].length, 3);
  assert.doesNotMatch(md.render('`www.example.com` and [text](www.example.com)\n'), /http:\/\/www/);
});
