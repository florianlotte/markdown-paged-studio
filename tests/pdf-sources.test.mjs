// Unit tests of the PDF attachments that make an exported PDF editable again (Node, pdf-lib only).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFName } from 'pdf-lib';
import { attachSources, MARKDOWN_NAME, readSources, SOURCE_NAME } from '../src/pdf-sources.js';

async function blankPdf() {
  const document = await PDFDocument.create();
  document.addPage([200, 100]);
  return document.save();
}

// Names of the files attached to a PDF, in order.
async function attachmentNames(bytes) {
  const document = await PDFDocument.load(bytes);
  const entries = document.catalog
    .lookup(PDFName.of('Names'))
    .lookup(PDFName.of('EmbeddedFiles'))
    .lookup(PDFName.of('Names'));
  const names = [];
  for (let index = 0; index < entries.size(); index += 2) names.push(entries.lookup(index).decodeText());
  return names;
}

test('a PDF without attachments has no sources', async () => {
  assert.equal(await readSources(await blankPdf()), null);
});

test('the sources are attached, read back, and replaced on a second pass', async () => {
  const json = JSON.stringify({ title: 'Étude <b> & "quotes"', markdown: '# Étude\n\nText.', images: {} });
  const once = await attachSources(await blankPdf(), { json, markdown: '# Étude\n\nText.' });
  assert.equal(Buffer.from(once.subarray(0, 5)).toString(), '%PDF-');
  assert.deepEqual(await readSources(once), { json });
  assert.deepEqual(await attachmentNames(once), [SOURCE_NAME, MARKDOWN_NAME]);
  // The page is still there: the document itself is untouched.
  assert.equal((await PDFDocument.load(once)).getPageCount(), 1);

  const other = JSON.stringify({ title: 'Second' });
  const twice = await attachSources(once, { json: other, markdown: '# Second' });
  assert.deepEqual(await readSources(twice), { json: other });
  assert.deepEqual(await attachmentNames(twice), [SOURCE_NAME, MARKDOWN_NAME]);
  // ArrayBuffer and Buffer inputs are accepted too.
  assert.deepEqual(await readSources(twice.buffer.slice(twice.byteOffset, twice.byteOffset + twice.byteLength)), {
    json: other,
  });
  assert.deepEqual(await readSources(Buffer.from(twice)), { json: other });
});

test('other attachments of the PDF are kept', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  await document.attach(Buffer.from('a,b\n1,2\n'), 'data.csv', { mimeType: 'text/csv' });
  const withSources = await attachSources(await document.save(), { json: '{"a":1}', markdown: 'a' });
  assert.deepEqual(await attachmentNames(withSources), ['data.csv', SOURCE_NAME, MARKDOWN_NAME]);
  assert.deepEqual(await readSources(withSources), { json: '{"a":1}' });
});

test('something that is not a PDF is refused', async () => {
  await assert.rejects(readSources(new TextEncoder().encode('hello')), /PDF/);
  await assert.rejects(attachSources(new TextEncoder().encode('hello'), { json: '{}', markdown: '' }), /PDF/);
});
