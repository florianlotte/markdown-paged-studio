import fs from 'fs';
import path from 'path';

const UA_DIR = '.ua';
const INTER_DIR = path.join(UA_DIR, 'intermediate');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(INTER_DIR, file), 'utf8'));
}

const structural = readJson('structural-analysis.json');
const layers = readJson('layers.json');
const tour = readJson('tour.json');

const graph = {
  project: {
    name: 'markdown-paged-studio',
    description:
      'Write Markdown, add custom CSS and get a paginated, print-ready document with cover page, headers, footers, page numbers and Mermaid diagrams. 100% in the browser.',
    languages: ['javascript', 'markdown', 'html', 'css'],
    frameworks: ['vite', 'pagedjs', 'codemirror', 'electron'],
    analyzedAt: new Date().toISOString(),
    gitCommitHash: 'unknown', // In a real scenario, we would get this from git
  },
  nodes: structural.nodes,
  edges: structural.edges,
  layers: layers,
  tour: tour,
};

fs.writeFileSync(path.join(UA_DIR, 'knowledge-graph.json'), JSON.stringify(graph, null, 2));
console.log('Knowledge graph generated successfully.');
