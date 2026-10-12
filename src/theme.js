// The theme of the studio chrome: light, dark, or the one of the system ('system', the default, follows
// `prefers-color-scheme`). A setting of the studio with its own localStorage key, like the interface
// language: never part of the document. The effective theme is written as `data-theme` on <html>, the
// only thing src/ui.css looks at; the rendered document keeps its white pages whatever the theme.
export const THEME_KEY = 'markdown-paged-studio:theme';
export const THEMES = ['system', 'light', 'dark'];

const DARK = matchMedia('(prefers-color-scheme: dark)');
let theme = 'system';
const listeners = new Set();

export const currentTheme = () => theme;

// 'light' or 'dark': the theme in force.
export const effectiveTheme = () => (theme === 'system' ? (DARK.matches ? 'dark' : 'light') : theme);

export function onThemeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function apply() {
  document.documentElement.dataset.theme = effectiveTheme();
  for (const listener of listeners) listener(theme);
}

export function setTheme(next) {
  if (!THEMES.includes(next) || next === theme) return;
  theme = next;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable: the theme still applies for this session.
  }
  apply();
}

// The saved theme, else the system's. The inline script of index.html already set `data-theme` before the
// first paint; this takes over and follows the system from now on.
export function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    // Storage unavailable: follow the system.
  }
  theme = THEMES.includes(stored) ? stored : 'system';
  DARK.addEventListener('change', () => {
    if (theme === 'system') apply();
  });
  apply();
  return theme;
}
