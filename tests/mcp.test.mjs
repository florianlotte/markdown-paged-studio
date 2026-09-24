// End-to-end check of the MCP server: a real MCP client spawns it over stdio, lists the tools, and renders a
// report with a Mermaid diagram to PDF and to HTML. Requires `npm run build` first (the server uses dist/).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

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
});

test('render_html returns a standalone document with the diagram and French quotes', async () => {
  const result = await client.callTool({
    name: 'render_html',
    arguments: { markdown, config: { language: 'fr', cover: false } },
  });
  assert.equal(result.isError, undefined);
  const html = result.content[0].text;
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /class="mermaid-diagram"><svg/);
  // innerHTML serialisation turns the no-break spaces of French quotes into &nbsp; entities.
  assert.match(html, /«(?:\u00a0|&nbsp;)world(?:\u00a0|&nbsp;)»/);
  assert.doesNotMatch(html, /<section class="cover-page"/);
  assert.doesNotMatch(html, /unpkg\.com/);
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
