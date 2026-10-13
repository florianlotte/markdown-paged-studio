// Unit tests of the HTML tags in Mermaid labels: marks for bold and italic, the other tags dropped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARKS, markLabels, stripMarks } from '../src/diagram-labels.js';

const { boldOpen: B, boldClose: b, italicOpen: I, italicClose: i } = MARKS;

test('bold and italic tags become marks glued to the words', () => {
  assert.equal(markLabels('A[<b>Bold</b> plain]'), `A[${B}Bold${b} plain]`);
  assert.equal(markLabels('A[<strong>Bold</strong> <em>soft</em>]'), `A[${B}Bold${b} ${I}soft${i}]`);
  assert.equal(markLabels('A[<I>Soft</I>]'), `A[${I}Soft${i}]`);
  assert.equal(markLabels('A[<b><i>both</i></b>]'), `A[${B}${I}both${i}${b}]`);
  assert.equal(markLabels('A[<b>one</b> and <b>two</b>]'), `A[${B}one${b} and ${B}two${b}]`);
});

test('a line break inside a pair closes and reopens the marks', () => {
  assert.equal(markLabels('A[<b>first<br>second</b>]'), `A[${B}first${b}<br>${B}second${b}]`);
  assert.equal(markLabels('A[<b>first<br/></b>]'), `A[${B}first${b}<br/>]`);
});

test('the other tags are dropped and their text kept', () => {
  assert.equal(markLabels('A[<u>under</u> <span class="x">in</span> <font color=red>red</font>]'), 'A[under in red]');
  assert.equal(markLabels('A[<b>unclosed]'), 'A[unclosed]');
  assert.equal(markLabels('A[closed</b>]'), 'A[closed]');
  assert.equal(markLabels('A[<sub>2</sub><br/>next]'), 'A[2<br/>next]');
});

test('arrows, comparisons and entities are not tags', () => {
  const source = 'flowchart LR\n  A --> B\n  A <--> C\n  D[x < y and y > z]\n  E[&lt;b&gt;]';
  assert.equal(markLabels(source), source);
  assert.equal(
    markLabels('sequenceDiagram\n  Alice->>Bob: <b>Hi</b> there'),
    `sequenceDiagram\n  Alice->>Bob: ${B}Hi${b} there`,
  );
});

test('marks typed in the source are removed, and stripMarks removes them all', () => {
  assert.equal(markLabels(`A[${B}x${b} <b>y</b>]`), `A[x ${B}y${b}]`);
  assert.equal(stripMarks(`${B}${I}x${i}${b}`), 'x');
});
