// The validation of a configuration: unknown keys dropped, values coerced, the two forms of the text kept
// consistent.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG_SCHEMA, mergeConfig, sanitizeConfig } from '../src/schema.js';

test('sanitizeConfig keeps the known keys with well-typed values and drops the rest', () => {
  const clean = sanitizeConfig({
    title: 'Report',
    subtitle: 42,
    marginTop: '500',
    marginLeft: -5,
    marginRight: 'wide',
    pageSize: 'Tabloid',
    codeTheme: 'dark',
    coverTemplate: 'fancy',
    accentColor: ' #AA3366 ',
    language: 'pt-BR',
    cover: 'yes',
    logoDataUrl: 'javascript:alert(1)',
    extra: true,
  });
  assert.deepEqual(clean, {
    title: 'Report',
    marginTop: 80,
    marginLeft: 0,
    codeTheme: 'dark',
    accentColor: '#aa3366',
    language: 'pt-BR',
    cover: true,
  });
  assert.deepEqual(sanitizeConfig(null), {});
  assert.deepEqual(sanitizeConfig([1, 2]), {});
  assert.deepEqual(sanitizeConfig({ language: 'not a tag', accentColor: 'red;}' }), {});
  assert.deepEqual(sanitizeConfig({ logoDataUrl: '' }), { logoDataUrl: '' });
});

test('every key of the schema has a kind the sanitizer knows', () => {
  const kinds = new Set(Object.values(CONFIG_SCHEMA));
  for (const kind of kinds) {
    const sample = {
      string: 'x',
      boolean: true,
      pageSize: 'A5',
      margin: 10,
      codeTheme: 'none',
      coverTemplate: 'band',
      headingNumbering: 'h1',
      runningHeaderLevel: 'h2',
      color: '#000000',
      language: 'fr',
      imageDataUrl: '',
      files: [],
    }[kind];
    assert.notEqual(sample, undefined, `no sample for the kind ${kind}`);
    const [key] = Object.entries(CONFIG_SCHEMA).find(([, k]) => k === kind);
    assert.ok(key in sanitizeConfig({ [key]: sample }), `${key} (${kind}) was dropped`);
  }
});

test('mergeConfig assembles the files into the Markdown, and makes one file of a Markdown alone', () => {
  const files = [
    { name: 'a.md', markdown: '# A\n' },
    { name: 'b.md', markdown: '# B\n' },
  ];
  const merged = mergeConfig({ title: 'kept' }, { files, markdown: 'ignored', unknown: 1 });
  assert.equal(merged.title, 'kept');
  assert.equal(merged.markdown, '# A\n\n\n# B\n');
  assert.deepEqual(
    merged.files.map(file => file.name),
    ['a.md', 'b.md'],
  );
  const alone = mergeConfig({}, { markdown: '# Only\n' });
  assert.deepEqual(alone.files, [{ name: 'document.md', markdown: '# Only\n' }]);
  // Nothing about the text: nothing about the files either.
  assert.deepEqual(mergeConfig({}, { title: 'T' }), { title: 'T' });
});
