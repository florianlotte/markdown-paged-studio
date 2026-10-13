// Unit tests of the Prettify button: the blocks hidden from Prettier, and the formatting of the studio's syntax.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prettifyMarkdown, protectBlocks, restoreBlocks } from '../src/prettify.js';

test('formula blocks and a front matter are hidden from Prettier and put back', () => {
  const text = '---\ntitle: x\n---\n\nText\n\n$$\na\n$$ {#eq:a}\n\n$$ b $$\n\n```\n$$\nnot a formula\n```\n\nEnd\n';
  const { text: hidden, blocks } = protectBlocks(text);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0], '---\ntitle: x\n---');
  assert.equal(blocks[1], '$$\na\n$$ {#eq:a}');
  assert.equal(blocks[2], '$$ b $$');
  assert.match(
    hidden,
    /^MPSPRETTIFYBLOCK0X\n\nText\n\nMPSPRETTIFYBLOCK1X\n\nMPSPRETTIFYBLOCK2X\n\n```\n\$\$\nnot a formula\n```/,
  );
  assert.equal(restoreBlocks(hidden, blocks), text);
  // A formula left open runs to the end of the text, nothing is lost.
  const open = protectBlocks('a\n\n$$\nb\nc');
  assert.deepEqual(open.blocks, ['$$\nb\nc']);
  assert.equal(restoreBlocks(open.text, open.blocks), 'a\n\n$$\nb\nc');
});

test('prettifyMarkdown normalises the Markdown and keeps the syntax of the studio', async () => {
  const text =
    '#  Title {#sec:intro}\nSome *text*   \nwith $E = mc^2$, H~2~O, x^2^, ==mark==, a note[^1].\n\n\\newpage\n\n[[toc depth=2]]\n\n' +
    "* one\n* two\n   * nested\n\n![Plan](plan.png 'Floor'){#fig:plan width=60% align=left}\n\n| a | b |\n|---|:-:|\n| 1 | 22 |\n\n" +
    'Table: Costs {#tab:costs}\n\nSee @fig:plan and -@tab:costs.\n\n$$\n\\int_0^1 x\n$$ {#eq:x}\n\n> [!NOTE]\n> A note.\n\n' +
    'Term\n: Its definition.\n\n```mermaid width=60% #fig:flow caption="The flow"\nflowchart LR\n  A[<b>Bold</b>] --> B\n```\n\n- [ ] todo\n\n[^1]: The note.\n';
  const out = await prettifyMarkdown(text);
  assert.equal(
    out,
    '# Title {#sec:intro}\n\nSome _text_  \nwith $E = mc^2$, H~2~O, x^2^, ==mark==, a note[^1].\n\n\\newpage\n\n[[toc depth=2]]\n\n' +
      '- one\n- two\n  - nested\n\n![Plan](plan.png "Floor"){#fig:plan width=60% align=left}\n\n| a   |  b  |\n| --- | :-: |\n| 1   | 22  |\n\n' +
      'Table: Costs {#tab:costs}\n\nSee @fig:plan and -@tab:costs.\n\n$$\n\\int_0^1 x\n$$ {#eq:x}\n\n> [!NOTE]\n> A note.\n\n' +
      'Term\n: Its definition.\n\n```mermaid width=60% #fig:flow caption="The flow"\nflowchart LR\n  A[<b>Bold</b>] --> B\n```\n\n- [ ] todo\n\n[^1]: The note.\n',
  );
  // Formatting again changes nothing.
  assert.equal(await prettifyMarkdown(out), out);
  assert.equal(await prettifyMarkdown(''), '');
});
