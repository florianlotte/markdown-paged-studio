// Syntax highlighting of the code blocks, a pass after markdown-it like the diagrams: highlight.js is
// loaded on first use, the colours of each theme live in documentCss().
import { outputOf, rootOf } from './fragment.js';
import { lazy } from './util.js';

// ---- Syntax highlighting of code blocks

// Loaded the first time a document holds a code block with a language.
const loadHighlighter = lazy(() => import('highlight.js/lib/common').then(module => module.default));

// Coloured code per theme, language and text: retyping elsewhere does not colour every block again.
const highlightCache = new Map();

// Colours the code blocks whose language is known (```js, ```python...). The theme is a class on the <pre>;
// its colours come from documentCss(). Blocks without a language, or with an unknown one, stay plain.
export async function highlightCode(html, theme = 'light') {
  if (!['light', 'dark'].includes(theme)) return html;
  const root = rootOf(html);
  const blocks = root.content.querySelectorAll('pre > code[class*="language-"]');
  if (!blocks.length) return html;
  const highlighter = await loadHighlighter();
  for (const code of blocks) {
    const language = /(?:^|\s)language-(\S+)/.exec(code.className)?.[1];
    if (!language || !highlighter.getLanguage(language)) continue;
    const key = `${theme}\0${language}\0${code.textContent}`;
    if (!highlightCache.has(key)) {
      if (highlightCache.size >= 200) highlightCache.clear();
      highlightCache.set(key, highlighter.highlight(code.textContent, { language, ignoreIllegals: true }).value);
    }
    code.innerHTML = highlightCache.get(key);
    code.parentElement.classList.add('code-block', `code-${theme}`);
  }
  return outputOf(html, root);
}
