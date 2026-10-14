// Escaping helpers for the two injection points of user strings: CSS `content: "…"` and HTML.

export function escCssString(value) {
  return (
    String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      // The string also travels inside a <style> element: a "<" is written as its CSS escape (`\3c `).
      .replace(/</g, '\\3c ')
      // A line break of any kind would end the string, and the margin box with it.
      .replace(/[\n\r\f]/g, ' ')
  );
}

// A well-formed CSS string from one Paged.js may have left open: it writes its `string-set` values in the
// inline style of each page as `"text` without the closing quote. The live DOM tolerates it; a copy of the
// page parsed again (the SVG image of the drawn PDF) does not always.
export function closeCssString(value) {
  let text = String(value ?? '').trim();
  if (text.startsWith('"')) text = text.slice(1);
  if (text.endsWith('"') && !/(^|[^\\])(\\\\)*\\"$/.test(text)) text = text.slice(0, -1);
  return `"${text}"`;
}

// The text of an escaped value, as escapeHtml() wrote it.
export function unescapeHtml(value) {
  return String(value ?? '').replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name],
  );
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
