// Unit tests of the pure helpers that choose which font files a document needs (no browser needed).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { neededFaces, parseFontFaces, parseUnicodeRange } from '../src/font-faces.js';

const css = name =>
  readFileSync(new URL(`../node_modules/@fontsource-variable/inter/${name}`, import.meta.url), 'utf8');
const faces = [...parseFontFaces(css('wght.css')), ...parseFontFaces(css('wght-italic.css'))];
const files = (text, options) => neededFaces(faces, text, options).map(face => face.file);

test('parseUnicodeRange reads single points, ranges and wildcards', () => {
  assert.deepEqual(parseUnicodeRange('U+0460-052F, U+20B4,U+4??'), [
    [0x460, 0x52f],
    [0x20b4, 0x20b4],
    [0x400, 0x4ff],
  ]);
  assert.deepEqual(parseUnicodeRange('U+0041-0040, nonsense, U+'), []);
});

test('parseFontFaces lists every subset of the packaged font, in both styles', () => {
  assert.equal(faces.length, 14);
  assert.equal(faces.filter(face => face.style === 'italic').length, 7);
  for (const face of faces) {
    assert.match(face.file, /^inter-[a-z-]+-wght-(normal|italic)\.woff2$/);
    assert.ok(face.ranges.length > 0);
  }
  assert.deepEqual(parseFontFaces('@font-face { font-family: X; src: url(x.woff2); }'), []);
});

test('neededFaces keeps the subsets the text uses', () => {
  assert.deepEqual(files('Plain text, élève, œuvre — “quotes”', { italic: false }), ['inter-latin-wght-normal.woff2']);
  assert.deepEqual(files('Łódź', { italic: false }), [
    'inter-latin-ext-wght-normal.woff2',
    'inter-latin-wght-normal.woff2',
  ]);
  assert.deepEqual(files('Привет'), ['inter-cyrillic-wght-normal.woff2', 'inter-cyrillic-wght-italic.woff2']);
  assert.deepEqual(files('日本語'), []);
  assert.deepEqual(files(''), []);
});
