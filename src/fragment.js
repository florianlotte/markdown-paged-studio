// The rendered HTML as a <template>, whose content is inert (images are not decoded): the passes that edit
// the HTML after markdown-it (diagrams, code colours) work on it and it is serialised once, in documentHtml().
// Each pass also accepts a string, and then returns one.

export function fragmentOf(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
}
export const rootOf = html => (typeof html === 'string' ? fragmentOf(html) : html);
export const outputOf = (html, root) => (typeof html === 'string' ? root.innerHTML : root);
