const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const ExifReader = require(path.join(root, '.cache/exifreader-4.41.3/extracted/package/dist/exif-reader.js'));
const fflate = require(path.join(root, '.cache/fflate-0.8.3/extracted/package/umd/index.js'));

// Run the real application script with DOM/download boundaries supplied by the test.
// EXIF uses the real pinned parser. Node lacks DOMParser, so XMP removal is checked by chunk absence.
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
    navigator: { language }, crypto: webcrypto, Blob, File, ArrayBuffer, Uint8Array, DataView, TextDecoder, TextEncoder, Response,
    URL: { createObjectURL(blob) { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; }, revokeObjectURL() {} },
    setTimeout(fn, delay) { return delay === 0 ? setTimeout(fn, 0) : 0; }, clearTimeout() {},
    console: { error() {}, warn() {} }, atob, btoa });
  let html = fs.readFileSync(path.resolve(root, process.env.APP_HTML || 'src/index.template.html'), 'utf8');
  const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  if (payload) html = require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8');
  const script = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.api={state,analyzeFile,addFiles,inspectBlob,doClean,batchClean,applyLanguage,clearAll,privacyClean,flattenMetadata,classifyTag,assess,t,setLanguage(value){lang=value;applyLanguage()}};})();'), context);
  context.api.state.ExifReader = ExifReader;
  context.api.state.fflate = fflate;
  return { ...context.api, node, downloads };
}
const file = (bytes, name = 'synthetic.png', type = 'image/png') => new File([bytes], name, { type });

const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/photo-clean.json'))).cases;
const bytesFor = name => Buffer.from(fixtures.find(f => f.name === name).base64, 'base64');
const mimeFor = name => 'image/' + (name.endsWith('.jpg') ? 'jpeg' : name.split('.').at(-1));
function webpChunks(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  const chunks = [];
  for (let p = 12; p + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(p + 4), end = p + 8 + length + (length & 1);
    chunks.push({ type: bytes.toString('ascii', p, p + 4), data: bytes.subarray(p + 8, p + 8 + length), bytes: bytes.subarray(p, end) });
    p = end;
  }
  return chunks;
}
async function clean(a, bytes, name) {
  const before = await a.analyzeFile(file(bytes, name, mimeFor(name)));
  const result = await a.privacyClean(before);
  const output = Buffer.from(await result.blob.arrayBuffer());
  const after = await a.inspectBlob(result.blob, result.name);
  assert.equal(result.method, 'lossless');
  assert.deepEqual(Buffer.from(before.buffer), bytes, 'input bytes must not be mutated');
  if (process.env.PHOTO_CLEAN_OUTPUT_DIR) {
    fs.mkdirSync(process.env.PHOTO_CLEAN_OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.PHOTO_CLEAN_OUTPUT_DIR, name), output);
  }
  return { before, result, output, after };
}

// Removing the replacement EXIF or omitting getOrientation from privacyClean must fail these tests.
// Node has no DOMParser: EXIF is parsed normally, while XMP removal is checked by chunk absence.
for (const fixture of fixtures.filter(f => f.name.endsWith('.webp') && !f.preserveIcc)) {
  test(`WebP preserves orientation and encoded payload: ${fixture.name}`, async () => {
    const a = app(), input = Buffer.from(fixture.base64, 'base64');
    const { output, after } = await clean(a, input, fixture.name);
    const parsed = await ExifReader.load(output, { expanded: true });
    assert.equal(parsed.exif?.Orientation?.value ?? 1, fixture.orientation);
    assert.deepEqual(Object.keys(parsed.exif || {}), fixture.orientation === 1 ? [] : ['Orientation']);
    assert.equal(after.risk.score, 0);
    assert.ok(!after.metadata.some(x => a.classifyTag(x)), 'private fields should be removed');
    const beforeChunks = webpChunks(input), afterChunks = webpChunks(output);
    assert.equal(afterChunks.filter(c => c.type === 'EXIF').length, fixture.orientation === 1 ? 0 : 1);
    assert.equal(afterChunks.filter(c => c.type === 'XMP ').length, 0);
    const payload = c => !['EXIF', 'XMP ', 'VP8X'].includes(c.type);
    assert.deepEqual(afterChunks.filter(payload).map(c => c.bytes), beforeChunks.filter(payload).map(c => c.bytes));
    const beforeHeader = beforeChunks.find(c => c.type === 'VP8X');
    const header = afterChunks.find(c => c.type === 'VP8X');
    if (header) {
      assert.equal(header.data[0] & 0x08, fixture.orientation === 1 ? 0 : 0x08);
      assert.equal(header.data[0] & 0x04, 0);
      assert.equal(header.data[0] & ~0x0c, beforeHeader.data[0] & ~0x0c);
      assert.deepEqual(header.data.subarray(1), beforeHeader.data.subarray(1));
    }
  });
}

test('WebP retains color profile bytes and truthfully reports its remaining ICC metadata', async () => {
  const a = app(), input = bytesFor('color-profile.webp');
  const { output, after } = await clean(a, input, 'color-profile.webp');
  const beforeChunks = webpChunks(input), afterChunks = webpChunks(output);
  assert.deepEqual(afterChunks.find(c => c.type === 'ICCP').bytes, beforeChunks.find(c => c.type === 'ICCP').bytes);
  assert.deepEqual(afterChunks.find(c => c.type === 'VP8L').bytes, beforeChunks.find(c => c.type === 'VP8L').bytes);
  assert.equal(afterChunks.find(c => c.type === 'VP8X').data[0] & 0x2c, 0x28);
  assert.ok(!afterChunks.some(c => c.type === 'XMP '));
  assert.deepEqual(Object.keys(after.tags.exif), ['Orientation']);
  assert.equal(after.tags.exif.Orientation.value, 6);
  const sensitive = after.metadata.filter(x => a.classifyTag(x));
  assert.ok(sensitive.length > 0, 'existing ICC warnings must not be silently suppressed');
  assert.ok(sensitive.every(x => x.group === 'icc'));
  assert.equal(after.risk.score, 25);
  assert.deepEqual(Object.keys(after.risk.found).sort(), ['device', 'identity', 'text']);
});

test('JPEG clean retains Orientation 6 without warning for absent JFIF thumbnail', async () => {
  const a = app();
  const { output, after } = await clean(a, bytesFor('control.jpg'), 'control.jpg');
  const parsed = await ExifReader.load(output, { expanded: true });
  assert.equal(parsed.exif.Orientation.value, 6);
  assert.deepEqual(Object.keys(parsed.exif), ['Orientation']);
  assert.equal(parsed.jfif['JFIF Thumbnail Width'].value, 0);
  assert.equal(parsed.jfif['JFIF Thumbnail Height'].value, 0);
  assert.equal(after.risk.score, 0);
  assert.ok(!after.risk.found.thumbnail);
  assert.ok(after.metadata.filter(x => /JFIF Thumbnail/.test(x.key)).every(x => !a.classifyTag(x)));
  const scan = bytes => bytes.subarray(bytes.indexOf(Buffer.from([0xff, 0xda])));
  assert.deepEqual(scan(output), scan(bytesFor('control.jpg')));
});

for (const name of ['control.png', 'no-metadata.png']) {
  test(`PNG control stays cleanable: ${name}`, async () => {
    const a = app();
    const { output, after } = await clean(a, bytesFor(name), name);
    assert.equal(after.risk.score, 0);
    const idat = bytes => { const parts = []; for (let p = 8; p + 12 <= bytes.length;) { const len = bytes.readUInt32BE(p); if (bytes.toString('ascii', p + 4, p + 8) === 'IDAT') parts.push(bytes.subarray(p + 8, p + 8 + len)); p += 12 + len; } return parts; };
    assert.deepEqual(idat(output), idat(bytesFor(name)));
  });
}

test('a real nonempty JFIF thumbnail still produces a warning', async () => {
  const a = app(), source = bytesFor('control.jpg');
  // Valid 1x1 RGB JFIF thumbnail, rather than a mocked parser result.
  const marker = source.indexOf(Buffer.from([0xff, 0xe0]));
  assert.equal(source.toString('ascii', marker + 4, marker + 9), 'JFIF\0');
  const end = marker + 2 + source.readUInt16BE(marker + 2);
  const head = Buffer.from(source.subarray(0, end));
  head.writeUInt16BE(source.readUInt16BE(marker + 2) + 3, marker + 2);
  head[marker + 16] = 1; head[marker + 17] = 1;
  const input = Buffer.concat([head, Buffer.from([255, 0, 0]), source.subarray(end)]);
  const it = await a.analyzeFile(file(input, 'thumbnail.jpg', 'image/jpeg'));
  assert.equal(it.tags.jfif['JFIF Thumbnail Width'].value, 1);
  assert.equal(it.tags.jfif['JFIF Thumbnail Height'].value, 1);
  assert.ok(it.risk.found.thumbnail);
  const { after } = await clean(a, input, 'thumbnail.jpg');
  assert.ok(after.risk.found.thumbnail, 'retained JFIF thumbnail must still be disclosed');
  assert.equal(after.risk.score, 5);
});

test('thumbnail payloads and unrelated zero metadata remain sensitive', () => {
  const a = app();
  assert.equal(a.classifyTag({ group: 'thumbnail', key: 'Thumbnail', raw: { image: new Uint8Array([1, 2, 3]) } }), 'thumbnail');
  assert.equal(a.classifyTag({ group: 'exif', key: 'ThumbnailOffset', raw: { value: 0 } }), 'thumbnail');
  assert.equal(a.classifyTag({ group: 'gps', key: 'Latitude', raw: 0 }), 'gps');
});

test('single-clean verification JSON discloses retained orientation as nonsensitive', async () => {
  const a = app();
  const item = await a.analyzeFile(file(bytesFor('browser-orientation-6.webp'), 'oriented.webp', 'image/webp'));
  a.state.items.push(item); a.state.current = 0;
  await a.doClean('lossless');
  assert.ok(a.state.cleanResult);
  assert.equal(a.node('verifyDialog').open, true);
  a.node('downloadReportButton').click();
  const report = JSON.parse(await a.downloads.at(-1).blob.text());
  assert.equal(report.after.method, 'lossless');
  assert.equal(report.after.risk.score, 0);
  assert.ok(report.after.metadata.some(x => x.tag === 'Orientation' && x.sensitive === false));
  assert.ok(!report.after.metadata.some(x => x.sensitive));
});

test('batch clean uses the same orientation-preserving WebP path', async () => {
  const a = app();
  a.state.items.push(await a.analyzeFile(file(bytesFor('browser-orientation-6.webp'), 'oriented.webp', 'image/webp')));
  await a.batchClean();
  assert.equal(a.downloads.length, 1);
  const zip = fflate.unzipSync(new Uint8Array(await a.downloads[0].blob.arrayBuffer()));
  assert.deepEqual(Object.keys(zip), ['oriented-clean.webp']);
  const parsed = await ExifReader.load(Buffer.from(zip['oriented-clean.webp']), { expanded: true });
  assert.deepEqual(Object.keys(parsed.exif), ['Orientation']);
  assert.equal(parsed.exif.Orientation.value, 6);
});
