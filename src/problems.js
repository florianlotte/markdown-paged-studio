// The problems of the last render, each with the line that causes it: a diagram Mermaid could not draw, a
// formula KaTeX refused, an image the library does not have, a reference to nothing, or a render that
// failed altogether. The toolbar shows their count next to the page count; the list under it leads to the
// line in the editor. Problems are read from the pages shown, where every block carries its source line.
import { revealDocumentLine } from './chapters.js';
import { onLanguageChange, t } from './i18n.js';
import { bindMenu } from './menu.js';
import { revealEditor } from './view.js';

const $ = id => document.getElementById(id);

let problems = [];
let menu = null;

// The line of the document (from 0) an element of the preview comes from, or null.
function lineOf(element) {
  const block = element.closest('[data-source-line], [data-line]');
  const line = Number(block?.dataset.sourceLine ?? block?.dataset.line);
  return Number.isInteger(line) ? line : null;
}

// Mermaid says "Parse error on line 3": line 1 of a diagram is the line after its fence.
export function diagramErrorLine(message, fenceLine) {
  const match = /\bline (\d+)/i.exec(message ?? '');
  return fenceLine === null ? null : fenceLine + (match ? Number(match[1]) : 0);
}

const firstLine = text =>
  String(text ?? '')
    .split('\n')[0]
    .trim();

// The problems found in the pages shown, in document order, one per cause and line.
export function collectProblems(preview, renderError = null) {
  const found = [];
  if (renderError) found.push({ kind: 'render', message: firstLine(renderError?.message || renderError), line: null });
  for (const element of preview.querySelectorAll('.mermaid-error, .math-error, .image-missing, .ref-missing')) {
    let kind;
    let message;
    let line = lineOf(element);
    if (element.classList.contains('mermaid-error')) {
      kind = 'diagram';
      message = firstLine(element.textContent);
      line = diagramErrorLine(message, line);
    } else if (element.classList.contains('math-error')) {
      kind = 'formula';
      message = firstLine(element.querySelector('[title]')?.getAttribute('title') || element.textContent);
    } else if (element.classList.contains('image-missing')) {
      kind = 'image';
      message = element.dataset.image ?? '';
    } else {
      kind = 'reference';
      message = element.textContent.trim();
    }
    found.push({ kind, message, line });
  }
  const seen = new Set();
  return found.filter(problem => {
    const key = `${problem.kind}\n${problem.line}\n${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const KIND_LABELS = {
  render: 'Render',
  diagram: 'Diagram',
  formula: 'Formula',
  image: 'Image not found',
  reference: 'Unknown reference',
};

function entryOf(problem) {
  const item = document.createElement('li');
  item.setAttribute('role', 'none');
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'menuitem');
  const title = document.createElement('strong');
  title.textContent =
    problem.line === null
      ? t(KIND_LABELS[problem.kind])
      : t('{what}, line {line}', { what: t(KIND_LABELS[problem.kind]), line: problem.line + 1 });
  const detail = document.createElement('span');
  detail.textContent = problem.message;
  button.append(title, detail);
  if (problem.line === null) {
    button.setAttribute('aria-disabled', 'true');
  } else {
    button.addEventListener('click', () => {
      menu.close();
      revealEditor();
      revealDocumentLine(problem.line);
    });
  }
  item.append(button);
  return item;
}

function drawCount() {
  const button = $('problems');
  button.hidden = problems.length === 0;
  $('problemsCount').textContent = String(problems.length);
  $('problemsLabel').textContent = problems.length === 1 ? t('problem') : t('problems');
  const label = problems.length === 1 ? t('1 problem') : t('{count} problems', { count: problems.length });
  button.setAttribute('aria-label', label);
  button.title = t('{label}: where the pages differ from what was written', { label });
  if (problems.length === 0) menu?.close();
}

// Called after every render with the pages shown, or with the error that stopped it.
export function reportProblems(preview, renderError = null) {
  problems = collectProblems(preview, renderError);
  drawCount();
}

export function initProblems() {
  menu = bindMenu(
    'problems',
    'problemsMenu',
    {},
    { onOpen: () => $('problemsMenu').replaceChildren(...problems.map(entryOf)) },
  );
  onLanguageChange(drawCount);
  drawCount();
}
