// The spelling of the shortcuts: words translated, modifiers kept, the macOS form given separately.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setLanguage } from '../src/i18n.js';
import { IS_MAC, keys } from '../src/shortcuts.js';

test('a chord is spelled for this platform, with its key words translated', () => {
  // The tests run on Linux: the PC spelling applies, and the macOS form is left aside.
  assert.equal(IS_MAC, false);
  setLanguage('en');
  assert.equal(keys('Ctrl+Shift+E'), 'Ctrl+Shift+E');
  assert.equal(keys('Ctrl+Shift+1', 'Cmd+Alt+1'), 'Ctrl+Shift+1');
  assert.equal(keys('Ctrl+wheel'), 'Ctrl+wheel');
  assert.equal(keys('Alt+arrows'), 'Alt+arrows');
  setLanguage('fr');
  assert.equal(keys('Ctrl+wheel'), 'Ctrl+molette');
  assert.equal(keys('Delete'), 'Suppr');
  assert.equal(keys('F2'), 'F2');
  setLanguage('en');
});
