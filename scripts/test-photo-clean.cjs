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
  const canvasExports = [];
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
    createElement: tag => {const el=node(Symbol());if(tag==='canvas'){el.getContext=()=>({drawImage(){}});el.toBlob=callback=>canvasExports.push(callback);}return el;}, addEventListener() {}, documentElement: {}, body: node('body') },
    navigator: { language }, crypto: webcrypto, Blob, File, ArrayBuffer, Uint8Array, DataView, TextDecoder, TextEncoder, Response,
    URL: { createObjectURL(blob) { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; }, revokeObjectURL() {} },
    setTimeout(fn, delay) { return delay === 0 ? setTimeout(fn, 0) : 0; }, clearTimeout() {},
    console: { error() {}, warn() {} }, atob, btoa });
  let html = fs.readFileSync(path.resolve(root, process.env.APP_HTML || 'src/index.template.html'), 'utf8');
  const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  if (payload) html = require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8');
  html = html.replace('/*__AI_METADATA_SOURCE__*/', () => fs.readFileSync(path.join(root, 'src/ai-metadata.js'), 'utf8'));
  const script = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.api={state,analyzeFile,addFiles,inspectBlob,doClean,batchClean,applyLanguage,clearAll,privacyClean,showVerification,renderCurrent,resetVerification,flattenMetadata,classifyTag,assess,t,setLanguage(value){lang=value;applyLanguage()}};})();'), context);
  context.api.state.ExifReader = ExifReader;
  context.api.state.fflate = fflate;
  return { ...context.api, node, downloads, runtime:context, canvasExports };
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
  assert.equal(after.risk.score, 19); // Zero-filled ICC device identifiers are absent; other profile values remain reviewable.
  assert.deepEqual(Object.keys(after.risk.found).sort(), ['identity', 'text']);
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

function syntheticAiPng() {
  const base=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
  const data=Buffer.from('parameters\0synthetic test image\nNegative prompt: none\nSteps: 20, Sampler: Euler, CFG scale: 7, Seed: 123');
  const body=Buffer.concat([Buffer.from('tEXt'),data]);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([base.subarray(0,-12),len,body,sum,base.subarray(-12)]);
}
test('AI generation records are detected, cleaned without re-encoding, and verified absent',async()=>{
 const a=app(),bytes=syntheticAiPng();const result=await clean(a,bytes,'synthetic-ai.png');
 assert.equal(result.before.aiMetadata.hasAiRecords,true);
 assert.equal(result.after.aiMetadata.status,'none');assert.equal(result.after.aiMetadata.clean,true);
 assert.ok(!result.output.includes(Buffer.from('Negative prompt')));
 assert.deepEqual(result.output,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64'));
});
test('remaining AI records block clean-output verification',async()=>{
 const a=app();await assert.rejects(a.inspectBlob(new Blob([syntheticAiPng()],{type:'image/png'}),'unremoved.png'),/AI|provenance|埋め込み/);
});
test('single clean verification report records AI before and after states',async()=>{
 const a=app();a.state.items.push(await a.analyzeFile(file(syntheticAiPng())));a.state.current=0;await a.doClean('lossless');
 assert.ok(a.state.cleanResult);a.node('downloadReportButton').click();const report=JSON.parse(await a.downloads.at(-1).blob.text());
 assert.equal(report.before.aiMetadata.hasAiRecords,true);assert.equal(report.after.aiMetadata.clean,true);
});
test('AI notices explain absence, unsigned provenance and pixel-watermark limitations in both languages',()=>{
 for(const lang of ['en','ja']){const a=app(lang);assert.notEqual(a.t('aiDisclaimer'),'aiDisclaimer');assert.notEqual(a.t('aiCleanWarning'),'aiCleanWarning');assert.notEqual(a.t('aiNone'),'aiNone');}
});
test('structurally invalid metadata is rejected before vendor parsing',async()=>{
 const a=app();let calls=0;a.state.ExifReader={load(){calls++;throw new Error('unexpected vendor call');}};
 await assert.rejects(a.analyzeFile(file(Buffer.from([255,216,255,235,0,30,74,80,0]),'truncated.jpg','image/jpeg')));
 assert.equal(calls,0);
});
test('input and output parsing explicitly bound decompressed metadata',async()=>{
 const a=app(),limits=[];a.state.ExifReader={load(buffer,options){limits.push(options.decompress?.maxDecompressedSize);return ExifReader.load(buffer,options);}};
 await clean(a,syntheticAiPng(),'synthetic-ai.png');assert.equal(limits.length,2);for(const limit of limits)assert.ok(limit>0&&limit<=16*1024*1024);
});
test('vendor suppressed decompression failures remain unavailable analysis',async()=>{
 const a=app();a.state.ExifReader={load(){return {png:{Comment:{value:'<text using unknown compression>'}}};}};
 await assert.rejects(a.analyzeFile(file(syntheticAiPng())),/Unable to analyze/);
});

const aiFixtures = require('../tests/fixtures/ai-metadata.cjs');
function addProvenance(bytes, kind) {
 const record=aiFixtures.manifest();
 if(kind==='jpeg')return Buffer.concat([bytes.subarray(0,2),aiFixtures.jp(record),bytes.subarray(2)]);
 if(kind==='png')return Buffer.concat([bytes.subarray(0,-12),aiFixtures.chunk('caBX',record),bytes.subarray(-12)]);
 const out=Buffer.concat([bytes,aiFixtures.riffChunk('C2PA',record)]);out.writeUInt32LE(out.length-8,4);return out;
}
for(const [name,kind] of [['control.jpg','jpeg'],['control.png','png'],['browser-orientation-6.webp','webp']]) {
 test(`real parser and Privacy Clean remove C2PA from ${kind} without changing cleaned image bytes`,async()=>{
  const a=app(),base=bytesFor(name),input=addProvenance(base,kind),result=await clean(a,input,'c2pa-'+name);
  assert.equal(result.before.aiMetadata.hasProvenance,true);assert.equal(result.before.aiMetadata.hasAiRecords,false);
  assert.equal(result.after.aiMetadata.clean,true);assert.equal(result.after.aiMetadata.hasProvenance,false);
  const control=await clean(a,base,name);assert.deepEqual(result.output,control.output);
 });
}
test('batch cleans AI and C2PA records, and its output passes independent record verification',async()=>{
 const a=app();a.state.items.push(await a.analyzeFile(file(syntheticAiPng(),'ai.png')));a.state.items.push(await a.analyzeFile(file(addProvenance(bytesFor('control.jpg'),'jpeg'),'provenance.jpg','image/jpeg')));
 await a.batchClean();assert.equal(a.downloads.length,1);const files=fflate.unzipSync(new Uint8Array(await a.downloads[0].blob.arrayBuffer()));
 assert.deepEqual(Object.keys(files).sort(),['ai-clean.png','provenance-clean.jpg']);
 for(const [name,bytes] of Object.entries(files)){const verified=await a.inspectBlob(new Blob([bytes]),name);assert.equal(verified.aiMetadata.clean,true);}
});

function syntheticMultiJpeg(){return aiFixtures.multiJpeg(addProvenance(bytesFor('control.jpg'),'jpeg'),bytesFor('control.jpg'));}
test('multiple JPEG input inspects each image and offers explicit SDR export',async()=>{
 const a=app();const input=syntheticMultiJpeg(),item=await a.analyzeFile(file(input,'synthetic-hdr.jpg','image/jpeg'));
 assert.equal(item.aiMetadata.multiImage,true);assert.equal(item.aiMetadata.secondaryMetadataInspected,true);assert.equal(item.aiMetadata.hasProvenance,true);
 assert.equal(item.tagSets.length,2);assert.ok(item.metadata.some(row=>row.imageIndex===1));
 a.state.items.push(item);a.state.current=0;a.applyLanguage();a.node('cleanButton').click();
 assert.match(a.node('cleanButton').textContent,/SDR/);assert.equal(a.node('losslessClean').disabled,true);assert.equal(a.node('multiImageWarning').hidden,false);
 assert.match(a.node('multiImageWarning').textContent,/HDR/);assert.match(a.node('multiImageWarning').textContent,/original/i);
 assert.match(a.node('deepCleanLabel').textContent,/SDR/);await assert.rejects(a.privacyClean(item),/SDR|multiple|multi/i);
});
test('explicit multi-image Deep Clean decodes only primary JPEG, re-encodes, and verifies output',async()=>{
 const a=app(),input=syntheticMultiJpeg(),item=await a.analyzeFile(file(input,'synthetic-hdr.jpg','image/jpeg'));a.state.items.push(item);a.state.current=0;
 const decoded=[];a.runtime.createImageBitmap=async(blob)=>{decoded.push(Buffer.from(await blob.arrayBuffer()));return {width:1,height:1,close(){}};};
 const control=await a.privacyClean(await a.analyzeFile(file(bytesFor('control.jpg'),'control.jpg','image/jpeg')));
 const pending=a.doClean('deep');await new Promise(r=>setImmediate(r));assert.equal(a.canvasExports.length,1);a.canvasExports[0](control.blob);await pending;
 assert.equal(decoded.length,1);assert.ok(decoded[0].length<item.aiMetadata.images[0].end);assert.equal(decoded[0].includes(Buffer.from("MPF\0")),false,"decoder input must not retain dangling auxiliary-image references");assert.equal(decoded[0][0],255);assert.equal(decoded[0][1],216);assert.equal(decoded[0].at(-1),217);
 assert.equal(a.state.cleanResult.result.method,'deep');assert.equal(a.state.cleanResult.after.aiMetadata.clean,true);assert.equal(a.state.cleanResult.after.aiMetadata.multiImage,false);assert.deepEqual(Buffer.from(item.buffer),input);
});
test('both languages explicitly distinguish SDR export and HDR loss',async()=>{
 for(const lang of ['en','ja']){const a=app(lang);assert.notEqual(a.t('multiImageWarning'),'multiImageWarning');assert.match(a.t('multiImageWarning'),/HDR/);assert.match(a.t('exportSdr'),/SDR/);}
});

test('secondary-only metadata contributes to visible privacy findings',async()=>{
 const a=app(),secondary=await a.analyzeFile(file(bytesFor('control.jpg'),'secondary.jpg','image/jpeg'));
 const cleanPrimary=await a.privacyClean(secondary);const primary=Buffer.from(await cleanPrimary.blob.arrayBuffer());
 const item=await a.analyzeFile(file(aiFixtures.multiJpeg(primary,bytesFor('control.jpg')),'secondary-private.jpg','image/jpeg'));
 assert.ok(item.metadata.some(row=>row.imageIndex===1&&a.classifyTag(row)));assert.equal(item.risk.score,secondary.risk.score);assert.ok(item.risk.found.gps);
 assert.equal(item.aiMetadata.secondaryMetadataInspected,true);
});
test('bulk ZIP does not silently convert multi-image JPEGs to SDR',async()=>{
 const a=app();a.state.items.push(await a.analyzeFile(file(syntheticMultiJpeg(),'hdr.jpg','image/jpeg')));
 a.runtime.createImageBitmap=()=>assert.fail('batch must not re-encode');await a.batchClean();
 assert.equal(a.downloads.length,0);assert.deepEqual(Array.from(a.state.batchFailures),['hdr.jpg']);
});
test('AI tool records stored only in an auxiliary JPEG are inspected',async()=>{
 const a=app(),cleaned=await a.privacyClean(await a.analyzeFile(file(bytesFor('control.jpg'),'base.jpg','image/jpeg'))),base=Buffer.from(await cleaned.blob.arrayBuffer());
 const exif=Buffer.from([69,120,105,102,0,0,77,77,0,42,0,0,0,8,0,1,1,49,0,2,0,0,0,8,0,0,0,26,0,0,0,0,...Buffer.from('ComfyUI\0')]);
 const secondary=Buffer.concat([base.subarray(0,2),aiFixtures.segment(0xe1,exif),base.subarray(2)]);
 const item=await a.analyzeFile(file(aiFixtures.multiJpeg(base,secondary),'secondary-ai.jpg','image/jpeg'));
 assert.equal(item.aiMetadata.hasAiRecords,true);assert.ok(item.aiMetadata.records.some(record=>record.kind==='tool'));
 assert.ok(item.metadata.some(row=>row.imageIndex===1&&row.key==='Software'&&row.value.includes('ComfyUI')));
});

// Browser-generated from the repository's synthetic MPF fixture; never a user photo.
test('Canvas-generated standard sRGB ICC fields do not create false privacy findings',async()=>{
 const a=app(),bytes=fs.readFileSync(path.join(root,'tests/fixtures/browser-sdr-srgb.jpg'));
 const item=await a.analyzeFile(file(bytes,'canvas-srgb.jpg','image/jpeg'));
 assert.ok(item.metadata.some(row=>row.group==='icc'&&row.key==='ICC Description'&&row.value==='sRGB'));
 assert.equal(item.risk.score,0);assert.equal(item.metadata.filter(row=>a.classifyTag(row)).length,0);
});
test('custom ICC identifiers, descriptions and copyrights remain privacy-sensitive',()=>{
 const a=app();for(const [key,value] of [['Device Model Number','Private camera 123'],['Profile Creator','Private owner'],['ICC Description','sRGB with private project notes'],['ICC Copyright','Alice Private']])assert.ok(a.classifyTag({group:'icc',key,value,raw:{value}}),key);
 assert.ok(a.classifyTag({group:'exif',key:'UserComment',value:'Private user notes',raw:{value:'Private user notes'}}));
 assert.ok(a.classifyTag({group:'exif',key:'UserComment',value:'sRGB',raw:{value:'sRGB'}}));
 for(const [key,value] of [['Profile Creator','\0\0\0X'],['Profile Creator','\0\0\0\0Private'],['ICC Description','sRGB\0Private'],['ICC Copyright','Google Inc. 2016 Private']])assert.ok(a.classifyTag({group:'icc',key,value}),key);
 assert.ok(a.classifyTag({group:'xmp',key:'ICC Description',value:'sRGB'}));
});
test('remaining findings after Deep Clean recommend review, not another identical Deep Clean',async()=>{
 for(const lang of ['en','ja']){const a=app(lang),original=await a.analyzeFile(file(bytesFor('control.jpg'),'control.jpg','image/jpeg'));
 a.state.cleanResult={original,result:{method:'deep',name:'copy.jpg'},after:{risk:{score:25},metadata:[],hash:'123'}};a.showVerification();
 assert.equal(a.node('verifySummary').textContent,a.t('stillRiskAfterDeep'));assert.notEqual(a.t('stillRiskAfterDeep'),'stillRiskAfterDeep');}
});

test('verified-copy notice persists without replacing original findings and stays scoped to its photo',async()=>{
 for(const language of ['ja','en']){
  const a=app(language),item=await a.analyzeFile(file(bytesFor('control.jpg'),'source.jpg','image/jpeg'));
  const untouched=Buffer.from(item.buffer),originalScore=item.risk.score;
  a.state.items.push(item);a.state.current=0;a.renderCurrent();assert.equal(a.node('copyVerificationNotice').hidden,true);
  await a.doClean('lossless');assert.ok(a.state.cleanResult);assert.equal(a.node('copyVerificationNotice').hidden,false);
  assert.equal(a.node('copyVerificationNotice').textContent,a.t('copyVerifiedNotice'));assert.notEqual(a.t('copyVerifiedNotice'),'copyVerifiedNotice');
  a.resetVerification();a.renderCurrent();assert.equal(a.node('copyVerificationNotice').hidden,false);
  assert.equal(item.risk.score,originalScore);assert.deepEqual(Buffer.from(item.buffer),untouched);
  a.state.items.push(await a.analyzeFile(file(bytesFor('control.jpg'),'other.jpg','image/jpeg')));a.state.current=1;a.renderCurrent();assert.equal(a.node('copyVerificationNotice').hidden,true);
  a.state.current=0;a.renderCurrent();assert.equal(a.node('copyVerificationNotice').hidden,false);
 }
});
test('failed verification never produces a verified-copy notice',async()=>{
 const a=app(),item=await a.analyzeFile(file(bytesFor('control.jpg'),'broken.jpg','image/jpeg'));
 item.buffer=new Uint8Array([1,2,3]).buffer;a.state.items.push(item);a.state.current=0;
 await a.doClean('lossless');a.renderCurrent();assert.equal(a.node('copyVerificationNotice').hidden,true);assert.equal(a.state.cleanResult,null);
});

test('cancelled cleaning cannot attach a copy-verification notice',async()=>{
 const a=app(),item=await a.analyzeFile(file(bytesFor('control.jpg'),'cancelled.jpg','image/jpeg'));
 a.state.items.push(item);a.state.current=0;
 let release;a.runtime.createImageBitmap=()=>new Promise(resolve=>release=resolve);
 const pending=a.doClean('deep');a.clearAll();release({width:1,height:1,close(){}});
 while(!a.canvasExports.length)await new Promise(resolve=>setTimeout(resolve,0));a.canvasExports[0](new Blob([bytesFor('control.jpg')],{type:'image/jpeg'}));await pending;
 assert.equal(item.clean,null);assert.equal(a.state.items.length,0);assert.equal(a.node('copyVerificationNotice').hidden,true);
});
