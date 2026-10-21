// Formulas for Word: the MathML that KaTeX writes for a formula becomes Office Math (OMML), the native
// equations of Word, which stay editable there. Pure: a MathML element in (any DOM), an XML string out.
// Only the constructs KaTeX produces are mapped; anything unknown passes its children through, so a
// formula is never lost, at worst flattened.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escapeXml = text => String(text).replace(/[&<>]/g, character => ESCAPES[character]);

// Big operators drawn with their limits by Word's n-ary object.
const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '∯', '∰', '⋃', '⋂', '⨆', '⨁', '⨂', '⨀', '⋁', '⋀']);
// Accents: the character KaTeX writes over the base, and the combining character Word expects.
const ACCENTS = {
  '^': '̂',
  ˆ: '̂',
  '~': '̃',
  '˜': '̃',
  '→': '⃗',
  '⃗': '⃗',
  '˙': '̇',
  '.': '̇',
  '¨': '̈',
  '˘': '̆',
  ˇ: '̌',
  '´': '́',
  '`': '̀',
  '⏞': '⏞',
};
const BARS = new Set(['¯', 'ˉ', '‾', '―', '_', '̄']);
const OPENERS = new Set(['(', '[', '{', '⟨', '|', '‖', '⌊', '⌈', '⟦', '⟮', '⟪']);
const CLOSERS = new Set([')', ']', '}', '⟩', '|', '‖', '⌋', '⌉', '⟧', '⟯', '⟫']);

const ELEMENT = 1;
const TEXT = 3;
const elements = node => [...node.childNodes].filter(child => child.nodeType === ELEMENT);
const name = node => (node.localName || node.nodeName || '').toLowerCase();
const attribute = (node, key) => node.getAttribute?.(key) ?? null;
const text = node => (node.textContent ?? '').replace(/\s+/g, ' ');

const run = (content, properties = '') =>
  content === '' ? '' : `<m:r>${properties}<m:t xml:space="preserve">${escapeXml(content)}</m:t></m:r>`;
const element = (tag, inner) => `<m:${tag}>${inner}</m:${tag}>`;
const chr = (tag, value) => `<m:${tag} m:val="${escapeXml(value)}"/>`;

// The run properties of a token: upright for text and named functions, bold when asked.
function runProperties(node) {
  const variant = attribute(node, 'mathvariant') ?? '';
  const upright = name(node) === 'mtext' || name(node) === 'ms' || variant === 'normal' || text(node).trim().length > 1;
  const bold = variant.includes('bold');
  const styles = [];
  if (name(node) === 'mtext') styles.push('<m:nor/>');
  else if (upright && bold) styles.push('<m:sty m:val="b"/>');
  else if (upright) styles.push('<m:sty m:val="p"/>');
  else if (bold) styles.push('<m:sty m:val="bi"/>');
  return styles.length ? `<m:rPr>${styles.join('')}</m:rPr>` : '';
}

function isFence(node, set) {
  if (name(node) !== 'mo') return false;
  const content = text(node).trim();
  return attribute(node, 'fence') === 'true' || set.has(content);
}

// A row of children: fences become delimiters, big operators take the rest of the row as their body.
function row(nodes) {
  const children = nodes.filter(
    node => node.nodeType === ELEMENT || (node.nodeType === TEXT && node.textContent.trim()),
  );
  let out = '';
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if (node.nodeType === TEXT) {
      out += run(node.textContent.trim());
      continue;
    }
    const base = naryBase(node);
    if (base) {
      // KaTeX writes the summand after the operator: Word wants it inside the n-ary object.
      out += nary(node, base, row(children.slice(index + 1)));
      break;
    }
    if (isFence(node, OPENERS) && index === 0 && children.length > 1 && isFence(children.at(-1), CLOSERS)) {
      const open = text(node).trim();
      const close = text(children.at(-1)).trim();
      const inner = row(children.slice(1, -1));
      out += `<m:d><m:dPr>${chr('begChr', open)}${chr('endChr', close)}</m:dPr>${element('e', inner)}</m:d>`;
      break;
    }
    out += convert(node);
  }
  return out;
}

// The big operator of a scripted node (munderover, munder, mover, msubsup, msub, msup), if its base is one.
function naryBase(node) {
  if (!['munderover', 'munder', 'mover', 'msubsup', 'msub', 'msup'].includes(name(node))) return null;
  const [base] = elements(node);
  if (!base || name(base) !== 'mo') return null;
  const operator = text(base).trim();
  return NARY.has(operator) ? operator : null;
}

function nary(node, operator, body) {
  const kind = name(node);
  const [, first, second] = elements(node);
  const limits = kind === 'munderover' || kind === 'munder' || kind === 'mover';
  const sub = kind === 'munderover' || kind === 'munder' || kind === 'msubsup' || kind === 'msub' ? first : null;
  const sup = kind === 'munderover' || kind === 'msubsup' ? second : kind === 'mover' || kind === 'msup' ? first : null;
  const properties = [
    chr('chr', operator),
    chr('limLoc', limits ? 'undOvr' : 'subSup'),
    sub ? '' : '<m:subHide m:val="1"/>',
    sup ? '' : '<m:supHide m:val="1"/>',
  ].join('');
  return `<m:nary><m:naryPr>${properties}</m:naryPr>${element('sub', sub ? convert(sub) : '')}${element('sup', sup ? convert(sup) : '')}${element('e', body)}</m:nary>`;
}

function script(tag, parts) {
  return `<m:${tag}>${parts.map(([inner, node]) => element(inner, node ? convert(node) : '')).join('')}</m:${tag}>`;
}

// The OMML of one MathML node.
function convert(node) {
  const [first, second, third] = elements(node);
  switch (name(node)) {
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'menclose':
    case 'merror':
    case 'mtd':
      return row([...node.childNodes]);
    case 'semantics':
      return first ? convert(first) : '';
    case 'annotation':
    case 'annotation-xml':
      return '';
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
    case 'ms':
      return run(text(node), runProperties(node));
    case 'mspace': {
      const width = parseFloat(attribute(node, 'width') ?? '0');
      return width > 0 ? run(' ') : '';
    }
    case 'mfrac': {
      const bar = /^0(\.0+)?(px|pt|em|ex|%)?$/.test(attribute(node, 'linethickness') ?? '');
      return `<m:f>${bar ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''}${element('num', first ? convert(first) : '')}${element('den', second ? convert(second) : '')}</m:f>`;
    }
    case 'msup':
      return script('sSup', [
        ['e', first],
        ['sup', second],
      ]);
    case 'msub':
      return script('sSub', [
        ['e', first],
        ['sub', second],
      ]);
    case 'msubsup':
      return script('sSubSup', [
        ['e', first],
        ['sub', second],
        ['sup', third],
      ]);
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${element('e', row([...node.childNodes]))}</m:rad>`;
    case 'mroot':
      return `<m:rad>${element('deg', second ? convert(second) : '')}${element('e', first ? convert(first) : '')}</m:rad>`;
    case 'mover': {
      const over = second ? text(second).trim() : '';
      if (second && BARS.has(over))
        return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${element('e', convert(first))}</m:bar>`;
      if (second && (attribute(node, 'accent') === 'true' || ACCENTS[over]))
        return `<m:acc><m:accPr>${chr('chr', ACCENTS[over] ?? over)}</m:accPr>${element('e', convert(first))}</m:acc>`;
      return `<m:limUpp>${element('e', first ? convert(first) : '')}${element('lim', second ? convert(second) : '')}</m:limUpp>`;
    }
    case 'munder': {
      const under = second ? text(second).trim() : '';
      if (second && BARS.has(under))
        return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>${element('e', convert(first))}</m:bar>`;
      return `<m:limLow>${element('e', first ? convert(first) : '')}${element('lim', second ? convert(second) : '')}</m:limLow>`;
    }
    case 'munderover':
      return `<m:limUpp>${element('e', `<m:limLow>${element('e', first ? convert(first) : '')}${element('lim', second ? convert(second) : '')}</m:limLow>`)}${element('lim', third ? convert(third) : '')}</m:limUpp>`;
    case 'mphantom':
      return `<m:phant>${element('e', row([...node.childNodes]))}</m:phant>`;
    case 'mtable':
      return matrix(node);
    case 'mtr':
    case 'mlabeledtr':
      return `<m:mr>${elements(node)
        .map(cell => element('e', convert(cell)))
        .join('')}</m:mr>`;
    default:
      return row([...node.childNodes]);
  }
}

function matrix(node) {
  const rows = elements(node).filter(child => name(child) === 'mtr' || name(child) === 'mlabeledtr');
  const columns = Math.max(1, ...rows.map(mtr => elements(mtr).length));
  const aligns = (attribute(node, 'columnalign') ?? '').trim().split(/\s+/).filter(Boolean);
  const justification = { left: 'left', right: 'right', center: 'center' }[aligns[0]] ?? 'center';
  const properties = `<m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="${columns}"/><m:mcJc m:val="${justification}"/></m:mcPr></m:mc></m:mcs></m:mPr>`;
  // Every row holds the same number of cells, or Word refuses the matrix.
  const body = rows
    .map(mtr => {
      const cells = elements(mtr).map(cell => element('e', convert(cell)));
      while (cells.length < columns) cells.push('<m:e/>');
      return `<m:mr>${cells.join('')}</m:mr>`;
    })
    .join('');
  return `<m:m>${properties}${body}</m:m>`;
}

// The Office Math of a MathML `<math>` element (or any node of one): inline (`<m:oMath>`), or as a
// paragraph of its own, centred (`<m:oMathPara>`), when `block` is set.
export function ommlOf(math, { block = false } = {}) {
  const inner = convert(math);
  const oMath = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath>`;
  if (!block) return oMath;
  return `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>${oMath}</m:oMathPara>`;
}
