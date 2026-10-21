// The sources of a document inside its Word file: the project (settings, Markdown, logo and images) is kept
// in a custom XML part of the package, which Word and LibreOffice preserve when the file is saved again,
// and which the studio reads back to reopen the document. Plain ESM around fflate, shared by the browser
// (loaded on demand) and the tests.
import { strFromU8, strToU8, zipSync } from 'fflate';
import { unzipBounded } from './archive.js';

// The namespace of the part: the mark the studio looks for when it reads a .docx back.
export const SOURCE_NAMESPACE = 'urn:markdown-paged-studio:project';
const CONTENT_TYPES = '[Content_Types].xml';
const DOCUMENT_RELS = 'word/_rels/document.xml.rels';
const PROPS_TYPE = 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml';
const RELATION_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';
const PROPS_RELATION_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps';
const RELATION_ID = 'rIdMarkdownPagedStudio';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const escapeXml = text =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const unescapeXml = text =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

const unzip = bytes => unzipBounded(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

// True for a Word document: a zip that holds the main document part.
export function isDocx(bytes) {
  try {
    return 'word/document.xml' in unzip(bytes);
  } catch {
    return false;
  }
}

// The parts of the studio already in the package: their number (customXml/itemN.xml) and the paths to drop.
function studioParts(entries) {
  const found = [];
  for (const path of Object.keys(entries)) {
    const match = /^customXml\/item(\d+)\.xml$/.exec(path);
    if (match && strFromU8(entries[path]).includes(SOURCE_NAMESPACE)) found.push(Number(match[1]));
  }
  return found;
}

// A GUID for the data store item, as Word writes one.
function itemId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = [...bytes]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

// The Word file with the project in a custom XML part: `json` is the content of a project file. A part
// from an earlier pass is replaced.
export function attachSources(docxBytes, { json }) {
  const entries = unzip(docxBytes);
  if (!('word/document.xml' in entries) || !(DOCUMENT_RELS in entries) || !(CONTENT_TYPES in entries))
    throw new Error('not a Word document');
  for (const number of studioParts(entries)) {
    delete entries[`customXml/item${number}.xml`];
    delete entries[`customXml/itemProps${number}.xml`];
    delete entries[`customXml/_rels/item${number}.xml.rels`];
  }
  const taken = new Set(Object.keys(entries));
  let number = 1;
  while (taken.has(`customXml/item${number}.xml`) || taken.has(`customXml/itemProps${number}.xml`)) number++;

  entries[`customXml/item${number}.xml`] = strToU8(
    `${XML_HEAD}<project xmlns="${SOURCE_NAMESPACE}">${escapeXml(json)}</project>`,
  );
  entries[`customXml/itemProps${number}.xml`] = strToU8(
    `${XML_HEAD}<ds:datastoreItem ds:itemID="${itemId()}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${SOURCE_NAMESPACE}"/></ds:schemaRefs></ds:datastoreItem>`,
  );
  entries[`customXml/_rels/item${number}.xml.rels`] = strToU8(
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${PROPS_RELATION_TYPE}" Target="itemProps${number}.xml"/></Relationships>`,
  );

  // The main part points at the item; the package declares the type of its properties.
  let rels = strFromU8(entries[DOCUMENT_RELS]);
  rels = rels.replace(new RegExp(`<Relationship [^>]*Id="${RELATION_ID}"[^>]*/>`, 'g'), '');
  rels = rels.replace(
    /<\/Relationships>\s*$/,
    `<Relationship Id="${RELATION_ID}" Type="${RELATION_TYPE}" Target="../customXml/item${number}.xml"/></Relationships>`,
  );
  entries[DOCUMENT_RELS] = strToU8(rels);
  let types = strFromU8(entries[CONTENT_TYPES]);
  types = types.replace(/<Override [^>]*PartName="\/customXml\/itemProps\d+\.xml"[^>]*\/>/g, '');
  types = types.replace(
    /<\/Types>\s*$/,
    `<Override PartName="/customXml/itemProps${number}.xml" ContentType="${PROPS_TYPE}"/></Types>`,
  );
  entries[CONTENT_TYPES] = strToU8(types);

  const zipped = {};
  for (const [path, bytes] of Object.entries(entries)) zipped[path] = [bytes, { level: 6 }];
  return zipSync(zipped);
}

// The project held by a Word file, as text, or null when the file carries none.
export function readSources(docxBytes) {
  const entries = unzip(docxBytes);
  if (!('word/document.xml' in entries)) throw new Error('not a Word document');
  const [number] = studioParts(entries);
  if (number === undefined) return null;
  const xml = strFromU8(entries[`customXml/item${number}.xml`]);
  const match = /<project [^>]*>([^]*)<\/project>\s*$/.exec(xml);
  return match ? { json: unescapeXml(match[1]) } : null;
}
