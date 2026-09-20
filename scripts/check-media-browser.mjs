// Start the local site on port 8766, then run with Playwright installed.
// Or set PLAYWRIGHT_MODULE to the file URL of an existing Playwright installation.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
const base=process.env.DTOWN_TEST_URL || 'http://127.0.0.1:8766';
let failures=0;
for(const lang of ['', '/en']) {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.route('https://fonts.**/*', r=>r.abort());
 const media=[]; page.on('request',r=>{if(/\.mp4/.test(r.url())) media.push(r.url())});
 await page.goto(base+lang+'/?media-test='+Date.now(),{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(700);
 async function check(name,fn){try{await fn();console.log('PASS',lang||'ZH',name)}catch(e){failures++;console.log('FAIL',lang||'ZH',name,e.message)}}
 await check('no offscreen video requests',()=>assert.equal(media.length,0));
 await page.evaluate(()=>showTab('cocktail',document.querySelector('[onclick*="showTab(\'cocktail\'"]')));
 await page.locator('.cocktail-menu-card').first().scrollIntoViewIfNeeded();
 await check('correct cocktail aspect ratio',async()=>{const r=await page.locator('.cocktail-menu-card img').first().boundingBox();assert.ok(Math.abs(r.width/r.height-0.8)<0.02,JSON.stringify(r))});
 await page.evaluate(()=>openLightbox(document.querySelector('.cocktail-menu-card img').src,'test'));
 await check('close button above nav',async()=>assert.equal(await page.locator('.lightbox-close').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el}),true));
 await page.keyboard.press('Escape');
 await check('escape restores scroll',async()=>assert.equal(await page.evaluate(()=>document.body.style.overflow),''));
 await check('24 cocktail text items remain',async()=>assert.equal(await page.locator('.cocktail-text-item').count(),24));
 await check('no horizontal page overflow',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390));
 await context.close();
}
await browser.close();
process.exitCode=failures?1:0;
