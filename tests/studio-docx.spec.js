// Integration tests of the Word export: the .docx is a real OOXML package, read back here with fflate, and
// the project it carries reopens in the studio.
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { png } from './helpers/png.mjs';
import { exportVia, notice, openDocument, savedAs, setMarkdown, toast } from './helpers/studio.mjs';

const DOCUMENT = `# Report {#sec:report}

[[toc]]

## Numbers {#sec:numbers}

A sentence with **bold**, *italic*, ~~gone~~, ==marked==, H~2~O, x^2^ and \`code\`, plus a note[^1] and a [link](https://example.com).

[^1]: The note at the foot of the page.

- one
- two
  - nested

1. first
2. second

- [x] done
- [ ] to do

| Left | Right |
| :--- | ----: |
| a    |     1 |

Table: Numbers {#tab:numbers}

![Plan](plan.png "The plan"){width=50% #fig:plan}

\`\`\`mermaid caption="The flow" #fig:flow
flowchart LR
  A --> B
\`\`\`

See @fig:plan, @fig:flow and @tab:numbers, then @eq:euler.

$$
e^{i\\pi} + 1 = \\frac{a}{b} + \\sqrt{x} + \\sum_{i=1}^{n} x_i
$$ {#eq:euler}

Inline $x^2$ too.

> [!NOTE]
> Keep this in mind.

\`\`\`js
const answer = 42; // the answer
\`\`\`

\\newpage

## After the break

> A quote.

Term
: Definition
`;

const parts = file => {
  const entries = unzipSync(new Uint8Array(readFileSync(file)));
  return Object.fromEntries(Object.entries(entries).map(([path, bytes]) => [path, bytes]));
};
const xml = (entries, path) => strFromU8(entries[path]);

async function exportDocx(page, id) {
  const [download] = await Promise.all([page.waitForEvent('download'), exportVia(page, id)]);
  return download;
}

test('the Word export holds the features of the document as native Word objects', async ({ page }) => {
  await openDocument(page, DOCUMENT, 'Report');
  await page.locator('#imageFiles').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(80, 40) });
  await page.locator('#title').fill('Word report');
  await page.locator('#tabDesign').click();
  await page.locator('#numberHeadings').selectOption('h1');
  await expect(page.locator('#preview .document-image > img')).toHaveCount(1);
  await expect(page.locator('#preview .mermaid-diagram > svg')).toHaveCount(1);
  await expect(page.locator('#preview')).not.toHaveClass(/is-stale/);

  const download = await exportDocx(page, 'exportDocxProject');
  expect(savedAs(download)).toBe('Word report.docx');
  if (process.env.DOCX_COPY) writeFileSync(process.env.DOCX_COPY, readFileSync(await download.path()));
  await expect(toast(page)).toHaveText('Word file saved with its project');
  const entries = parts(await download.path());
  const body = xml(entries, 'word/document.xml');

  // Headings with their numbers, bookmarked for the links; the table of contents is a field.
  expect(body).toMatch(/<w:pStyle w:val="Heading1"\/>/);
  expect(body).toMatch(/<w:pStyle w:val="Heading2"\/>/);
  expect(body).toContain('1. Report');
  expect(body).toMatch(/<w:bookmarkStart [^>]*w:name="b_sec_numbers"/);
  expect(body).toMatch(/<w:instrText[^>]*>TOC \\h \\o &quot;1-2&quot;/);
  expect(body).toMatch(/PAGEREF _Toc\d+/);
  expect(body).toMatch(/<w:hyperlink [^>]*w:anchor="b_fig_plan"/);
  expect(body).toMatch(/<w:hyperlink [^>]*r:id="rId/);
  // Inline formatting and the footnote.
  expect(body).toMatch(/<w:b\/>.*?<w:t[^>]*>bold<\/w:t>/);
  expect(body).toMatch(/<w:i\/>.*?<w:t[^>]*>italic<\/w:t>/);
  expect(body).toMatch(/<w:strike\/>.*?<w:t[^>]*>gone<\/w:t>/);
  expect(body).toMatch(/<w:highlight w:val="yellow"\/>.*?<w:t[^>]*>marked<\/w:t>/);
  expect(body).toMatch(/<w:footnoteReference w:id="1"\/>/);
  expect(xml(entries, 'word/footnotes.xml')).toContain('The note at the foot of the page.');
  // Lists, tasks, the table and its caption, the page break, the quote and the definition.
  expect(body).toMatch(/<w:numPr>/);
  expect(body).toMatch(/☑ <\/w:t><\/w:r><w:r><w:t[^>]*>done</);
  expect(body).toMatch(/☐ <\/w:t><\/w:r><w:r><w:t[^>]*>to do</);
  expect(body).toMatch(/<w:tbl>[^]*<w:tblHeader\/>[^]*<\/w:tbl>/);
  expect(body).toContain('Table 1: ');
  expect(body).toMatch(/<w:br w:type="page"\/>/);
  expect(body).toMatch(/<w:pBdr><w:left [^>]*w:color="c8cdd4"/);
  expect(body).toMatch(/<w:pBdr><w:left [^>]*w:color="1f5fbf"/);
  // The image, the diagram as SVG with its PNG, the captions and the references.
  const media = Object.keys(entries).filter(path => path.startsWith('word/media/'));
  expect(media.some(path => path.endsWith('.svg'))).toBe(true);
  expect(media.filter(path => path.endsWith('.png')).length).toBeGreaterThanOrEqual(2);
  expect(body).toContain('Figure 1: ');
  expect(body).toContain('The flow');
  expect(body).toMatch(/<w:t[^>]*>figure\u00a01<\/w:t>/);
  // Formulas as Office Math: a fraction, a radical, a superscript, a sum, and the equation number.
  expect(body).toMatch(/<w:tab\/><\/w:r><m:oMath /);
  expect(body).not.toContain('<undefined>');
  expect(body).toMatch(/<m:f>/);
  expect(body).toMatch(/<m:rad>/);
  expect(body).toMatch(/<m:sSup>/);
  expect(body).toMatch(/<m:nary>/);
  expect(body).toContain('(1)');
  // Highlighted code keeps its colours, one paragraph per line.
  expect(body).toMatch(/<w:pStyle w:val="Code"\/>/);
  expect(body).toMatch(/<w:color w:val="cf222e"\/>.*?<w:t[^>]*>const<\/w:t>/);
  // The header and footer carry the texts and the page counter; the project sits in a custom XML part.
  // The cover has empty headers of its own: the texts sit in those of the body.
  const all = pattern =>
    Object.keys(entries)
      .filter(path => pattern.test(path))
      .map(path => xml(entries, path))
      .join('');
  const headers = all(/^word\/header\d*\.xml$/);
  const footers = all(/^word\/footer\d*\.xml$/);
  expect(headers).toContain('Architecture Report');
  expect(headers).toContain('Jane Doe');
  expect(footers).toContain('Confidential');
  expect(footers).toMatch(/PAGE/);
  expect(footers).toMatch(/NUMPAGES/);
  const custom = Object.keys(entries).find(path => /^customXml\/item\d+\.xml$/.test(path));
  expect(xml(entries, custom)).toContain('urn:markdown-paged-studio:project');
  expect(xml(entries, custom)).toContain('Word report');
  expect(xml(entries, 'word/_rels/document.xml.rels')).toContain('customXml/item');
  expect(xml(entries, 'word/settings.xml')).toMatch(/<w:updateFields(?: w:val="(?:true|1)")?\/>/);
});

test('Word only leaves the project out, and a Word file with the project reopens in the studio', async ({ page }) => {
  await openDocument(page, '# Plain {#sec:plain}\n\nText with a note[^1].\n\n[^1]: Note.\n', 'Plain');
  await page.locator('#title').fill('Plain report');
  await page.locator('#subtitle').fill('Round trip');
  const plain = await exportDocx(page, 'exportDocxOnly');
  await expect(toast(page)).toHaveText('Word file saved');
  const plainEntries = parts(await plain.path());
  expect(Object.keys(plainEntries).some(path => path.startsWith('customXml/'))).toBe(false);

  const withProject = await exportDocx(page, 'exportDocxProject');
  const file = await withProject.path();
  const entries = parts(file);
  expect(Object.keys(entries).some(path => path.startsWith('customXml/'))).toBe(true);

  // Another document, then the Word file brings the first one back.
  await setMarkdown(page, '# Other\n');
  await page.locator('#title').fill('Other');
  await expect(page.locator('#preview .document-content h1').first()).toHaveText('Other');
  await page.locator('#importFile').setInputFiles({
    name: 'Plain report.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: readFileSync(file),
  });
  await expect(page.locator('#title')).toHaveValue('Plain report');
  await expect(page.locator('#subtitle')).toHaveValue('Round trip');
  await expect(page.locator('#preview .document-content h1').first()).toHaveText('Plain');

  // A Word file without the project cannot be opened: said in the notice.
  const plainFile = `${file}.plain.docx`;
  writeFileSync(plainFile, readFileSync(await plain.path()));
  await page.locator('#importFile').setInputFiles({
    name: 'plain.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: readFileSync(plainFile),
  });
  await expect(notice(page)).toContainText('this Word file holds no project');
  await expect(page.locator('#title')).toHaveValue('Plain report');
});
