// Unit tests of the MathML to Office Math conversion. Node has no DOM: a small parser gives the converter
// the nodes it reads (localName, childNodes, getAttribute, textContent).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ommlOf } from '../src/mathml-omml.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = text =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity) =>
    entity[0] === '#'
      ? String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
      : (ENTITIES[entity] ?? `&${entity};`),
  );

class Node {
  constructor(nodeType, name, attributes = {}) {
    this.nodeType = nodeType;
    this.localName = name;
    this.attributes = attributes;
    this.childNodes = [];
    this.data = '';
  }
  getAttribute(key) {
    return this.attributes[key] ?? null;
  }
  get textContent() {
    return this.nodeType === 3 ? this.data : this.childNodes.map(child => child.textContent).join('');
  }
}

// Elements, attributes and text; enough for MathML.
function parseXml(source) {
  const root = new Node(1, '#root');
  const stack = [root];
  const token = /<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  for (const [, close, open, attributes, selfClosing, text] of source.matchAll(token)) {
    const parent = stack.at(-1);
    if (close) stack.pop();
    else if (open) {
      const node = new Node(
        1,
        open,
        Object.fromEntries([...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])])),
      );
      parent.childNodes.push(node);
      if (!selfClosing) stack.push(node);
    } else if (text) {
      const node = new Node(3, '#text');
      node.data = decode(text);
      parent.childNodes.push(node);
    }
  }
  return root.childNodes[0];
}

const omml = (mathml, options) => ommlOf(parseXml(`<math>${mathml}</math>`), options);
const run = text => `<m:r><m:t xml:space="preserve">${text}</m:t></m:r>`;

test('tokens become runs: variables italic, numbers and operators as they are, functions and text upright', () => {
  assert.equal(
    omml('<mi>x</mi><mo>+</mo><mn>1</mn>'),
    `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${run('x')}${run('+')}${run('1')}</m:oMath>`,
  );
  assert.match(
    omml('<mi>sin</mi>'),
    /<m:r><m:rPr><m:sty m:val="p"\/><\/m:rPr><m:t xml:space="preserve">sin<\/m:t><\/m:r>/,
  );
  assert.match(omml('<mi mathvariant="normal">d</mi>'), /<m:sty m:val="p"\/>/);
  assert.match(omml('<mi mathvariant="bold">v</mi>'), /<m:sty m:val="bi"\/>/);
  assert.match(omml('<mtext>if </mtext>'), /<m:nor\/><\/m:rPr><m:t xml:space="preserve">if <\/m:t>/);
  assert.match(omml('<mi>a</mi><mo>&lt;</mo><mi>b</mi>'), /<m:t xml:space="preserve">&lt;<\/m:t>/);
});

test('fractions, scripts and radicals map to their Office Math objects', () => {
  assert.equal(
    omml('<mfrac><mi>a</mi><mi>b</mi></mfrac>').replace(/<m:oMath[^>]*>|<\/m:oMath>/g, ''),
    `<m:f><m:num>${run('a')}</m:num><m:den>${run('b')}</m:den></m:f>`,
  );
  assert.match(
    omml('<mfrac linethickness="0px"><mi>n</mi><mi>k</mi></mfrac>'),
    /<m:fPr><m:type m:val="noBar"\/><\/m:fPr>/,
  );
  assert.match(omml('<msup><mi>x</mi><mn>2</mn></msup>'), /<m:sSup><m:e>.*<\/m:e><m:sup>.*2.*<\/m:sup><\/m:sSup>/);
  assert.match(omml('<msub><mi>x</mi><mi>i</mi></msub>'), /<m:sSub>/);
  assert.match(omml('<msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup>'), /<m:sSubSup><m:e>.*<m:sub>.*<m:sup>/);
  assert.match(
    omml('<msqrt><mi>x</mi></msqrt>'),
    /<m:rad><m:radPr><m:degHide m:val="1"\/><\/m:radPr><m:deg\/><m:e>.*x.*<\/m:e><\/m:rad>/,
  );
  assert.match(omml('<mroot><mi>x</mi><mn>3</mn></mroot>'), /<m:rad><m:deg>.*3.*<\/m:deg><m:e>.*x.*<\/m:e><\/m:rad>/);
});

test('big operators take the rest of the row as their body, with their limits', () => {
  const sum = omml(
    '<mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mi>i</mi></msub></mrow>',
  );
  assert.match(
    sum,
    /<m:nary><m:naryPr><m:chr m:val="∑"\/><m:limLoc m:val="undOvr"\/><\/m:naryPr><m:sub>.*i.*=.*1.*<\/m:sub><m:sup>.*n.*<\/m:sup><m:e><m:sSub>.*<\/m:e><\/m:nary>/,
  );
  const integral = omml('<mrow><msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup><mi>f</mi></mrow>');
  assert.match(integral, /<m:chr m:val="∫"\/><m:limLoc m:val="subSup"\/>/);
  assert.match(omml('<mrow><mo>∑</mo><mi>x</mi></mrow>'), /∑/);
});

test('fences become delimiters, matrices become matrices, accents and bars their objects', () => {
  const fenced = omml('<mrow><mo fence="true">(</mo><mi>a</mi><mo fence="true">)</mo></mrow>');
  assert.match(fenced, /<m:d><m:dPr><m:begChr m:val="\("\/><m:endChr m:val="\)"\/><\/m:dPr><m:e>.*a.*<\/m:e><\/m:d>/);
  const cases = omml(
    '<mrow><mo fence="true">{</mo><mtable columnalign="left left"><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd></mtr></mtable><mo fence="true"></mo></mrow>',
  );
  assert.match(cases, /<m:begChr m:val="\{"\/><m:endChr m:val=""\/>/);
  assert.match(cases, /<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="2"\/><m:mcJc m:val="left"\/>/);
  assert.match(cases, /<m:mr><m:e>.*c.*<\/m:e><m:e\/><\/m:mr>/);
  assert.match(
    omml('<mover accent="true"><mi>x</mi><mo>^</mo></mover>'),
    /<m:acc><m:accPr><m:chr m:val="̂"\/><\/m:accPr><m:e>.*x.*<\/m:e><\/m:acc>/,
  );
  assert.match(omml('<mover accent="true"><mi>x</mi><mo>¯</mo></mover>'), /<m:bar><m:barPr><m:pos m:val="top"\/>/);
  assert.match(
    omml('<munder><mo>lim</mo><mrow><mi>x</mi><mo>→</mo><mn>0</mn></mrow></munder>'),
    /<m:limLow><m:e>.*lim.*<\/m:e><m:lim>/,
  );
});

test('a block formula is a paragraph of its own; unknown nodes pass their children through', () => {
  assert.match(
    omml('<mi>x</mi>', { block: true }),
    /^<m:oMathPara [^>]*><m:oMathParaPr><m:jc m:val="center"\/><\/m:oMathParaPr><m:oMath[^>]*>.*<\/m:oMath><\/m:oMathPara>$/,
  );
  assert.equal(
    omml('<semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x</annotation></semantics>'),
    omml('<mi>x</mi>'),
  );
  assert.match(
    omml('<mstyle displaystyle="true"><mspace width="1em"/><mi>y</mi></mstyle>'),
    /<m:t xml:space="preserve"> <\/m:t>.*y/,
  );
  assert.match(omml('<mphantom><mi>x</mi></mphantom>'), /<m:phant><m:e>/);
  assert.match(omml('<mfenced><mi>z</mi></mfenced>'), /z/);
});
