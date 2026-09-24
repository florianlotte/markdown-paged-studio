// Entry point: restores the saved document, wires the UI and the view, starts the first render.
// See CLAUDE.md for the module map.
import './ui.css';
import { AUTOMATION, installAutomationApi } from './automation.js';
import { flushPersist, loadStoredConfig, state } from './config.js';
import { render } from './render.js';
import { initUi } from './ui.js';
import { flushView, initView } from './view.js';

Object.assign(state, loadStoredConfig());
initUi();
initView();

// Closing or reloading the tab must not lose the last edit or view change still waiting on a debounce.
window.addEventListener('pagehide', () => {
  flushPersist();
  flushView();
});

installAutomationApi();
if (!AUTOMATION) render();
