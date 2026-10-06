import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  anchorId,
  captionLabel,
  headingAttributes,
  headingCounter,
  parseLabel,
  parseReference,
  referenceText,
  trailingLabel,
} from '../src/crossref.js';

test('a label is one word: # then the kind, a colon and a name', () => {
  assert.deepEqual(parseLabel('#fig:plan'), { kind: 'fig', name: 'plan' });
  assert.deepEqual(parseLabel('#tab:costs-2026'), { kind: 'tab', name: 'costs-2026' });
  assert.deepEqual(parseLabel('#eq:énergie_1.b'), { kind: 'eq', name: 'énergie_1.b' });
  for (const word of [
    'fig:plan',
    '#fig:',
    '#fig:plan.',
    '#fig:-a',
    '#img:plan',
    '#fig:a b',
    'width=50%',
    '',
    undefined,
  ])
    assert.equal(parseLabel(word), null, String(word));
  assert.equal(anchorId('fig', 'Plan'), 'fig-plan');
  assert.equal(anchorId('sec', 'intro'), 'sec-intro');
});

test('a caption or a formula ends with its label in braces', () => {
  assert.deepEqual(trailingLabel('Costs per year {#tab:costs}', 'tab'), { text: 'Costs per year', name: 'costs' });
  assert.deepEqual(trailingLabel('{#eq:energy}', 'eq'), { text: '', name: 'energy' });
  assert.equal(trailingLabel('Costs per year {#fig:costs}', 'tab'), null);
  assert.equal(trailingLabel('Costs {a} per year', 'tab'), null);
  assert.equal(trailingLabel('Costs per year', 'tab'), null);
});

test('a heading may end with an id and the unnumbered mark', () => {
  assert.deepEqual(headingAttributes('Introduction {#sec:intro}'), {
    text: 'Introduction',
    name: 'intro',
    unnumbered: false,
  });
  assert.deepEqual(headingAttributes('Introduction {#intro}'), {
    text: 'Introduction',
    name: 'intro',
    unnumbered: false,
  });
  assert.deepEqual(headingAttributes('Preface {-}'), { text: 'Preface', name: null, unnumbered: true });
  assert.deepEqual(headingAttributes('Preface {.unnumbered #preface}'), {
    text: 'Preface',
    name: 'preface',
    unnumbered: true,
  });
  // Anything else in the braces is text of the heading.
  for (const text of ['Set {a, b}', 'Title {#fig:x}', 'Title {.other}', 'Title {}', 'Title', 'A {#a} B'])
    assert.equal(headingAttributes(text), null, text);
});

test('a reference is @ and a label, capitalised to open a sentence, with - for the number alone', () => {
  assert.deepEqual(parseReference('@fig:plan and more'), {
    length: 9,
    kind: 'fig',
    name: 'plan',
    capital: false,
    bare: false,
  });
  assert.deepEqual(parseReference('@Tab:costs.'), {
    length: 10,
    kind: 'tab',
    name: 'costs',
    capital: true,
    bare: false,
  });
  assert.deepEqual(parseReference('-@eq:e1, then'), { length: 7, kind: 'eq', name: 'e1', capital: false, bare: true });
  for (const text of ['@john', '@fig', '@fig:', '@FIG:plan', '@figure:plan', 'fig:plan', '@ fig:plan', '--@fig:plan'])
    assert.equal(parseReference(text), null, text);
});

test('headings are counted from the first or from the second level', () => {
  const all = headingCounter('h1');
  assert.deepEqual([1, 2, 2, 3, 1, 2, 4, 2].map(all), ['1', '1.1', '1.2', '1.2.1', '2', '2.1', '2.1.0.1', '2.2']);
  const below = headingCounter('h2');
  // The first level is the title: no number, and the chapters after it keep counting.
  assert.deepEqual([1, 2, 3, 2, 1, 2].map(below), [null, '1', '1.1', '2', null, '3']);
  assert.equal(headingCounter('none')(1), null);
  assert.equal(headingCounter(undefined)(2), null);
});

test('the words around a number follow the language of the document', () => {
  assert.equal(captionLabel('fig', 3, 'en'), 'Figure 3: ');
  assert.equal(captionLabel('tab', 1, 'fr-CA'), 'Tableau 1\u00a0– ');
  assert.equal(captionLabel('fig', 2, 'de'), 'Abbildung 2: ');
  assert.equal(captionLabel('fig', 2, 'ja'), 'Figure 2: ');
  assert.equal(captionLabel('fig', 2, 'en', { alone: true }), 'Figure 2');
  assert.equal(referenceText('fig', 3, 'en'), 'figure\u00a03');
  assert.equal(referenceText('fig', 3, 'en', { capital: true }), 'Figure\u00a03');
  assert.equal(referenceText('tab', 2, 'fr'), 'tableau\u00a02');
  assert.equal(referenceText('eq', '(4)', 'fr'), 'équation\u00a0(4)');
  // German nouns keep their capital.
  assert.equal(referenceText('fig', 3, 'de'), 'Abbildung\u00a03');
  assert.equal(referenceText('sec', '1.2', 'pt-BR', { capital: true }), 'Seção\u00a01.2');
  assert.equal(referenceText('sec', '1.2', 'pt'), 'secção\u00a01.2');
  assert.equal(referenceText('fig', 3, 'en', { bare: true }), '3');
});
