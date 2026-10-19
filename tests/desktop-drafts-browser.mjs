import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Four bounded regressions from the desktop integration review. State stays in
// a temporary directory; delayed AI replies are fixture HTTP routes, never CLI.
const root=path.resolve(import.meta.dirname,'..'),port=18772,base=`http://127.0.0.1:${port}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-desktop-drafts-')),passed=[],errors=[],logs=[];
let server,browser,page,step='startup';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pass=label=>{passed.push(label);console.log('PASS',label);};
async function nav(name){await page.locator(`.nav [data-page="${name}"]`).click();await page.locator(`.nav [data-page="${name}"].active`).waitFor();}
async function close(){await page.keyboard.press('Escape');await page.locator('.modal').waitFor({state:'detached'});}
try{
 let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)});occupied=true;}catch{}
 assert.equal(occupied,false,'Port 18772 is occupied; refusing to use another server.');
 server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:path.join(dir,'state')},stdio:'pipe'});
 server.stdout.on('data',chunk=>logs.push(chunk.toString()));server.stderr.on('data',chunk=>logs.push(chunk.toString()));
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await pause(100);}assert.ok(ready,logs.join(''));
 browser=await chromium.launch({headless:true,executablePath:process.env.EJU_CHROMIUM_PATH||'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--autoplay-policy=no-user-gesture-required']});
 page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await page.locator('.nav').waitFor();
 const state=await fetch(base+'/api/state').then(response=>response.json());
 const bank=await fetch(base+'/api/questions').then(response=>response.json());

 step='learning note across close and reopen';
 const card=state.learningSession.cards[0],note='复习关闭前写下的重要条件：先区分符号，再检查使用范围。';
 await nav('learning');await page.locator(`[data-learn-card="${card.id}"]`).click();
 await page.locator('#learning-recall').fill('不记得');await page.locator('#learning-recall-form .btn').click();await page.locator('#learning-check').click();await page.locator('#learning-note').fill(note);
 const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),`eju-learning-draft-${state.today}-${card.id}`);assert.equal(stored.userNote,note);
 await close();await page.locator(`[data-learn-card="${card.id}"]`).click();assert.equal(await page.locator('#learning-recall').inputValue(),'不记得');await page.locator('#learning-recall-form .btn').click();await page.locator('#learning-check').click();assert.equal(await page.locator('#learning-note').inputValue(),note);await close();
 pass('a knowledge-card note survives closing, reopening and resubmitting the recall step');

 step='unrequested help draft';
 const word=bank.find(q=>q.id==='vx001')||bank.find(q=>q.topic==='vocab');
 await nav('practice');await page.locator('#search').fill(word.title||word.prompt);await page.locator(`[data-question="${word.id}"]`).click();await page.locator('#help-open').click();
 const help='我先观察题干中的转折信号，但是不能确认最终选择的依据。';await page.locator('#help-attempt').fill(help);
 let session=await page.evaluate(()=>JSON.parse(localStorage.getItem('eju-active-session')));assert.equal(session.helpDraft[word.id],help);assert.equal(!!session.hints?.[word.id],false,'typing the attempt is not receiving help');
 await close();await nav('today');await page.locator('#continue').click();await page.locator('#help-open').click();assert.equal(await page.locator('#help-attempt').inputValue(),help);assert.equal(await page.locator('#used-help').isChecked(),false);await close();
 pass('an unsent attempt survives exercise close/resume without being marked as assisted');

 step='Japanese search composition';
 for(const [name,selector] of [['practice','#search'],['notebook','#notebook-search']]){
  await nav(name);
  const composition=await page.locator(selector).evaluate(input=>{
   input.focus();input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'で'}));
   input.value='で';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'で'}));
   const during={connected:input.isConnected,sameField:document.getElementById(input.id)===input};
   input.value='電場';input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'電場'}));return during;
  });
  assert.equal(composition.connected,true,name+' must retain the IME-owned input until compositionend');assert.equal(composition.sameField,true,name+' must not replace the composing input');
  await page.waitForFunction(selector=>document.querySelector(selector)?.value==='電場',selector);
  await page.evaluate(()=>dispatchEvent(new CustomEvent('eju-command',{detail:{action:'navigate',page:'today'}})));
  await page.locator('.nav [data-page="today"].active').waitFor({timeout:3000});
 }
 pass('both searches retain the composing input, finish conversion, and leave native commands responsive');

 step='late hint stays with its question';
 let releaseJob,started=0;const gate=new Promise(resolve=>releaseJob=resolve),marker='第一题专用提示标记';
 await page.route('**/api/ai/start',route=>{started++;return route.fulfill({json:{id:'desktop-draft-hint-fixture',status:'running'}});});
 await page.route('**/api/ai/job?id=desktop-draft-hint-fixture',async route=>{await gate;return route.fulfill({json:{id:'desktop-draft-hint-fixture',status:'completed',result:{observation:'第一题的观察',hint:marker,checkQuestion:'第一题的检查问题'}}});});
 const task=state.plans[state.today].tasks.find(t=>t.topic==='vocab'),block=task.blocks.find(b=>b.kind==='questions'),firstId=block.questionIds[0];assert.ok(block.questionIds.length>1);
 await page.locator(`[data-study="${task.id}"]`).click();await page.locator(`[data-block="${block.id}"]`).click();await page.locator('#help-open').click();await page.locator('#help-attempt').fill('我在第一题先看了条件，但不能判断正确的词义，请只给下一步提示。');await page.locator('#ai-hint').click();
 await page.locator('[data-qindex="1"]').click();await page.locator('#help-open').click();releaseJob();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('eju-active-session'))?.aiHints?.[id]?.length>0,firstId,{timeout:5000});
 assert.equal(await page.locator('.qnav .active').getAttribute('data-qindex'),'1');assert.equal((await page.locator('#ai-hint-result').innerText()).includes(marker),false,'the old reply must never occupy the next question panel');assert.equal(await page.locator('#ai-hint').isEnabled(),true);
 await page.locator('[data-qindex="0"]').click();await page.locator('#help-open').click();assert.ok((await page.locator('#ai-hint-result').innerText()).includes(marker),'the completed hint is retained for its own question');assert.equal(started,1);
 pass('a delayed hint is cached for its original question and never appears in another question panel');

 assert.deepEqual(errors,[]);assert.equal((await fetch(base+'/api/state').then(r=>r.json())).attempts.length,0);
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:true,passed,errors,noLiveCLI:true,state:path.join(dir,'state')},null,2));console.log('ARTIFACTS',dir);
}catch(error){if(page)await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:false,step,error:String(error.stack||error),passed,errors},null,2));console.error('FAILED',step,'ARTIFACTS',dir);throw error;}
finally{if(browser)await browser.close();if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}fs.writeFileSync(path.join(dir,'server.log'),logs.join(''));}
