// The Markdown files of a document. A document is written as one or several files (chapters) kept in order;
// the document that is rendered and exported is their assembly, one after the other. Everything that works
// by line number (the tools of the preview, the scroll synchronisation) works on the assembled text: this
// module maps its lines back to the files. Pure functions, shared with the tests.

export const DEFAULT_FILE_NAME = 'document.md';
export const FILE_LIMIT = 200;
const NAME_LIMIT = 120;
// Files are separated by one empty line, so the last block of a file never merges with the next file.
const SEPARATOR = '\n\n';

// Characters a file name cannot hold on every system: control characters and the reserved punctuation.
// eslint-disable-next-line no-control-regex
const RESERVED = /[\0-\x1f<>:"|?*]+/g;

const lf = text => text.replace(/\r\n?/g, '\n');

export const lineCount = text => text.split('\n').length;

// A file name that is safe in an archive and unique among `taken`: no path, no reserved character, a
// Markdown extension, and a numeric suffix when the name is already used.
export function fileName(wanted, taken = []) {
  const base = String(wanted ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(RESERVED, ' ')
    .trim()
    .slice(0, NAME_LIMIT);
  const stem = base.replace(/\.(md|markdown|txt)$/i, '').trim() || DEFAULT_FILE_NAME.replace(/\.md$/, '');
  const used = new Set(taken.map(name => name.toLowerCase()));
  let name = `${stem}.md`;
  for (let rank = 2; used.has(name.toLowerCase()); rank++) name = `${stem}-${rank}.md`;
  return name;
}

// The files of a configuration: a list of { name, markdown } with unique names; anything else is dropped.
export function sanitizeFiles(input) {
  if (!Array.isArray(input)) return [];
  const files = [];
  for (const entry of input.slice(0, FILE_LIMIT)) {
    if (!entry || typeof entry !== 'object' || typeof entry.markdown !== 'string') continue;
    const name = fileName(
      entry.name,
      files.map(file => file.name),
    );
    files.push({ name, markdown: lf(entry.markdown) });
  }
  return files;
}

// The document: the files one after the other.
export function assembleFiles(files) {
  return files.map(file => file.markdown).join(SEPARATOR);
}

// First line of each file in the assembled document (lines count from 0).
export function fileOffsets(files) {
  const offsets = [];
  let line = 0;
  for (const file of files) {
    offsets.push(line);
    line += lineCount(file.markdown) + 1;
  }
  return offsets;
}

// The file that holds a line of the assembled document, and the line inside that file. The empty line
// between two files belongs to the end of the first one.
export function locateLine(files, line) {
  const offsets = fileOffsets(files);
  let index = 0;
  while (index + 1 < offsets.length && offsets[index + 1] <= line) index++;
  const last = lineCount(files[index]?.markdown ?? '') - 1;
  return { index, line: Math.max(0, Math.min(line - (offsets[index] ?? 0), last)) };
}

// The assembled text cut back into files of the given line counts, or null when it does not have that
// shape (the text was edited outside the studio).
export function splitAssembled(text, counts) {
  const lines = lf(text).split('\n');
  const expected = counts.reduce((sum, count) => sum + count, 0) + Math.max(0, counts.length - 1);
  if (!counts.length || counts.some(count => !Number.isInteger(count) || count < 1) || lines.length !== expected)
    return null;
  const parts = [];
  let line = 0;
  for (const [index, count] of counts.entries()) {
    parts.push(lines.slice(line, line + count).join('\n'));
    line += count;
    if (index + 1 < counts.length && lines[line++] !== '') return null;
  }
  return parts;
}

// An edit of the assembled document brought back to the file it changed: { index, markdown } with the new
// text of that file, or null when nothing changed. An edit that spans several files (never made by the
// studio) cannot be attributed: the result is then { index: -1 }.
export function applyAssembledEdit(files, next) {
  const before = assembleFiles(files).split('\n');
  const after = lf(next).split('\n');
  const limit = Math.min(before.length, after.length);
  let head = 0;
  while (head < limit && before[head] === after[head]) head++;
  if (head === before.length && head === after.length) return null;
  let tail = 0;
  while (tail < limit - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const end = before.length - tail; // first unchanged line after the edit, in the old text
  const offsets = fileOffsets(files);
  for (const [index, file] of files.entries()) {
    const start = offsets[index];
    const count = lineCount(file.markdown);
    if (head < start || end > start + count) continue;
    const grown = count + after.length - before.length;
    if (grown < 1) break;
    return { index, markdown: after.slice(start, start + grown).join('\n') };
  }
  return { index: -1 };
}
