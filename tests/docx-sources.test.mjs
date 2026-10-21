// Unit tests of the project inside a Word file: the custom XML part is added, read back and replaced, and
// other zips are told apart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { attachSources, isDocx, readSources, SOURCE_NAMESPACE } from '../src/docx-sources.js';

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
// The smallest package that passes for a Word document.
function minimalDocx() {
  return zipSync({
    '[Content_Types].xml': strToU8(
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    'word/document.xml': strToU8(
      `${HEAD}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>`,
    ),
    'word/_rels/document.xml.rels': strToU8(
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
  });
}

const entries = bytes => unzipSync(bytes);
const text = (bytes, path) => strFromU8(entries(bytes)[path]);

test('a Word file is told apart from another zip', () => {
  assert.equal(isDocx(minimalDocx()), true);
  assert.equal(isDocx(zipSync({ 'notes.md': strToU8('# Notes') })), false);
  assert.equal(isDocx(new Uint8Array([1, 2, 3])), false);
});

test('the project is added as a custom XML part, with its relationship and content type, and read back', () => {
  const json = JSON.stringify({ title: 'A & B <c>', markdown: '# Title\n\n"Quoted" text' });
  const docx = attachSources(minimalDocx(), { json });
  const paths = Object.keys(entries(docx)).sort();
  assert.deepEqual(paths, [
    '[Content_Types].xml',
    'customXml/_rels/item1.xml.rels',
    'customXml/item1.xml',
    'customXml/itemProps1.xml',
    'word/_rels/document.xml.rels',
    'word/document.xml',
  ]);
  const item = text(docx, 'customXml/item1.xml');
  assert.match(item, new RegExp(`<project xmlns="${SOURCE_NAMESPACE}">`));
  assert.ok(item.includes('A &amp; B &lt;c&gt;'), 'the JSON is escaped for XML');
  assert.match(text(docx, 'customXml/itemProps1.xml'), /ds:itemID="\{[0-9A-F-]{36}\}"/);
  assert.match(
    text(docx, 'word/_rels/document.xml.rels'),
    /relationships\/customXml" Target="\.\.\/customXml\/item1\.xml"/,
  );
  assert.match(text(docx, '[Content_Types].xml'), /PartName="\/customXml\/itemProps1\.xml"/);
  assert.deepEqual(readSources(docx), { json });
});

test('a second pass replaces the part, other parts and a foreign item are kept', () => {
  const first = attachSources(minimalDocx(), { json: '{"title":"one"}' });
  const packed = entries(first);
  packed['customXml/item2.xml'] = strToU8(`${HEAD}<other xmlns="urn:other"/>`);
  packed['word/media/image1.png'] = new Uint8Array([137, 80, 78, 71]);
  const again = attachSources(zipSync(packed), { json: '{"title":"two"}' });
  const paths = Object.keys(entries(again));
  assert.equal(paths.filter(path => /^customXml\/item\d+\.xml$/.test(path)).length, 2);
  assert.ok(paths.includes('word/media/image1.png'));
  assert.deepEqual(readSources(again), { json: '{"title":"two"}' });
  assert.equal((text(again, 'word/_rels/document.xml.rels').match(/relationships\/customXml"/g) || []).length, 1);
  assert.equal((text(again, '[Content_Types].xml').match(/customXmlProperties\+xml/g) || []).length, 1);
});

test('a Word file without the project gives null, and something else is refused', () => {
  assert.equal(readSources(minimalDocx()), null);
  assert.throws(() => readSources(zipSync({ 'notes.md': strToU8('x') })), /Word/);
  assert.throws(() => attachSources(zipSync({ 'notes.md': strToU8('x') }), { json: '{}' }), /Word/);
});
