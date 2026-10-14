// What the studio says to the user without a blocking dialog: the notice banner (#notice) for what must be
// read, the toast (#toast) for a confirmation that goes away by itself, with an optional action (Undo).
import { t } from './i18n.js';

// A message for the user, in a banner above the pages instead of a blocking dialog.
export function notify(message) {
  document.getElementById('noticeText').textContent = message;
  document.getElementById('notice').hidden = false;
}

// A short confirmation in the corner (a file saved, the document reset), gone by itself after `duration`;
// `action` names a button that runs `run`, to undo what was just done.
let toastTimer = 0;
export function toast(message, { action = '', run = null, duration = 5000 } = {}) {
  const box = document.getElementById('toast');
  const button = document.getElementById('toastAction');
  clearTimeout(toastTimer);
  document.getElementById('toastText').textContent = message;
  button.textContent = action;
  button.hidden = !action;
  button.onclick = () => {
    hideToast();
    run?.();
  };
  box.hidden = false;
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  document.getElementById('toast').hidden = true;
}

// Runs an action and reports its failure in the banner instead of letting the error vanish.
export const guarded =
  (action, message) =>
  async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      console.error(error);
      notify(t(message, { error: error?.message || error }));
    }
  };
