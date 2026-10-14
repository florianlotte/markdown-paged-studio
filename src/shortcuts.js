// The keyboard shortcuts of the studio: how a chord is spelled on this platform (the tooltips and the menus
// show it next to the control) and the panel that lists them all, opened with `?`, from the ⋯ menu, or
// from the Help menu of the desktop app.
import { t } from './i18n.js';

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

// macOS writes the modifiers as symbols, glued to the key: Ctrl+Shift+E is ⌘⇧E there.
const MAC_MODIFIERS = { Ctrl: '⌘', Cmd: '⌘', Alt: '⌥', Shift: '⇧' };
// Keys named by a word are translated; a letter, a digit or a function key is not.
const KEY_WORDS = new Set(['wheel', 'double-click', 'drag', 'arrows', 'Delete', 'Enter', 'Escape', 'Home', 'End']);

const keyName = key => (KEY_WORDS.has(key) ? t(key) : key);

// The spelling of a chord written as `Ctrl+Shift+E` for this platform. The second form is for macOS when
// the chord differs there (the view modes are Ctrl+Shift+1 on a PC, Cmd+Alt+1 on a Mac).
export function keys(spec, macSpec = spec) {
  const parts = (IS_MAC ? macSpec : spec).split('+');
  if (!IS_MAC) return parts.map(keyName).join('+');
  const modifiers = parts.filter(part => part in MAC_MODIFIERS).map(part => MAC_MODIFIERS[part]);
  const rest = parts.filter(part => !(part in MAC_MODIFIERS)).map(keyName);
  const glued = rest.length === 1 && rest[0].length === 1;
  return `${modifiers.join('')}${glued ? '' : ' '}${rest.join(' ')}`.trim();
}

// The shortcut of a control, from its `data-shortcut` (and `data-shortcut-mac`) attributes.
export function shortcutOf(element) {
  const spec = element.dataset.shortcut;
  return spec ? keys(spec, element.dataset.shortcutMac) : '';
}

// Adds (or rewrites, after a language change) the <kbd> of every menu entry that has a shortcut.
export function decorateMenus(root = document) {
  for (const entry of root.querySelectorAll('.menu [data-shortcut]')) {
    const kbd = entry.querySelector('kbd.shortcut') ?? document.createElement('kbd');
    kbd.className = 'shortcut';
    kbd.textContent = shortcutOf(entry);
    entry.append(kbd);
  }
}

// The groups of the panel. Each line is [what, ...chords]; a chord is a spec or [pc, mac].
function groups({ desktop }) {
  const chord = spec => (Array.isArray(spec) ? keys(...spec) : keys(spec));
  const line = (what, ...chords) => [what, chords.map(chord)];
  return [
    [
      t('Document'),
      line(t('Export the PDF with the project'), 'Ctrl+Shift+E'),
      line(t('Print the document'), 'Ctrl+P'),
      ...(desktop ? [line(t('Import a file'), 'Ctrl+O')] : []),
      line(t('Hide or show the sidebar'), 'Ctrl+B'),
      line(t('Undo or redo a change made from the preview'), 'Ctrl+Z', 'Ctrl+Y'),
      line(t('Keyboard shortcuts'), '?'),
    ],
    [
      t('Workspace'),
      line(t('Editor alone'), ['Ctrl+Shift+1', 'Cmd+Alt+1']),
      line(t('Editor and preview side by side'), ['Ctrl+Shift+2', 'Cmd+Alt+2']),
      line(t('Preview alone'), ['Ctrl+Shift+3', 'Cmd+Alt+3']),
      line(t('Zoom the preview'), 'Ctrl+wheel'),
      line(t('Editor width, on the splitter'), 'arrows', 'Home', 'End', 'double-click'),
    ],
    [
      t('Editor'),
      line(t('Find and replace'), 'Ctrl+F'),
      line(t('Next or previous match'), 'F3', 'Shift+F3'),
      line(t('Select the next occurrence'), 'Ctrl+D'),
      line(t('Go to a line'), 'Ctrl+Alt+G'),
      line(t('Undo or redo'), 'Ctrl+Z', 'Ctrl+Shift+Z'),
    ],
    [
      t('Files'),
      line(t('Actions of a file, on its tab'), t('right-click'), 'Shift+F10'),
      line(t('Rename'), 'F2', 'double-click'),
      line(t('Remove'), 'Delete'),
      line(t('Move'), 'Alt+arrows', 'drag'),
      line(t('Previous or next file'), 'arrows'),
      line(t('First or last file'), 'Home', 'End'),
      line(t('Back to the text'), 'Enter'),
    ],
    [
      t('Preview'),
      line(t('Show the source of a block'), 'double-click'),
      line(t('Resize a figure, on its handle'), 'arrows'),
      line(t('Leave the tools of a figure'), 'Escape'),
    ],
  ];
}

// Fills the panel (built again at each opening, so it follows the language) and shows it.
export function showShortcuts() {
  const dialog = document.getElementById('shortcutsDialog');
  const body = document.getElementById('shortcutsBody');
  body.replaceChildren(
    ...groups({ desktop: Boolean(window.desktop) }).map(([title, ...lines]) => {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = title;
      const list = document.createElement('dl');
      for (const [what, chords] of lines) {
        const term = document.createElement('dt');
        term.textContent = what;
        const detail = document.createElement('dd');
        chords.forEach((text, index) => {
          if (index) detail.append(document.createTextNode(` ${t('or')} `));
          const kbd = document.createElement('kbd');
          kbd.textContent = text;
          detail.append(kbd);
        });
        list.append(term, detail);
      }
      section.append(heading, list);
      return section;
    }),
  );
  if (!dialog.open) dialog.showModal();
}

// `?` outside a text field opens the panel; a click on the backdrop or the close button closes it.
export function initShortcuts() {
  const dialog = document.getElementById('shortcutsDialog');
  document.getElementById('closeShortcuts').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable], .cm-editor')) return;
    event.preventDefault();
    if (dialog.open) dialog.close();
    else showShortcuts();
  });
  decorateMenus();
}
