import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyAssembledEdit,
  assembleFiles,
  fileName,
  fileOffsets,
  locateLine,
  sanitizeFiles,
  splitAssembled,
} from '../src/files.js';

const files = [
  { name: 'intro.md', markdown: '# Intro\n\nFirst.\n' },
  { name: 'body.md', markdown: '# Body\n\nSecond.' },
  { name: 'end.md', markdown: '# End\n' },
];

test('the document is the files one after the other, separated by an empty line', () => {
  const text = assembleFiles(files);
  assert.equal(text, '# Intro\n\nFirst.\n\n\n# Body\n\nSecond.\n\n# End\n');
  assert.deepEqual(fileOffsets(files), [0, 5, 9]);
  const lines = text.split('\n');
  assert.equal(lines[5], '# Body');
  assert.equal(lines[9], '# End');
  assert.equal(assembleFiles([{ name: 'one.md', markdown: 'alone' }]), 'alone');
});

test('a line of the document is found in its file', () => {
  assert.deepEqual(locateLine(files, 0), { index: 0, line: 0 });
  assert.deepEqual(locateLine(files, 2), { index: 0, line: 2 });
  // The separator belongs to the end of the file before it.
  assert.deepEqual(locateLine(files, 4), { index: 0, line: 3 });
  assert.deepEqual(locateLine(files, 5), { index: 1, line: 0 });
  assert.deepEqual(locateLine(files, 7), { index: 1, line: 2 });
  assert.deepEqual(locateLine(files, 9), { index: 2, line: 0 });
  assert.deepEqual(locateLine(files, 99), { index: 2, line: 1 });
});

test('the assembled text splits back into files of known line counts', () => {
  const counts = files.map(file => file.markdown.split('\n').length);
  assert.deepEqual(
    splitAssembled(assembleFiles(files), counts),
    files.map(file => file.markdown),
  );
  assert.deepEqual(splitAssembled('a\r\nb', [2]), ['a\nb']);
  // Edited elsewhere: the shape no longer matches.
  assert.equal(splitAssembled(`${assembleFiles(files)}\nmore`, counts), null);
  assert.equal(splitAssembled('a\nb\nc', [1, 1]), null);
  assert.equal(splitAssembled('a', []), null);
  assert.equal(splitAssembled('a', [0]), null);
});

test('an edit of the document goes back to the file it changed', () => {
  const text = assembleFiles(files);
  assert.equal(applyAssembledEdit(files, text), null);
  // A line rewritten in the second file.
  assert.deepEqual(applyAssembledEdit(files, text.replace('Second.', 'Second, edited.')), {
    index: 1,
    markdown: '# Body\n\nSecond, edited.',
  });
  // Lines added in the first file, removed from the last one.
  assert.deepEqual(applyAssembledEdit(files, text.replace('First.', 'First.\n\nMore.')), {
    index: 0,
    markdown: '# Intro\n\nFirst.\n\nMore.\n',
  });
  assert.deepEqual(applyAssembledEdit(files, text.replace('# End\n', '# End')), { index: 2, markdown: '# End' });
  // Identical lines around the edit do not move it to another file.
  const twins = [
    { name: 'a.md', markdown: 'same\nsame' },
    { name: 'b.md', markdown: 'same\nsame' },
  ];
  assert.deepEqual(applyAssembledEdit(twins, 'same\nsame\n\nsame\nchanged'), { index: 1, markdown: 'same\nchanged' });
  // Across two files: no single file can take it.
  assert.deepEqual(applyAssembledEdit(files, text.replace('First.\n\n\n# Body', 'Merged')), { index: -1 });
});

test('file names are safe, Markdown and unique', () => {
  assert.equal(fileName('notes.md'), 'notes.md');
  assert.equal(fileName('C:\\docs\\Chapter 1.MARKDOWN'), 'Chapter 1.md');
  assert.equal(fileName('../../etc/passwd'), 'passwd.md');
  assert.equal(fileName('a<b>:c?.txt'), 'a b c.md');
  assert.equal(fileName(''), 'document.md');
  assert.equal(fileName(undefined), 'document.md');
  assert.equal(fileName('notes.md', ['Notes.md']), 'notes-2.md');
  assert.equal(fileName('notes', ['notes.md', 'notes-2.md']), 'notes-3.md');
});

test('the files of a configuration are validated', () => {
  assert.deepEqual(sanitizeFiles('nope'), []);
  assert.deepEqual(
    sanitizeFiles([
      { name: 'a.md', markdown: 'one\r\ntwo' },
      { name: 'a.md', markdown: 'again' },
      { name: 5, markdown: 'named by default' },
      { name: 'skipped.md', markdown: 42 },
      null,
    ]),
    [
      { name: 'a.md', markdown: 'one\ntwo' },
      { name: 'a-2.md', markdown: 'again' },
      { name: '5.md', markdown: 'named by default' },
    ],
  );
});
