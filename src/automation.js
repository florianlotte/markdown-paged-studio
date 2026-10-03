// Automation API for headless rendering, used by the MCP server (mcp/server.mjs). It builds a document from a
// config object without touching the UI; it is not part of the browser UX.
import { CONFIG_SCHEMA, DEFAULTS, MARGIN_MAX_MM, PAGE_SIZES, sanitizeConfig, state } from './config.js';
import { standaloneHtml } from './document.js';
import { exportImages, replaceImages, sanitizeImages } from './images.js';

// True when the page was opened by an automation client (?automation=1): the initial preview is skipped.
export const AUTOMATION = new URLSearchParams(location.search).has('automation');

export function installAutomationApi() {
  window.studio = {
    defaults: () => ({ ...DEFAULTS }),
    schema: () => ({ kinds: { ...CONFIG_SCHEMA }, pageSizes: [...PAGE_SIZES], marginMaxMm: MARGIN_MAX_MM }),
    // Resolves to the standalone HTML for `config` (validated like a JSON import) in the given mode.
    // `images` is { fileName: dataUrl }: the document's images, matched by file name, kept in memory only.
    // The configuration of the last render, as a project file holds it: what render_pdf attaches to the PDF.
    source: () => JSON.stringify({ ...state, images: exportImages() }),
    async render(config = {}, mode = 'pdf', { images } = {}) {
      Object.assign(state, DEFAULTS, sanitizeConfig(config));
      await replaceImages(sanitizeImages(images), { persist: false });
      return standaloneHtml({ mode });
    },
  };
}
