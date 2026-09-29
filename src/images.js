// Image library of the document. Markdown references images by any path, but only the file name counts:
// ![Alt](./img/Photo.PNG) shows the uploaded "photo.png". Images live in memory, are persisted in IndexedDB
// (not in localStorage, which is too small) and travel in the config JSON as data URLs.
// Nothing here touches the browser at import time, so the pure helpers can be unit-tested in Node.

export const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=-]+)*,[^\s"<>]*$/i;
// Wider raster images are scaled down on upload: 2400 px is 300 dpi across the text column of an A4 page.
export const MAX_IMAGE_WIDTH = 2400;
// The cover logo is printed at most 55 mm wide: 1200 px is already more than 500 dpi.
export const MAX_LOGO_WIDTH = 1200;
const MAX_NAME_LENGTH = 200;
const RESIZABLE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DATABASE = 'markdown-paged-studio';
const STORE = 'images';
// Key-value store for what belongs to the document but is too large for localStorage: the cover logo.
const DOCUMENT_STORE = 'document';
const LOGO_KEY = 'logo';

const library = new Map(); // key -> { key, name, dataUrl, bytes, width?, height?, builtin? }
let builtin = []; // images bundled from local/images/, always present
let missing = []; // names referenced by the document but not uploaded
const listeners = new Set();

// File name of a source, whatever its path style: URL-decoded, "/" and "\" alike, no query or fragment.
export function imageName(source) {
  let value = String(source ?? '').trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Not valid percent-encoding: use the text as written.
  }
  value = value.split(/[?#]/)[0].replace(/\\/g, '/');
  return value.slice(value.lastIndexOf('/') + 1).trim();
}

// Matching key: the file name, case-insensitive.
export function imageKey(source) {
  return imageName(source).toLowerCase();
}

// Sources the library does not handle: remote, protocol-relative, or already inline.
export function isExternalSource(source) {
  const value = String(source ?? '').trim();
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value);
}

function makeEntry(name, dataUrl, extra = {}) {
  const payload = dataUrl.length - dataUrl.indexOf(',') - 1;
  const bytes = /;base64,/i.test(dataUrl.slice(0, 80)) ? Math.round(payload * 0.75) : payload;
  return { key: imageKey(name), name: imageName(name), dataUrl, bytes, ...extra };
}

// Keeps the valid images of an untrusted { name: dataUrl } object (or [{ name, dataUrl }] list).
export function sanitizeImages(input) {
  let pairs = [];
  if (Array.isArray(input)) pairs = input.map(item => [item?.name, item?.dataUrl]);
  else if (input && typeof input === 'object') pairs = Object.entries(input);
  const entries = [];
  for (const [name, dataUrl] of pairs) {
    if (typeof name !== 'string' || typeof dataUrl !== 'string') continue;
    const clean = imageName(name);
    if (!clean || clean.length > MAX_NAME_LENGTH || !IMAGE_DATA_URL.test(dataUrl)) continue;
    entries.push(makeEntry(clean, dataUrl));
  }
  return entries;
}

export function findImage(source) {
  return library.get(imageKey(source)) ?? null;
}

export function listImages() {
  return [...library.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function missingImages() {
  return [...missing];
}

// Uploaded images as { name: dataUrl }, for the config JSON. Bundled images are not exported.
export function exportImages() {
  return Object.fromEntries(
    listImages()
      .filter(image => !image.builtin)
      .map(image => [image.name, image.dataUrl]),
  );
}

// Listeners receive 'library' when images were added, replaced or removed (the document must be rendered
// again) and 'missing' when only the list of unresolved names changed.
export function onImagesChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(reason = 'library') {
  for (const listener of listeners) listener(reason);
}

// ---- Persistence (IndexedDB). Every failure degrades to "memory only" with a warning.

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      const stores = request.result.objectStoreNames;
      if (!stores.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
      if (!stores.contains(DOCUMENT_STORE)) request.result.createObjectStore(DOCUMENT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function inStore(mode, action, name = STORE) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(name, mode);
      const result = action(transaction.objectStore(name));
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function persist(action, mode = 'readwrite', name = STORE) {
  try {
    return await inStore(mode, action, name);
  } catch (error) {
    console.warn('Images are kept for this session only', error);
    return undefined;
  }
}

// ---- Cover logo. It is part of the document state (`state.logoDataUrl`) but saved here, not in localStorage.

// The saved logo: a data URL, '' when it was removed on purpose, undefined when none was ever saved.
export async function loadLogo() {
  const stored = await persist(store => store.get(LOGO_KEY), 'readonly', DOCUMENT_STORE);
  if (stored === '' || (typeof stored === 'string' && IMAGE_DATA_URL.test(stored))) return stored;
  return undefined;
}

// Saves the logo; `undefined` forgets it, so the default one applies again.
export function saveLogo(dataUrl) {
  return persist(
    store => (dataUrl === undefined ? store.delete(LOGO_KEY) : store.put(dataUrl, LOGO_KEY)),
    'readwrite',
    DOCUMENT_STORE,
  );
}

function resetLibrary(entries) {
  library.clear();
  for (const image of builtin) library.set(image.key, image);
  for (const image of entries) library.set(image.key, image);
}

// Images bundled at build time from local/images/ ({ path: dataUrl }); call before loadImages().
export function setBuiltinImages(files) {
  builtin = sanitizeImages(files).map(image => ({ ...image, builtin: true }));
  resetLibrary([...library.values()].filter(image => !image.builtin));
}

export async function loadImages() {
  const stored = (await persist(store => store.getAll(), 'readonly')) ?? [];
  resetLibrary(sanitizeImages(stored).map((image, index) => ({ ...stored[index], ...image })));
  notify();
}

// Replaces the uploaded images (config import, automation). `persist: false` keeps them in memory only.
export async function replaceImages(entries, { persist: save = true } = {}) {
  resetLibrary(entries);
  if (save) {
    await persist(store => {
      store.clear();
      for (const image of entries) store.put(image);
    });
  }
  notify();
}

export async function removeImage(key) {
  const image = library.get(key);
  if (!image || image.builtin) return;
  library.delete(key);
  // A bundled image of the same name shows again.
  const fallback = builtin.find(candidate => candidate.key === key);
  if (fallback) library.set(key, fallback);
  await persist(store => store.delete(key));
  notify();
}

export async function clearImages() {
  await replaceImages([]);
}

// Names the last render could not resolve; shown in the image list as a to-do.
export function setMissingImages(names) {
  const next = [...new Set(names)].sort();
  if (next.join('\n') === missing.join('\n')) return;
  missing = next;
  notify('missing');
}

// ---- Upload

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function decode(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The file is not a readable image'));
    image.src = dataUrl;
  });
}

// Data URL and pixel size of a file, scaled down when it is a raster image wider than `maxWidth`.
export async function prepareImage(file, maxWidth = MAX_IMAGE_WIDTH) {
  const original = await readAsDataUrl(file);
  const image = await decode(original);
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!RESIZABLE_TYPES.includes(file.type) || width <= maxWidth) return { dataUrl: original, width, height };
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = Math.round((height * maxWidth) / width);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL(file.type, 0.9), width: canvas.width, height: canvas.height, resized: true };
}

// Adds image files to the library, replacing images of the same name. Resolves to what happened to each file.
export async function addImageFiles(files, { rename } = {}) {
  const results = [];
  const added = [];
  for (const file of files) {
    const name = imageName(rename?.(file) ?? file.name);
    if (!file.type.startsWith('image/') || !name || name.length > MAX_NAME_LENGTH) {
      results.push({ name: file.name, error: 'Not an image' });
      continue;
    }
    try {
      const { dataUrl, width, height, resized } = await prepareImage(file);
      if (!IMAGE_DATA_URL.test(dataUrl)) throw new Error('Unsupported image data');
      const image = makeEntry(name, dataUrl, { width, height });
      library.set(image.key, image);
      added.push(image);
      results.push({ name: image.name, width, height, resized: Boolean(resized) });
    } catch (error) {
      results.push({ name: file.name, error: error?.message || String(error) });
    }
  }
  if (added.length) {
    await persist(store => {
      for (const image of added) store.put(image);
    });
    notify();
  }
  return results;
}
