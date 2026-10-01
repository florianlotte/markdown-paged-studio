// End-to-end check of the MCP server: a real MCP client spawns it over stdio, lists the tools, and renders a
// report with a Mermaid diagram to PDF and to HTML. Requires `npm run build` first (the server uses dist/).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { png } from './helpers/png.mjs';
import { readSources } from '../src/pdf-sources.js';

const dir = mkdtempSync(path.join(tmpdir(), 'mps-mcp-'));
const client = new Client({ name: 'mcp-test', version: '0.0.0' });

before(async () => {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['mcp/server.mjs'] }));
});
after(async () => {
  await client.close();
});

const markdown =
  '# Quarterly report\n\nHello "world".\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n' + 'Text. '.repeat(600);

test('lists the tools and the CSS contract resource', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ['describe_config', 'render_html', 'render_pdf']);
  const { resources } = await client.listResources();
  assert.equal(resources[0].uri, 'studio://css-contract');
  const contract = await client.readResource({ uri: 'studio://css-contract' });
  assert.match(contract.contents[0].text, /document-content/);
});

test('describe_config returns defaults and the schema', async () => {
  const result = await client.callTool({ name: 'describe_config', arguments: {} });
  assert.equal(result.isError, undefined);
  const info = JSON.parse(result.content[0].text);
  assert.equal(info.defaults.pageSize, 'A4');
  assert.equal(info.schema.kinds.language, 'language');
  assert.deepEqual(info.schema.pageSizes, ['A4', 'Letter', 'A5']);
});

test('render_pdf writes a paginated PDF honouring the config', async () => {
  const output = path.join(dir, 'report.pdf');
  const result = await client.callTool({
    name: 'render_pdf',
    arguments: {
      markdown,
      config: { title: 'Quarterly report', author: 'Robot', language: 'fr', pageSize: 'A5', cover: true },
      output_path: output,
    },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  const info = JSON.parse(result.content[0].text);
  assert.equal(info.path, output);
  const pdf = readFileSync(output);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(info.pages >= 3, `expected a cover plus body pages, got ${info.pages}`);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/gi) || []).length, info.pages);
  // The PDF carries the validated configuration, ready to be reopened by the studio.
  assert.equal(info.editable, true);
  const sources = JSON.parse((await readSources(pdf)).json);
  assert.equal(sources.title, 'Quarterly report');
  assert.equal(sources.pageSize, 'A5');
  assert.equal(sources.markdown, markdown);
  assert.deepEqual(sources.images, {});

  // Without the project the PDF is the document alone.
  const plain = path.join(dir, 'plain.pdf');
  const bare = await client.callTool({
    name: 'render_pdf',
    arguments: { markdown: '# Plain\n\nText.\n', config: { cover: false }, output_path: plain, project: false },
  });
  assert.equal(bare.isError, undefined, JSON.stringify(bare.content));
  assert.equal(JSON.parse(bare.content[0].text).editable, false);
  assert.equal(await readSources(readFileSync(plain)), null);
});

test('render_html returns a standalone document with the diagram and French quotes', async () => {
  const result = await client.callTool({
    name: 'render_html',
    arguments: { markdown, config: { language: 'fr', cover: false } },
  });
  assert.equal(result.isError, undefined);
  const html = result.content[0].text;
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /class="mermaid-diagram"[^>]*><svg/);
  // innerHTML serialisation turns the no-break spaces of French quotes into &nbsp; entities.
  assert.match(html, /«(?:\u00a0|&nbsp;)world(?:\u00a0|&nbsp;)»/);
  assert.doesNotMatch(html, /<section class="cover-page"/);
  assert.doesNotMatch(html, /unpkg\.com/);
});

test('diagrams honour the size and alignment of their fence line', async () => {
  const result = await client.callTool({
    name: 'render_html',
    arguments: { markdown: '# Sized\n\n```mermaid width=40% align=left\nflowchart LR\n  A --> B\n```\n' },
  });
  assert.equal(result.isError, undefined);
  const html = result.content[0].text;
  assert.match(
    html,
    /class="mermaid-diagram is-sized"[^>]*style="--diagram-width: 40%"[^>]*data-align="left"[^>]*><svg/,
  );
  assert.doesNotMatch(html, /diagram-tools/);
});

test('images are read from disk and matched to the Markdown by file name', async () => {
  const chart = path.join(dir, 'Chart Q3.png');
  writeFileSync(chart, png(200, 100));
  const markdown = '# Images\n\n![Chart](reports/2026/chart%20q3.png){width=50% align=center}\n\n![Logo](logo.png)\n';
  const result = await client.callTool({
    name: 'render_html',
    arguments: { markdown, images: [{ path: chart }], output_path: path.join(dir, 'images.html') },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  assert.deepEqual(JSON.parse(result.content[0].text).missing_images, ['logo.png']);
  const html = readFileSync(path.join(dir, 'images.html'), 'utf8');
  assert.match(
    html,
    /<span class="document-image is-sized is-block"[^>]*style="--image-width: 50%" data-align="center"><img src="data:image\/png;base64,[^"]+" alt="Chart"><\/span>/,
  );
  assert.match(html, /Missing image: logo.png/);

  // The same file under the name the document expects.
  const renamed = await client.callTool({
    name: 'render_pdf',
    arguments: {
      markdown,
      images: [{ path: chart }, { path: chart, name: 'logo.png' }],
      output_path: path.join(dir, 'images.pdf'),
    },
  });
  assert.equal(renamed.isError, undefined, JSON.stringify(renamed.content));
  assert.deepEqual(JSON.parse(renamed.content[0].text).missing_images, []);
  assert.equal(readFileSync(path.join(dir, 'images.pdf')).subarray(0, 5).toString(), '%PDF-');
});

test('images inside text float or take their own line, images in tables are sized', async () => {
  const picture = path.join(dir, 'picture.png');
  writeFileSync(picture, png(300, 200));
  const text = 'A sentence that wraps around the image. '.repeat(12);
  const markdown = [
    '# Alignment',
    `![Right](picture.png){width=30% align=right} ${text}`,
    `![Left](picture.png){width=30% align=left} ${text}`,
    `Before ![Own line](picture.png){width=40% align=center} after.`,
    '![Alone](picture.png)',
    '| Name | Picture |\n|---|---|\n| one | ![Cell](picture.png){width=50%} |',
  ].join('\n\n');
  const output = path.join(dir, 'alignment.html');
  const result = await client.callTool({
    name: 'render_html',
    arguments: { markdown, config: { cover: false }, images: [{ path: picture }], output_path: output },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  const html = readFileSync(output, 'utf8');
  assert.match(
    html,
    /class="document-image is-sized"[^>]*style="--image-width: 30%" data-align="right"><img[^>]*alt="Right"/,
  );
  assert.match(html, /class="document-image is-sized"[^>]*data-align="center"><img[^>]*alt="Own line"/);
  assert.match(html, /class="document-image is-block"[^>]*><img[^>]*alt="Alone"/);
  assert.match(
    html,
    /<td><span class="document-image is-sized is-block"[^>]*style="--image-width: 50%"><img[^>]*alt="Cell"/,
  );
  assert.match(html, /\.document-image:not\(\.is-block\)\[data-align="right"\] \{ float: right;/);

  const pdf = await client.callTool({
    name: 'render_pdf',
    arguments: {
      markdown,
      config: { cover: false },
      images: [{ path: picture }],
      output_path: path.join(dir, 'alignment.pdf'),
    },
  });
  assert.equal(pdf.isError, undefined, JSON.stringify(pdf.content));
  // Floats must not confuse the pagination: this content fills one page and part of a second.
  assert.equal(JSON.parse(pdf.content[0].text).pages, 2);
});

test('only image files can be read, inside MPS_INPUT_DIR when it is set', async () => {
  const secret = path.join(dir, 'notes.txt');
  writeFileSync(secret, 'not an image');
  const refused = await client.callTool({
    name: 'render_html',
    arguments: { markdown: '# T', images: [{ path: secret, name: 'notes.png' }] },
  });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /not a supported type/);
  const absent = await client.callTool({
    name: 'render_html',
    arguments: { markdown: '# T', images: [{ path: path.join(dir, 'absent.png') }] },
  });
  assert.equal(absent.isError, true);
  assert.match(absent.content[0].text, /cannot be read/);

  const allowed = path.join(dir, 'allowed');
  mkdirSync(allowed);
  writeFileSync(path.join(allowed, 'in.png'), png(20, 20));
  writeFileSync(path.join(dir, 'out.png'), png(20, 20));
  const confined = new Client({ name: 'mcp-test-confined', version: '0.0.0' });
  await confined.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['mcp/server.mjs'],
      env: { ...process.env, MPS_INPUT_DIR: allowed },
    }),
  );
  try {
    const inside = await confined.callTool({
      name: 'render_html',
      arguments: { markdown: '![In](in.png)', images: [{ path: 'in.png' }] },
    });
    assert.equal(inside.isError, undefined, JSON.stringify(inside.content));
    assert.match(inside.content[0].text, /<img src="data:image\/png;base64,/);
    const outside = await confined.callTool({
      name: 'render_html',
      arguments: { markdown: '![Out](out.png)', images: [{ path: path.join(dir, 'out.png') }] },
    });
    assert.equal(outside.isError, true);
    assert.match(outside.content[0].text, /MPS_INPUT_DIR/);
    const escaping = await confined.callTool({
      name: 'render_html',
      arguments: { markdown: '![Out](out.png)', images: [{ path: '../out.png' }] },
    });
    assert.equal(escaping.isError, true);
  } finally {
    await confined.close();
  }
});

test('refuses to overwrite an existing file unless asked', async () => {
  const output = path.join(dir, 'twice.pdf');
  const first = await client.callTool({ name: 'render_pdf', arguments: { markdown: '# One', output_path: output } });
  assert.equal(first.isError, undefined);
  const second = await client.callTool({ name: 'render_pdf', arguments: { markdown: '# Two', output_path: output } });
  assert.equal(second.isError, true);
  assert.match(second.content[0].text, /already exists/);
  const third = await client.callTool({
    name: 'render_pdf',
    arguments: { markdown: '# Two', output_path: output, overwrite: true },
  });
  assert.equal(third.isError, undefined);
});

test('the cover page fills exactly one page on every paper size', async () => {
  for (const pageSize of ['A4', 'A5', 'Letter']) {
    const output = path.join(dir, `cover-${pageSize}.pdf`);
    const result = await client.callTool({
      name: 'render_pdf',
      arguments: { markdown: '# Short\n\nOne paragraph.', config: { pageSize, cover: true }, output_path: output },
    });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).pages, 2, pageSize);
  }
});

test('rejects an empty document without crashing the server', async () => {
  // Depending on the SDK version, invalid arguments come back as a JSON-RPC error or as an isError result.
  const result = await client
    .callTool({ name: 'render_pdf', arguments: { markdown: '', output_path: path.join(dir, 'x.pdf') } })
    .catch(error => ({ isError: true, content: [{ type: 'text', text: String(error) }] }));
  assert.equal(result.isError, true);
  const again = await client.callTool({ name: 'describe_config', arguments: {} });
  assert.equal(again.isError, undefined);
});

test('render_html supports the table of contents, page breaks, captions, highlighting and cover options', async () => {
  const result = await client.callTool({
    name: 'render_html',
    arguments: {
      markdown:
        '# Report\n\n[[toc]]\n\n\\newpage\n\n# Chapter\n\n```js\nconst a = 1;\n```\n\n' +
        '```mermaid caption="The flow"\nflowchart LR\n  A --> B\n```\n\n' +
        'A claim[^1], see www.example.com.\n\n- [x] done\n\n[^1]: The note.\n',
      config: {
        coverTemplate: 'band',
        accentColor: '#AA3366',
        codeTheme: 'dark',
        runningHeader: true,
        mirrorMargins: true,
      },
    },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  const html = result.content.map(part => part.text ?? '').join('');
  assert.match(html, /<nav class="toc">.*href="#sec-chapter"/s);
  assert.match(html, /<div class="page-break"><\/div>/);
  assert.match(html, /<pre class="code-block code-dark">/);
  assert.match(html, /<div class="diagram-caption">The flow<\/div>/);
  assert.match(html, /A claim<span class="footnote">The note\.<\/span>/);
  assert.match(html, /<a href="http:\/\/www\.example\.com">/);
  assert.match(html, /<li class="task-list-item"><input checked="" disabled="" type="checkbox"> done<\/li>/);
  assert.match(html, /float: footnote/);
  assert.match(html, /#aa3366 22mm/);
  assert.match(html, /@page :left/);
  assert.match(html, /string-set: chapter/);
});
