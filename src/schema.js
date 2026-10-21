// The schema of a document: the keys of its configuration, their kinds and allowed values, and the
// validation that everything entering the state goes through (`sanitizeConfig()`), plus the merge that keeps
// the files and their assembled Markdown consistent (`mergeConfig()`). Pure: no browser, no defaults.
import { assembleFiles, DEFAULT_FILE_NAME, sanitizeFiles } from './files.js';
import { IMAGE_DATA_URL } from './images.js';
import { clamp } from './util.js';

export const PAGE_SIZES = ['A4', 'Letter', 'A5'];
// Page heights in mm, used to size the cover page to the selected paper.
export const PAGE_HEIGHT_MM = { A4: 297, A5: 210, Letter: 279.4 };
export const MARGIN_MAX_MM = 80;
export const CODE_THEMES = ['light', 'dark', 'none'];
export const COVER_TEMPLATES = ['classic', 'centered', 'band', 'minimal'];
// Where the numbering of headings starts: nowhere, at the first level, or at the second one (the first
// level is then the title of the document).
export const HEADING_NUMBERING = ['none', 'h1', 'h2'];
// The deepest heading level the running header follows.
export const RUNNING_HEADER_LEVELS = ['h1', 'h2', 'h3'];
// Mermaid options of the document: the space between the nodes and ranks, and the colour theme.
export const DIAGRAM_SPACINGS = ['compact', 'normal', 'wide'];
export const DIAGRAM_THEMES = ['neutral', 'default', 'forest', 'dark'];
// Numeric keys with their bounds (the kind `range`): the text size of the diagrams and the width of their
// lines, in px of the drawing before it is scaled to the column.
export const RANGES = { diagramFontSize: [8, 40], diagramLineWidth: [1, 6] };
export const DIAGRAM_FONT_SIZE = RANGES.diagramFontSize;
const COLOR = /^#[0-9a-f]{6}$/i;
// BCP 47 language tag such as "en", "fr", "pt-BR" or "zh-Hant".
export const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

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
  files: 'files',
  customCss: 'string',
  logoDataUrl: 'imageDataUrl',
  codeTheme: 'codeTheme',
  runningHeader: 'boolean',
  runningHeaderLevel: 'runningHeaderLevel',
  numberHeadings: 'headingNumbering',
  numberFigures: 'boolean',
  mirrorMargins: 'boolean',
  coverTemplate: 'coverTemplate',
  accentColor: 'color',
  diagramFontSize: 'range',
  diagramSpacing: 'diagramSpacing',
  diagramTheme: 'diagramTheme',
  diagramLineWidth: 'range',
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
      case 'codeTheme':
        if (CODE_THEMES.includes(value)) out[key] = value;
        break;
      case 'coverTemplate':
        if (COVER_TEMPLATES.includes(value)) out[key] = value;
        break;
      case 'headingNumbering':
        if (HEADING_NUMBERING.includes(value)) out[key] = value;
        break;
      case 'runningHeaderLevel':
        if (RUNNING_HEADER_LEVELS.includes(value)) out[key] = value;
        break;
      case 'diagramSpacing':
        if (DIAGRAM_SPACINGS.includes(value)) out[key] = value;
        break;
      case 'diagramTheme':
        if (DIAGRAM_THEMES.includes(value)) out[key] = value;
        break;
      case 'range': {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = clamp(n, ...RANGES[key]);
        break;
      }
      case 'color':
        if (typeof value === 'string' && COLOR.test(value.trim())) out[key] = value.trim().toLowerCase();
        break;
      case 'language':
        if (typeof value === 'string' && LANGUAGE_TAG.test(value.trim())) out[key] = value.trim();
        break;
      case 'imageDataUrl':
        if (value === '' || (typeof value === 'string' && IMAGE_DATA_URL.test(value))) out[key] = value;
        break;
      case 'files':
        out[key] = sanitizeFiles(value);
        break;
    }
  }
  return out;
}

// Merges a (possibly untrusted) configuration into `target` and keeps its two forms of the text consistent:
// the files are the source and the Markdown is their assembly. A configuration that only brings a Markdown
// text (an older project, the MCP server, a plain Markdown file) becomes a document of one file.
export function mergeConfig(target, config) {
  const clean = sanitizeConfig(config);
  if (clean.files?.length) clean.markdown = assembleFiles(clean.files);
  else if (typeof clean.markdown === 'string') clean.files = [{ name: DEFAULT_FILE_NAME, markdown: clean.markdown }];
  else delete clean.files;
  return Object.assign(target, clean);
}
