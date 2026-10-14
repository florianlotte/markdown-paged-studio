// The settings sidebar beyond the fields bound to a state key by ui.js: the collapsible groups and the
// counter of the images, the date helpers (Today, a picker), the language chosen by its name, the margin
// presets and the "same on all sides" box, and the logo zone (drop, choose, replace, remove). None of it adds
// a state key: the groups remember their fold in localStorage, the rest writes the existing keys.
import { LANGUAGE_TAG, sanitizeConfig, state } from './config.js';
import { syncCssEditor } from './css-editor.js';
import { currentLanguage, onLanguageChange, t } from './i18n.js';
import { findImage, listImages, MAX_LOGO_WIDTH, missingImages, onImagesChange, prepareImage } from './images.js';
import { notify } from './notices.js';
import { scheduleRender } from './render.js';
import { readStoredJson, writeStoredJson } from './storage.js';

export const SETTINGS_KEY = 'markdown-paged-studio:settings';

// The languages offered by name; any other BCP 47 tag is typed in the field shown by "Other…".
export const LANGUAGE_CHOICES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'da', 'sv', 'nb', 'fi', 'pl', 'cs'];

const MARGIN_KEYS = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'];
// Top, right, bottom, left in mm. Normal is what the sample document uses.
export const MARGIN_PRESETS = { narrow: [12, 12, 12, 12], normal: [24, 18, 20, 18], wide: [30, 25, 30, 25] };

const $ = id => document.getElementById(id);

// --- Groups --------------------------------------------------------------------------------------------

function closedGroups() {
  const stored = readStoredJson(SETTINGS_KEY);
  return Array.isArray(stored.closed) ? stored.closed : [];
}

function bindGroups() {
  const groups = [...document.querySelectorAll('.sidebar-body details.group')];
  const closed = new Set(closedGroups());
  for (const group of groups) {
    group.open = !closed.has(group.dataset.group);
    group.addEventListener('toggle', () => {
      writeStoredJson(SETTINGS_KEY, { closed: groups.filter(other => !other.open).map(other => other.dataset.group) });
    });
  }
}

// The count of the library next to the title of its group, and how many names of the document are missing.
function updateImagesCount() {
  const count = listImages().length;
  const missing = missingImages().filter(name => !findImage(name)).length;
  const parts = [];
  if (count) parts.push(String(count));
  if (missing) parts.push(t('{count} missing', { count: missing }));
  const label = $('imagesCount');
  label.textContent = parts.join(' · ');
  label.classList.toggle('is-warning', missing > 0);
}

// --- Date ----------------------------------------------------------------------------------------------

// The language of the document, when it is a valid tag, else the one of the browser.
const documentLocale = () => (LANGUAGE_TAG.test(state.language) ? state.language : undefined);

// A date written the way the document language writes it in full ("October 14, 2026", "14 octobre 2026").
export function formatDate(date) {
  try {
    return new Intl.DateTimeFormat(documentLocale(), { dateStyle: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
  }
}

const isoDate = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function writeDate(date) {
  const input = $('date');
  input.value = formatDate(date);
  state.date = input.value;
  scheduleRender();
}

function bindDate() {
  const picker = $('datePicker');
  $('dateToday').addEventListener('click', () => writeDate(new Date()));
  $('datePick').addEventListener('click', () => {
    picker.value = isoDate(new Date());
    try {
      // The picker of the browser, anchored on the button; an older browser gets the field itself.
      if (typeof picker.showPicker === 'function') picker.showPicker();
      else picker.click();
    } catch {
      picker.focus();
    }
  });
  picker.addEventListener('change', () => {
    const [year, month, day] = picker.value.split('-').map(Number);
    if (!year) return;
    writeDate(new Date(year, month - 1, day));
  });
}

// --- Language ------------------------------------------------------------------------------------------

// The name of a language in the language of the interface, with a capital ("Français", "Deutsch").
function languageName(tag) {
  try {
    const name = new Intl.DisplayNames([currentLanguage()], { type: 'language' }).of(tag) ?? tag;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return tag;
  }
}

function fillLanguages() {
  const select = $('language');
  select.replaceChildren(
    ...LANGUAGE_CHOICES.map(tag => new Option(`${languageName(tag)} (${tag})`, tag)),
    new Option(t('Other…'), 'other'),
  );
  syncLanguage();
}

// The select shows the language of the document, or "Other…" with the tag in its own field.
export function syncLanguage() {
  const known = LANGUAGE_CHOICES.includes(state.language);
  $('language').value = known ? state.language : 'other';
  $('languageTagField').hidden = known;
  if (!known) $('languageTag').value = state.language;
}

function bindLanguage() {
  const select = $('language');
  const field = $('languageTagField');
  const input = $('languageTag');
  select.addEventListener('change', () => {
    if (select.value === 'other') {
      field.hidden = false;
      input.value = LANGUAGE_CHOICES.includes(state.language) ? '' : state.language;
      input.focus();
      return;
    }
    field.hidden = true;
    state.language = select.value;
    scheduleRender();
  });
  // The tag is kept as typed, like any text: the document falls back to English from an invalid one, and
  // the saved configuration drops it.
  input.addEventListener('input', () => {
    state.language = input.value.trim();
    scheduleRender();
  });
  fillLanguages();
  onLanguageChange(fillLanguages);
}

// --- Margins -------------------------------------------------------------------------------------------

const presetOf = () =>
  Object.keys(MARGIN_PRESETS).find(name => MARGIN_PRESETS[name].every((mm, i) => state[MARGIN_KEYS[i]] === mm)) ??
  'custom';

function writeMargins(values) {
  MARGIN_KEYS.forEach((key, i) => {
    state[key] = values[i];
    $(key).value = values[i];
  });
}

// The preset select follows the four fields; linked, the three others follow the top one.
export function syncMargins() {
  $('marginPreset').value = presetOf();
  const linked = $('marginsLinked').checked;
  for (const key of MARGIN_KEYS.slice(1)) $(key).disabled = linked;
}

function bindMargins() {
  const preset = $('marginPreset');
  const linked = $('marginsLinked');
  preset.addEventListener('change', () => {
    const values = MARGIN_PRESETS[preset.value];
    if (!values) return;
    writeMargins(values);
    linked.checked = values.every(mm => mm === values[0]) && linked.checked;
    syncMargins();
    scheduleRender();
  });
  linked.addEventListener('change', () => {
    if (linked.checked) writeMargins(Array(4).fill(state.marginTop));
    syncMargins();
    scheduleRender();
  });
  // After the binding of ui.js, which has already written the typed value into the state.
  for (const key of MARGIN_KEYS) {
    $(key).addEventListener('input', () => {
      if (linked.checked && key === 'marginTop') writeMargins(Array(4).fill(state.marginTop));
      syncMargins();
    });
  }
}

// --- Logo ----------------------------------------------------------------------------------------------

// The zone to drop or choose a logo while there is none; the thumbnail with Replace and Remove once there is.
export function syncLogo() {
  const has = Boolean(state.logoDataUrl);
  $('logoZone').hidden = has;
  $('logoCard').hidden = !has;
  $('logoPreview').src = has ? state.logoDataUrl : '';
}

async function setLogo(file) {
  try {
    // Like the images of the document, a large logo is scaled down: it prints at most 55 mm wide.
    const { dataUrl } = await prepareImage(file, MAX_LOGO_WIDTH);
    state.logoDataUrl = sanitizeConfig({ logoDataUrl: dataUrl }).logoDataUrl ?? '';
    syncLogo();
    scheduleRender();
  } catch (error) {
    console.error(error);
    notify(t('The logo could not be read: {error}', { error: error?.message || error }));
  }
}

function bindLogo() {
  const input = $('logo');
  const zone = $('logoZone');
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) setLogo(file);
  });
  zone.addEventListener('click', () => input.click());
  $('replaceLogo').addEventListener('click', () => input.click());
  $('clearLogo').addEventListener('click', () => {
    state.logoDataUrl = '';
    syncLogo();
    scheduleRender();
  });
  zone.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('is-over');
    const file = [...(event.dataTransfer?.files ?? [])].find(candidate => candidate.type.startsWith('image/'));
    if (file) setLogo(file);
  });
}

// --- Entry points ----------------------------------------------------------------------------------------

// Brings the controls of this module in line with the state; called by syncInputs() of ui.js.
export function syncSettings() {
  syncLanguage();
  syncMargins();
  syncLogo();
  syncCssEditor();
}

export function initSettings() {
  bindGroups();
  bindDate();
  bindLanguage();
  bindMargins();
  bindLogo();
  onImagesChange(updateImagesCount);
  onLanguageChange(updateImagesCount);
  updateImagesCount();
  syncSettings();
}
