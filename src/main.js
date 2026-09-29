// Entry point: restores the saved document, wires the UI and the view, starts the first render.
// See CLAUDE.md for the module map.
import './ui.css';
import { AUTOMATION, installAutomationApi } from './automation.js';
import { flushPersist, loadStoredConfig, LOCAL_IMAGES, restoreLogo, state } from './config.js';
import { initLanguage } from './i18n.js';
import { loadImages, onImagesChange, setBuiltinImages } from './images.js';
import { render, scheduleRender } from './render.js';
import { initUi } from './ui.js';
import { flushView, initView } from './view.js';

initLanguage();
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
  // Images and logo first, so the first render already shows them; then every change of the library re-renders.
  Promise.allSettled([loadImages(), restoreLogo()]).then(() => {
    onImagesChange(reason => {
      if (reason === 'library') scheduleRender();
    });
    render();
  });
}
