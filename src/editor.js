// Edits of the Markdown editor made by the studio itself (tools of the preview, insert buttons, pasted
// images). They go through the editing command of the browser, so they take part in the undo history of the
// editor like something the user typed.

// Writes `next` into the editor as an edit of its smallest changed range, through the browser's editing
// command: unlike assigning `value`, this keeps the undo history, so Ctrl+Z reverts the change and what was
// typed before it. Returns false when the editor cannot take the edit (hidden sidebar or panel).
export function editInPlace(editor, next) {
  const current = editor.value;
  if (!editor.checkVisibility?.({ visibilityProperty: true })) return false;

  let start = 0;
  const limit = Math.min(current.length, next.length);
  while (start < limit && current[start] === next[start]) start++;
  let tail = 0;
  while (tail < limit - start && current[current.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
  const end = current.length - tail;
  const inserted = next.slice(start, next.length - tail);

  const focused = document.activeElement;
  const { selectionStart, selectionEnd, scrollTop } = editor;
  // A caret after the edited range moves with the text; inside the range it goes to its end.
  const shift = offset =>
    offset <= start ? offset : Math.max(start + inserted.length, offset + next.length - current.length);

  editor.focus({ preventScroll: true });
  if (document.activeElement !== editor) return false;
  editor.setSelectionRange(start, end);
  // Deprecated but without replacement: no other API records an edit in the undo history of a textarea.
  const command = inserted ? 'insertText' : 'delete';
  const done = document.execCommand(command, false, inserted) && editor.value === next;
  if (done) editor.setSelectionRange(shift(selectionStart), shift(selectionEnd));
  editor.scrollTop = scrollTop;
  if (focused instanceof HTMLElement && focused !== editor) focused.focus({ preventScroll: true });
  return done;
}

// Inserts a block of text at the cursor, on lines of its own, and leaves the cursor after it.
export function insertBlock(editor, text) {
  const { selectionStart, selectionEnd, value } = editor;
  const before = value.slice(0, selectionStart);
  const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const block = `${lead}${text}\n`;
  const end = selectionStart + block.length;
  if (editInPlace(editor, before + block + value.slice(selectionEnd))) {
    editor.setSelectionRange(end, end);
    return;
  }
  // The editor cannot take the focus (hidden panel): the text is written, the undo history is not kept.
  editor.setRangeText(block, selectionStart, selectionEnd, 'end');
  editor.dispatchEvent(new Event('input'));
}
