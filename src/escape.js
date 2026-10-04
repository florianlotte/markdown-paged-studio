// Escaping helpers for the two injection points of user strings: CSS `content: "…"` and HTML.

export function escCssString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ');
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
