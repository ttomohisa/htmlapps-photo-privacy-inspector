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
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.api={dict,renderExposure,renderAiRecords,icons};})();'),context);
  return {node,menus,api:context.api,get focused(){return focused;},dispatch(type,event){for(const fn of events[type]||[])fn(event);}};
}
test('approved headline stays synchronized in Japanese and English',()=>{const a=app();assert.equal(a.api.dict.ja.introTitle,'写真だけをシェアする');assert.equal(a.api.dict.en.introTitle,'Share the photo. Keep the private details.');});
test('drop panel has no decorative circular pseudo element',()=>assert.doesNotMatch(html,/\.drop-panel::before\s*\{/));
test('mobile metadata toolbar stays in normal flow above the first result',()=>{const rules=[...html.matchAll(/\.metadata-toolbar\s*\{([^}]*)\}/g)];assert.ok(rules.length);for(const [,rule] of rules)assert.doesNotMatch(rule,/position\s*:\s*(sticky|fixed)/);});
test('all ten exposure categories render labeled decorative line SVGs',()=>{const a=app(),keys=['gps','place','time','device','serial','identity','software','text','unique','thumbnail'];a.api.renderExposure({risk:{found:Object.fromEntries(keys.map(k=>[k,true]))}});const rendered=a.node('exposureList').innerHTML;assert.equal((rendered.match(/<svg\b/g)||[]).length,10);assert.equal((rendered.match(/aria-hidden="true"/g)||[]).length,10);assert.doesNotMatch(rendered,/\p{Extended_Pictographic}/u);for(const k of keys)assert.ok(rendered.includes(a.api.dict.en[k]));});
for(const index of [0,1]) {
 test(`menu ${index}: outside click dismisses, inside click preserves action`,()=>{const a=app(),m=a.menus[index];m.open=true;a.dispatch('click',{target:m.child});assert.equal(m.open,true);a.dispatch('click',{target:a.node('outside')});assert.equal(m.open,false);m.open=true;a.dispatch('click',{target:a.node('outside')});assert.equal(m.open,false);});
 test(`menu ${index}: Escape dismisses and restores summary focus`,()=>{const a=app(),m=a.menus[index];m.open=true;let prevented=false;a.dispatch('keydown',{key:'Escape',preventDefault(){prevented=true;}});assert.equal(m.open,false);assert.equal(a.focused,m.summary);assert.equal(prevented,true);});
 test(`menu ${index}: opening closes the other menu`,()=>{const a=app(),m=a.menus[index];a.menus.forEach(menu=>menu.open=true);m.handlers.toggle?.();assert.equal(m.open,true);assert.equal(a.menus[1-index].open,false);});
}
test('unrelated keys leave menus open and Escape with none open does not steal focus',()=>{const a=app();a.menus[0].open=true;a.dispatch('keydown',{key:'ArrowDown'});assert.equal(a.menus[0].open,true);a.menus[0].open=false;a.dispatch('keydown',{key:'Escape',preventDefault(){assert.fail('no open menu');}});assert.equal(a.focused,null);});

test('unique-ID icon uses inset horizontal links and software uses an editor window',()=>{
 const a=app();
 assert.ok(a.api.icons.unique.includes('M9 7H7a5 5 0 0 0 0 10h2m6-10h2a5 5 0 0 1 0 10h-2'));
 assert.ok(a.api.icons.unique.includes('M8 12h8'));
 assert.ok(a.api.icons.software.includes('<rect x="3" y="4" width="18" height="16" rx="2"/>'));
 assert.ok(a.api.icons.software.includes('M3 9h18'));
});

test('original inspection and output verification have distinct bilingual labels',()=>{
 const a=app();assert.match(html,/id="aiRecordsTitle" data-i18n="originalAiTitle"/);
 for(const lang of ['ja','en'])for(const key of ['originalAiTitle','originalMetadata','copyVerifiedNotice','copyVerificationScope'])assert.ok(a.api.dict[lang][key],lang+' '+key);
 assert.match(html,/data-i18n="originalMetadata"/);assert.match(html,/data-i18n="copyVerificationScope"/);
});
test('AI output result omits the confusing recheck parenthetical',()=>{
 const a=app();assert.equal(a.api.dict.ja.aiVerified,'対応する埋め込み記録なし');assert.equal(a.api.dict.en.aiVerified,'No supported embedded records');
});
test('optional file picker leaves accept unset and remains reachable before and after photo import',()=>{
 const tag=html.match(/<input\b[^>]*id="documentFileInput"[^>]*>/)?.[0];assert.ok(tag);assert.doesNotMatch(tag,/\baccept\s*=/);assert.match(tag,/\bmultiple\b/);
 assert.match(html,/id="chooseFilesButton"/);assert.match(html,/id="addFilesButton"/);
 const a=app();for(const lang of ['ja','en'])assert.ok(a.api.dict[lang].chooseFiles&&a.api.dict[lang].filePickerHelp);
});
test('copy notice uses ordinary checked-information wording without recheck jargon',()=>{
 const a=app();assert.equal(a.api.dict.ja.copyVerifiedNotice,'保存用コピーの情報を確認しました。元画像は変更していません。');assert.equal(a.api.dict.en.copyVerifiedNotice,"The copy’s information has been checked. The original is unchanged.");
});

test('creation and editing headings are neutral while provenance alone is explicitly not an AI verdict',()=>{
 const a=app();assert.equal(a.api.dict.ja.originalAiTitle,'元画像の作成・編集情報');assert.equal(a.api.dict.en.originalAiTitle,'Creation and editing information in the original');
 assert.equal(a.api.dict.ja.aiTitle,'画像の作成・編集情報');assert.equal(a.api.dict.en.aiTitle,'Image creation and editing information');
 assert.match(a.api.dict.ja.aiProvenance,/AI生成を示すものではありません/);assert.match(a.api.dict.en.aiProvenance,/does not indicate AI generation/);
 for(const [hasAiRecords,hasProvenance,key] of [[false,true,'aiProvenance'],[false,false,'aiNone'],[true,false,'aiFound'],[true,true,'aiFound']]){
  a.api.renderAiRecords({aiMetadata:{status:hasAiRecords||hasProvenance?'records':'none',hasAiRecords,hasProvenance,records:[]}});
  assert.equal(a.node('aiRecordsStatus').textContent,a.api.dict.en[key]);
 }
 for(const status of ['error','unknown']){a.api.renderAiRecords({aiMetadata:{status,records:[]}});assert.equal(a.node('aiRecordsStatus').textContent,a.api.dict.en[status==='error'?'aiError':'aiUnknown']);}
});
test('open dialogs constrain their scroll body while preserving header and footer',()=>{
 const openRule=html.match(/dialog\[open\]\s*\{([^}]+)\}/)?.[1]||'';assert.match(openRule,/display\s*:\s*flex/);assert.match(openRule,/flex-direction\s*:\s*column/);
 const bodyRule=html.match(/\.dialog-body\s*\{([^}]+)\}/)?.[1]||'';assert.match(bodyRule,/min-height\s*:\s*0/);assert.match(bodyRule,/flex\s*:\s*1 1 auto/);assert.match(bodyRule,/overflow\s*:\s*auto/);assert.doesNotMatch(bodyRule,/max-height\s*:\s*calc/);
 for(const selector of ['dialog-header','dialog-footer']){const rule=html.match(new RegExp('\\.'+selector+'\\s*\\{([^}]+)\\}'))?.[1]||'';assert.match(rule,/flex-shrink\s*:\s*0/);}
 assert.match(html,/<dialog id="helpDialog">[\s\S]*?<div class="dialog-body" tabindex="0">/);
});
test('local-processing badge matches the Mini League Desk shield reference',()=>{
 const svg=html.match(/<div class="local-badge">(<svg[\s\S]*?<\/svg>)/)?.[1]||'';
 assert.match(svg,/stroke-width="1.9"/);assert.match(svg,/stroke-linecap="round"/);assert.match(svg,/stroke-linejoin="round"/);assert.match(svg,/aria-hidden="true"/);
 assert.ok(svg.includes('d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"'));assert.ok(svg.includes('d="m9 12 2 2 4-5"'));
});
