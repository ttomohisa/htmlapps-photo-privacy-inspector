const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const ExifReader = require(path.join(root, '.cache/exifreader-4.41.3/extracted/package/dist/exif-reader.js'));
const fflate = require(path.join(root, '.cache/fflate-0.8.3/extracted/package/umd/index.js'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
const broken = Buffer.from('synthetic broken JPEG');
// Output fault injection models a metadata engine rejection after a successful input parse.

// Run the real application script with DOM/download boundaries supplied by the test.
// Input parsing uses the pinned engine; output failure tests inject only its rejection boundary.
function app(language = 'en') {
  const nodes = new Map();
  const downloads = [];
  const blobs = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      const handlers = {};
      nodes.set(id, { textContent: '', innerHTML: '', value: '', checked: false, hidden: false, open: false,
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, on) { on ? classes.add(x) : classes.delete(x); } },
        style: { setProperty() {} }, addEventListener: (event, fn) => { handlers[event] = fn; },
        appendChild() {}, insertAdjacentHTML() {}, setAttribute() {}, removeAttribute() {}, remove() {},
        showModal() { this.open = true; }, close() { this.open = false; },
        click() { if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) }); else handlers.click?.(); },
        closest() { return null; }, handlers });
    }
    return nodes.get(id);
  }
  node('app-config').textContent = fs.readFileSync(path.join(root, 'app.config.json'), 'utf8');
  node('build-manifest').textContent = '{}';
  const context = vm.createContext({ document: { getElementById: node, querySelectorAll: () => [],
    createElement: () => node(Symbol()), addEventListener() {}, documentElement: {}, body: node('body') },
    navigator: { language }, crypto: webcrypto, Blob, File, ArrayBuffer, Uint8Array, DataView, TextDecoder, Response,
    URL: { createObjectURL(blob) { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; }, revokeObjectURL() {} },
    setTimeout(fn, delay) { return delay === 0 ? setTimeout(fn, 0) : 0; }, clearTimeout() {},
    console: { error() {}, warn() {} }, atob, btoa });
  let html = fs.readFileSync(path.resolve(root, process.env.APP_HTML || 'src/index.template.html'), 'utf8');
  const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  if (payload) html = require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8');
  html = html.replace('/*__AI_METADATA_SOURCE__*/', () => fs.readFileSync(path.join(root, 'src/ai-metadata.js'), 'utf8'));
  const script = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.api={state,analyzeFile,addFiles,inspectBlob,doClean,batchClean,applyLanguage,clearAll,setLanguage(value){lang=value;applyLanguage()}};})();'), context);
  context.api.state.ExifReader = ExifReader;
  context.api.state.fflate = fflate;
  return { ...context.api, node, downloads };
}
const file = (bytes, name = 'synthetic.png', type = 'image/png') => new File([bytes], name, { type });

// Returning to the old empty-tags fallback must fail these rejection assertions.
test('unreadable input never receives a low-risk analysis', async () => {
  const a = app();
  await assert.rejects(a.analyzeFile(file(broken, 'broken.jpg', 'image/jpeg')), /analy/i);
});
test('unreadable cleaned bytes never receive successful verification', async () => {
  const a = app();
  await assert.rejects(a.inspectBlob(new Blob([broken]), 'broken-clean.jpg'), /verif/i);
});
test('valid image without EXIF remains analyzable and cleanable', async () => {
  const a = app();
  const it = await a.analyzeFile(file(png));
  assert.equal(it.risk.score, 0);
  assert.equal(it.risk.level, 'low');
  assert.equal(Object.keys(it.risk.found).length, 0);
  a.state.items.push(it); a.state.current = 0;
  await a.doClean('lossless');
  assert.ok(a.state.cleanResult);
  assert.equal(a.state.cleanResult.after.risk.score, 0);
  assert.equal(a.node('verifyDialog').open, true);
});
test('mixed batch reports unreadable names and excludes them from risk reports in both languages', async () => {
  const a = app();
  await a.addFiles([file(broken, '<broken>.jpg', 'image/jpeg'), file(png)]);
  assert.equal(a.state.items.length, 1);
  assert.match(a.node('analysisError').textContent, /<broken>\.jpg/);
  assert.match(a.node('analysisError').textContent, /unable|unavailable|cannot/i);
  assert.equal(a.node('analysisError').hidden, false);
  a.setLanguage('ja');
  assert.match(a.node('analysisError').textContent, /解析/);
  assert.match(a.node('analysisError').textContent, /<broken>\.jpg/);
});
test('batch of only unreadable files does not show a low-risk workspace', async () => {
  const a = app();
  await a.addFiles([file(broken, 'broken.jpg', 'image/jpeg')]);
  assert.equal(a.state.items.length, 0);
  assert.equal(a.node('workspace').classList.contains('show'), false);
  assert.equal(a.node('analysisError').hidden, false);
});
test('failed clean verification clears stale success and keeps verification closed', async () => {
  const a = app();
  const it = await a.analyzeFile(file(png));
  a.state.ExifReader = { load() { return Promise.reject(new Error("Synthetic output parser failure")); } };
  a.state.items.push(it); a.state.current = 0; a.state.cleanResult = { stale: true };
  await a.doClean('lossless');
  assert.equal(a.state.cleanResult, null);
  assert.equal(a.node('verifyDialog').open, false);
  assert.match(a.node('cleanStatus').textContent, /verif/i);
});
test('ZIP excludes outputs that fail verification and reports the failure', async () => {
  const a = app();
  const bad = await a.analyzeFile(file(png, 'broken-output.png'));

  a.state.items.push(bad, await a.analyzeFile(file(png, 'good.png')));
  let calls = 0;
  a.state.ExifReader = { load(buffer, options) { return ++calls === 1 ? Promise.reject(new Error('Synthetic output parser failure')) : ExifReader.load(buffer, options); } };
  await a.batchClean();
  assert.equal(a.downloads.length, 1);
  const zip = fflate.unzipSync(new Uint8Array(await a.downloads[0].blob.arrayBuffer()));
  assert.deepEqual(Object.keys(zip), ['good-clean.png']);
  assert.match(a.node('batchError').textContent, /broken-output\.png/);
  assert.match(a.node('batchError').textContent, /verif/i);
});
test('ZIP is not downloaded when no output can be verified', async () => {
  const a = app('ja');
  const it = await a.analyzeFile(file(png));
  a.state.ExifReader = { load() { return Promise.reject(new Error("Synthetic output parser failure")); } };
  a.state.items.push(it);
  await a.batchClean();
  assert.equal(a.downloads.length, 0);
  assert.match(a.node('batchError').textContent, /検証/);
});

