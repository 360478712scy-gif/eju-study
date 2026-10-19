import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),port=18770,base=`http://127.0.0.1:${port}`,dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-desktop-integration-')),passed=[],errors=[];
let server,browser,page;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=label=>{passed.push(label);console.log('PASS',label);};
async function nav(name){await page.locator(`.nav [data-page="${name}"]`).click();}
async function state(){return fetch(base+'/api/state').then(r=>r.json());}
try{
 let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)});occupied=true;}catch{}assert.equal(occupied,false);
 server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:path.join(dir,'state')},stdio:'ignore'});
 for(let n=0;n<80;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await sleep(100);}
 browser=await chromium.launch({headless:true,executablePath:'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--autoplay-policy=no-user-gesture-required']});
 page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>{window.webkit={messageHandlers:{ejuNative:{postMessage(){}}}};window.ejuNative={readClipboard:async()=>window._clipboard||'',writeClipboard:async text=>{window._clipboard=text;}};});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base);await page.locator('.nav').waitFor();await page.waitForFunction(()=>!document.querySelector('#bgm').paused&&document.querySelector('#bgm').currentTime>0);
 pass('BGM starts automatically when media playback is permitted');
 await nav('report');const draft='我正在用日语输入法写复盘，切音乐和快捷键后这段文字应完整保留。';await page.locator('#reflection').fill(draft);
 await page.keyboard.press('Meta+Shift+m');assert.equal(await page.locator('#bgm').evaluate(a=>a.paused),true);assert.equal(await page.locator('#reflection').inputValue(),draft);
 await page.keyboard.press('Meta+Shift+m');assert.equal(await page.locator('#reflection').inputValue(),draft);assert.equal(await page.locator('#bgm').evaluate(a=>a.paused),false);
 await page.keyboard.press('Meta+1');await page.locator('[data-page="today"].active').waitFor();await page.keyboard.press('Meta+4');await page.locator('#reflection').waitFor();assert.equal(await page.locator('#reflection').inputValue(),draft);
 await page.reload();await page.locator('.nav').waitFor();await nav('report');assert.equal(await page.locator('#reflection').inputValue(),draft);
 pass('music shortcuts do not rebuild editors and report drafts survive navigation and reload');
 let navigations=0;page.on('framenavigated',()=>navigations++);const before=await page.evaluate(()=>location.href);
 for(const key of ['Meta+r','Meta+l','Meta+p','Meta+f','Meta+[','Meta+]'])await page.keyboard.press(key);
 assert.equal(await page.evaluate(()=>location.href),before);assert.equal(navigations,0);assert.equal(await page.locator('#reflection').inputValue(),draft);
 await page.locator('#reflection').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'1',metaKey:true,isComposing:true,bubbles:true,cancelable:true}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});assert.equal(await page.locator('#reflection').inputValue(),draft);assert.equal(await page.locator('[data-page="report"].active').count(),1);
 pass('web navigation shortcuts and IME composition do not navigate away or erase text');
 await page.locator('#reflection').click({button:'right'});await page.locator('[role="menu"]').waitFor();await page.locator('[role="menu"]').getByRole('menuitem',{name:/全选/}).click();
 await page.locator('#reflection').click({button:'right'});await page.locator('[role="menu"]').getByRole('menuitem',{name:/复制所选文字/}).click();assert.equal(await page.evaluate(()=>window._clipboard),draft);
 await page.evaluate(()=>window._clipboard='右键粘贴测试');await page.locator('#reflection').click({button:'right'});await page.locator('[role="menu"]').getByRole('menuitem',{name:/粘贴/}).click();assert.ok((await page.locator('#reflection').inputValue()).includes('右键粘贴测试'));
 await page.keyboard.press('Meta+/');await page.locator('.eju-shortcuts').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.eju-shortcuts').count(),0);
 pass('context menu copies and pastes in the focused editor; shortcut help closes separately');
 const questions=await fetch(base+'/api/questions').then(r=>r.json()),vocab=questions.find(q=>q.id==='vx001')||questions.find(q=>q.topic==='vocab');
 await nav('practice');await page.locator('#search').fill(vocab.title||vocab.prompt);await page.locator(`[data-question="${vocab.id}"]`).click();await page.locator(`[data-pron-word="${vocab.id}"]`).click();await page.waitForFunction(()=>document.querySelector('#bgm').volume===0);
 assert.equal(await page.locator('#used-help').isChecked(),true);await page.waitForFunction(()=>document.querySelector('#bgm').volume>0);
 await page.locator(`[data-option="${vocab.answer}"]`).click();await page.locator('#submit-answer').click();await page.locator('[data-pron-example]').waitFor();
 await page.locator('[data-pron-rate]').selectOption('0.8');await page.locator('[data-pron-example]').click();await page.waitForFunction(()=>document.querySelector('#bgm').volume===0);await page.locator('#close-modal').click();assert.ok(await page.locator('#bgm').evaluate(a=>a.volume)>0);
 pass('offline word and example audio play, hearing before recall is marked assisted, and music recovers on close');
 await nav('learning');await page.locator('[data-learn-card]').first().click();await page.locator('#learning-recall').fill('不记得');await page.locator('#learning-recall-form .btn').click();await page.locator('[data-pron-term]').first().click();await page.waitForFunction(()=>document.querySelector('#bgm').volume===0);await page.locator('#close-modal').click();
 pass('knowledge-card Japanese terms have offline pronunciation during the lesson');
 const official=questions.find(q=>q.subject==='physics'&&q.official&&q.images?.length);await nav('practice');await page.locator('#search').fill(official.title);await page.locator(`[data-question="${official.id}"]`).click();
 if(await page.locator('#written-response').count())await page.locator('#written-response').fill('先列出条件与公式，暂时保留过程。');await page.locator('#question-note').fill('放大原图前写下的疑问');await page.locator('a .question-img').first().click();await page.locator('#image-viewer').waitFor();await page.locator('[data-image-plus]').click();assert.equal(await page.locator('[data-image-percent]').innerText(),'125%');await page.keyboard.press('Escape');assert.equal(await page.locator('#image-viewer').count(),0);assert.equal(await page.locator('#question-note').inputValue(),'放大原图前写下的疑问');await page.keyboard.press('Meta+3');assert.equal(await page.locator('.modal').count(),1);await page.locator('#close-modal').click();
 pass('question images zoom inside the app and shortcuts cannot replace an active exercise');
 await nav('today');if(!(await page.locator('#bgm').evaluate(a=>a.paused)))await page.locator('#music-toggle').click();await page.reload();await page.locator('.nav').waitFor();assert.equal(await page.locator('#bgm').evaluate(a=>a.paused),true);await page.locator('#music-toggle').click();await page.evaluate(()=>dispatchEvent(new Event('eju-window-hidden')));assert.equal(await page.locator('#bgm').evaluate(a=>a.paused),true);await page.evaluate(()=>dispatchEvent(new Event('eju-window-visible')));await page.waitForFunction(()=>!document.querySelector('#bgm').paused);
 pass('manual pause persists across launches; hiding the native window stops audio and reopening restores preference');
 await page.setViewportSize({width:390,height:844});await page.mouse.click(375,760,{button:'right'});const box=await page.locator('[role="menu"]').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391&&box.y>=0&&box.y+box.height<=845);await page.screenshot({path:path.join(dir,'context-mobile.png'),fullPage:true});await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);assert.equal((await state()).attempts.length,1);pass('edge-positioned menus fit 390px and integration produces no JavaScript or media errors');
 fs.writeFileSync(path.join(root,'tests/desktop-integration-results.json'),JSON.stringify({ok:true,passed,errors,at:new Date().toISOString(),context:'isolated Chromium integration; native WKWebView tested separately'},null,2));console.log('ARTIFACTS',dir);
}catch(e){if(page)await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});console.error('ARTIFACTS',dir);throw e;}
finally{if(browser)await browser.close();server?.kill('SIGTERM');}
