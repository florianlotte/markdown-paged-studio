// Formats the Markdown of a file with Prettier, loaded on demand (a few hundred kilobytes). Two kinds of block
// are hidden behind placeholders first, and put back unchanged: a `$$` formula, whose label after the closing
// dollars (`$$ {#eq:name}`) Prettier reads as a new formula, leaving a stray `$$` at the end of the document, and
// a front matter, which would need the YAML plugin. Nothing here touches the browser at import time.
const placeholder = index => `MPSPRETTIFYBLOCK${index}X`;
const PLACEHOLDERS = /MPSPRETTIFYBLOCK(\d+)X/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const MATH_OPEN = /^ {0,3}\$\$/;

// The text with its formula blocks and front matter replaced by placeholders, and the blocks themselves.
export function protectBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  const out = [];
  let i = 0;
  const take = end => {
    blocks.push(lines.slice(i, end + 1).join('\n'));
    out.push(placeholder(blocks.length - 1));
    i = end + 1;
  };
  // A front matter: `---` on the first line, up to the next `---`.
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) take(end);
  }
  let fence = null; // the marker of the open code fence, whose content is never a formula
  while (i < lines.length) {
    const line = lines[i];
    const mark = FENCE.exec(line)?.[1];
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null;
    } else if (mark) {
      fence = mark;
    } else if (MATH_OPEN.test(line)) {
      // `$$ x $$` on one line closes itself; otherwise the block runs to the next line starting with `$$`.
      let end = i;
      if (!line.replace(MATH_OPEN, '').includes('$$')) {
        end = i + 1;
        while (end < lines.length && !MATH_OPEN.test(lines[end])) end++;
        if (end === lines.length) end = lines.length - 1;
      }
      take(end);
      continue;
    }
    out.push(line);
    i++;
  }
  return { text: out.join('\n'), blocks };
}

export const restoreBlocks = (text, blocks) => text.replace(PLACEHOLDERS, (match, n) => blocks[Number(n)] ?? match);

// The Markdown formatted by Prettier: one space after `#`, `-` lists, `_emphasis_`, aligned tables, one blank
// line between blocks, hard breaks kept. The syntax of the studio (page breaks, table of contents, attributes,
// labels, references, formulas) is plain text or code for Prettier, which leaves it as it is.
export async function prettifyMarkdown(text) {
  const [{ default: prettier }, { default: markdown }] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/markdown'),
  ]);
  const protectedText = protectBlocks(text);
  const formatted = await prettier.format(protectedText.text, {
    parser: 'markdown',
    plugins: [markdown],
    printWidth: 120,
    proseWrap: 'preserve',
  });
  return restoreBlocks(formatted, protectedText.blocks);
}
