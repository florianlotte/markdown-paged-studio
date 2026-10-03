// The sources of a document inside its PDF: the full configuration (settings, Markdown, logo, images) and
// the Markdown alone are added as file attachments of the PDF, where any reader shows them, and the studio
// reads them back to reopen the document. Plain ESM around pdf-lib, shared by the browser (loaded on
// demand), the MCP server and the tests.
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';

export const SOURCE_NAME = 'markdown-paged-studio.json';
export const MARKDOWN_NAME = 'document.md';

const bytesOf = input => (input instanceof Uint8Array ? input : new Uint8Array(input));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Every (name, file specification) pair of the EmbeddedFiles name tree, leaves and kids alike.
function embeddedFiles(document) {
  const found = [];
  const names = document.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const root = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const walk = node => {
    if (!node) return;
    const entries = node.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (entries) {
      for (let index = 0; index + 1 < entries.size(); index += 2) {
        const key = entries.lookup(index);
        const name = key instanceof PDFHexString || key instanceof PDFString ? key.decodeText() : String(key);
        found.push({ name, specification: entries.lookupMaybe(index + 1, PDFDict) });
      }
    }
    const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
    if (kids) for (let index = 0; index < kids.size(); index++) walk(kids.lookupMaybe(index, PDFDict));
  };
  walk(root);
  return found;
}

// Drops the attachments named `names` so that `attach()` does not leave two of a kind.
function removeAttachments(document, names) {
  const dictionary = document.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const root = dictionary?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const entries = root?.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (!entries) return;
  const kept = [];
  for (let index = 0; index + 1 < entries.size(); index += 2) {
    const key = entries.lookup(index);
    const name = key instanceof PDFHexString || key instanceof PDFString ? key.decodeText() : String(key);
    if (!names.includes(name)) kept.push(entries.get(index), entries.get(index + 1));
  }
  const replacement = document.context.obj(kept);
  root.set(PDFName.of('Names'), replacement);
}

// The PDF with the sources attached: `json` is the project (the content of a project file),
// `markdown` the document alone. Attachments of the same names, from an earlier pass, are replaced.
export async function attachSources(pdfBytes, { json, markdown }) {
  const document = await PDFDocument.load(bytesOf(pdfBytes), { ignoreEncryption: false });
  removeAttachments(document, [SOURCE_NAME, MARKDOWN_NAME]);
  const now = new Date();
  await document.attach(encoder.encode(json), SOURCE_NAME, {
    mimeType: 'application/json',
    description:
      'Markdown Paged Studio project: settings, Markdown, logo and images. Import this PDF in the studio to edit it.',
    creationDate: now,
    modificationDate: now,
  });
  await document.attach(encoder.encode(markdown), MARKDOWN_NAME, {
    mimeType: 'text/markdown',
    description: 'The Markdown source of the document.',
    creationDate: now,
    modificationDate: now,
  });
  // Without object streams the objects of the PDF stay readable as text, as Chromium writes them.
  return document.save({ useObjectStreams: false });
}

// The configuration attached to a PDF, as text, or null when the PDF carries none.
export async function readSources(pdfBytes) {
  const document = await PDFDocument.load(bytesOf(pdfBytes), { ignoreEncryption: true });
  const entry = embeddedFiles(document).find(file => file.name === SOURCE_NAME);
  const streams = entry?.specification?.lookupMaybe(PDFName.of('EF'), PDFDict);
  const stream = streams?.lookup(PDFName.of('F')) ?? streams?.lookup(PDFName.of('UF'));
  if (!(stream instanceof PDFRawStream)) return null;
  return { json: decoder.decode(decodePDFRawStream(stream).decode()) };
}
