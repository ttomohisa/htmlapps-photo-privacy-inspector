const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.resolve(root, process.env.APP_HTML || 'src/index.template.html'), 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
if (payload) html = require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8');
function app() {
  const nodes = new Map(), events = {}, menus = [];
  let focused = null;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML:'', textContent:'', value:'', style:{setProperty(){}}, classList:{add(){},remove(){},toggle(){}}, handlers:{}, addEventListener(type, fn){this.handlers[type]=fn;}, insertAdjacentHTML(_, text){this.innerHTML+=text;}, setAttribute(){}, removeAttribute(name){if(name==='open')this.open=false;}, close(){this.open=false;}, focus(){focused=this;}, closest(){return null;} });
    return nodes.get(id);
  }
  for (let i=0;i<2;i++) {const menu=node('menu'+i); menu.open=false; menu.summary=node('summary'+i); menu.child=node('child'+i); menu.contains=target=>[menu,menu.summary,menu.child].includes(target); menu.querySelector=()=>menu.summary; menus.push(menu);}
  node('app-config').textContent=fs.readFileSync(path.join(root,'app.config.json'),'utf8'); node('build-manifest').textContent='{}';
  const document={getElementById:node,querySelectorAll(selector){return selector==='.action-menu'?menus:selector==='.action-menu[open]'?menus.filter(m=>m.open):[];},addEventListener(type, fn){(events[type]??=[]).push(fn);},documentElement:{},body:node('body')};
  const context=vm.createContext({document,navigator:{language:'en'},console,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,setTimeout(){},clearTimeout(){},atob,btoa});
  html = html.replace('/*__AI_METADATA_SOURCE__*/', () => fs.readFileSync(path.join(root, 'src/ai-metadata.js'), 'utf8'));
  const script=[...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.api={dict,renderExposure};})();'),context);
  return {node,menus,api:context.api,get focused(){return focused;},dispatch(type,event){for(const fn of events[type]||[])fn(event);}};
}
test('approved headline stays synchronized in Japanese and English',()=>{const a=app();assert.equal(a.api.dict.ja.introTitle,'写真だけを、シェアしよう。');assert.equal(a.api.dict.en.introTitle,'Share the photo. Keep the private details.');});
test('drop panel has no decorative circular pseudo element',()=>assert.doesNotMatch(html,/\.drop-panel::before\s*\{/));
test('mobile metadata toolbar stays in normal flow above the first result',()=>{const rules=[...html.matchAll(/\.metadata-toolbar\s*\{([^}]*)\}/g)];assert.ok(rules.length);for(const [,rule] of rules)assert.doesNotMatch(rule,/position\s*:\s*(sticky|fixed)/);});
test('all ten exposure categories render labeled decorative line SVGs',()=>{const a=app(),keys=['gps','place','time','device','serial','identity','software','text','unique','thumbnail'];a.api.renderExposure({risk:{found:Object.fromEntries(keys.map(k=>[k,true]))}});const rendered=a.node('exposureList').innerHTML;assert.equal((rendered.match(/<svg\b/g)||[]).length,10);assert.equal((rendered.match(/aria-hidden="true"/g)||[]).length,10);assert.doesNotMatch(rendered,/\p{Extended_Pictographic}/u);for(const k of keys)assert.ok(rendered.includes(a.api.dict.en[k]));});
for(const index of [0,1]) {
 test(`menu ${index}: outside click dismisses, inside click preserves action`,()=>{const a=app(),m=a.menus[index];m.open=true;a.dispatch('click',{target:m.child});assert.equal(m.open,true);a.dispatch('click',{target:a.node('outside')});assert.equal(m.open,false);m.open=true;a.dispatch('click',{target:a.node('outside')});assert.equal(m.open,false);});
 test(`menu ${index}: Escape dismisses and restores summary focus`,()=>{const a=app(),m=a.menus[index];m.open=true;let prevented=false;a.dispatch('keydown',{key:'Escape',preventDefault(){prevented=true;}});assert.equal(m.open,false);assert.equal(a.focused,m.summary);assert.equal(prevented,true);});
 test(`menu ${index}: opening closes the other menu`,()=>{const a=app(),m=a.menus[index];a.menus.forEach(menu=>menu.open=true);m.handlers.toggle?.();assert.equal(m.open,true);assert.equal(a.menus[1-index].open,false);});
}
test('unrelated keys leave menus open and Escape with none open does not steal focus',()=>{const a=app();a.menus[0].open=true;a.dispatch('keydown',{key:'ArrowDown'});assert.equal(a.menus[0].open,true);a.menus[0].open=false;a.dispatch('keydown',{key:'Escape',preventDefault(){assert.fail('no open menu');}});assert.equal(a.focused,null);});
