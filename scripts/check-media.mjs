// Run with `node scripts/check-media.mjs`; browser interaction checks are separate.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'webp/responsive/manifest.json'), 'utf8'));
for (const [source, item] of Object.entries(manifest)) {
  assert.ok(fs.existsSync(path.join(root, source)), source);
  const bytes = fs.statSync(path.join(root, item.small)).size;
  assert.equal(bytes, item.smallBytes, item.small);
  assert.ok(bytes > 0 && bytes < item.originalBytes, item.small);
}
for (const file of ['index.html', 'en/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  let scripts = 0;
  for (const [, attrs, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (attrs.includes('application/ld+json')) JSON.parse(code);
    else { new vm.Script(code, { filename: file }); scripts++; }
  }
  for (const [tag] of html.matchAll(/<video\b[^>]*>/g)) {
    assert.match(tag, /preload="none"/);
    assert.doesNotMatch(tag, /\bautoplay\b/);
  }
  for (const [tag] of html.matchAll(/<source\b[^>]*\.mp4[^>]*>/g)) {
    assert.match(tag, /data-src=/);
    assert.doesNotMatch(tag, /\ssrc=/);
  }
  for (const [, asset] of html.matchAll(/(?:\s|data-)(?:src|poster)="([^"?#]+\.(?:webp|jpg|mp4))"/g)) {
    if (/^https?:/.test(asset)) continue;
    assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), asset)), file + ': ' + asset);
  }
  assert.equal((html.match(/class="cocktail-text-item"/g) || []).length, 24);
  console.log(`PASS ${file}: ${scripts} scripts parse, structured data parses, video loading contract, image paths, 24 cocktails`);
}
console.log(`PASS ${Object.keys(manifest).length} responsive assets: originals preserved, byte sizes verified`);
