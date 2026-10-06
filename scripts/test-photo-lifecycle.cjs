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
  let html = fs.readFileSync(path.resolve(root, process.env.APP_HTML || 'src/index.template.html'), 'utf8');
  const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  if (payload) html = require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8');
  const nodes = new Map();
  let focused = null;
  const downloads = [];
  const canvasExports = [];
  const blobs = new Map();
  const revoked = [];
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      const handlers = {};
      nodes.set(id, { textContent: '', innerHTML: '', value: '', checked: false, hidden: false, open: false,
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, on) { on ? classes.add(x) : classes.delete(x); } },
        style: { setProperty() {} }, addEventListener: (event, fn) => { handlers[event] = fn; },
        appendChild() {}, insertAdjacentHTML() {}, setAttribute() {}, removeAttribute() {}, remove() {}, focus() { focused=id; },
        showModal() { this.open = true; }, close() { this.open = false; },
        click() { if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) }); else handlers.click?.(); },
        closest() { return null; }, handlers });
    }
    return nodes.get(id);
  }
  const closeButtons=[...html.matchAll(/<button\b([^>]*data-close="([^"]+)"[^>]*)>/g)].map(match=>{const id=match[1].match(/\bid="([^"]+)"/);const el=node(id?id[1]:Symbol());el.dataset={close:match[2]};return el;});
  node('app-config').textContent = fs.readFileSync(path.join(root, 'app.config.json'), 'utf8');
  node('build-manifest').textContent = '{}';
  const context = vm.createContext({ document: { getElementById: node, querySelectorAll: selector => selector === "[data-close]" ? closeButtons : [],
    createElement: tag => { const el=node(Symbol());if(tag==='canvas'){el.getContext=()=>({drawImage(){}});el.toBlob=callback=>canvasExports.push(callback);}return el; }, addEventListener() {}, documentElement: {}, body: node('body') },
    navigator: { language }, crypto: webcrypto, Blob, File, ArrayBuffer, Uint8Array, DataView, TextDecoder, Response,
    URL: { createObjectURL(blob) { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; }, revokeObjectURL(url) { revoked.push(url); } },
    setTimeout(fn, delay) { return delay === 0 ? setTimeout(fn, 0) : 0; }, clearTimeout() {},
    console: { error() {}, warn() {} }, atob, btoa });
  const script = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.api={state,analyzeFile,addFiles,inspectBlob,doClean,batchClean,applyLanguage,clearAll,t,setLanguage(value){lang=value;applyLanguage()}};})();'), context);
  context.api.state.ExifReader = ExifReader;
  context.api.state.fflate = fflate;
  return { ...context.api, node, downloads, revoked, blobs, html, runtime:context, canvasExports, closeButtons, get focused(){return focused;} };
}
const file = (bytes, name = 'synthetic.png', type = 'image/png') => new File([bytes], name, { type });


function gateParser(a, fail = false) {
  let release;
  const entered = new Promise(resolve => { a.state.ExifReader = { async load(buffer, options) {
    resolve();
    await new Promise(r => { release = r; });
    if (fail) throw new Error('Synthetic delayed parser failure');
    return ExifReader.load(buffer, options);
  }}; });
  return { entered, release: () => release() };
}
async function seed(a) { a.state.items.push(await a.analyzeFile(file(png, 'already-added.png'))); a.state.current = 0; }
test('clear after completed import stays empty', async () => {
 const a = app(); await a.addFiles([file(png)]); a.clearAll();
 assert.equal(a.state.items.length, 0); assert.equal(a.node('workspace').classList.contains('show'), false);
});
test('ordinary delayed import completes once', async () => {
 const a = app(); const g = gateParser(a); const pending = a.addFiles([file(png)]);
 await g.entered; g.release(); await pending;
 assert.equal(a.state.items.length, 1); assert.equal(a.node('workspace').classList.contains('show'), true);
});
test('clear while import parses should prevent late photo resurrection', async () => {
 const a = app(); await seed(a); const g = gateParser(a);
 const pending = a.addFiles([file(png, 'late.png')]); await g.entered;
 a.clearAll(); g.release(); await pending;
 assert.equal(a.state.items.length, 0, 'late parser completion restored a cleared photo');
 assert.equal(a.node('workspace').classList.contains('show'), false);
});
test('clear while import fails should prevent late error resurrection', async () => {
 const a = app(); await seed(a); const g = gateParser(a, true);
 const pending = a.addFiles([file(png, 'late-failure.png')]); await g.entered;
 a.clearAll(); g.release(); await pending;
 assert.equal(a.state.analysisFailures.length, 0, 'late parser failure restored a cleared name');
});
test('ordinary delayed clean verifies', async () => {
 const a = app(); await seed(a); const g = gateParser(a);
 const pending = a.doClean('lossless'); await g.entered; g.release(); await pending;
 assert.ok(a.state.cleanResult); assert.equal(a.node('verifyDialog').open, true);
});
test('clear while cleaning should prevent late clean result', async () => {
 const a = app(); await seed(a); const g = gateParser(a);
 const pending = a.doClean('lossless'); await g.entered;
 a.node('cleanDialog').close(); a.clearAll(); g.release(); await pending;
 assert.equal(a.state.cleanResult === null, true, 'late clean completion restored cleared photo and output');
 assert.equal(a.node('verifyDialog').open, false);
});
test('ordinary delayed batch downloads verified ZIP', async () => {
 const a = app(); await seed(a); const g = gateParser(a);
 const pending = a.batchClean(); await g.entered; g.release(); await pending;
 assert.equal(a.downloads.length, 1);
});
test('clear while batch cleaning should stop late ZIP download', async () => {
 const a = app(); await seed(a); const g = gateParser(a);
 const pending = a.batchClean(); await g.entered;
 a.clearAll(); g.release(); await pending;
 assert.equal(a.downloads.length, 0, 'late batch completion still downloaded cleared photos');
});

for (const index of [0, 1, 2]) test(`remove index ${index} preserves neighbors and selects next or previous`, async () => {
 const a = app(); await a.addFiles([file(png, 'first.png'), file(png, 'middle.png'), file(png, 'last.png')]);
 const original = [...a.state.items], removedUrl=original[index].url; a.state.current=index;
 a.node('removeButton').click();
 assert.equal(a.node('removeDialog').open, true, 'in-app remove confirmation should open');
 assert.equal(a.node('removePhotoName').textContent, original[index].file.name);
 assert.equal(a.state.items.length, 3, 'requesting removal must not mutate photos');
 a.node('confirmRemove').click();
 assert.deepEqual([...a.state.items], original.filter((_, i) => i !== index));
 assert.equal(a.state.current, Math.min(index, 1));
 assert.equal(a.node('photoName').textContent, original[index === 2 ? 1 : index + 1].file.name);
 assert.deepEqual(a.revoked, [removedUrl]);
 assert.equal(a.node('removeDialog').open, false);
 await a.doClean('lossless'); assert.ok(a.state.cleanResult, 'retained photos remain cleanable');
});
test('remove only photo clears detail, progress and dialogs without deleting original bytes', async () => {
 const a = app(); const input=file(png, 'only.png'); await a.addFiles([input]); await a.doClean('lossless');
 const original=a.state.items[0], removedUrl=original.url; a.node('removeButton').click(); a.node('confirmRemove').click();
 assert.equal(a.state.items.length,0); assert.equal(a.state.current,-1);
 assert.equal(a.state.cleanResult,null); assert.equal(a.node('verifyDialog').open,false);
 assert.equal(a.node('workspace').classList.contains('show'),false);
 assert.equal(a.node('previewWrap').innerHTML,''); assert.equal(a.node('photoName').textContent,'');
 assert.deepEqual(a.revoked,[removedUrl]); assert.deepEqual(Buffer.from(await input.arrayBuffer()),png);
});
test('cancel and Esc leave photos, selection, URLs and pending work untouched', async () => {
 for(const dismiss of ['cancelRemove','escape']) {
  const a=app(); await a.addFiles([file(png)]); const original=a.state.items[0];
  a.node('removeButton').click(); assert.equal(a.node('removeDialog').open,true);
  if(dismiss==='escape') {a.node('removeDialog').handlers.cancel?.({}); a.node('removeDialog').close();} else a.node(dismiss).click();
  a.node('confirmRemove').click();
  assert.equal(a.state.items[0],original); assert.equal(a.state.current,0); assert.deepEqual(a.revoked,[]);
 }
});
test('confirmation targets the named photo even if selection changes', async () => {
 const a=app(); await a.addFiles([file(png,'a.png'),file(png,'b.png'),file(png,'c.png')]);
 const [first,,third]=a.state.items; a.node('removeButton').click(); a.state.current=2; a.node('confirmRemove').click();
 assert.equal(a.state.items.includes(first),false); assert.equal(a.state.items[a.state.current],third);
});
test('clear releases all preview URLs and erases hidden detail and verification fields', async () => {
 const a=app(); await a.addFiles([file(png,'a.png'),file(png,'b.png')]); await a.doClean('lossless');
 const urls=a.state.items.map(it=>it.url); a.clearAll();
 assert.deepEqual(a.revoked,[...urls]); assert.equal(a.node('verifyDialog').open,false);
 assert.equal(a.node('previewWrap').innerHTML,''); assert.equal(a.node('cleanFileName').value,'');
 assert.equal(a.node('verifyList').innerHTML,''); assert.equal(a.node('dropStatus').textContent,'');
 assert.equal(a.node('progress').classList.contains('show'),false);
});
test('a discarded late import preview is revoked', async () => {
 const a=app(); const g=gateParser(a); const p=a.addFiles([file(png)]); await g.entered; a.clearAll(); g.release(); await p;
 assert.equal(a.state.items.length,0); assert.equal(a.blobs.size,1); assert.deepEqual(a.revoked,[...a.blobs.keys()]);
});
test('old import completion cannot reset a newer import progress or error state', async () => {
 const a=app(); const old=gateParser(a); const first=a.addFiles([file(png,'old.png')]); await old.entered; a.clearAll();
 const newer=gateParser(a); const second=a.addFiles([file(png,'new.png')]); await newer.entered;
 old.release(); await first;
 assert.equal(a.node('progress').classList.contains('show'),true);
 assert.match(a.node('dropStatus').textContent,/Analyzing/i); assert.equal(a.state.items.length,0);
 newer.release(); await second; assert.deepEqual(Array.from(a.state.items,it=>it.file.name),['new.png']);
});
for(const fail of [false,true]) test(`remove cancels delayed import ${fail?'failure':'success'}`,async()=>{
 const a=app(); await seed(a); const g=gateParser(a,fail); const pending=a.addFiles([file(png,'late.png')]); await g.entered;
 a.node('removeButton').click(); a.node('confirmRemove').click(); g.release(); await pending;
 assert.equal(a.state.items.length,0); assert.equal(a.state.analysisFailures.length,0); assert.equal(a.node('dropStatus').textContent,'');
});
test('remove cancels pending clean verification and stale download actions',async()=>{
 const a=app(); await seed(a); const g=gateParser(a); const pending=a.doClean('lossless'); await g.entered;
 a.node('removeButton').click(); a.node('confirmRemove').click(); g.release(); await pending;
 a.node('downloadCleanButton').click(); a.node('downloadReportButton').click();
 assert.equal(a.state.cleanResult,null); assert.equal(a.node('verifyDialog').open,false); assert.equal(a.downloads.length,0);
});
test('old clean error cannot overwrite a new clean operation',async()=>{
 const a=app(); await seed(a); const g=gateParser(a,true); const pending=a.doClean('lossless'); await g.entered;
 a.clearAll(); a.state.ExifReader=ExifReader; await seed(a); await a.doClean('lossless'); const result=a.state.cleanResult;
 g.release(); await pending; assert.equal(a.state.cleanResult,result); assert.doesNotMatch(a.node('cleanStatus').textContent,/failed|cannot/i);
});
test('repeated cleans only publish the latest result',async()=>{
 const a=app(); await seed(a); const g=gateParser(a); const pending=a.doClean('lossless'); await g.entered;
 a.state.ExifReader=ExifReader; await a.doClean('lossless'); const result=a.state.cleanResult; g.release(); await pending;
 assert.equal(a.state.cleanResult,result);
});
test('Esc during cleaning suppresses late verification',async()=>{
 const a=app(); await seed(a); const g=gateParser(a); const pending=a.doClean('lossless'); await g.entered;
 a.node('cleanDialog').handlers.cancel?.({}); a.node('cleanDialog').close(); g.release(); await pending;
 assert.equal(a.state.cleanResult,null); assert.equal(a.node('verifyDialog').open,false);
});
for(const action of ['clear','remove']) test(`${action} cancels a batch after one verified output without partial ZIP`,async()=>{
 const a=app(); await a.addFiles([file(png,'a.png'),file(png,'b.png')]);
 let entered,release; const waiting=new Promise(r=>entered=r); let count=0;
 a.state.ExifReader={async load(buffer,options){if(++count===2){entered(); await new Promise(r=>release=r);} return ExifReader.load(buffer,options);}};
 const pending=a.batchClean(); await waiting;
 if(action==='clear') a.clearAll(); else {a.node('removeButton').click(); a.node('confirmRemove').click();}
 release(); await pending; assert.equal(a.downloads.length,0); assert.equal(a.state.batchFailures.length,0);
 assert.equal(a.node('progress').classList.contains('show'),false);
});

test('removal controls and both translations explain scope and original preservation',()=>{
 const a=app();
 for(const id of ['removeButton','removeDialog','removeTitle','removeText','removePhotoName','cancelRemove','confirmRemove']) assert.match(a.html,new RegExp(`id="${id}"`));
 assert.match(a.html, /id="removeDialog" aria-labelledby="removeTitle" aria-describedby="removePhotoName removeText"/);
 assert.match(a.t('removePhoto'),/Remove this photo/); assert.match(a.t('removeText'),/original file will not be changed/i);
 assert.match(a.t('clearText'),/cancel/i); assert.match(a.t('helpRemove'),/partial ZIP/);
 a.setLanguage('ja'); assert.match(a.t('removePhoto'),/この写真/); assert.match(a.t('removeText'),/元ファイルは変更されません/);
 assert.match(a.t('helpRemove'),/一部.*ZIP|途中.*ZIP/);
});
for(const dismiss of ['cancelRemove','escape']) test(`${dismiss} keeps a pending import alive`,async()=>{
 const a=app(); await seed(a); const g=gateParser(a); const pending=a.addFiles([file(png,'keep.png')]); await g.entered;
 a.node('removeButton').click();
 if(dismiss==='escape'){a.node('removeDialog').handlers.cancel?.({});a.node('removeDialog').close();}else a.node(dismiss).click();
 g.release();await pending;assert.equal(a.state.items.length,2);assert.deepEqual(a.revoked,[]);
});
test('superseded import revokes discarded preview without clear',async()=>{
 const a=app();const g=gateParser(a);const old=a.addFiles([file(png,'old.png')]);await g.entered;
 a.state.ExifReader=ExifReader;await a.addFiles([file(png,'new.png')]);g.release();await old;
 assert.deepEqual(Array.from(a.state.items,it=>it.file.name),['new.png']); assert.equal(a.revoked.length,1);
 assert.notEqual(a.revoked[0],a.state.items[0].url);
});
test('old batch failure cannot reset a new import progress or show stale names',async()=>{
 const a=app();await seed(a);const old=gateParser(a,true);const batch=a.batchClean();await old.entered;a.clearAll();
 const newer=gateParser(a);const added=a.addFiles([file(png,'new.png')]);await newer.entered;old.release();await batch;
 assert.equal(a.state.batchFailures.length,0);assert.equal(a.node('batchError').hidden,true);
 assert.equal(a.node('progress').classList.contains('show'),true);newer.release();await added;
 assert.equal(a.state.items.length,1);assert.equal(a.downloads.length,0);
});
test('repeated batches download only the latest ZIP',async()=>{
 const a=app();await seed(a);const g=gateParser(a);const first=a.batchClean();await g.entered;
 a.state.ExifReader=ExifReader;await a.batchClean();g.release();await first;assert.equal(a.downloads.length,1);
});

test('clearing during engine initialization suppresses a later batch',async()=>{
 const a=app();await seed(a);let release;a.state.ExifReader=null;a.state.fflate=null;a.state.enginePromise=new Promise(r=>release=r);
 const pending=a.batchClean();a.clearAll();a.state.ExifReader=ExifReader;a.state.fflate=fflate;release();await pending;
 assert.equal(a.downloads.length,0);assert.equal(a.state.items.length,0);assert.equal(a.node('progress').classList.contains('show'),false);
});
test('clear during a delayed Deep Clean export cannot start verification or reopen dialogs',async()=>{
 const a=app();await seed(a);let closed=0;
 a.runtime.createImageBitmap=async()=>({width:1,height:1,close(){closed++;}});
 const pending=a.doClean('deep');await new Promise(r=>setImmediate(r));assert.equal(a.canvasExports.length,1);
 a.clearAll();a.canvasExports[0](new Blob([png],{type:'image/png'}));await pending;
 assert.equal(closed,1);assert.equal(a.state.cleanResult,null);assert.equal(a.node('verifyDialog').open,false);assert.equal(a.node('cleanStatus').textContent,'');
});
test('removing a GPS photo erases its hidden coordinates when the next photo has none',async()=>{
 const a=app();await a.addFiles([file(png,'gps.png'),file(png,'no-gps.png')]);
 a.state.items[0].risk.lat=35;a.state.items[0].risk.lon=139;a.applyLanguage();assert.match(a.node('mapCaption').textContent,/35/);
 a.node('removeButton').click();a.node('confirmRemove').click();
 assert.equal(a.node('locationSection').hidden,true);assert.equal(a.node('mapCaption').textContent,'');
});
for(const action of ['clear','remove']) test(`${action} last GPS photo erases the hidden map position`,async()=>{
 const a=app();await a.addFiles([file(png)]);a.state.items[0].risk.lat=35;a.state.items[0].risk.lon=139;a.applyLanguage();
 assert.notEqual(a.node('mapPin').style.left,'');
 if(action==='clear')a.clearAll();else{a.node('removeButton').click();a.node('confirmRemove').click();}
 assert.equal(a.node('mapCaption').textContent,'');assert.equal(a.node('mapPin').style.left,'');assert.equal(a.node('mapPin').style.top,'');
});

test('removing the only photo targets the visible keyboard-accessible drop zone',async()=>{
 const a=app();await a.addFiles([file(png)]);a.node('removeButton').click();a.node('confirmRemove').click();
 assert.equal(a.focused,'dropZone');assert.match(a.html,/<[^>]+id="dropZone"[^>]+tabindex="0"/);
});

test('actual clean-dialog close-button wiring cancels pending verification',async()=>{
 const a=app();await seed(a);const g=gateParser(a);const pending=a.doClean('lossless');await g.entered;
 const button=a.closeButtons.find(b=>b.dataset.close==='cleanDialog');assert.ok(button);button.click();g.release();await pending;
 assert.equal(a.state.cleanResult,null);assert.equal(a.node('verifyDialog').open,false);assert.equal(a.node('cleanDialog').open,false);
});
test('reports still export the retained selection and omit the removed photo',async()=>{
 const a=app();await a.addFiles([file(png,'remove.png'),file(png,'keep.png')]);a.node('removeButton').click();a.node('confirmRemove').click();
 a.node('reportButton').click();a.node('batchReportButton').click();assert.equal(a.downloads.length,2);
 const one=JSON.parse(await a.downloads[0].blob.text()),all=JSON.parse(await a.downloads[1].blob.text());
 assert.equal(one.file.name,'keep.png');assert.deepEqual(all.files.map(it=>it.file.name),['keep.png']);
});
