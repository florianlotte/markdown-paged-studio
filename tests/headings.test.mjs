import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headingAt, headingMatches, headingsOf } from '../src/headings.js';

const SOURCE =
  '# One {#sec:one}\n\nText\n\n## *Two* `code` @sec:one\n\n```md\n# not a heading\n```\n\nSetext\n======\n\n### Élan\n';

test('headingsOf lists the headings with their level, text, line and number, fences skipped', () => {
  const headings = headingsOf(SOURCE, { numberHeadings: 'h1' });
  assert.deepEqual(
    headings.map(({ level, text, number, line }) => ({ level, text, number, line })),
    [
      { level: 1, text: 'One', number: '1', line: 0 },
      { level: 2, text: 'Two code', number: '1.1', line: 4 },
      { level: 1, text: 'Setext', number: '2', line: 10 },
      { level: 3, text: 'Élan', number: '2.0.1', line: 13 },
    ],
  );
  assert.equal(headings[0].id, 'sec-one');
  assert.equal(headingsOf(SOURCE)[1].number, null);
  assert.deepEqual(headingsOf(''), []);
});

test('headingMatches ignores case and accents and wants every word', () => {
  const [one, two] = headingsOf(SOURCE, { numberHeadings: 'h1' });
  const elan = headingsOf(SOURCE).at(-1);
  assert.ok(headingMatches(elan, 'elan'));
  assert.ok(headingMatches(two, '1.1 TWO'));
  assert.ok(headingMatches(one, '   '));
  assert.ok(!headingMatches(one, 'two'));
});

test('headingAt gives the heading that holds a line', () => {
  const headings = headingsOf(SOURCE);
  assert.equal(headingAt(headings, 0).text, 'One');
  assert.equal(headingAt(headings, 6).text, 'Two code');
  assert.equal(headingAt(headings, 99).text, 'Élan');
  assert.equal(headingAt([], 3), null);
});
