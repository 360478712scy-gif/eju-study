import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {initialState,buildPlan,today} from '../engine.mjs';
import {loadBank} from '../bank.mjs';
import {getVocabContent} from '../public/vocab-content.js';

// Use the real server, content, grading and persistence in an isolated data dir.
// Every AI endpoint is intercepted; the CLI path is also deliberately invalid.
// This proves reading/feedback behaviour, not audible pronunciation quality.
const root=path.resolve(import.meta.dirname,'..'),port=18778,base=`http://127.0.0.1:${port}`;
const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'eju-pronunciation-reading-')),data=path.join(isolated,'state');
const artifacts=path.join(root,'tests/pronunciation-audit-20261006/reading-browser');
const cases=[
  {id:'vx096',answer:'こうはん',correct:true,feedback:'かくはん ／ こうはん'},
  {id:'vx258',answer:'いそん',correct:true,feedback:'いぞん ／ いそん'},
  {id:'vx207',answer:'ふんべつ',correct:false,feedback:'ぶんべつ',context:'ごみを種類ごとに分別する。'},
];
const passed=[],errors=[],logs=[],aiRequests=[],screenshots=[],grades=[];
let step='prepare',server,browser,page,task;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pass=label=>{passed.push(label);console.log('PASS',label);};
async function json(url){const response=await fetch(base+url),value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;}
async function startServer(){
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:data,EJU_CODEX_PATH:path.join(isolated,'live-cli-is-disabled')},stdio:'pipe'});
  server.stdout.on('data',b=>logs.push(b.toString()));server.stderr.on('data',b=>logs.push(b.toString()));
  for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error('Server exited: '+logs.join(''));try{if((await json('/api/health')).app==='eju-study')return;}catch{}await sleep(100);}throw Error('Server did not start');
}
async function stopServer(){if(!server||server.exitCode!==null)return;await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');setTimeout(()=>{if(server.exitCode===null)server.kill('SIGKILL');resolve();},2500).unref();});}
async function screenshot(name){const target=path.join(artifacts,name+'.png');await page.screenshot({path:target,fullPage:false});screenshots.push(target);}
async function hiddenBeforeAnswer(item){
  const modal=page.locator('.modal'),content=getVocabContent(item.id),text=await modal.innerText();
  assert.equal(await modal.locator('[data-vocab-word],[data-vocab-example],[data-pron-word],[data-pron-example],#help-open,#ai-hint,#quiz-guide,.vocab-standard,audio').count(),0,'answer/audio/help is hidden before submission');
  for(const reading of new Set([content.reading,...(content.acceptedReadings||[]),item.answer]))assert.equal(text.includes(reading),false,'answer kana leaked: '+reading);
  assert.equal(await page.locator('#vocab-response').inputValue(),'');
  assert.equal(await page.locator('#jp-auto-next').count(),0);
  const size=await modal.evaluate(element=>{const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight};});
  assert.ok(Math.abs(size.x)<2&&Math.abs(size.y)<2&&Math.abs(size.width-size.viewportWidth)<2&&Math.abs(size.height-size.viewportHeight)<2,'question modal fills the current viewport');
  if(item.context){assert.equal(await page.locator('.vocab-reading-context').innerText(),item.context);assert.ok(await page.locator('.vocab-reading-context').isVisible());}
}
function result(ok,extra={}){return {ok,at:new Date().toISOString(),step,passed,errors,noLiveCLI:true,port,isolatedData:data,fixture:'Only three reading questions; no answers or attempt history seeded. Real server/API/persistence; all AI HTTP requests mocked as unavailable.',limitations:['No human listening acceptance; audio buttons are checked for post-answer visibility only.'],grades,aiRequests,screenshots,...extra};}

fs.mkdirSync(artifacts,{recursive:true});
try{
  let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)});occupied=true;}catch{}assert.equal(occupied,false,'Port 18778 is occupied; refusing to attach.');
  const seed=initialState(),date=today(),plan=buildPlan(seed,loadBank(),date);task=plan.tasks.find(t=>t.topic==='vocab');
  const reading=task.blocks.find(b=>b.id==='reading'),oldMinutes=task.minutes;
  reading.questionIds=cases.map(item=>item.id);reading.units=3;reading.minutes=reading.units*reading.unitSeconds/60;
  task.blocks=[reading];task.questionIds=[...reading.questionIds];task.minutes=task.estimatedMinutes=reading.minutes;task.coverage.vocab=3;task.newCount=3;
  task.vocabulary={distinctWords:3,responses:3,modes:{reading:3,meaning:0,cloze:0},repair:0};
  plan.budget-=oldMinutes-task.minutes;plan.allocations.japanese-=oldMinutes-task.minutes;seed.plans[date]=plan;
  fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'state.json'),JSON.stringify(seed,null,2));await startServer();
  browser=await chromium.launch({headless:true,executablePath:process.env.EJU_CHROMIUM_PATH||'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('eju-music-enabled','false'));
  await page.route('**/api/ai/**',async route=>{const request=route.request();aiRequests.push({url:new URL(request.url()).pathname,method:request.method(),input:request.postDataJSON()});await route.fulfill({status:200,json:{id:'isolated-ai-disabled',type:'vocabReport',status:'failed',available:false,error:'Isolated audit: AI disabled',result:null}});});
  await page.goto(base);await page.locator('.nav').waitFor();await page.locator(`[data-study="${task.id}"]`).click();await page.locator('[data-block="reading"]').click();
  for(const [index,item] of cases.entries()){
    step=item.id+' before answer';await page.waitForFunction(id=>document.querySelector('#vocab-exercise')?.dataset.vocabId===id,item.id);await hiddenBeforeAnswer(item);
    assert.equal((await json('/api/state')).vocabulary.attempts.length,index);
    await screenshot(item.id+'-before');pass(item.id+' has no answer kana, audio, or AI help before submission'+(item.context?'; sorting context is visible':''));
    step=item.id+' feedback';await page.locator('#vocab-response').fill(item.answer);await page.locator('#vocab-submit').click();await page.locator('.vocab-feedback').waitFor();
    assert.equal(await page.locator('.vocab-feedback.'+(item.correct?'is-correct':'needs-review')).count(),1);
    assert.equal(await page.locator('.vocab-standard b').innerText(),item.feedback);
    assert.equal(await page.locator('[data-vocab-word]').count(),1);assert.ok(await page.locator('[data-vocab-word]').isVisible());
    assert.equal(await page.locator('[data-vocab-example]').count(),1);assert.ok(await page.locator('[data-vocab-example]').isVisible());
    assert.equal(await page.locator('#help-open,#ai-hint').count(),0);
    const attempts=(await json('/api/state')).vocabulary.attempts,row=attempts.at(-1);assert.equal(attempts.length,index+1);
    assert.equal(row.questionId,item.id);assert.equal(row.response,item.answer);assert.equal(row.correct,item.correct);assert.equal(row.mode,'reading');assert.equal(row.taskId,task.id);assert.equal(row.blockId,'reading');assert.ok(row.seconds>=0);assert.ok(row.contentSnapshot);
    grades.push({questionId:row.questionId,answer:row.response,correct:row.correct,seconds:row.seconds,expected:row.expected,feedback:item.feedback});
    await screenshot(item.id+'-feedback');pass(item.id+' grades '+item.answer+' as '+item.correct+' and reveals '+item.feedback+' with audio controls');
    await page.locator('#vocab-next').focus();await page.keyboard.press('Enter');
  }
  step='summary and persisted records';await page.locator('#vocab-summary').waitFor();await page.locator('#vocab-ai-retry').waitFor();
  assert.ok(aiRequests.some(request=>request.url==='/api/ai/start'));assert.ok(aiRequests.every(request=>request.url.startsWith('/api/ai/')));
  const state=await json('/api/state');assert.equal(state.vocabulary.attempts.length,3);assert.equal(state.attempts.length,0);assert.deepEqual(state.vocabulary.attempts.map(row=>row.correct),[true,true,false]);
  const persisted=JSON.parse(fs.readFileSync(path.join(data,'state.json'),'utf8'));assert.deepEqual(persisted.vocabulary.attempts,state.vocabulary.attempts);
  assert.equal(Object.keys(persisted.vocabulary.reports||{}).length,0,'mock AI must not create a backend report');
  assert.deepEqual(errors,[]);await screenshot('summary');pass('Enter advances once per question; exactly three real grades persist in temporary data and AI remains intercepted');
  fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(result(true),null,2));console.log('ARTIFACTS',artifacts);
}catch(error){if(page){await screenshot('failure').catch(()=>{});fs.writeFileSync(path.join(artifacts,'failure-page.txt'),await page.locator('body').innerText().catch(()=>''));}fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(result(false,{error:String(error.stack||error)}),null,2));console.error('FAILED',step,'ARTIFACTS',artifacts);throw error;}
finally{if(browser)await browser.close();await stopServer();fs.writeFileSync(path.join(artifacts,'server.log'),logs.join(''));}
