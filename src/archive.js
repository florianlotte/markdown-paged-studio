// A project as a folder of ordinary files, zipped: the Markdown files of the document, the stylesheet, the
// logo and the images side by side, and the settings in a small YAML file. Any tool can open what is inside
// (an image referenced by its name sits next to the Markdown), and the studio reads the archive back.
// Plain ESM around fflate and yaml, loaded on demand by the page and shared with the tests.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { parse, stringify } from 'yaml';
import { DEFAULT_FILE_NAME } from './files.js';
import { FORMAT, MARKER_KEY, firstHeading } from './markdown-sources.js';

export const SETTINGS_NAME = 'markdown-paged-studio.yaml';
export const STYLESHEET_NAME = 'style.css';
const LOGO_STEM = 'cover-logo';

const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};
const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};
// What is read from an archive: enough for a large document, not for a decompression bomb.
const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

const extension = name => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? '';

// The bytes and the type of an image data URL (base64 or percent-encoded).
function bytesOfDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const type = header.split(';')[0].toLowerCase();
  if (/;base64$/i.test(header))
    return { type, bytes: Uint8Array.from(atob(payload), character => character.charCodeAt(0)) };
  return { type, bytes: strToU8(decodeURIComponent(payload)) };
}

function dataUrlOfBytes(bytes, type) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

// A name that no other entry of the archive uses.
function freeName(wanted, taken) {
  const dot = wanted.lastIndexOf('.');
  const [stem, tail] = dot > 0 ? [wanted.slice(0, dot), wanted.slice(dot)] : [wanted, ''];
  let name = wanted;
  for (let rank = 2; taken.has(name.toLowerCase()); rank++) name = `${stem}-${rank}${tail}`;
  taken.add(name.toLowerCase());
  return name;
}

// The archive (zip bytes) of a project given as its JSON.
export function projectArchive(json) {
  const { markdown = '', files: listed, images = {}, customCss, logoDataUrl, ...settings } = JSON.parse(json);
  const files = Array.isArray(listed) && listed.length ? listed : [{ name: DEFAULT_FILE_NAME, markdown }];
  const entries = {};
  const taken = new Set([SETTINGS_NAME.toLowerCase()]);
  const project = { [MARKER_KEY]: FORMAT, ...settings };

  project.files = files.map(file => {
    const name = freeName(file.name, taken);
    entries[name] = strToU8(file.markdown);
    return name;
  });
  if (typeof customCss === 'string') {
    project.stylesheet = freeName(STYLESHEET_NAME, taken);
    entries[project.stylesheet] = strToU8(customCss);
  }
  // Images keep their own name, so a Markdown reference finds them next to the file.
  project.images = Object.entries(images).map(([name, dataUrl]) => {
    const entry = freeName(name, taken);
    entries[entry] = bytesOfDataUrl(dataUrl).bytes;
    return entry === name ? name : { name, file: entry };
  });
  if (logoDataUrl) {
    const { type, bytes } = bytesOfDataUrl(logoDataUrl);
    project.logo = freeName(`${LOGO_STEM}.${EXTENSIONS[type] ?? 'png'}`, taken);
    entries[project.logo] = bytes;
  }
  entries[SETTINGS_NAME] = strToU8(stringify(project, { lineWidth: 0, indent: 2 }));
  // Images are already compressed: only the text is deflated.
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, bytes]) => [
        name,
        [bytes, { level: /\.(md|css|yaml|svg)$/i.test(name) ? 6 : 0 }],
      ]),
    ),
  );
}

const baseName = path => path.split('/').pop();
const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// The project held by an archive, as a configuration text. An archive written by the studio brings the
// whole project; any other zip brings its Markdown files, in the order of their names, and its images.
export function sourcesOfArchive(bytes) {
  let count = 0;
  const unzipped = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
    filter: file => !file.name.endsWith('/') && file.originalSize <= MAX_ENTRY_BYTES && ++count <= MAX_ENTRIES,
  });
  const paths = Object.keys(unzipped).filter(
    path => !path.split('/').includes('..') && !baseName(path).startsWith('.'),
  );
  const image = path => {
    const type = IMAGE_TYPES[extension(path)];
    return type && dataUrlOfBytes(unzipped[path], type);
  };

  // The settings file closest to the root, and the folder it sits in.
  const settingsPath = paths
    .filter(path => baseName(path) === SETTINGS_NAME)
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  let listed = null;
  if (settingsPath) {
    try {
      const parsed = parse(strFromU8(unzipped[settingsPath]), { version: '1.2', uniqueKeys: true, maxAliasCount: 10 });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && MARKER_KEY in parsed) listed = parsed;
    } catch {
      // Not readable: the archive is taken as plain files.
    }
  }

  if (!listed) {
    const documents = paths.filter(path => /\.(md|markdown)$/i.test(path)).sort(naturally);
    if (!documents.length) throw new Error('this archive holds no Markdown file');
    const files = documents.map(path => ({ name: baseName(path), markdown: strFromU8(unzipped[path]) }));
    const images = Object.fromEntries(
      paths.filter(path => IMAGE_TYPES[extension(path)]).map(path => [baseName(path), image(path)]),
    );
    const title = firstHeading(files[0].markdown);
    return JSON.stringify({ files, images, ...(title === null ? {} : { title }) });
  }

  const folder = settingsPath.slice(0, settingsPath.length - SETTINGS_NAME.length);
  const at = name => (typeof name === 'string' && `${folder}${name}` in unzipped ? `${folder}${name}` : null);
  const { files, stylesheet, logo, images, ...project } = listed;
  delete project[MARKER_KEY];
  project.files = (Array.isArray(files) ? files : [])
    .filter(name => at(name))
    .map(name => ({ name, markdown: strFromU8(unzipped[at(name)]) }));
  if (!project.files.length) throw new Error('this archive holds no Markdown file');
  if (at(stylesheet)) project.customCss = strFromU8(unzipped[at(stylesheet)]);
  const logoDataUrl = at(logo) && image(at(logo));
  if (logoDataUrl) project.logoDataUrl = logoDataUrl;
  project.images = {};
  for (const entry of Array.isArray(images) ? images : []) {
    const [name, file] = typeof entry === 'string' ? [entry, entry] : [entry?.name, entry?.file];
    const dataUrl = typeof name === 'string' && at(file) && image(at(file));
    if (dataUrl) project.images[name] = dataUrl;
  }
  return JSON.stringify(project);
}
