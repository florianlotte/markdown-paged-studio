// Unit tests of the escaping helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeCssString, escCssString, escapeHtml, unescapeHtml } from '../src/escape.js';

test('escCssString escapes quotes and backslashes and keeps the value on one line', () => {
  assert.equal(escCssString('A "quoted" \\ title\nnext'), 'A \\"quoted\\" \\\\ title next');
  assert.equal(escCssString(null), '');
});

test('escapeHtml and unescapeHtml are inverse', () => {
  const text = 'Tom & "Jerry" <b>';
  assert.equal(escapeHtml(text), 'Tom &amp; &quot;Jerry&quot; &lt;b&gt;');
  assert.equal(unescapeHtml(escapeHtml(text)), text);
});

test('closeCssString closes the strings Paged.js leaves open and keeps closed ones', () => {
  // What Paged.js writes in the inline style of a page: an opening quote, no closing one.
  assert.equal(closeCssString('"First chapter'), '"First chapter"');
  assert.equal(closeCssString(' "First chapter '), '"First chapter"');
  // Already closed (Firefox serialises it that way), and the quotes inside stay escaped.
  assert.equal(closeCssString('"First chapter"'), '"First chapter"');
  assert.equal(closeCssString('"Say \\"hi\\""'), '"Say \\"hi\\""');
  // An escaped quote at the end is not a closing quote.
  assert.equal(closeCssString('"Say \\"hi\\"'), '"Say \\"hi\\""');
  assert.equal(closeCssString('"'), '""');
  assert.equal(closeCssString(''), '""');
});
