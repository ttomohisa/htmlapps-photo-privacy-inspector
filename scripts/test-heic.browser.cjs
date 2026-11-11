'use strict';
// CC0 HEIC test-card from loremfile.dev; fetched by CI only and SHA-256 verified.
// No web traffic is allowed from the application under test.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const https=require('node:https');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const playwright=require('playwright');
const url='https://loremfile.dev/heic/640x480.heic';
const sha='61aace709cfad9d9155e2b57b484097f77737536e34932075160fc3da6f87fe7';
const destination=path.resolve(__dirname,'../test-results/heic-browser');
fs.mkdirSync(destination,{recursive:true});
async function request(link,hops=0){
 if(hops>3)throw new Error('Too many HEIC fixture redirects');
 return new Promise((resolve,reject)=>{
  https.get(link,{headers:{'User-Agent':'BrowserKitty-HEIC-Regression/1.0'},timeout:15000},response=>{
   const status=response.statusCode||0;
   if([301,302,303,307,308].includes(status)&&response.headers.location){
    response.resume();resolve(request(new URL(response.headers.location,link).href,hops+1));return;
   }
   if(status!==200){response.resume();reject(new Error('Fixture HTTP '+status));return}
   const chunks=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>50000){response.destroy(new Error('HEIC fixture too large'));return}chunks.push(chunk)});
   response.on('end',()=>resolve(Buffer.concat(chunks)));
   response.on('error',reject);
  }).on('timeout',function(){this.destroy(new Error('Fixture timeout'))}).on('error',reject)
 });
}
async function main(){
 let bytes;const local=process.env.HEIC_FIXTURE_PATH;
 if(local)bytes=fs.readFileSync(local);else bytes=await request(url);
 assert.equal(bytes.length,5066,'CC0 fixture length');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha,'CC0 HEIC fixture checksum');
 assert.equal(bytes.toString('ascii',4,8),'ftyp','HEIF format signature');
 const engine=process.argv.includes('--webkit')?'webkit':'chromium';
 const browser=await playwright[engine].launch();
 try{
  for(const locale of ['en-US','ja-JP']){
   const context=await browser.newContext({viewport:{width:393,height:852},locale,acceptDownloads:true,reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url())});
   try{
    await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/index.html')).href);
    await page.locator('#documentFileInput').setInputFiles({name:'iphone-capture.heic',mimeType:'image/heic',buffer:bytes});
    await page.waitForFunction(()=>document.querySelector('#fileCount')?.textContent.trim()==='1',null,{timeout:45000});
    assert.equal(await page.locator('#photoName').innerText(),'iphone-capture.heic');
    assert.equal(await page.locator('#cleanButton').innerText(),locale.startsWith('ja')?'JPEGに変換して保存':'Convert to JPEG & save');
    await page.locator('#cleanButton').click();
    assert.equal(await page.locator('#losslessClean').isDisabled(),true);
    assert.equal(await page.locator('#multiImageWarning').isVisible(),true);
    await page.locator('#deepClean').click();
    await page.waitForTimeout(2000);
    console.log('HEIC_DIAGNOSTICS '+engine+' '+locale+' '+JSON.stringify(await page.evaluate(()=>({
      cleanStatus:document.querySelector('#cleanStatus')?.textContent,
      verifyOpen:document.querySelector('#verifyDialog')?.open,
      cleanOpen:document.querySelector('#cleanDialog')?.open,
      preview:document.querySelector('#previewWrap')?.textContent?.slice(0,100)
    }))));
    await Promise.race([
     page.locator('#verifyDialog').waitFor({state:'visible',timeout:45000}),
     page.waitForFunction(()=>/HEIC画像を開けません|cannot open HEIC images/.test(document.querySelector('#cleanStatus')?.textContent||''),null,{timeout:45000})
    ]);
    if(await page.locator('#verifyDialog').isVisible()){
     const downloadPromise=page.waitForEvent('download',{timeout:30000});
     await page.locator('#downloadCleanButton').click();
     const download=await downloadPromise;
     assert.equal(download.suggestedFilename(),'iphone-capture-clean.jpg');
     const buffer=fs.readFileSync(await download.path());
     assert.equal(buffer[0],255);assert.equal(buffer[1],216);
     assert.ok(buffer.length>1000,'Empty HEIC-derived JPEG');
     assert.match(await page.locator('#verifyList').innerText(),/SHA-256/);
     console.log('PASS '+engine+' '+locale+': native HEIC import, JPEG conversion, verified copy and download');
    }else{
     const warning=await page.locator('#cleanStatus').innerText();
     assert.match(warning,/HEIC画像を開けません|cannot open HEIC images/);
     console.log('NATIVE_CODEC_UNAVAILABLE '+engine+' '+locale+': inspection works; JPEG export correctly rejected');
    }
    assert.deepEqual(errors,[],'Uncaught browser exceptions');
    assert.deepEqual(requests,[],'Unexpected photo upload or network request');
    await page.screenshot({path:path.join(destination,engine+'-'+locale+'.png')});
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
