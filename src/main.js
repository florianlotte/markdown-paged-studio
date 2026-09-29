// Entry point: restores the saved document, wires the UI and the view, starts the first render.
// See CLAUDE.md for the module map.
import './ui.css';
import { AUTOMATION, installAutomationApi } from './automation.js';
import { flushPersist, loadStoredConfig, LOCAL_IMAGES, state } from './config.js';
import { loadImages, onImagesChange, setBuiltinImages } from './images.js';
import { render, scheduleRender } from './render.js';
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
setBuiltinImages(LOCAL_IMAGES);
if (!AUTOMATION) {
  // Images first, so the first render already resolves them; then every change of the library re-renders.
  loadImages().finally(() => {
    onImagesChange(reason => {
      if (reason === 'library') scheduleRender();
    });
    render();
  });
}
