// Document settings: defaults (built-in, then personal ones from local/), the mutable `state`, validation of
// anything that enters it, and the autosave in localStorage.

export const STORAGE_KEY = 'markdown-paged-studio:document';
export const PAGE_SIZES = ['A4', 'Letter', 'A5'];
// Page heights in mm, used to size the cover page to the selected paper.
export const PAGE_HEIGHT_MM = { A4: 297, A5: 210, Letter: 279.4 };
export const MARGIN_MAX_MM = 80;
const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=-]+)*,[^\s"<>]*$/i;
// BCP 47 language tag such as "en", "fr", "pt-BR" or "zh-Hant".
export const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

const DEFAULT_MARKDOWN = `# Introduction\n\nWelcome to **Markdown Paged Studio**.\n\nThis app turns your Markdown into a paginated document that is ready to print.\n\n## Features\n\n- configurable cover page;\n- logo;\n- header and footer;\n- Page X / Y counter;\n- custom CSS;\n- live paged preview;\n- Mermaid diagrams;\n- standalone HTML export;\n- print / PDF through the browser.\n\n## Table example\n\n| Item | Value |\n|---|---|\n| Source | Markdown |\n| Rendering | HTML |\n| Pagination | Paged.js |\n\n## Diagram\n\n\`\`\`mermaid\nflowchart LR\n  A[Markdown] --> B[HTML]\n  B --> C[Pages]\n\`\`\`\n\n## Second part\n\nAdd content here to get more pages.\n\n> Custom CSS only applies to the rendered document.\n\n### Code\n\n\`\`\`js\nconsole.log('Markdown → HTML → pages');\n\`\`\`\n`;

const DEFAULT_CSS = `
.document-content {
  font-family: Inter, Arial, sans-serif;
  color: #202124;
  font-size: 10.5pt;
  line-height: 1.55;
  hyphens: auto;
}
.document-content h1 { font-size: 24pt; margin: 0 0 8mm; }
.document-content h2 { font-size: 17pt; margin-top: 10mm; }
.document-content h3 { font-size: 13pt; margin-top: 7mm; }
.document-content table { width: 100%; border-collapse: collapse; }
.document-content th,
.document-content td { border: .2mm solid #d0d4da; padding: 2.5mm 3mm; text-align: left; }
.document-content pre { background: #f5f6f8; padding: 4mm; border-radius: 2mm; white-space: pre-wrap; }
.document-content blockquote { margin-left: 0; padding-left: 5mm; border-left: 1mm solid #c8cdd4; color: #555; }
`;

const DEFAULT_STATE = {
  title: 'Architecture Report',
  subtitle: 'Generated from Markdown',
  author: 'Jane Doe',
  date: new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date()),
  headerTitle: 'Architecture Report',
  headerName: 'Jane Doe',
  footerText: 'Confidential',
  language: 'en',
  pageSize: 'A4',
  marginTop: 24,
  marginRight: 18,
  marginBottom: 20,
  marginLeft: 18,
  cover: true,
  markdown: DEFAULT_MARKDOWN,
  customCss: DEFAULT_CSS,
  logoDataUrl: '',
};

// Value kind per config key. Anything not listed here is dropped on import.
export const CONFIG_SCHEMA = {
  title: 'string',
  subtitle: 'string',
  author: 'string',
  date: 'string',
  headerTitle: 'string',
  headerName: 'string',
  footerText: 'string',
  language: 'language',
  pageSize: 'pageSize',
  marginTop: 'margin',
  marginRight: 'margin',
  marginBottom: 'margin',
  marginLeft: 'margin',
  cover: 'boolean',
  markdown: 'string',
  customCss: 'string',
  logoDataUrl: 'imageDataUrl',
};

// Returns only the keys of `input` that are known and well-typed, coerced into safe values.
export function sanitizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [key, kind] of Object.entries(CONFIG_SCHEMA)) {
    if (!(key in input)) continue;
    const value = input[key];
    switch (kind) {
      case 'string':
        if (typeof value === 'string') out[key] = value;
        break;
      case 'boolean':
        out[key] = Boolean(value);
        break;
      case 'pageSize':
        if (PAGE_SIZES.includes(value)) out[key] = value;
        break;
      case 'margin': {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = Math.min(MARGIN_MAX_MM, Math.max(0, n));
        break;
      }
      case 'language':
        if (typeof value === 'string' && LANGUAGE_TAG.test(value.trim())) out[key] = value.trim();
        break;
      case 'imageDataUrl':
        if (value === '' || (typeof value === 'string' && IMAGE_DATA_URL.test(value))) out[key] = value;
        break;
    }
  }
  return out;
}

// Personal defaults from the gitignored `local/` folder (see local/README.md), resolved at build time by Vite.
// They apply on first start and on Reset; a document saved in the browser always wins over them.
const localConfig =
  Object.values(import.meta.glob('../local/config.json', { eager: true, import: 'default' }))[0] ?? {};
const localText = import.meta.glob(['../local/custom.css', '../local/template.md'], {
  eager: true,
  query: '?raw',
  import: 'default',
});
const localLogo = Object.values(
  import.meta.glob('../local/logo.{svg,png,jpg,jpeg,webp,gif}', { eager: true, query: '?inline', import: 'default' }),
)[0];

export const DEFAULTS = {
  ...DEFAULT_STATE,
  ...sanitizeConfig(localConfig),
  ...(localText['../local/custom.css'] ? { customCss: localText['../local/custom.css'] } : {}),
  ...(localText['../local/template.md'] ? { markdown: localText['../local/template.md'] } : {}),
  ...(localLogo ? { logoDataUrl: localLogo } : {}),
};

// The live document. Mutated in place (Object.assign) so every module sees the same object.
export const state = { ...DEFAULTS };

export function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeConfig(JSON.parse(raw)) : {};
  } catch (error) {
    console.warn('Could not restore the saved document', error);
    return {};
  }
}

export function clearStoredConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

let persistTimer = null;
function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Quota exceeded (large logo) or storage disabled: the app keeps working without autosave.
    console.warn('Autosave failed', error);
  }
}

export function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 500);
}

// Writes a pending autosave immediately (used when the page is closed or reloaded).
export function flushPersist() {
  if (persistTimer !== null) persistNow();
}
