// Takes the screenshots of the README from the built application: `npm run build`, then
// `npm run screenshots`. They are written to docs/screenshots/. The studio starts from its sample document
// and from the defaults of the build, so build without personal files in local/ before running this.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { png } from '../tests/helpers/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'screenshots');
const PORT = Number(process.env.PORT) || 5191;
const URL = `http://localhost:${PORT}/`;
const VIEWPORT = { width: 1440, height: 757 };

const REPORT = `# Quarterly report

[[toc]]

\\newpage

# Overview

The platform served **4.2 million** requests a day this quarter, see the [details](#details).

## Details

\`\`\`python
# Requests per day, in millions
def average(values):
    return sum(values) / len(values)

print(average([3.9, 4.2, 4.5]))
\`\`\`

\`\`\`mermaid width=70% caption="Figure 1: how a request travels"
flowchart LR
  Client --> Gateway --> Service --> Database
\`\`\`

# Next steps

## Capacity

Plan the capacity of the next quarter.

## Security

Review the access rules.
`;

const IMAGES = `# Site survey

![Plan](plan.png "Figure 1: the ground floor"){width=45% align=right}

The survey covers the ground floor of the building. ${'The rooms were measured and compared with the plans. '.repeat(6)}

![Missing](elevation.png)
`;

function startServer() {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--strictPort', '--port', PORT], {
    cwd: root,
    stdio: 'ignore',
  });
  return server;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`The preview server did not start on port ${PORT}`);
}

const rendered = page =>
  page.waitForFunction(
    () =>
      /^\d+ pages?$/.test(document.getElementById('status').textContent) &&
      !document.getElementById('preview').classList.contains('is-stale'),
  );

async function openStudio(browser, { locale = 'en-US', markdown } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, locale, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(URL);
  await rendered(page);
  if (markdown) await write(page, markdown);
  return page;
}

async function write(page, markdown) {
  await page.locator('#markdown').evaluate((editor, value) => {
    editor.value = value;
    editor.dispatchEvent(new Event('input'));
  }, markdown);
  await page.waitForTimeout(300);
  await rendered(page);
}

const shot = (target, name) => target.screenshot({ path: path.join(out, name) });

mkdirSync(out, { recursive: true });
const server = startServer();
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();

  // The studio with its sample document.
  let page = await openStudio(browser);
  // Zoomed out so the cover and the first page of text both show.
  for (let step = 0; step < 6; step++) await page.locator('#zoomOut').click();
  await page.locator('.preview-shell').evaluate(shell => (shell.scrollTop = 330));
  await page.waitForTimeout(300);
  await shot(page, 'studio.png');
  await page.context().close();

  // Two pages side by side: table of contents, highlighted code, captioned diagram.
  page = await openStudio(browser, { markdown: REPORT });
  await page.locator('#cover').uncheck();
  await page.locator('#layoutSpread').click();
  await page.waitForTimeout(300);
  await rendered(page);
  await shot(page, 'spread.png');

  // A diagram with its tools.
  await page.locator('#layoutSingle').click();
  const diagram = page.locator('#preview .mermaid-diagram');
  await diagram.scrollIntoViewIfNeeded();
  await diagram.click();
  await page.waitForTimeout(300);
  const box = await diagram.boundingBox();
  await page.screenshot({
    path: path.join(out, 'diagram.png'),
    clip: { x: box.x - 60, y: box.y - 46, width: box.width + 120, height: box.height + 76 },
  });
  await page.context().close();

  // Images: the library, a sized image with its caption and tools, a missing image.
  page = await openStudio(browser, { markdown: IMAGES });
  await page
    .locator('#imageFiles')
    .setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png(900, 600, [37, 99, 235]) });
  await page.waitForTimeout(300);
  await rendered(page);
  await page.locator('#preview .document-image').click();
  await page.locator('#imageList').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, 'images.png');
  await page.context().close();

  // The four cover templates, side by side.
  page = await openStudio(browser);
  // Tall enough to hold a whole page: an element larger than the window is cut.
  await page.setViewportSize({ width: 1440, height: 1900 });
  await page.waitForTimeout(300);
  const covers = [];
  for (const template of ['classic', 'centered', 'band', 'minimal']) {
    await page.locator('#coverTemplate').selectOption(template);
    await page.waitForTimeout(300);
    await rendered(page);
    const image = await page.locator('#preview .pagedjs_page').first().screenshot();
    covers.push({ template, data: image.toString('base64') });
  }
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: 1440, height: 560 });
  await sheet.setContent(`<body style="margin:0;padding:24px;background:#e8ebf0;display:flex;gap:24px;
    justify-content:center;font:600 15px system-ui,sans-serif;color:#4f5660">${covers
      .map(
        cover => `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${cover.data}"
          style="height:470px;display:block;box-shadow:0 4px 18px rgba(0,0,0,.14)"><figcaption
          style="margin-top:12px">${cover.template}</figcaption></figure>`,
      )
      .join('')}</body>`);
  await shot(sheet, 'covers.png');
  await page.context().close();

  // The interface in French.
  page = await openStudio(browser, { locale: 'fr-FR', markdown: REPORT });
  await page.locator('#cover').uncheck();
  await page.waitForTimeout(300);
  await rendered(page);
  await shot(page, 'french.png');
  await page.context().close();

  console.log(`Screenshots written to ${path.relative(root, out)}/`);
} finally {
  await browser?.close();
  server.kill();
}
