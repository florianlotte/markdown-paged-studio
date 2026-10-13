import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2] || '.';
const UA_DIR = path.join(ROOT, '.ua');
const INTER_DIR = path.join(UA_DIR, 'intermediate');

if (!fs.existsSync(INTER_DIR)) {
  fs.mkdirSync(INTER_DIR, { recursive: true });
}

const EXCLUDES = ['node_modules', 'dist', 'test-results', 'release', '.ua', '.understand-anything', '.git'];

function isExcluded(filepath) {
  const relative = path.relative(ROOT, filepath);
  return EXCLUDES.some(exclude => relative.startsWith(exclude) || relative.startsWith('.' + exclude));
}

function categorize(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const basename = path.basename(filepath);

  // Config
  if (
    [
      '.json',
      '.yaml',
      '.yml',
      '.config.js',
      '.config.mjs',
      '.config.cjs',
      '.config.ts',
      '.config.d.ts',
      '.env',
      '.toml',
    ].includes(ext) ||
    basename === 'Dockerfile' ||
    basename === 'compose.yaml' ||
    basename === 'electron-builder.yml' ||
    basename === 'vite.config.js' ||
    basename === 'eslint.config.js' ||
    basename === 'playwright.config.js' ||
    basename === 'playwright.desktop.config.js'
  ) {
    return 'config';
  }

  // Docs
  if (
    ['.md', '.txt', '.rst'].includes(ext) ||
    filepath.startsWith('docs/') ||
    basename === 'README.md' ||
    basename === 'CHANGELOG.md' ||
    basename === 'CONTRIBUTING.md' ||
    basename === 'SECURITY.md' ||
    basename === 'LICENSE' ||
    basename === 'CLAUDE.md'
  ) {
    return 'docs';
  }

  // Infra
  if (filepath.startsWith('docker/') || basename === 'Dockerfile' || basename === 'compose.yaml') {
    return 'infra';
  }

  // Data
  if (filepath.startsWith('tests/fixtures/') || (ext === '.json' && filepath.includes('local/'))) {
    return 'data';
  }

  // Script
  if (filepath.startsWith('scripts/') || (ext === '.mjs' && filepath.startsWith('scripts/'))) {
    return 'script';
  }

  // Markup
  if (basename === 'index.html') {
    return 'markup';
  }

  // Code
  if (['.js', '.mjs', '.cjs', '.ts', '.d.ts'].includes(ext)) {
    return 'code';
  }

  return 'code'; // default
}

function scan(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relativePath = path.relative(ROOT, fullPath);

    if (isExcluded(relativePath)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scan(fullPath, fileList);
    } else {
      fileList.push({
        path: relativePath,
        category: categorize(relativePath),
      });
    }
  }
  return fileList;
}

const allFiles = scan(ROOT);
fs.writeFileSync(path.join(INTER_DIR, 'scan-result.json'), JSON.stringify({ files: allFiles }, null, 2));
console.log(`Scanned ${allFiles.length} files.`);
