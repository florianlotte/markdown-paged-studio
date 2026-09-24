// The studio's controls: form fields bound to the state, tabs, file imports, downloads, export and print.
// The markup itself lives in index.html.
import { clearStoredConfig, DEFAULTS, sanitizeConfig, state } from './config.js';
import { standaloneHtml } from './document.js';
import { scheduleRender } from './render.js';

// Every state key has a form control with the same id, except the logo (a file input).
const ids = Object.keys(state).filter(k => k !== 'logoDataUrl');

export function syncInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(state[key]);
    else el.value = state[key];
  }
}

// Merge a (possibly untrusted) config object into the state, refresh the form, and re-render.
export function applyConfig(config) {
  Object.assign(state, sanitizeConfig(config));
  syncInputs();
  scheduleRender();
}

function bindInputs() {
  for (const key of ids) {
    const el = document.getElementById(key);
    if (!el) continue;
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      state[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
      scheduleRender();
    });
  }
}

function bindTabs() {
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

function readTextFile(input, callback) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(String(reader.result ?? ''));
  reader.readAsText(file);
  input.value = '';
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function bindFiles() {
  document.getElementById('logo').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.logoDataUrl = String(reader.result || '');
      scheduleRender();
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('clearLogo').addEventListener('click', () => {
    state.logoDataUrl = '';
    document.getElementById('logo').value = '';
    scheduleRender();
  });

  document
    .getElementById('loadMarkdown')
    .addEventListener('click', () => document.getElementById('markdownFile').click());
  document.getElementById('markdownFile').addEventListener('change', e =>
    readTextFile(e.target, text => {
      state.markdown = text;
      document.getElementById('markdown').value = text;
      scheduleRender();
    }),
  );

  document.getElementById('loadCss').addEventListener('click', () => document.getElementById('cssFile').click());
  document.getElementById('cssFile').addEventListener('change', e =>
    readTextFile(e.target, text => {
      state.customCss = text;
      document.getElementById('customCss').value = text;
      scheduleRender();
    }),
  );

  document.getElementById('resetCss').addEventListener('click', () => {
    state.customCss = DEFAULTS.customCss;
    document.getElementById('customCss').value = DEFAULTS.customCss;
    scheduleRender();
  });

  document
    .getElementById('downloadMarkdown')
    .addEventListener('click', () => download('document.md', state.markdown, 'text/markdown;charset=utf-8'));

  document.getElementById('saveConfig').addEventListener('click', () => {
    download('markdown-paged-config.json', JSON.stringify(state, null, 2), 'application/json');
  });

  document.getElementById('loadConfig').addEventListener('click', () => document.getElementById('configFile').click());
  document.getElementById('configFile').addEventListener('change', e =>
    readTextFile(e.target, text => {
      let loaded;
      try {
        loaded = JSON.parse(text);
      } catch {
        alert('Invalid JSON file.');
        return;
      }
      applyConfig(loaded);
    }),
  );

  document.getElementById('resetDocument').addEventListener('click', () => {
    if (!confirm('Discard the current document and restore the sample?')) return;
    clearStoredConfig();
    document.getElementById('logo').value = '';
    applyConfig(DEFAULTS);
  });

  document.getElementById('exportHtml').addEventListener('click', async () => {
    download('document.html', await standaloneHtml(), 'text/html;charset=utf-8');
  });
}

// Opens the print-ready document in a new window; it prints itself once Paged.js is done. In the browser
// this is also how a PDF is produced ("Save as PDF" in the print dialog), so it must run inside a user
// gesture (click or key press) or pop-up blockers stop it: window.open comes before the first await.
async function openPrintWindow() {
  const win = window.open('', '_blank');
  if (!win) {
    alert('The browser blocked the print window. Allow pop-ups for this site.');
    return;
  }
  const html = await standaloneHtml({ mode: 'print' });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  win.location = url;
  // The opened page prints itself when Paged.js finishes; the URL only needs to outlive the load.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Desktop only: the preload script exposes `window.desktop.exportPdf`, which renders the standalone HTML in
// a hidden Chromium window and writes the PDF where the user chooses, without any dialog in between.
async function exportPdfDirect() {
  const button = document.getElementById('exportPdf');
  button.disabled = true;
  try {
    const result = await window.desktop.exportPdf(await standaloneHtml({ mode: 'pdf' }));
    if (!result.canceled) document.getElementById('status').textContent = 'PDF saved';
  } catch (error) {
    console.error(error);
    alert(`PDF export failed: ${error?.message || error}`);
  } finally {
    button.disabled = false;
  }
}

function bindPdf() {
  const button = document.getElementById('exportPdf');
  // One "Export PDF" button everywhere: direct file in the desktop app, print dialog in the browser.
  button.addEventListener('click', () => (window.desktop ? exportPdfDirect() : openPrintWindow()));

  if (window.desktop) {
    // File menu entries of the desktop app.
    window.desktop.onCommand(command => {
      if (command === 'export-pdf') exportPdfDirect();
      else if (command === 'print') openPrintWindow();
    });
  } else {
    button.title = 'Opens the print dialog: choose "Save as PDF"';
    // Ctrl/Cmd+P prints the document rather than the studio page. On desktop the menu accelerator does this.
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        openPrintWindow();
      }
    });
  }
}

export function initUi() {
  syncInputs();
  bindInputs();
  bindTabs();
  bindFiles();
  bindPdf();
}
