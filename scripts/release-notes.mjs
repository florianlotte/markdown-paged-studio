// Prints the section of CHANGELOG.md for a version ("v1.9.0" or "1.9.0"), without its heading: the first
// part of the notes of a GitHub release. Prints nothing when the version has no section.
import { readFileSync } from 'node:fs';

const version = String(process.argv[2] ?? '').replace(/^v/, '');
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const start = lines.findIndex(line => line.startsWith(`## [${version}]`));
if (version && start !== -1) {
  const rest = lines.slice(start + 1);
  // The section ends at the next version, or at the link definitions closing the file.
  const end = rest.findIndex(line => line.startsWith('## [') || /^\[[^\]]+\]: /.test(line));
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  if (section) console.log(section);
}
