// Rebuild small display images; original WebP files remain the zoom/high-DPI source.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sources = new Set();
for (const match of html.matchAll(/(?:data-)?src="(?:\.\.\/)?(webp\/[^"/]+\.webp)"/g)) {
  if (!/favicon|logo\.webp$/.test(match[1]) || match[1].includes('氛圍')) sources.add(match[1]);
}
for (const match of html.matchAll(/switchImg\('[^']+',\s*'([^']+)\.jpg'/g)) sources.add('webp/' + match[1] + '.webp');
const out = path.join(root, 'webp/responsive');
fs.mkdirSync(out, { recursive: true });
const manifest = {};
for (const source of [...sources].sort()) {
  const input = path.join(root, source);
  const [width, height] = execFileSync('identify', ['-format', '%w %h', input], { encoding: 'utf8' }).trim().split(' ').map(Number);
  if (width <= 480) continue;
  const target = 'webp/responsive/' + path.basename(source, '.webp') + '-480.webp';
  execFileSync('cwebp', ['-quiet', '-q', '86', '-m', '6', '-resize', '480', '0', input, '-o', path.join(root, target)]);
  manifest[source] = { width, height, small: target, originalBytes: fs.statSync(input).size, smallBytes: fs.statSync(path.join(root, target)).size };
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ count: Object.keys(manifest).length, originalBytes: Object.values(manifest).reduce((n, i) => n + i.originalBytes, 0), smallBytes: Object.values(manifest).reduce((n, i) => n + i.smallBytes, 0) }));
