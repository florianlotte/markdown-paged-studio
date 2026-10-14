// The settings form: every state key has a control of the same id in index.html, read into the state on
// input and written back from it (restore, import, reset). The controls that are more than a bound field
// live in settings.js.
import { mergeConfig, sanitizeConfig, state } from './config.js';
import { syncChapters } from './chapters.js';
import { scheduleRender } from './render.js';
import { syncSettings } from './settings.js';

// Every state key has a form control with the same id, except the logo (a file input, see settings.js), the
// language (chosen by name, or typed as a tag, see settings.js) and the text of the document (the files and
// the editor, see chapters.js).
const ids = Object.keys(state).filter(k => !['logoDataUrl', 'language', 'markdown', 'files'].includes(k));

export function syncInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(state[key]);
    else el.value = state[key];
  }
  syncRunningHeaderLevel();
  syncSettings();
}

// The level of the running header only matters while the running header is on.
function syncRunningHeaderLevel() {
  document.getElementById('runningHeaderLevel').disabled = !document.getElementById('runningHeader').checked;
}

// Merge a (possibly untrusted) config object into the state, refresh the form and the editor, and re-render.
export function applyConfig(config) {
  const text = 'markdown' in config || 'files' in config;
  mergeConfig(state, config);
  syncInputs();
  if (text) syncChapters();
  scheduleRender();
}

export function bindInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      // A typed number is clamped like an imported one: a margin of 500 mm would make the layout loop. Text
      // keeps its raw value, which the document falls back from and the saved configuration drops if invalid.
      const value = el.type === 'checkbox' ? el.checked : el.value;
      state[key] = el.type === 'number' ? (sanitizeConfig({ [key]: value })[key] ?? state[key]) : value;
      scheduleRender();
    });
    if (el.type === 'number') el.addEventListener('change', () => (el.value = state[key]));
  }
  document.getElementById('runningHeader').addEventListener('change', syncRunningHeaderLevel);
}

export function bindTabs() {
  const tabs = [...document.querySelectorAll('.tab')];

  function activateTab(tab, { focus = false } = {}) {
    for (const other of tabs) {
      const selected = other === tab;
      other.classList.toggle('active', selected);
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
    }
    document.querySelectorAll('.panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    // Roving focus per the WAI-ARIA tabs pattern: arrows, Home and End move between tabs.
    tab.addEventListener('keydown', event => {
      const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index };
      if (!(event.key in moves)) return;
      event.preventDefault();
      activateTab(tabs[(index + moves[event.key] + tabs.length) % tabs.length], { focus: true });
    });
  });
}
