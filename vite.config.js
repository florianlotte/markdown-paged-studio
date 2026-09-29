// Build-time constants shown in the sidebar footer: the package version and the commit being built.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// GITHUB_SHA in GitHub Actions, APP_COMMIT for Docker builds (no .git in the image), git otherwise.
function commit() {
  const fromEnvironment = process.env.GITHUB_SHA || process.env.APP_COMMIT;
  if (fromEnvironment) return fromEnvironment.trim().slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit()),
  },
});
