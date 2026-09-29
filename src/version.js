// What is running: the package version and the commit it was built from (see vite.config.js).
// The dev server shows "dev" instead of a commit, since the working tree may differ from HEAD.
const REPOSITORY = 'https://github.com/florianlotte/markdown-paged-studio';

export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = import.meta.env.DEV ? 'dev' : __APP_COMMIT__;

export const RELEASE_URL = `${REPOSITORY}/releases/tag/v${APP_VERSION}`;
export const COMMIT_URL = /^[0-9a-f]{7,40}$/.test(APP_COMMIT) ? `${REPOSITORY}/commit/${APP_COMMIT}` : null;
