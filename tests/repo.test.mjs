// Checks on the repository itself: the changelog follows the version, and the release notes can be cut out.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const notes = wanted =>
  execFileSync(process.execPath, ['scripts/release-notes.mjs', wanted], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

test('the changelog has a dated section and a link for the current version', () => {
  const escaped = version.replaceAll('.', '\\.');
  assert.match(changelog, new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'));
  assert.match(changelog, new RegExp(`^\\[${escaped}\\]: https://github.com/.+/compare/v.+\\.\\.\\.v${escaped}$`, 'm'));
  // The newest released version comes first.
  assert.equal(/^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1], version);
});

test('the release notes are the section of the requested version', () => {
  const text = notes('v1.9.0');
  assert.match(text, /^### Changed/);
  assert.match(text, /Links of the preview open in a new tab/);
  assert.doesNotMatch(text, /## \[/);
  assert.doesNotMatch(text, /Every image can be sized/);
  assert.equal(notes('1.9.0'), text);
  // An unknown version gives empty notes rather than an error: the release is still published.
  assert.equal(notes('v0.0.1').trim(), '');
});
