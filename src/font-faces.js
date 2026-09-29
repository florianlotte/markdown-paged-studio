// Pure helpers behind the bundled document font (see fonts.js): which @font-face rules a stylesheet declares,
// and which of them a text needs. No browser or Vite feature here, so they are unit-tested in Node.

// One entry per @font-face rule of `css`: { style, file, unicodeRange, ranges: [[from, to], ...] }.
export function parseFontFaces(css) {
  const faces = [];
  for (const [, body] of String(css).matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const style = /font-style:\s*([a-z]+)/i.exec(body)?.[1] ?? 'normal';
    const file = /url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/i.exec(body)?.[1].split('/').pop();
    const unicodeRange = /unicode-range:\s*([^;]+)/i.exec(body)?.[1].trim();
    if (!file || !unicodeRange) continue;
    faces.push({ style, file, unicodeRange, ranges: parseUnicodeRange(unicodeRange) });
  }
  return faces;
}

// "U+0460-052F, U+20B4, U+4??" as [from, to] pairs of code points.
export function parseUnicodeRange(value) {
  const ranges = [];
  for (const part of String(value).split(',')) {
    const match = /^U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?$/i.exec(part.trim());
    if (!match) continue;
    const [, first, last] = match;
    const from = parseInt(first.replace(/\?/g, '0'), 16);
    const to = parseInt(last ?? first.replace(/\?/g, 'F'), 16);
    if (from <= to) ranges.push([from, to]);
  }
  return ranges;
}

// The faces needed to draw `text`, italic ones only when `italic`. Subsets overlap (œ is in "latin" and in
// "latin-ext"): per style, the face covering the most characters is taken first, and a face is only added
// for characters no chosen face covers.
export function neededFaces(faces, text, { italic = true } = {}) {
  const points = new Set();
  for (const character of String(text)) points.add(character.codePointAt(0));
  const covers = (face, point) => face.ranges.some(([from, to]) => point >= from && point <= to);
  const chosen = [];
  for (const style of new Set(faces.map(face => face.style))) {
    if (style === 'italic' && !italic) continue;
    const candidates = faces.filter(face => face.style === style);
    let remaining = [...points].filter(point => candidates.some(face => covers(face, point)));
    while (remaining.length) {
      const count = face => remaining.filter(point => covers(face, point)).length;
      const best = candidates.reduce((a, b) => (count(b) > count(a) ? b : a));
      chosen.push(best);
      remaining = remaining.filter(point => !covers(best, point));
    }
  }
  // In the order of the stylesheet, whatever the order of selection.
  return faces.filter(face => chosen.includes(face));
}
