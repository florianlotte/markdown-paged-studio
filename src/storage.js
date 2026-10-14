// localStorage, which may be absent, disabled or full: every access is guarded, and a failure reads as
// "nothing stored" or "not saved". The autosave of the document keeps its own handling in config.js, since
// a failed save is reported to the user there.
export function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

// A JSON value, or `fallback` when nothing is stored or it cannot be read.
export function readStoredJson(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export const writeStoredJson = (key, value) => writeStored(key, JSON.stringify(value));
