'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const evidence = path.resolve('test-results/mobile-label');
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const language of ['ja', 'en']) for (const [width, height] of [[1360,900],[320,568],[393,252]]) {
      const context = await browser.newContext({ viewport: {width,height}, locale: language, reducedMotion:'reduce' });
      const page = await context.newPage();
      const errors=[], requests=[];
      const label=`${language}-${width}x${height}`;
      page.on('pageerror', e=>errors.push(e.message));
      page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('request', r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
      try {
        await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/index.html')).href);
        await page.locator('#langButton').waitFor();
        if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#langButton').click();
        const badge=page.locator('[data-i18n="localOnly"]');
        assert.equal(await badge.innerText(),language==='ja'?'完全ローカル処理':'Fully local processing');
        assert.equal(await badge.isVisible(), width > 760, label+': preserve existing mobile badge hiding');
        if(width > 760) assert.ok(await badge.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1;}), label+': badge not clipped');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': page width');
        const title=await page.locator('.page-intro h2').evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{text:el.textContent.trim(),fontSize:parseFloat(s.fontSize),height:r.height,lineHeight:parseFloat(s.lineHeight)}});
        assert.equal(title.text,language==='ja'?'写真の情報を確認':'Check photo details');
        assert.equal(title.fontSize,width<=760?20:24,label+': title typography');
        assert.ok(title.height<=title.lineHeight+1,label+': title must be one line '+JSON.stringify(title));
        assert.equal(await page.locator('footer').count(),1,'Standard informational footer is added.');
        assert.equal(await page.locator('footer').isVisible(), width > 760, label+': footer hidden on smartphones');
        if(width > 760) assert.equal((await page.locator('footer').innerText()).replace(/\s+/g,' ').trim(),language==='ja'?'Photo Privacy Inspector · MIT License · 写真の検査はブラウザー内で完結':'Photo Privacy Inspector · MIT License · Photo inspection stays in the browser',label+': footer text');
        if(width!==393) await page.screenshot({path:path.join(evidence,label+'.png')});
        await page.locator('#helpButton').click();
        const body=page.locator('#helpDialog .dialog-body');
        const details=page.locator('#helpDialog .help-more');
        assert.equal(await details.count(),3);
        for(const el of await details.all())assert.equal(await el.evaluate(x=>x.open),false);
        await details.last().locator('summary').click();
        await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
        const helpEnd=await page.locator('#buildInfo').evaluate(el=>{const r=el.getBoundingClientRect(),body=el.closest('.dialog-body').getBoundingClientRect(),dialog=el.closest('dialog').getBoundingClientRect();return{top:r.top,bottom:r.bottom,clipTop:Math.max(0,body.top,dialog.top),clipBottom:Math.min(innerHeight,body.bottom,dialog.bottom)};});
        assert.ok(helpEnd.top>=helpEnd.clipTop-1&&helpEnd.bottom<=helpEnd.clipBottom+1,label+': final Help details reachable '+JSON.stringify(helpEnd));
        assert.notEqual(await page.locator('#buildInfo').innerText(), '-');
        assert.equal(await page.locator('#helpDialog .help-more:last-child #buildInfo').count(),1);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#helpDialog').isVisible(),false);
        assert.deepEqual(errors,[],label+': runtime errors');
        assert.deepEqual(requests,[],label+': external requests');
        console.log('PASS '+label);
      } catch(error) {
        await page.screenshot({path:path.join(evidence,'failure-'+label+'.png')}).catch(()=>{});
        throw error;
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
