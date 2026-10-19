import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {initialState,buildPlan,today} from '../engine.mjs';
import {loadBank} from '../bank.mjs';
import {getVocabContent} from '../public/vocab-content.js';

// Real browser / real grading API. Only Codex's asynchronous HTTP transport is
// stubbed; the executable is additionally pointed at a nonexistent temp path.
// Real content is retained, while this isolated fixture shortens each block so
// every transition can be exercised through UI. Production data is never read.
const root=path.resolve(import.meta.dirname,'..'),port=18775,base=`http://127.0.0.1:${port}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-japanese-v2-')),data=path.join(dir,'state'),bank=loadBank(),date=today();
const passed=[],errors=[],logs=[],aiRequests=[],aiPolls=[],selfReportRequests=[],jobs=new Map();let step='prepare',server,browser,page,releaseReports=false,rejectSelfReportOnce=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pass=label=>{passed.push(label);console.log('PASS',label);};
async function json(url,options){const r=await fetch(base+url,options),value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
const readState=()=>json('/api/state');
async function startServer(){
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:data,EJU_CODEX_PATH:path.join(dir,'live-cli-is-disabled')},stdio:'pipe'});
  server.stdout.on('data',b=>logs.push(b.toString()));server.stderr.on('data',b=>logs.push(b.toString()));
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Server exited: '+logs.join(''));try{if((await json('/api/health')).app==='eju-study')return;}catch{}await sleep(100);}throw Error('Server did not start');
}
async function stopServer(){if(!server||server.exitCode!==null)return;const child=server;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');resolve();},2500).unref();});}
async function nav(name){if(await page.locator('#close-modal').count())await page.locator('#close-modal').click();await page.locator(`.nav [data-page="${name}"]`).click();await page.locator(`.nav [data-page="${name}"].active`).waitFor();}
async function work(task,block){await nav('today');await page.locator(`[data-study="${task.id}"]`).click();await page.locator(`[data-block="${block.id}"]`).click();await page.locator('#vocab-exercise').waitFor();}
async function fits(label,footer='.vocab-footer'){
  const measurements=await page.evaluate(selector=>{const r=document.querySelector('.modal')?.getBoundingClientRect(),f=document.querySelector(selector)?.getBoundingClientRect();const controls=[...document.querySelectorAll(selector+' button,'+selector+' input')].filter(e=>!e.disabled).map(e=>{const b=e.getBoundingClientRect();return {id:e.id,left:b.left,right:b.right,top:b.top,bottom:b.bottom};});return {width:innerWidth,height:innerHeight,doc:document.documentElement.scrollWidth,modal:r&&{x:r.x,y:r.y,width:r.width,height:r.height},footer:f&&{left:f.left,right:f.right,top:f.top,bottom:f.bottom},controls};},footer);
  assert.ok(measurements.doc<=measurements.width+1,label+' page horizontal overflow '+JSON.stringify(measurements));
  if(measurements.modal){assert.ok(Math.abs(measurements.modal.x)<2&&Math.abs(measurements.modal.y)<2,label+' is not full screen');assert.ok(Math.abs(measurements.modal.width-measurements.width)<2);assert.ok(Math.abs(measurements.modal.height-measurements.height)<2);}
  if(measurements.footer){assert.ok(measurements.footer.left>=-1&&measurements.footer.right<=measurements.width+1&&measurements.footer.bottom<=measurements.height+1,label+' footer overflow');for(const control of measurements.controls)assert.ok(control.left>=-1&&control.right<=measurements.width+1&&control.top>=0&&control.bottom<=measurements.height+1,label+' hidden footer control '+JSON.stringify(control));}
}
async function noAnswerLeak(id){
  const c=getVocabContent(id),modal=page.locator('.modal');
  assert.equal(await modal.locator('[data-vocab-word],[data-vocab-example],[data-pron-word],[data-pron-example],#help-open,#ai-hint,#quiz-guide,.vocab-standard').count(),0,'no pronunciation or hint control before grading');
  assert.equal((await modal.innerText()).includes(c.reading),false,'the standard kana must not appear before submitting '+id);
  assert.equal(await modal.locator('audio').count(),0);
}
async function currentId(){return page.locator('#vocab-exercise').getAttribute('data-vocab-id');}
async function waitId(id){await page.waitForFunction(q=>document.querySelector('#vocab-exercise')?.dataset.vocabId===q,id);}
async function enterNext(){await page.locator('#vocab-next').focus();await page.keyboard.press('Enter');}
function fixtureResult(mode){return {summary:`AI 测试回包：${mode} 的本组记录已分析。`,strengths:['此处只展示测试 AI 响应，不代表实际学习评估。'],weaknesses:['需要用下一次独立作答继续验证。'],nextSteps:['按本组错误再做一次不同日期的回忆。']};}

try{
  let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(300)});occupied=true;}catch{}assert.equal(occupied,false,'Port 18775 is occupied; refusing to attach.');
  const seed=initialState(),plan=buildPlan(seed,bank,date),task=plan.tasks.find(t=>t.topic==='vocab');
  const sizes={reading:3,meaning:2,cloze:2,repair:2};
  for(const block of task.blocks){block.questionIds=block.questionIds.slice(0,sizes[block.id]);if(block.id==='repair')block.questionIds=task.blocks[0].questionIds.slice(0,2);block.units=block.questionIds.length;block.minutes=block.units*block.unitSeconds/60;}
  const oldMinutes=task.minutes;task.questionIds=[...new Set(task.blocks.flatMap(b=>b.questionIds))];task.minutes=task.estimatedMinutes=task.blocks.reduce((n,b)=>n+b.minutes,0);task.coverage.vocab=task.questionIds.length;task.newCount=task.questionIds.length;task.vocabulary={distinctWords:task.questionIds.length,responses:9,modes:{reading:5,meaning:2,cloze:2},repair:2};plan.budget-=oldMinutes-task.minutes;plan.allocations.japanese-=oldMinutes-task.minutes;seed.plans[date]=plan;
  seed.vocabulary.reports={};const sessions=[];
  for(const block of task.blocks){
    const key=`eju-vocab-session:${date}:${task.id}:${block.id}:${block.mode}:${block.questionIds.join(',')}`,requestIds=Object.fromEntries(block.questionIds.map(id=>[id,`ui-${block.id}-${id}`]));
    sessions.push({key,ids:block.questionIds,index:0,mode:block.mode,submitted:{},drafts:{},helped:{},requestIds,seconds:{}});
    const attemptIds=Object.values(requestIds).sort(),reportKey='vocab-'+createHash('sha256').update(JSON.stringify({version:1,attemptIds})).digest('hex');
    const job={id:'fixture-'+block.id,type:'vocabReport',reportKey,attemptIds,status:'running',result:null,date,taskId:task.id,blockId:block.id,mode:block.mode,createdAt:new Date().toISOString()};
    // Pre-existing pending jobs allow the real self-report API to persist text.
    // None is marked completed and no grade/answer is seeded.
    seed.vocabulary.reports[reportKey]=job;jobs.set(job.id,job);block.fixtureReportKey=reportKey;
  }
  fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'state.json'),JSON.stringify(seed,null,2));await startServer();
  browser=await chromium.launch({headless:true,executablePath:process.env.EJU_CHROMIUM_PATH||'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(values=>{localStorage.setItem('eju-music-enabled','false');for(const value of values)if(!localStorage.getItem(value.key))localStorage.setItem(value.key,JSON.stringify(value));},sessions);
  await page.route('**/api/action',async route=>{
    const input=route.request().postDataJSON();
    if(input.type==='vocabSelfReport'){
      selfReportRequests.push(input);
      if(rejectSelfReportOnce){rejectSelfReportOnce=false;await route.fulfill({status:503,json:{error:'测试：保存暂时失败，请重试。'}});return;}
    }
    await route.continue();
  });
  await page.route('**/api/ai/start',async route=>{const input=route.request().postDataJSON();aiRequests.push(input);assert.equal(input.type,'vocabReport','this run never asks real question hints or plans');const ids=[...new Set(input.attemptIds)].sort(),key='vocab-'+createHash('sha256').update(JSON.stringify({version:1,attemptIds:ids})).digest('hex');let job=[...jobs.values()].find(j=>j.reportKey===key);if(!job){const s=await readState(),row=s.vocabulary.attempts.find(a=>a.id===ids[0]);job={id:'fixture-extra-'+jobs.size,type:'vocabReport',reportKey:key,attemptIds:ids,status:'running',result:null,date,taskId:row?.taskId||null,blockId:row?.blockId||null,mode:row?.mode};jobs.set(job.id,job);}await route.fulfill({status:202,json:job});});
  await page.route('**/api/ai/job?*',async route=>{const id=new URL(route.request().url()).searchParams.get('id'),job=jobs.get(id);assert.ok(job,'unexpected AI polling '+id);aiPolls.push(id);await route.fulfill({json:releaseReports?{...job,status:'completed',result:fixtureResult(job.mode)}:job});});
  await page.goto(base);await page.locator('.nav').waitFor();

  step='reading leak guards / draft / IME';
  const reading=task.blocks[0],first=reading.questionIds[0];await work(task,reading);await noAnswerLeak(first);await fits('desktop reading');
  await page.locator('#vocab-response').fill('まだ入力中');
  const imePrevented=await page.locator('#vocab-response').evaluate(input=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'こ'}));const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true});input.dispatchEvent(event);input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'こ'}));return event.defaultPrevented;});assert.equal(imePrevented,true,'composition Enter cannot perform form submission');
  assert.equal((await readState()).vocabulary.attempts.length,0,'IME Enter must not submit');
  await page.reload();await page.locator('.nav').waitFor();await work(task,reading);assert.equal(await page.locator('#vocab-response').inputValue(),'まだ入力中');await noAnswerLeak(first);
  pass('reading is full screen, hides audio/answers/AI help, and preserves a draft through refresh and IME Enter');

  step='foreground timing / Chinese reading is wrong';
  const timeKey=sessions[0].key+':time:'+first,readSeconds=()=>page.evaluate(key=>Number(localStorage.getItem(key)||0),timeKey);
  await sleep(450);await page.evaluate(()=>dispatchEvent(new Event('eju-window-hidden')));const hiddenStart=await readSeconds();await sleep(900);const hiddenEnd=await readSeconds();assert.ok(hiddenEnd-hiddenStart<.2,'hidden time was counted');
  await page.evaluate(()=>dispatchEvent(new Event('eju-window-visible')));await sleep(450);await page.locator('#vocab-response').fill(getVocabContent(first).word);await page.locator('#vocab-submit').click();await page.locator('.vocab-feedback').waitFor();
  let s=await readState(),row=s.vocabulary.attempts.at(-1);assert.equal(row.correct,false);assert.equal(row.mode,'reading');assert.equal(row.taskId,task.id);assert.equal(row.blockId,'reading');assert.ok(row.seconds>=.7&&row.seconds<hiddenStart+1.6);assert.equal(await page.locator('[data-vocab-word]').count(),1);assert.equal(await page.locator('#help-open,#ai-hint').count(),0);
  assert.equal(row.expected,getVocabContent(first).reading);assert.ok(row.contentSnapshot);await page.locator('[data-vocab-word]').click();
  pass('native hide pauses the automatic clock; Chinese spelling is graded wrong and audio appears only after submission');

  step='Enter navigation / reading completion';
  await enterNext();await waitId(reading.questionIds[1]);await noAnswerLeak(reading.questionIds[1]);
  await page.locator('#vocab-response').fill(getVocabContent(reading.questionIds[1]).reading);await page.locator('#vocab-submit').click();await page.locator('#vocab-next').waitFor();await enterNext();await waitId(reading.questionIds[2]);
  await page.locator('#vocab-forgot').click();await page.locator('#vocab-next').waitFor();await enterNext();await page.locator('#vocab-summary').waitFor();
  assert.equal((await readState()).vocabulary.attempts.filter(a=>a.blockId==='reading').length,3);assert.ok((await readState()).vocabulary.attempts.find(a=>a.questionId===reading.questionIds[2]).skipped);
  pass('Enter advances exactly one question, and explicit cannot-recall remains a saved wrong response');

  step='separate AI and self report';
  await page.locator('#vocab-ai-report').waitFor();assert.equal((await page.locator('#vocab-ai-report').innerText()).includes('AI 测试回包'),false,'a running job must not pretend it has generated a report');
  const self='我能听懂词义，但看到汉字时还不能稳定想起读音。';await page.locator('#vocab-self-report').fill(self);await page.locator('#vocab-self-report').press('Enter');assert.ok(await page.locator('#vocab-summary').count(),'multiline Enter must not leave the report');
  await page.locator('#vocab-save-self').click();await page.waitForFunction(()=>document.querySelector('#vocab-self-status')?.textContent.includes('已保存'));s=await readState();assert.equal(s.vocabulary.selfReports[reading.fixtureReportKey].text,self);assert.equal(s.vocabulary.selfReports[reading.fixtureReportKey].source,'self-report');
  releaseReports=true;await page.waitForFunction(()=>document.querySelector('#vocab-ai-report')?.textContent.includes('AI 测试回包'),{},{timeout:10000});assert.equal((await page.locator('#vocab-self-report').inputValue()).trim(),self);assert.equal((await page.locator('#vocab-ai-report').innerText()).includes(self),false);
  pass('an unfinished AI report stays pending, and the user report is saved separately from the controlled AI response');

  step='next block / meaning auto-next';
  const requestsAfterManualSave=selfReportRequests.length;
  await page.locator('#vocab-next-block').click();const meaning=task.blocks[1];await waitId(meaning.questionIds[0]);assert.equal(selfReportRequests.length,requestsAfterManualSave,'an unchanged saved report must not be written again on continue');await noAnswerLeak(meaning.questionIds[0]);assert.equal(await page.locator('#jp-auto-next').isChecked(),false);
  await page.locator(`input[name="vocab-choice"][value="${getVocabContent(meaning.questionIds[0]).meaningAnswer}"]`).check();await sleep(250);assert.equal((await readState()).vocabulary.attempts.filter(a=>a.mode==='meaning').length,0,'auto-next is opt-in');await page.locator('#vocab-submit').click();await page.locator('#vocab-next').waitFor();await enterNext();await waitId(meaning.questionIds[1]);
  await page.locator('#jp-auto-next').check();await page.locator(`input[name="vocab-choice"][value="${getVocabContent(meaning.questionIds[1]).meaningAnswer}"]`).check();await page.locator('#vocab-summary').waitFor();s=await readState();assert.equal(s.vocabulary.attempts.filter(a=>a.mode==='meaning').length,2);assert.equal(s.vocabulary.attempts.filter(a=>a.mode==='reading').length,3);
  pass('one click starts the meaning block; only opting into Japanese auto-next submits and advances a selection');

  step='self-report autosave / failed save stays / retry before next block';
  const meaningSelf='这组能区分词义，但还需要用新语境检查是否真的理解。',beforeAutosave=selfReportRequests.length;
  await page.locator('#vocab-self-report').fill(meaningSelf);
  assert.equal(selfReportRequests.length,beforeAutosave,'typing alone must not write a report');
  assert.equal((await readState()).vocabulary.selfReports?.[meaning.fixtureReportKey],undefined);
  rejectSelfReportOnce=true;
  await page.locator('#vocab-next-block').click();await page.waitForFunction(()=>document.querySelector('#vocab-self-status')?.textContent.includes('未保存'));
  assert.equal(await page.locator('#vocab-summary').count(),1,'failed automatic save must stay on the summary');
  assert.equal(await page.locator('#vocab-self-report').inputValue(),meaningSelf,'failed automatic save must preserve the text');
  assert.equal(await page.locator('#vocab-next-block').isEnabled(),true,'retry must remain available');
  assert.equal((await readState()).vocabulary.selfReports?.[meaning.fixtureReportKey],undefined,'the failed mocked request cannot persist a report');
  assert.equal(selfReportRequests.length,beforeAutosave+1);
  await page.locator('#vocab-next-block').click();const cloze=task.blocks[2];await waitId(cloze.questionIds[0]);
  s=await readState();assert.equal(s.vocabulary.selfReports[meaning.fixtureReportKey].text,meaningSelf);assert.equal(s.vocabulary.selfReports[meaning.fixtureReportKey].source,'self-report');
  assert.deepEqual(selfReportRequests.at(-1).attemptIds.slice().sort(),Object.values(sessions[1].requestIds).sort(),'the automatic save belongs to this block’s exact attempts');
  assert.equal(s.vocabulary.selfReports[meaning.fixtureReportKey].reportKey,meaning.fixtureReportKey);
  assert.equal(selfReportRequests.length,beforeAutosave+2,'one retry should produce exactly one successful write');
  assert.equal(await page.evaluate(key=>localStorage.getItem('eju-vocab-self:'+key),sessions[1].key),null,'the saved draft is cleared only after persistence');
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'state.json'),'utf8')).vocabulary.selfReports[meaning.fixtureReportKey].text,meaningSelf);
  pass('continue automatically saves an unsubmitted self report; failed persistence stays in place with the draft intact and retry saves before navigation');

  step='cloze and repair continuity / mobile';
  await page.setViewportSize({width:390,height:844});await fits('mobile cloze');await noAnswerLeak(cloze.questionIds[0]);
  for(const id of cloze.questionIds){await waitId(id);await page.locator(`input[name="vocab-choice"][value="${getVocabContent(id).cloze.answer}"]`).check();}
  await page.locator('#vocab-summary').waitFor();const requestsBeforeBlank=selfReportRequests.length;await page.locator('#vocab-next-block').click();const repair=task.blocks[3];await page.locator('#vocab-repair-read').waitFor();assert.equal(selfReportRequests.length,requestsBeforeBlank,'an untouched empty report must not create a write');assert.equal((await readState()).vocabulary.selfReports?.[cloze.fixtureReportKey],undefined);await fits('mobile repair study');await page.locator('#vocab-repair-start').click();await waitId(repair.questionIds[0]);await noAnswerLeak(repair.questionIds[0]);await fits('mobile reading repair');
  for(const id of repair.questionIds){await waitId(id);await page.locator('#vocab-response').fill(getVocabContent(id).reading);await page.locator('#vocab-submit').click();await page.locator('#vocab-next').waitFor();await fits('mobile graded reading');await enterNext();}
  await page.locator('#vocab-summary').waitFor();await page.waitForFunction(()=>document.querySelector('#vocab-ai-report')?.textContent.includes('AI 测试回包'),{},{timeout:10000});s=await readState();assert.equal(s.vocabulary.attempts.length,9);assert.equal(s.attempts.length,0);assert.ok(s.vocabulary.attempts.filter(a=>a.blockId==='repair').every(a=>a.helped&&!a.intervalAdvanced));assert.equal(s.vocabulary.mastery[first].reading.streak,0);await page.screenshot({path:path.join(dir,'mobile-summary.png'),fullPage:true});
  pass('cloze and repair continue in order, fit the mobile footer, and keep each mode separate without same-day mastery inflation');

  step='automatic notebook and persisted feedback';
  const repairSelf='订正后能写出读音，下一次要先独立回忆再核对。';await page.locator('#vocab-self-report').fill(repairSelf);
  await page.locator('#vocab-finish-notebook').click();await page.locator('#vocab-note-search').waitFor();assert.equal((await readState()).vocabulary.selfReports[repair.fixtureReportKey].text,repairSelf,'opening the notebook also saves the pending self report');await page.locator('#vocab-note-search').fill(getVocabContent(first).word);await page.locator(`[data-vocab-note="${first}"]`).click();const history=await page.locator('.vocab-history').innerText();assert.ok(history.includes(getVocabContent(first).reading));assert.ok(history.includes('我的答案'));assert.equal(await page.locator('.vocab-history article').count(),4);await page.screenshot({path:path.join(dir,'mobile-vocab-notebook.png'),fullPage:true});
  const persisted=await readState();await stopServer();await startServer();assert.deepEqual((await readState()).vocabulary,persisted.vocabulary);await page.reload();await page.locator('.nav').waitFor();await nav('notebook');await page.locator(`[data-vocab-note="${first}"]`).click();assert.ok((await page.locator('.vocab-history').innerText()).includes(getVocabContent(first).reading));
  pass('each response automatically becomes a notebook record and real grading/self reports survive server restart');

  step='restored self-report uses persisted attempt identities';
  await work(task,meaning);await page.locator('#vocab-next').waitFor();await enterNext();await page.locator('#vocab-summary').waitFor();
  assert.equal(await page.locator('#vocab-self-report').inputValue(),meaningSelf,'reopening the same completed attempts restores the saved report without a local draft');
  assert.equal(await page.evaluate(key=>localStorage.getItem('eju-vocab-self:'+key),sessions[1].key),null);
  pass('a completed block restores its persisted self report by the same attempt IDs after restart');

  step='generic Enter safeguards for math physics chemistry';
  await page.setViewportSize({width:1280,height:900});await page.locator('#close-modal').click();
  for(const subject of ['math','physics','chemistry']){
    const qs=bank.filter(q=>q.subject===subject&&!q.selfGrade&&!q.official).slice(0,2);assert.equal(qs.length,2);
    // Seed only an unopened two-question practice queue, never a response.
    await page.evaluate(ids=>localStorage.setItem('eju-active-session',JSON.stringify({ids,index:0,taskId:null,blockId:null,reviewLinks:{},responses:{},attempts:{},selections:{},text:{},revealed:{},elapsed:{},hints:{},helpDraft:{},startedAt:Date.now()})),qs.map(q=>q.id));
    await page.reload();await page.locator('#continue').click();await page.locator('.question-layout').waitFor();await fits(subject+' full-screen footer','.quiz-navigation');assert.equal(await page.locator('#jp-auto-next').count(),0,subject+' must not acquire Japanese automatic submission');
    await page.locator('#question-note').fill('这是多行草稿');await page.locator('#question-note').press('Enter');assert.equal(await page.locator('.qnav .active').getAttribute('data-qindex'),'0');assert.ok((await page.locator('#question-note').inputValue()).endsWith('\n'));
    await page.locator(`[data-option="${qs[0].answer}"]`).click();await sleep(150);assert.equal((await readState()).attempts.some(a=>a.questionId===qs[0].id),false,'non-Japanese selection cannot auto-submit');await page.locator('#submit-answer').click();await page.locator('.explanation').waitFor();await page.locator('#qnext').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.qnav .active')?.dataset.qindex==='1');
    // Finish the queue through its UI so pagehide cannot save the prior queue
    // over the next subject's deliberately seeded unopened session.
    await page.locator('#qnext').click();await page.locator('#finish-close').click();
  }
  pass('math physics and chemistry share full-screen Enter navigation while textareas keep newline behavior and no Japanese auto-submit toggle');

  assert.deepEqual(errors,[]);for(const block of task.blocks)assert.ok(aiPolls.includes('fixture-'+block.id)||aiRequests.some(r=>r.attemptIds?.every(id=>id.startsWith('ui-'+block.id+'-'))),'each finished block automatically initiates/resumes its own AI job: '+block.id);fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:true,passed,errors,noLiveCLI:true,aiRequests,aiPolls,selfReportRequests,state:data,fixture:'actual content; shortened 3/2/2/2 vocabulary blocks and pending AI job records',at:new Date().toISOString()},null,2));console.log('ARTIFACTS',dir);
}catch(error){if(page){await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(dir,'failure-page.txt'),await page.locator('body').innerText().catch(()=>''));}fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:false,step,error:String(error.stack||error),passed,errors,aiRequests,selfReportRequests,state:data},null,2));console.error('FAILED',step,'ARTIFACTS',dir);throw error;}
finally{if(browser)await browser.close();await stopServer();fs.writeFileSync(path.join(dir,'server.log'),logs.join(''));}
