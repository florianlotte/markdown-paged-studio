// The French translations: every text the code asks for has an entry, and the entries keep the placeholders
// of their key.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LANGUAGES, t, setLanguage } from '../src/i18n.js';

const src = new URL('../src/', import.meta.url);
const sources = readdirSync(src)
  .filter(name => name.endsWith('.js') && name !== 'i18n.js')
  .map(name => readFileSync(new URL(name, src), 'utf8'));
// A literal first argument of t(): t('text') or t('text', values), on one line or the next.
const CALL = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;

test('every literal text given to t() in the code has a French translation', () => {
  setLanguage('fr');
  const missing = new Set();
  for (const text of sources) {
    for (const [, key] of text.matchAll(CALL)) {
      const literal = key.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      if (t(literal) === literal && !/^[A-Z0-9 .+/-]*$/.test(literal)) missing.add(literal);
    }
  }
  // Texts that read the same in French are the exceptions; anything else is a gap.
  const allowed = new Set(['Auto', 'Document', '1 page', '{count} pages', '{step} / {count}']);
  assert.deepEqual(
    [...missing].filter(text => !allowed.has(text)),
    [],
  );
});

test('the French entries keep the placeholders of their key, and the languages are listed', () => {
  setLanguage('fr');
  assert.deepEqual(Object.keys(LANGUAGES), ['en', 'fr']);
  for (const text of sources) {
    for (const [, key] of text.matchAll(CALL)) {
      const literal = key.replace(/\\'/g, "'");
      const wanted = [...literal.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      const got = [...t(literal).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      assert.deepEqual(got, wanted, `placeholders differ for "${literal}"`);
    }
  }
  assert.equal(t('{name} removed from the document', { name: 'a.md' }), 'a.md retiré du document');
  setLanguage('en');
  assert.equal(t('Undo'), 'Undo');
});
