#!/usr/bin/env node
// MCP server (stdio) that lets AI assistants render reports with Markdown Paged Studio.
//
// It reuses the real rendering pipeline: the web build (dist/) is loaded in a headless Chromium through
// Playwright, the page's automation API (`window.studio`, see src/main.js) turns a config object into the
// standalone HTML, and Chromium prints that HTML to PDF once Paged.js has laid out the pages. Personal
// defaults from local/ are therefore baked in exactly as in the app.
//
// Never write to stdout here: it carries the MCP protocol. Use console.error for diagnostics.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = 'http://studio.local';
const RENDER_TIMEOUT_MS = 60_000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));

// ---- Browser -----------------------------------------------------------------------------------------

let browserPromise = null;
function getBrowser() {
  browserPromise ??= chromium.launch({ headless: true }).catch(error => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

async function ensureBuild() {
  try {
    await access(path.join(DIST, 'index.html'));
  } catch {
    throw new Error(`The web build is missing. Run "npm run build" in ${ROOT} first.`);
  }
}

// Serves dist/ to the page from memory on a private origin, so the app runs exactly as deployed.
async function serveDist(context) {
  await context.route(`${ORIGIN}/**`, async route => {
    const url = new URL(route.request().url());
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(DIST, relative));
    if (!file.startsWith(DIST + path.sep)) return route.fulfill({ status: 403, body: 'Forbidden' });
    try {
      const body = await readFile(file);
      return route.fulfill({ status: 200, body, contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
    } catch {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
  });
}

// Runs `fn` with a studio page whose automation API is ready, in a throwaway browser context.
async function withStudio(fn) {
  await ensureBuild();
  const context = await (await getBrowser()).newContext();
  try {
    await serveDist(context);
    const page = await context.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => typeof window.studio?.render === 'function');
    return await fn(page, context);
  } finally {
    await context.close();
  }
}

// Standalone HTML for a document; the page validates the config exactly like a JSON import.
function renderHtml(page, config, mode) {
  return page.evaluate(([cfg, m]) => window.studio.render(cfg, m), [config, mode]);
}

async function renderPdf(config) {
  return withStudio(async (page, context) => {
    const html = await renderHtml(page, config, 'pdf');
    const printPage = await context.newPage();
    printPage.setDefaultTimeout(RENDER_TIMEOUT_MS);
    await printPage.setContent(html, { waitUntil: 'load' });
    await printPage.waitForFunction(() => document.documentElement.dataset.pagedReady === 'true');
    const pages = await printPage.locator('.pagedjs_page').count();
    const pdf = await printPage.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return { pdf, pages };
  });
}

async function writeOutput(outputPath, data) {
  const target = path.resolve(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return target;
}

// ---- Tool schemas ------------------------------------------------------------------------------------

const configShape = {
  title: z.string().optional().describe('Cover page title'),
  subtitle: z.string().optional().describe('Cover page subtitle'),
  author: z.string().optional().describe('Author shown on the cover page'),
  date: z.string().optional().describe('Date text shown on the cover page (free text)'),
  headerTitle: z.string().optional().describe('Running header, top left of every page'),
  headerName: z.string().optional().describe('Running header, top right of every page'),
  footerText: z.string().optional().describe('Footer, bottom left; the "Page X / Y" counter is always bottom right'),
  language: z.string().optional().describe('BCP 47 tag ("en", "fr", "pt-BR"): hyphenation and typographic quotes'),
  pageSize: z.enum(['A4', 'Letter', 'A5']).optional(),
  marginTop: z.number().min(0).max(80).optional().describe('mm'),
  marginRight: z.number().min(0).max(80).optional().describe('mm'),
  marginBottom: z.number().min(0).max(80).optional().describe('mm'),
  marginLeft: z.number().min(0).max(80).optional().describe('mm'),
  cover: z.boolean().optional().describe('Whether to add the cover page'),
  customCss: z
    .string()
    .optional()
    .describe('Replaces the default document stylesheet; see the studio://css-contract resource'),
  logoDataUrl: z.string().optional().describe('Cover logo as a data:image/... URL'),
};

const markdownField = z
  .string()
  .min(1)
  .describe('The report body in Markdown (CommonMark + tables). ```mermaid fences become diagrams.');
const configField = z
  .object(configShape)
  .optional()
  .describe('Document settings; anything omitted keeps the studio defaults (see describe_config)');

function toolError(error) {
  return { isError: true, content: [{ type: 'text', text: `Rendering failed: ${error?.message || error}` }] };
}

// ---- Server ------------------------------------------------------------------------------------------

const server = new McpServer({ name: 'markdown-paged-studio', version: pkg.version });

server.registerTool(
  'render_pdf',
  {
    title: 'Render a Markdown report to PDF',
    description:
      'Turns Markdown into a paginated PDF with cover page, running header, footer and page numbers, ' +
      'using Markdown Paged Studio. Mermaid code fences are rendered as diagrams. Writes the file to ' +
      'output_path and returns its path, size and page count.',
    inputSchema: {
      markdown: markdownField,
      config: configField,
      output_path: z.string().min(1).describe('Where to write the PDF (absolute, or relative to the server cwd)'),
    },
  },
  async ({ markdown, config, output_path }) => {
    try {
      const { pdf, pages } = await renderPdf({ ...config, markdown });
      const target = await writeOutput(output_path, pdf);
      const result = { path: target, pages, bytes: pdf.length };
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  'render_html',
  {
    title: 'Render a Markdown report to standalone HTML',
    description:
      'Same document as render_pdf, as a single self-contained HTML file that paginates itself when opened ' +
      'in a browser (Paged.js is inlined, about 500 kB). Give output_path to write it to disk; without it ' +
      'the HTML is returned inline.',
    inputSchema: {
      markdown: markdownField,
      config: configField,
      output_path: z.string().min(1).optional().describe('Where to write the HTML file'),
    },
  },
  async ({ markdown, config, output_path }) => {
    try {
      const html = await withStudio(page => renderHtml(page, { ...config, markdown }, 'export'));
      if (output_path) {
        const target = await writeOutput(output_path, html);
        const result = { path: target, bytes: Buffer.byteLength(html) };
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      }
      return { content: [{ type: 'text', text: html }] };
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  'describe_config',
  {
    title: 'Describe the document settings',
    description:
      'Returns the current default settings (including personal defaults from local/) and the accepted ' +
      'keys, page sizes and margin limits. Call it before render_pdf to know what can be customised.',
    inputSchema: {},
  },
  async () => {
    try {
      const info = await withStudio(page =>
        page.evaluate(() => ({ defaults: window.studio.defaults(), schema: window.studio.schema() })),
      );
      // The sample logo can be large; the caller only needs to know whether one is set.
      info.defaults.logoDataUrl = info.defaults.logoDataUrl ? '<set>' : '';
      return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }], structuredContent: info };
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerResource(
  'css-contract',
  'studio://css-contract',
  {
    title: 'Document CSS contract',
    description: 'HTML structure and class names a customCss stylesheet can target',
    mimeType: 'text/markdown',
  },
  async uri => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/markdown',
        text: `# Document CSS contract

The rendered document has this structure (the cover section only when \`cover\` is true):

\`\`\`html
<section class="cover-page">
  <img class="cover-logo" />
  <h1 class="cover-title">…</h1>
  <div class="cover-subtitle">…</div>
  <div class="cover-meta"><div>author</div><div>date</div></div>
</section>
<article class="document-content">…Markdown as HTML…</article>
\`\`\`

Mermaid diagrams live in \`.mermaid-diagram\` (inline SVG); a failed diagram is a \`<pre class="mermaid-error">\`.
Header, footer and the page counter are \`@page\` margin boxes driven by the config, not by CSS classes.
Use print units (\`mm\`, \`pt\`) and paged-media properties such as \`break-before: page\` or \`break-inside: avoid\`.
\`customCss\` replaces the default stylesheet entirely; start from \`describe_config().defaults.customCss\`.
`,
      },
    ],
  }),
);

async function shutdown() {
  if (browserPromise) {
    try {
      await (await browserPromise).close();
    } catch {
      // Already gone.
    }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.connect(new StdioServerTransport());
console.error(`markdown-paged-studio MCP server ${pkg.version} ready (stdio)`);
