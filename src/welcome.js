// The welcome tour: a few panels that say how the studio works, shown on the first visit (and until the
// user ticks "Don't show this again"), and again from the ⋯ menu or the Help menu of the desktop app. The
// panels are static markup of index.html (translated in place like the rest); this module pages through
// them and remembers the choice in localStorage.
import { t } from './i18n.js';

export const WELCOME_KEY = 'markdown-paged-studio:welcome';

let current = 0;

const dialog = () => document.getElementById('welcomeDialog');
const panels = () => [...dialog().querySelectorAll('.welcome-panel')];

// Whether the tour should open by itself at startup.
export function welcomeWanted() {
  try {
    return localStorage.getItem(WELCOME_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

function remember(hidden) {
  try {
    if (hidden) localStorage.setItem(WELCOME_KEY, 'hidden');
    else localStorage.removeItem(WELCOME_KEY);
  } catch {
    // Storage unavailable: the tour comes back next time.
  }
}

function showPanel(index) {
  const all = panels();
  current = Math.max(0, Math.min(index, all.length - 1));
  all.forEach((panel, i) => {
    panel.hidden = i !== current;
  });
  document.getElementById('welcomePrev').disabled = current === 0;
  document.getElementById('welcomeNext').disabled = current === all.length - 1;
  document.getElementById('welcomeStep').textContent = t('{step} / {count}', { step: current + 1, count: all.length });
}

// Opens the tour on its first panel; the box reflects the saved choice.
export function showWelcome() {
  const box = dialog();
  document.getElementById('welcomeHide').checked = !welcomeWanted();
  showPanel(0);
  if (!box.open) box.showModal();
  document.getElementById('welcomeNext').focus();
}

export function initWelcome() {
  const box = dialog();
  document.getElementById('welcomePrev').addEventListener('click', () => showPanel(current - 1));
  document.getElementById('welcomeNext').addEventListener('click', () => showPanel(current + 1));
  document.getElementById('closeWelcome').addEventListener('click', () => box.close());
  document.getElementById('dismissWelcome').addEventListener('click', () => box.close());
  box.addEventListener('click', event => {
    if (event.target === box) box.close();
  });
  box.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') showPanel(current - 1);
    else if (event.key === 'ArrowRight') showPanel(current + 1);
    else return;
    event.preventDefault();
  });
  // Whatever closed it (a button, Escape, a click on the backdrop), the choice of the box is kept.
  box.addEventListener('close', () => remember(document.getElementById('welcomeHide').checked));
}
