// Unit tests of the measures of the Word export: page geometry, unit conversions and the fitting of a drawing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emu, fitDrawing, halfPoints, pageGeometry, pxOfMm, twips, wantedWidth } from '../src/docx-units.js';

test('units convert from the document to OOXML', () => {
  assert.equal(twips(25.4), 1440);
  assert.equal(twips(210), 11906);
  assert.equal(halfPoints(8.5), 17);
  assert.equal(emu(96), 914400);
  assert.equal(Math.round(pxOfMm(25.4)), 96);
});

test('the page geometry gives the column and the text area of the page', () => {
  const a4 = pageGeometry({ pageSize: 'A4', marginTop: 24, marginRight: 18, marginBottom: 20, marginLeft: 18 });
  assert.equal(a4.width, 210);
  assert.equal(a4.height, 297);
  assert.equal(a4.column, 174);
  assert.equal(a4.textHeight, 253);
  const letter = pageGeometry({ pageSize: 'Letter', marginTop: 10, marginRight: 10, marginBottom: 10, marginLeft: 10 });
  assert.equal(letter.width, 215.9);
  assert.equal(letter.height, 279.4);
  // An unknown size falls back to A4, and absurd margins keep a column.
  assert.equal(
    pageGeometry({ pageSize: 'Tabloid', marginTop: 0, marginRight: 100, marginBottom: 0, marginLeft: 100 }).column,
    20,
  );
});

test('the wanted width of a drawing is read as a share of the column or in mm', () => {
  assert.equal(wantedWidth('60%', 643), 385.8);
  assert.equal(Math.round(wantedWidth('80mm', 643)), 302);
  assert.equal(wantedWidth(undefined, 643), null);
  assert.equal(wantedWidth('', 643), null);
  assert.equal(wantedWidth('wide', 643), null);
  assert.equal(wantedWidth('300px', 643), null);
});

test('a drawing is fitted to the column, the text area and the wanted width, proportions kept', () => {
  const box = { column: 174, textHeight: 253 };
  const columnPx = Math.round(pxOfMm(174));
  // Natural size when it fits, the column when it does not.
  assert.deepEqual(fitDrawing({ width: 300, height: 150 }, null, box), { width: 300, height: 150 });
  assert.deepEqual(fitDrawing({ width: 3000, height: 1500 }, null, box), {
    width: columnPx,
    height: Math.round(columnPx / 2),
  });
  // A share of the column, or a size in mm; never wider than the column.
  assert.deepEqual(fitDrawing({ width: 300, height: 150 }, '50%', box), {
    width: Math.round(columnPx / 2),
    height: Math.round(Math.round(columnPx / 2) / 2),
  });
  assert.equal(fitDrawing({ width: 300, height: 150 }, '50mm', box).width, Math.round(pxOfMm(50)));
  assert.equal(fitDrawing({ width: 300, height: 150 }, '400mm', box).width, columnPx);
  // A tall drawing is bounded by the text area, less a reserve for a caption.
  const tall = fitDrawing({ width: 100, height: 2000 }, '100%', box);
  assert.ok(tall.height <= pxOfMm(253 - 12) + 1);
  assert.equal(Math.round((tall.height / tall.width) * 10) / 10, 20);
  assert.ok(fitDrawing({ width: 100, height: 2000 }, '100%', box, { reserve: 0 }).height > tall.height);
  // A drawing without a size takes the column with a 4:3 proportion.
  assert.deepEqual(fitDrawing({ width: 0, height: 0 }, null, box), {
    width: columnPx,
    height: Math.round(columnPx * 0.75),
  });
});
