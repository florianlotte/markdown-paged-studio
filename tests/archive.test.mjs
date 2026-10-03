import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { SETTINGS_NAME, STYLESHEET_NAME, projectArchive, sourcesOfArchive } from '../src/archive.js';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;

const project = {
  title: 'Report',
  pageSize: 'A4',
  cover: true,
  markdown: '# One\n\n![Plan](plan.png)\n\n\n# Two\n',
  files: [
    { name: 'one.md', markdown: '# One\n\n![Plan](plan.png)\n' },
    { name: 'two.md', markdown: '# Two\n' },
  ],
  customCss: '.document-content {\n  color: red;\n}\n',
  logoDataUrl: PNG,
  images: { 'plan.png': PNG, 'drawing.svg': SVG },
};

test('the archive holds the project as ordinary files next to each other', () => {
  const entries = unzipSync(projectArchive(JSON.stringify(project)));
  assert.deepEqual(Object.keys(entries).sort(), [
    'cover-logo.png',
    'drawing.svg',
    SETTINGS_NAME,
    'one.md',
    'plan.png',
    STYLESHEET_NAME,
    'two.md',
  ]);
  assert.equal(strFromU8(entries['one.md']), project.files[0].markdown);
  assert.equal(strFromU8(entries[STYLESHEET_NAME]), project.customCss);
  assert.equal(strFromU8(entries['drawing.svg']), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.deepEqual([...entries['plan.png'].subarray(1, 4)], [0x50, 0x4e, 0x47]);
  const settings = strFromU8(entries[SETTINGS_NAME]);
  assert.ok(settings.startsWith('markdown-paged-studio: 1\ntitle: Report\n'));
  assert.ok(settings.includes('files:\n  - one.md\n  - two.md\n'));
  // No text of the document, no encoded image in the settings.
  assert.ok(!settings.includes('base64') && !settings.includes('# One'));
});

test('a round trip restores the project', () => {
  const restored = JSON.parse(sourcesOfArchive(projectArchive(JSON.stringify(project))));
  assert.deepEqual(restored.files, project.files);
  assert.equal(restored.title, 'Report');
  assert.equal(restored.cover, true);
  assert.equal(restored.customCss, project.customCss);
  assert.equal(restored.logoDataUrl, PNG);
  assert.equal(restored.images['plan.png'], PNG);
  assert.match(restored.images['drawing.svg'], /^data:image\/svg\+xml;base64,/);
  assert.equal(restored.markdown, undefined);
});

test('a project of one text, and names that collide, still make a valid archive', () => {
  const single = {
    title: 'T',
    markdown: 'Text',
    images: { 'style.css.png': PNG, 'cover-logo.png': PNG },
    logoDataUrl: PNG,
  };
  const entries = unzipSync(projectArchive(JSON.stringify(single)));
  assert.deepEqual(Object.keys(entries).sort(), [
    'cover-logo-2.png',
    'cover-logo.png',
    'document.md',
    SETTINGS_NAME,
    'style.css.png',
  ]);
  const restored = JSON.parse(sourcesOfArchive(projectArchive(JSON.stringify(single))));
  assert.deepEqual(restored.files, [{ name: 'document.md', markdown: 'Text' }]);
  assert.deepEqual(Object.keys(restored.images).sort(), ['cover-logo.png', 'style.css.png']);
  assert.equal(restored.logoDataUrl, PNG);
});

test('any zip of Markdown files is a document: files in the order of their names, images, title', () => {
  const zip = zipSync({
    'book/10-end.md': strToU8('# End\n'),
    'book/2-middle.md': strToU8('# Middle\n'),
    'book/1-start.md': strToU8('# The book\n\nStart.\n'),
    'book/img/plan.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    'book/.hidden.md': strToU8('no'),
    'book/notes.txt': strToU8('ignored'),
  });
  const found = JSON.parse(sourcesOfArchive(zip));
  assert.deepEqual(
    found.files.map(file => file.name),
    ['1-start.md', '2-middle.md', '10-end.md'],
  );
  assert.equal(found.title, 'The book');
  assert.deepEqual(Object.keys(found.images), ['plan.png']);
  assert.throws(() => sourcesOfArchive(zipSync({ 'readme.txt': strToU8('x') })), /no Markdown file/);
});

test('an archive in a folder, with a missing file or a broken settings file, is still read', () => {
  const entries = unzipSync(projectArchive(JSON.stringify(project)));
  const nested = Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [`export/${name}`, bytes]));
  delete nested['export/two.md'];
  const restored = JSON.parse(sourcesOfArchive(zipSync(nested)));
  assert.deepEqual(restored.files, [project.files[0]]);
  assert.equal(restored.images['plan.png'], PNG);
  nested[`export/${SETTINGS_NAME}`] = strToU8('title: [unclosed');
  const plain = JSON.parse(sourcesOfArchive(zipSync(nested)));
  assert.deepEqual(plain.files, [project.files[0]]);
  assert.equal(plain.title, 'One');
});
