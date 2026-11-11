'use strict';
/* Browser-level regression of the distributed HTML using actual photo fixtures.
 * No testing hooks are added to the application. Network access is observed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const fflate = require(path.resolve(__dirname,'../.cache/fflate-0.8.3/extracted/package/umd/index.js'));
const fixtures=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../tests/fixtures/photo-clean.json'),'utf8')).cases;
const evidence=path.resolve(__dirname,'../test-results/photo-browser');
fs.mkdirSync(evidence,{recursive:true});
const fixture=name=>{
 const item=fixtures.find(x=>x.name===name);
 assert.ok(item,'Missing photo fixture: '+name);
 return Buffer.from(item.base64,'base64');
};
const mime=name=>name.endsWith('.jpg')?'image/jpeg':name.endsWith('.png')?'image/png':'image/webp';
const input=(name,as=name)=>({name:as,mimeType:mime(name),buffer:fixture(name)});
const originalMime=(name)=>mime(name);
async function open(browser,artifact,locale,viewport){
 const context=await browser.newContext({locale,viewport,acceptDownloads:true,reducedMotion:'reduce'});
 const page=await context.newPage(),pageErrors=[],externalRequests=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('request',r=>{if(/^https?:/i.test(r.url()))externalRequests.push(r.url())});
 await page.goto(pathToFileURL(path.resolve(__dirname,'..',artifact)).href);
 await page.locator('#documentFileInput').waitFor({state:'attached',timeout:30000});
 const language=locale.startsWith('ja')?'ja':'en';
 await page.waitForFunction(expected=>document.documentElement.lang===expected,language);
 return {context,page,pageErrors,externalRequests};
}
async function finished(a,label){
 assert.deepEqual(a.pageErrors,[],label+': uncaught exceptions');
 assert.deepEqual(a.externalRequests,[],label+': unexpected external requests');
 await a.context.close();
}
async function noHorizontalOverflow(page,label){
 const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth}));
 assert.ok(dimensions.scrollWidth<=dimensions.innerWidth+1,label+': horizontal overflow '+JSON.stringify(dimensions));
}
async function waitForCount(page,count){
 await page.waitForFunction(n=>document.querySelector('#fileCount')?.textContent.trim()===String(n),count,{timeout:45000});
}
async function choose(page,items){
 await page.locator('#documentFileInput').setInputFiles(items);
 await waitForCount(page,items.length);
 assert.equal(await page.locator('#analysisError').isVisible(),false);
}
async function downloadAfter(page,trigger){
 const pending=page.waitForEvent('download',{timeout:45000});
 await trigger();
 const download=await pending;
 const downloaded=await download.path();
 assert.ok(downloaded,'Browser download missing path');
 return {name:download.suggestedFilename(),buffer:fs.readFileSync(downloaded)};
}
async function decodeComparison(page,source,clean,mimeType){
 return page.evaluate(async({before,after,mimeType})=>{
  const bitmap=async base64=>{
   const bin=atob(base64),bytes=new Uint8Array(bin.length);
   for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
   const object=await createImageBitmap(new Blob([bytes],{type:mimeType}),{imageOrientation:'from-image'});
   const canvas=document.createElement('canvas');canvas.width=object.width;canvas.height=object.height;
   canvas.getContext('2d').drawImage(object,0,0);object.close();
   return {width:canvas.width,height:canvas.height,pixels:Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data)};
  };
  const a=await bitmap(before),b=await bitmap(after);
  return {width:a.width,height:a.height,otherWidth:b.width,otherHeight:b.height,equal:a.pixels.length===b.pixels.length&&a.pixels.every((v,i)=>v===b.pixels[i])};
 },{before:source.toString('base64'),after:clean.toString('base64'),mimeType});
}
async function singleLossless(browser,kind){
 const a=await open(browser,'dist/index.html','en-US',{width:1360,height:900}),page=a.page;
 try{
  const name=kind==='jpeg'?'control.jpg':kind==='png'?'control.png':'orientation-6.webp';
  await choose(page,[input(name)]);
  assert.equal(await page.locator('#photoName').innerText(),name);
  await page.locator('#cleanButton').click();
  assert.equal(await page.locator('#losslessClean').isEnabled(),true);
  await page.locator('#losslessClean').click();
  await page.locator('#verifyDialog').waitFor({state:'visible',timeout:45000});
  assert.ok((await page.locator('#verifyList').innerText()).includes('SHA-256'));
  // Deliberately enter a wrong extension. The resulting bytes and name must agree.
  await page.locator('#cleanFileName').fill('share-wrong-extension.txt');
  const out=await downloadAfter(page,()=>page.locator('#downloadCleanButton').click());
  const ext=kind==='jpeg'?'.jpg':kind==='png'?'.png':'.webp';
  assert.equal(out.name,'share-wrong-extension'+ext);
  const bytes=out.buffer;
  assert.ok(bytes.length>100,'Empty or truncated output');
  const compare=await decodeComparison(page,fixture(name),bytes,originalMime(name));
  assert.ok(compare.equal,'Lossless clean altered pixels: '+name+' '+JSON.stringify(compare));
  await noHorizontalOverflow(page,'single '+kind);
  console.log('PASS lossless '+kind+': '+bytes.length+' bytes, original pixels preserved');
 }catch(e){await page.screenshot({path:path.join(evidence,'failure-lossless-'+kind+'.png')}).catch(()=>{});throw e}
 finally{await finished(a,'lossless '+kind)}
}
async function deepCleanBrowser(browser){
 const a=await open(browser,'dist/index.html','en-US',{width:1280,height:850}),page=a.page;
 try{
  await choose(page,[input('control.jpg')]);
  await page.locator('#cleanButton').click();
  await page.locator('#deepClean').click();
  await page.locator('#verifyDialog').waitFor({state:'visible',timeout:45000});
  const out=await downloadAfter(page,()=>page.locator('#downloadCleanButton').click());
  assert.ok(out.name.endsWith('.jpg'));
  assert.equal(out.buffer[0],255);assert.equal(out.buffer[1],216);
  const after=await page.evaluate(async b64=>{
   const data=Uint8Array.from(atob(b64),s=>s.charCodeAt(0));
   const bm=await createImageBitmap(new Blob([data],{type:'image/jpeg'}));
   const r={width:bm.width,height:bm.height};bm.close();return r;
  },out.buffer.toString('base64'));
  assert.ok(after.width>0&&after.height>0);
  console.log('PASS Deep Clean JPEG: browser re-encoded and downloaded');
 }catch(e){await page.screenshot({path:path.join(evidence,'failure-deep.png')}).catch(()=>{});throw e}
 finally{await finished(a,'deep clean')}
}
async function batchBrowser(browser,count=3){
 const a=await open(browser,'dist/index.html','en-US',{width:1360,height:900}),page=a.page;
 try{
  const types=['control.jpg','control.png','orientation-6.webp'];
  const items=Array.from({length:count},(_,i)=>input(types[i%types.length],('photo-'+String(i).padStart(3,'0')+'.'+types[i%types.length].split('.').at(-1))));
  await choose(page,items);
  const out=await downloadAfter(page,()=>page.locator('#batchCleanButton').click());
  assert.equal(out.name,'photo-privacy-clean.zip');
  const entries=fflate.unzipSync(new Uint8Array(out.buffer));
  const names=Object.keys(entries).sort();
  assert.equal(names.length,count,'ZIP entry count');
  assert.equal(new Set(names).size,count,'ZIP names must remain unique');
  for(const [name,bytes] of Object.entries(entries)){
   assert.ok(bytes.length>100,'ZIP entry unexpectedly empty: '+name);
   if(name.endsWith('.jpg')){assert.equal(bytes[0],255);assert.equal(bytes[1],216)}
   else if(name.endsWith('.png'))assert.deepEqual(Array.from(bytes.subarray(0,4)),[137,80,78,71]);
   else if(name.endsWith('.webp'))assert.equal(Buffer.from(bytes).toString('ascii',8,12),'WEBP');
   else assert.fail('Unexpected ZIP output format '+name);
  }
  assert.equal(await page.locator('#batchError').isVisible(),false);
  console.log('PASS batch ZIP '+count+' real photos, verified ZIP entries and no overwrite');
 }catch(e){await page.screenshot({path:path.join(evidence,'failure-batch-'+count+'.png')}).catch(()=>{});throw e}
 finally{await finished(a,'batch '+count)}
}
async function corruptedFile(browser){
 const a=await open(browser,'dist/index.html','ja-JP',{width:390,height:844}),page=a.page;
 try{
  await page.locator('#documentFileInput').setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,0,1,2,3])});
  await page.locator('#analysisError').waitFor({state:'visible',timeout:30000});
  assert.ok((await page.locator('#analysisError').innerText()).includes('broken.jpg'));
  assert.equal(await page.locator('#fileCount').innerText(),'0');
  await choose(page,[input('control.png')]);
  assert.equal(await page.locator('#photoName').innerText(),'control.png');
  console.log('PASS corrupt JPEG cannot be silently accepted as safe; recovery succeeded');
 }catch(e){await page.screenshot({path:path.join(evidence,'failure-corrupt.png')}).catch(()=>{});throw e}
 finally{await finished(a,'corrupt file')}
}
async function mobileBrowser(browser,width,height){
 const label='mobile-'+width+'x'+height;
 const a=await open(browser,'dist/index.html','ja-JP',{width,height}),page=a.page;
 try{
  await noHorizontalOverflow(page,label+' initial');
  await choose(page,[input('control.png','長いファイル名'.repeat(15)+'.png')]);
  await noHorizontalOverflow(page,label+' loaded');
  await page.screenshot({path:path.join(evidence,label+'-loaded.png')});
  await page.locator('#helpButton').click();
  const help=page.locator('#helpDialog');
  assert.equal(await help.isVisible(),true);
  await help.locator('.dialog-body').evaluate(el=>{el.scrollTop=el.scrollHeight});
  await page.keyboard.press('Escape');assert.equal(await help.isVisible(),false);
  await page.locator('#cleanButton').click();
  await noHorizontalOverflow(page,label+' clean dialog');
  await page.keyboard.press('Escape');
  await page.locator('#clearButton').click();
  assert.equal(await page.locator('#clearDialog').isVisible(),true);
  await page.locator('#confirmClear').click();
  await waitForCount(page,0);
  assert.equal(await page.locator('#workspace').isVisible(),false);
  await noHorizontalOverflow(page,label+' cleared');
  console.log('PASS mobile '+width+'x'+height+' long filename, help, clean dialog, clear');
 }catch(e){await page.screenshot({path:path.join(evidence,'failure-'+label+'.png')}).catch(()=>{});throw e}
 finally{await finished(a,label)}
}
async function selfExtractBrowser(browser){
 const a=await open(browser,'dist/index.self-extract.html','en-US',{width:393,height:852}),page=a.page;
 try{
  await choose(page,[input('control.png')]);
  await page.locator('#cleanButton').click();
  await page.locator('#losslessClean').click();
  await page.locator('#verifyDialog').waitFor({state:'visible',timeout:45000});
  const out=await downloadAfter(page,()=>page.locator('#downloadCleanButton').click());
  assert.ok(out.buffer.length>100);assert.ok(out.name.endsWith('.png'));
  await noHorizontalOverflow(page,'self-extract');
  console.log('PASS self-extracting HTML file:// upload, clean, verify, download');
 }catch(e){await page.screenshot({path:path.join(evidence,'failure-self-extract.png')}).catch(()=>{});throw e}
 finally{await finished(a,'self-extract')}
}
async function main(){
 const browser=await chromium.launch();
 try{
  for(const kind of ['jpeg','png','webp'])await singleLossless(browser,kind);
  await deepCleanBrowser(browser);
  await batchBrowser(browser,3);
  await batchBrowser(browser,30);
  await corruptedFile(browser);
  for(const [w,h] of [[320,568],[393,852]])await mobileBrowser(browser,w,h);
  await selfExtractBrowser(browser);
 }finally{await browser.close()}
 console.log('PASS all actual-browser photo workflow regressions');
}
main().catch(e=>{console.error(e);process.exitCode=1});
