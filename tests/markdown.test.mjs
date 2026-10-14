// Unit tests of the pure Markdown helpers behind diagram sizing (no browser needed).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { md, slugify } from '../src/markdown.js';
import { parseDiagramAttributes, updateFenceAttributes, updateImageAttributes } from '../src/source-attributes.js';

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

test('formulas are kept apart as TeX: $…$ in a sentence, $$…$$ and ```math as blocks', () => {
  assert.equal(
    md.render('Energy $E = mc^2$ here.'),
    '<p>Energy <span class="math math-inline">E = mc^2</span> here.</p>\n',
  );
  // Nothing of the Markdown or of the typography touches the TeX; it is escaped as text.
  assert.equal(
    md.render('$a_1 * b_1 * c < "d" -- e$'),
    '<p><span class="math math-inline">a_1 * b_1 * c &lt; &quot;d&quot; -- e</span></p>\n',
  );
  assert.equal(md.render('$$\na^2 + b^2\n= c^2\n$$\n'), '<div class="math math-block">a^2 + b^2\n= c^2</div>\n');
  assert.equal(md.render('$$ x \\le y $$\n'), '<div class="math math-block">x \\le y</div>\n');
  assert.equal(md.render('```math\n\\frac{1}{2}\n```\n'), '<div class="math math-block">\\frac{1}{2}</div>\n');
  // A block interrupts a paragraph and works inside a list or a quote; a line of dashes stays TeX.
  assert.match(
    md.render('Text\n$$\nx\n---\ny\n$$\nmore'),
    /<p>Text<\/p>\n<div class="math math-block">x\n---\ny<\/div>\n<p>more<\/p>/,
  );
  assert.match(
    md.render('- item\n\n  $$\n  x\n  $$\n'),
    /<li>\n<p>item<\/p>\n<div class="math math-block">x<\/div>\n<\/li>/,
  );
  assert.match(md.render('> $$\n> x\n> $$\n'), /<blockquote>\n<div class="math math-block">x<\/div>\n<\/blockquote>/);
  // In a table cell, a link and a heading; the heading keeps its formula in the table of contents.
  assert.match(md.render('| a |\n|---|\n| $x^2$ |\n'), /<td><span class="math math-inline">x\^2<\/span><\/td>/);
  assert.match(
    md.render('[see $x$](https://example.com)'),
    /<a href="https:\/\/example.com"[^>]*>see <span class="math math-inline">x<\/span><\/a>/,
  );
  const titled = md.render('[[toc]]\n\n# Energy $E$\n');
  assert.match(titled, /<h1 id="sec-energy-e">Energy <span class="math math-inline">E<\/span><\/h1>/);
  assert.match(titled, /<span class="toc-text">Energy <span class="math math-inline">E<\/span><\/span>/);
  // The preview marks the block with its source line.
  assert.match(
    md.render('Text\n\n$$\nx\n$$\n', { sourceLines: true }),
    /<div class="math math-block" data-source-line="2">x<\/div>/,
  );
});

test('dollars that are not formulas stay text', () => {
  const plain = text => assert.equal(md.render(text), `<p>${text}</p>\n`, text);
  plain('5 $ and 10 $');
  plain('$5-$10');
  plain('US$5 and A$10');
  plain('$HOME and $PATH');
  plain('a $ b $ c');
  plain('cost: $5, then $ 6');
  assert.equal(md.render('Price \\$5 and \\$10'), '<p>Price $5 and $10</p>\n');
  assert.equal(md.render('$a \\$ b$'), '<p><span class="math math-inline">a \\$ b</span></p>\n');
  // Inside code nothing is a formula; an unclosed block is a paragraph; $$ inside a line is text.
  assert.equal(md.render('`$x$`'), '<p><code>$x$</code></p>\n');
  assert.equal(md.render('$$\nno end\n'), '<p>$$\nno end</p>\n');
  assert.equal(md.render('a $$x$$ b'), '<p>a $$x$$ b</p>\n');
  assert.equal(md.render('$$\n$$\n'), '<p>$$\n$$</p>\n');
});

test('highlighted text, subscript, superscript and definition lists', () => {
  assert.equal(
    md.render('H~2~O, x^2^, ==marked==, ~~gone~~'),
    '<p>H<sub>2</sub>O, x<sup>2</sup>, <mark>marked</mark>, <s>gone</s></p>\n',
  );
  assert.equal(md.render('a == b and c ~ d and e ^ f'), '<p>a == b and c ~ d and e ^ f</p>\n');
  // A caret after "[" is a footnote call, defined or not: it never opens a superscript.
  assert.equal(md.render('a[^1],b[^2]'), '<p>a[^1],b[^2]</p>\n');
  assert.match(md.render('a[^1] x^2^\n\n[^1]: Note\n'), /<span class="footnote">Note<\/span> x<sup>2<\/sup>/);
  // Fenced code with tildes and setext headings are untouched.
  assert.equal(md.render('~~~\ncode\n~~~\n'), '<pre><code>code\n</code></pre>\n');
  assert.equal(md.render('Title\n===\n'), '<h1 id="sec-title">Title</h1>\n');
  assert.equal(
    md.render('Term\n: Definition\n: Second\n'),
    '<dl>\n<dt>Term</dt>\n<dd>Definition</dd>\n<dd>Second</dd>\n</dl>\n',
  );
  assert.equal(md.render('Not a term\n\n:not a definition\n'), '<p>Not a term</p>\n<p>:not a definition</p>\n');
});

test('a quote that opens with [!NOTE] and its kin is an alert, titled in the language of the document', () => {
  assert.equal(
    md.render('> [!NOTE]\n> Useful **text**.\n>\n> More.\n'),
    '<div class="alert alert-note">\n<p class="alert-title">Note</p>\n<p>Useful <strong>text</strong>.</p>\n<p>More.</p>\n</div>\n',
  );
  for (const [marker, type, english, french] of [
    ['[!TIP]', 'tip', 'Tip', 'Astuce'],
    ['[!important]', 'important', 'Important', 'Important'],
    ['[!Warning]', 'warning', 'Warning', 'Avertissement'],
    ['[!CAUTION]', 'caution', 'Caution', 'Attention'],
  ]) {
    const source = `> ${marker}\n> Text.\n`;
    assert.match(
      md.render(source),
      new RegExp(`<div class="alert alert-${type}">\\n<p class="alert-title">${english}</p>`),
    );
    assert.match(md.render(source, { language: 'fr-CA' }), new RegExp(`<p class="alert-title">${french}</p>`));
    // A language without titles of its own gets the English ones.
    assert.match(md.render(source, { language: 'ja' }), new RegExp(`<p class="alert-title">${english}</p>`));
  }
  // The marker followed by a list, with no text of its own.
  assert.equal(
    md.render('> [!TIP]\n>\n> - one\n'),
    '<div class="alert alert-tip">\n<p class="alert-title">Tip</p>\n<ul>\n<li>one</li>\n</ul>\n</div>\n',
  );
  // Ordinary quotes, a marker alone, a marker with text on its line, an unknown marker: still quotes.
  for (const source of [
    '> Plain.\n',
    '> [!NOTE]\n',
    '> [!NOTE] text\n',
    '> [!OTHER]\n> Text.\n',
    '> Text\n> [!NOTE]\n',
  ])
    assert.match(md.render(source), /^<blockquote>/, source);
  // The preview marks the alert with its source line.
  assert.match(
    md.render('> [!NOTE]\n> Text.\n', { sourceLines: true }),
    /<div class="alert alert-note" data-source-line="0">/,
  );
});

test('headings are numbered as text, from the chosen level, and the table of contents follows', () => {
  const source = '[[toc]]\n\n# One\n\n## Two\n\n### Three\n\n## Four {-}\n\n# Five {.unnumbered}\n\n# Six\n';
  const all = md.render(source, { numberHeadings: 'h1' });
  assert.deepEqual(
    [...all.matchAll(/<h(\d) id="([^"]+)">(?:<span class="heading-number">([^<]*)<\/span> )?([^<]*)<\/h\1>/g)].map(
      match => match.slice(2),
    ),
    [
      ['sec-one', '1.', 'One'],
      ['sec-two', '1.1.', 'Two'],
      ['sec-three', '1.1.1.', 'Three'],
      ['sec-four', undefined, 'Four'],
      ['sec-five', undefined, 'Five'],
      ['sec-six', '2.', 'Six'],
    ],
  );
  // The number never enters the anchor, and the table of contents shows it.
  assert.match(
    all,
    /<a href="#sec-two"><span class="toc-text"><span class="heading-number">1\.1\.<\/span> Two<\/span>/,
  );
  assert.match(all, /<a href="#sec-four"><span class="toc-text">Four<\/span>/);
  // From the second level: the first one is the title of the document.
  const below = md.render(source, { numberHeadings: 'h2' });
  assert.match(below, /<h1 id="sec-one">One<\/h1>/);
  assert.match(below, /<h2 id="sec-two"><span class="heading-number">1\.<\/span> Two<\/h2>/);
  assert.match(below, /<h3 id="sec-three"><span class="heading-number">1\.1\.<\/span> Three<\/h3>/);
  // Without the setting, nothing changes; the unnumbered mark is still taken out of the title.
  assert.equal(md.render('# One\n\n## Two {-}\n'), '<h1 id="sec-one">One</h1>\n<h2 id="sec-two">Two</h2>\n');
});

test('a heading takes the id written in its braces, and is referred to by it', () => {
  const html = md.render(
    '# Introduction {#sec:intro}\n\n## Scope {#scope}\n\n## Intro\n\nSee @sec:intro, @sec:scope, [there](#intro).\n',
  );
  assert.match(html, /<h1 id="sec-intro">Introduction<\/h1>/);
  assert.match(html, /<h2 id="sec-scope">Scope<\/h2>/);
  // The automatic anchor of another heading does not take a written id.
  assert.match(html, /<h2 id="sec-intro-2">Intro<\/h2>/);
  // Without numbering, a section is named by its title.
  assert.match(
    html,
    /<a class="ref ref-sec" href="#sec-intro">Introduction<\/a>, <a class="ref ref-sec" href="#sec-scope">Scope<\/a>/,
  );
  assert.match(html, /<a href="#sec-intro">there<\/a>/);
  assert.match(
    md.render('# Introduction {#sec:intro}\n\n@Sec:intro and -@sec:intro.\n', { numberHeadings: 'h1', language: 'fr' }),
    /<a class="ref ref-sec" href="#sec-intro">Section\u00a01<\/a> and <a class="ref ref-sec" href="#sec-intro">1<\/a>/,
  );
  // Braces that are not attributes stay in the title.
  assert.match(md.render('# Set {a, b}\n'), /<h1 id="sec-set-a-b">Set {a, b}<\/h1>/);
});

test('figures are numbered when labelled or when the setting asks, and referred to before or after', () => {
  const source =
    'See @fig:flow and @fig:plan.\n\n![Plan](https://example.com/p.png "The plan"){#fig:plan width=50%}\n\n' +
    '![Bare](https://example.com/b.png)\n\n```mermaid #fig:flow caption="The flow"\nflowchart LR\n```\n';
  const html = md.render(source);
  assert.match(
    html,
    /<a class="ref ref-fig" href="#fig-flow">figure\u00a02<\/a> and <a class="ref ref-fig" href="#fig-plan">figure\u00a01<\/a>/,
  );
  assert.match(
    html,
    /<span class="document-image is-sized is-block has-caption" id="fig-plan" [^>]*><img [^>]*><span class="image-caption"><span class="caption-label">Figure 1: <\/span>The plan<\/span><\/span>/,
  );
  // Not labelled, no setting: left as it is.
  assert.match(html, /<span class="document-image is-block" data-line="4"[^>]*><img [^>]*><\/span>/);
  assert.match(
    html,
    /<div class="mermaid-diagram" id="fig-flow" [^>]*data-caption="The flow" data-caption-label="Figure 2: "><\/div>/,
  );
  // With the setting every captioned figure is numbered, labelled or not; a figure without caption is not.
  const all = md.render(
    '![A](https://example.com/a.png "First")\n\n![B](https://example.com/b.png)\n\n![C](https://example.com/c.png){caption="Third"}\n',
    {
      numberFigures: true,
      language: 'fr',
    },
  );
  assert.deepEqual(
    [...all.matchAll(/<span class="caption-label">([^<]*)<\/span>([^<]*)/g)].map(match => match.slice(1)),
    [
      ['Figure 1\u00a0– ', 'First'],
      ['Figure 2\u00a0– ', 'Third'],
    ],
  );
  // A labelled figure without caption shows its number alone; a missing image keeps its id.
  assert.match(
    md.render('![A](https://example.com/a.png){#fig:a}'),
    /id="fig-a"[^>]*><img [^>]*><span class="image-caption"><span class="caption-label">Figure 1<\/span><\/span>/,
  );
  assert.match(
    md.render('![A](nowhere.png){#fig:a}\n\n@fig:a'),
    /<span class="image-missing" id="fig-a" [^]*href="#fig-a">figure\u00a01<\/a>/,
  );
  // The label survives a resize from the preview, on an image and on a fence.
  assert.equal(
    updateImageAttributes('![A](a.png){#fig:a width=50%}', 0, 1, 0, { width: '25%', align: 'left' }),
    '![A](a.png){#fig:a width=25% align=left}',
  );
  assert.equal(
    updateFenceAttributes('```mermaid #fig:flow width=50%\nflowchart LR\n```', 0, { width: null }),
    '```mermaid #fig:flow\nflowchart LR\n```',
  );
});

test('a table takes its caption from the paragraph after or before it, and its number', () => {
  const table = '| a | b |\n|---|---|\n| 1 | 2 |\n';
  const after = md.render(`${table}\nTable: Costs per **year** {#tab:costs}\n\nSee @tab:costs.\n`);
  assert.match(
    after,
    /^<table class="has-caption" id="tab-costs">\n<caption class="table-caption"><span class="caption-label">Table 1: <\/span>Costs per <strong>year<\/strong><\/caption>\n<thead>/,
  );
  assert.match(after, /<p>See <a class="ref ref-tab" href="#tab-costs">table\u00a01<\/a>\.<\/p>/);
  assert.doesNotMatch(after, /Table: Costs/);
  // Before the table, with the short form; not numbered without label or setting.
  assert.match(
    md.render(`: Costs\n\n${table}`),
    /^<table class="has-caption">\n<caption class="table-caption">Costs<\/caption>/,
  );
  assert.match(
    md.render(`: Costs\n\n${table}`, { numberFigures: true, language: 'fr' }),
    /<caption class="table-caption"><span class="caption-label">Tableau 1\u00a0– <\/span>Costs<\/caption>/,
  );
  // The caption after wins; a paragraph that is not next to the table, or not a caption, stays text.
  const both = md.render(`: Before\n\n${table}\n: After\n`);
  assert.match(both, /<caption class="table-caption">After<\/caption>/);
  assert.match(both, /^<p>: Before<\/p>/);
  assert.match(md.render(`${table}\nTable of results.\n`), /<\/table>\n<p>Table of results\.<\/p>/);
  assert.match(md.render(`${table}\nText.\n\nTable: Far away\n`), /<p>Table: Far away<\/p>/);
  // An escaped colon keeps the paragraph as text.
  assert.match(md.render(`${table}\nTable\\: not a caption\n`), /^<table>[^]*<\/table>\n<p>Table: not a caption<\/p>/);
  // The preview marks the table with its line, not the moved caption.
  assert.match(
    md.render(`${table}\n: Costs\n`, { sourceLines: true }),
    /<table class="has-caption" data-source-line="0">\n<caption class="table-caption">/,
  );
});

test('a formula carries its label, and references to it wait for the number', () => {
  const html = md.render(
    '$$ E = mc^2 $$ {#eq:energy}\n\n$$\na\n$$ {#eq:two}\n\n```math #eq:three\nx\n```\n\n@eq:energy, @Eq:two, -@eq:three, @eq:none.\n',
  );
  assert.match(html, /<div class="math math-block" id="eq-energy">E = mc\^2<\/div>/);
  assert.match(html, /<div class="math math-block" id="eq-two">a<\/div>/);
  assert.match(html, /<div class="math math-block" id="eq-three">x<\/div>/);
  assert.match(html, /<a class="ref ref-eq" href="#eq-energy" data-eq="eq-energy">equation\u00a0\(\?\)<\/a>/);
  assert.match(html, /<a class="ref ref-eq" href="#eq-two" data-eq="eq-two">Equation\u00a0\(\?\)<\/a>/);
  assert.match(html, /<a class="ref ref-eq" href="#eq-three" data-eq="eq-three">\(\?\)<\/a>/);
  assert.match(html, /<span class="ref ref-missing">@eq:none<\/span>/);
  // Something else after the closing dollars is not a formula.
  assert.equal(md.render('$$ x $$ and text\n'), '<p>$$ x $$ and text</p>\n');
  assert.equal(md.render('$$ x $$ {#fig:wrong}\n'), '<p>$$ x $$ {#fig:wrong}</p>\n');
});

test('references leave addresses, mentions and code alone, and work in links and notes', () => {
  const plain = text => assert.equal(md.render(text), `<p>${text}</p>\n`, text);
  plain('Write to someone@fig:plan or ask @john.');
  plain('A handle like @figure:plan or @fig is no reference.');
  assert.match(md.render('me@example.com'), /<a href="mailto:me@example.com">me@example.com<\/a>/);
  assert.equal(md.render('`@fig:plan` and \\@fig:plan'), '<p><code>@fig:plan</code> and @fig:plan</p>\n');
  assert.equal(md.render('See @fig:nowhere.'), '<p>See <span class="ref ref-missing">@fig:nowhere</span>.</p>\n');
  // A reference of the wrong kind does not resolve.
  assert.match(md.render('# T {#sec:x}\n\n@fig:x'), /<span class="ref ref-missing">@fig:x<\/span>/);
  const figure = '![A](https://example.com/a.png){#fig:a}\n\n';
  // Inside a link the reference is its text only; inside a footnote it is resolved too.
  assert.match(
    md.render(`${figure}[see @fig:a](https://example.com)`),
    /<a href="https:\/\/example.com"[^>]*>see figure\u00a01<\/a>/,
  );
  assert.match(
    md.render(`${figure}Text[^n].\n\n[^n]: As in @fig:a.\n`),
    /<span class="footnote">As in <a class="ref ref-fig" href="#fig-a">figure\u00a01<\/a>\.<\/span>/,
  );
});
