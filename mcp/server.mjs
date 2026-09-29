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
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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
    await page.goto(`${ORIGIN}/?automation=1`);
    await page.waitForFunction(() => typeof window.studio?.render === 'function');
    return await fn(page, context);
  } finally {
    await context.close();
  }
}

// Standalone HTML for a document; the page validates the config and the images like a JSON import.
function renderHtml(page, config, mode, images) {
  return page.evaluate(([cfg, m, files]) => window.studio.render(cfg, m, { images: files }), [config, mode, images]);
}

// Names of the images the document references but that were not provided.
function missingImages(html) {
  return [...new Set([...html.matchAll(/class="image-missing" data-image="([^"]*)"/g)].map(match => match[1]))];
}

async function renderPdf(config, images) {
  return withStudio(async (page, context) => {
    const html = await renderHtml(page, config, 'pdf', images);
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
    return { pdf, pages, missing: missingImages(html) };
  });
}

// Image files the tools may read. Only image types, of a bounded size; MPS_INPUT_DIR confines the reads to
// one folder, as MPS_OUTPUT_DIR does for the writes.
const INPUT_DIR = process.env.MPS_INPUT_DIR ? path.resolve(process.env.MPS_INPUT_DIR) : null;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

// [{ path, name? }] -> { fileName: dataUrl }. The document matches images by file name only.
async function readImages(images = []) {
  const files = {};
  for (const { path: file, name } of images) {
    const source = path.resolve(INPUT_DIR ?? process.cwd(), file);
    if (INPUT_DIR && !source.startsWith(INPUT_DIR + path.sep)) {
      throw new Error(`Image ${file} must stay inside ${INPUT_DIR} (MPS_INPUT_DIR)`);
    }
    const type = IMAGE_TYPES[path.extname(source).toLowerCase()];
    if (!type) throw new Error(`Image ${file} is not a supported type (${Object.keys(IMAGE_TYPES).join(', ')})`);
    const { size } = await stat(source).catch(() => {
      throw new Error(`Image ${file} cannot be read`);
    });
    if (size > MAX_IMAGE_BYTES) throw new Error(`Image ${file} is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    files[name || path.basename(source)] = `data:${type};base64,${(await readFile(source)).toString('base64')}`;
  }
  return files;
}

// Where the tools may write. MPS_OUTPUT_DIR confines every output to one folder; without it, any path the
// server process can write to is accepted. Existing files are never overwritten unless asked.
const OUTPUT_DIR = process.env.MPS_OUTPUT_DIR ? path.resolve(process.env.MPS_OUTPUT_DIR) : null;

function resolveOutput(outputPath) {
  const target = path.resolve(OUTPUT_DIR ?? process.cwd(), outputPath);
  if (OUTPUT_DIR && !target.startsWith(OUTPUT_DIR + path.sep)) {
    throw new Error(`output_path must stay inside ${OUTPUT_DIR} (MPS_OUTPUT_DIR)`);
  }
  return target;
}

async function writeOutput(outputPath, data, { overwrite = false } = {}) {
  const target = resolveOutput(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data, { flag: overwrite ? 'w' : 'wx' }).catch(error => {
    if (error.code === 'EEXIST') throw new Error(`${target} already exists; pass overwrite: true to replace it`);
    throw error;
  });
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
  coverTemplate: z.enum(['classic', 'centered', 'band', 'minimal']).optional().describe('Layout of the cover page'),
  accentColor: z.string().optional().describe('Accent colour of the cover templates, as #rrggbb'),
  codeTheme: z.enum(['light', 'dark', 'none']).optional().describe('Syntax highlighting of code blocks'),
  runningHeader: z
    .boolean()
    .optional()
    .describe('Show the current first-level heading top left instead of headerTitle'),
  mirrorMargins: z
    .boolean()
    .optional()
    .describe('Facing pages: left-hand pages swap the left and right margins and the margin boxes'),
};

const markdownField = z
  .string()
  .min(1)
  .describe(
    'The report body in Markdown (CommonMark + tables). ```mermaid fences become diagrams; size one with ' +
      'attributes on its opening line, e.g. ```mermaid width=60% align=left (width: 10-100% or mm). Local ' +
      'images are passed through `images` and sized the same way: ![Alt](photo.png){width=60% align=center}. An ' +
      'image alone on its line is centered unless align says left or right; inside a sentence, align=left or ' +
      'align=right floats it with the text around, align=center puts it on its own line. A caption goes in ' +
      'the image title, ![Alt](photo.png "Caption"), or in caption="..." on a mermaid fence line. A line ' +
      'holding only \\newpage starts a new page; a line holding only [[toc]] (or [[toc depth=2]]) becomes the ' +
      'table of contents of the headings that follow it, with page numbers. Code fences with a language are ' +
      'syntax-highlighted.',
  );
const imagesField = z
  .array(
    z.object({
      path: z.string().min(1).describe('Image file to read (absolute, or relative to MPS_INPUT_DIR or the server cwd)'),
      name: z.string().min(1).optional().describe('File name the Markdown uses, when it differs from the file on disk'),
    }),
  )
  .optional()
  .describe(
    'Local images of the document (png, jpg, webp, gif, svg). The Markdown refers to them by file name, any ' +
      'path is ignored: ![Chart](charts/q3.png) uses the image named q3.png.',
  );

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
      output_path: z
        .string()
        .min(1)
        .describe('Where to write the PDF (absolute, or relative to MPS_OUTPUT_DIR or the server cwd)'),
      overwrite: z.boolean().optional().describe('Replace the file if it already exists (default: refuse)'),
      images: imagesField,
    },
  },
  async ({ markdown, config, output_path, overwrite, images }) => {
    try {
      const { pdf, pages, missing } = await renderPdf({ ...config, markdown }, await readImages(images));
      const target = await writeOutput(output_path, pdf, { overwrite });
      const result = { path: target, pages, bytes: pdf.length, missing_images: missing };
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
      overwrite: z.boolean().optional().describe('Replace the file if it already exists (default: refuse)'),
      images: imagesField,
    },
  },
  async ({ markdown, config, output_path, overwrite, images }) => {
    try {
      const files = await readImages(images);
      const html = await withStudio(page => renderHtml(page, { ...config, markdown }, 'export', files));
      if (output_path) {
        const target = await writeOutput(output_path, html, { overwrite });
        const result = { path: target, bytes: Buffer.byteLength(html), missing_images: missingImages(html) };
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

Mermaid diagrams live in \`.mermaid-diagram\` (inline SVG, select it with \`.mermaid-diagram > svg\`); a failed diagram is a \`<pre class="mermaid-error">\`.
A diagram is sized from its fence line (\`width=60%\`, \`align=left\`), which sets \`.is-sized\`, \`--diagram-width\` and \`data-align\`.
Images are wrapped in \`<span class="document-image">\` (\`.is-block\` when alone in a paragraph, \`.is-sized\` with \`--image-width\` for \`![Alt](photo.png){width=60% align=center}\`); an image that was not provided is a \`.image-missing\` box. \`data-align\` on a block image moves it left or right of its centered default; on an image inside text it floats it (\`left\`, \`right\`) or gives it its own line (\`center\`).
A caption is \`.image-caption\` inside the image wrapper (\`.has-caption\`) or \`.diagram-caption\` inside the diagram.
Headings carry an id (\`sec-\` plus the slug of their text). The table of contents is \`<nav class="toc">\` with an \`<ol class="toc-list">\` of \`<li class="toc-item toc-level-N">\`, each holding a link with \`.toc-text\` and \`.toc-dots\`; the page number is the \`::after\` of the link. A forced page break is \`<div class="page-break">\`.
Highlighted code blocks are \`<pre class="code-block code-light">\` (or \`code-dark\`) with highlight.js \`.hljs-*\` spans.
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
