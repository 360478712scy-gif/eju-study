import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

// All learning mutations in this test use an isolated temporary data directory.
// No Codex CLI request is made. The imported-plan path verifies the same preview API.
const root=path.resolve(import.meta.dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-browser-v2-'));
const data=path.join(dir,'state'),port=18764,base=`http://127.0.0.1:${port}`;
const logs=[],results=[],errors=[];
let server,browser,page,step='startup';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const pass=label=>{results.push(label);console.log('PASS',label);};
async function json(url){const r=await fetch(base+url);assert.ok(r.ok,`${url}: ${r.status}`);return r.json();}
async function action(body,expected=200){const r=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const x=await r.json();assert.equal(r.status,expected,JSON.stringify(x));return x;}
async function startServer(){
 server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:data},stdio:'pipe'});
 server.stdout.on('data',b=>logs.push(b.toString()));server.stderr.on('data',b=>logs.push(b.toString()));
 for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error('Isolated server exited: '+logs.join(''));try{if((await json('/api/health')).app==='eju-study')return;}catch{}await pause(100);}
 throw Error('Isolated server did not start: '+logs.join(''));
}
async function stopServer(){if(!server||server.exitCode!==null)return;const child=server;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');resolve();},2000).unref();});}
async function nav(name){
 await page.locator(`.nav [data-page="${name}"]`).click();
 await page.waitForFunction(n=>document.querySelector(`.nav [data-page="${n}"]`)?.classList.contains('active')&&document.querySelector('#view')?.children.length>0,name);
 if(name==='plan')await page.locator('#plan-detail .task').first().waitFor();
}
async function close(){if(await page.locator('#close-modal').count())await page.locator('#close-modal').click();}
async function work(task){await nav('today');await page.locator(`[data-study="${task.id}"]`).click();await page.locator('.workblocks').waitFor();}
async function saveOutput(task,block,text){
 await page.locator(`[data-block="${block.id}"]`).click();await page.locator('#block-output').fill(text);await page.locator('#block-minutes').fill('0.1');
 await page.locator('#block-form button[type="submit"], #block-form button:not([type])').first().click();await page.locator('.workblocks').waitFor();
 const s=await json('/api/state'),record=s.blockRecords[task.id+':'+block.id];assert.ok(record);assert.equal(record.text,text);assert.equal(record.minutes,.1);
}

try{
 let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(400)});occupied=true;}catch{}
 if(occupied)throw Error('Port 18764 is already in use; refusing to touch an unrelated server.');
 await startServer();
 browser=await chromium.launch({headless:true,executablePath:process.env.EJU_CHROMIUM_PATH||'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1440,height:1080},permissions:['clipboard-read','clipboard-write']});page=await context.newPage();
 page.on('pageerror',e=>errors.push({kind:'pageerror',message:e.message}));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push({kind:'console',message:m.text()});});
 await page.goto(base);await page.locator('[data-study]').first().waitFor();
 const initial=await json('/api/state'),bank=await json('/api/questions'),plan=initial.plans[initial.today],qby=id=>bank.find(q=>q.id===id);
 const vocab=plan.tasks.find(t=>t.topic==='vocab'),physics=plan.tasks.find(t=>t.subject==='physics');
 assert.equal(plan.tasks.length,7);assert.equal(await page.locator('.today-tasks .task').count(),7);assert.equal(plan.tasks.reduce((n,t)=>n+t.minutes,0),240);assert.ok(plan.tasks.every(t=>t.blocks?.length));
 pass('seven concrete tasks total 240 minutes and expose work blocks');

 step='workbench and honest completion defaults';
 await page.locator(`[data-complete="${vocab.id}"]`).click();assert.equal(await page.locator('#actual-minutes').inputValue(),'');assert.equal(await page.locator('#task-status').inputValue(),'partial');assert.equal(await page.locator('#task-status option[value="yes"]').isDisabled(),true);
 const rejected=await action({type:'completeTask',taskId:vocab.id,minutes:20,note:'虚构全部完成应被拦截',completed:true},400);assert.match(rejected.error,/产出/);assert.equal((await json('/api/state')).points,0);
 await page.locator('#actual-minutes').fill('1');await page.locator('#task-note').fill('先检查任务要求，题目还没有开始。');await page.locator('#complete-form .btn').first().click();await page.locator('.modal').waitFor({state:'detached'});assert.equal((await json('/api/state')).records[vocab.id].completed,false);
 pass('actual time starts blank, partial is default, zero-evidence completion is blocked');

 step='timer persistence';
 await page.locator('#timer-toggle').click();await page.waitForTimeout(1100);await page.reload();await page.locator('#timer-toggle').waitFor();assert.equal(await page.locator('#timer-toggle').innerText(),'暂停');await page.locator('#timer-toggle').click();
 assert.ok((await json('/api/state')).timer.elapsedSeconds>=1);pass('server-tracked timer survives reload and pauses with actual elapsed time');

 step='one actual UI answer with task and block identity';
 await work(vocab);assert.equal(await page.locator('.workblock').count(),vocab.blocks.length);
 const answerBlock=vocab.blocks.find(b=>b.kind==='questions'),first=qby(answerBlock.questionIds[0]);await page.locator(`[data-block="${answerBlock.id}"]`).click();
 await page.locator(`[data-option="${first.answer}"]`).click();await page.locator('#submit-answer').click();await page.locator('#recall-open').waitFor();
 let s=await json('/api/state');const firstAttempt=s.attempts.find(a=>a.questionId===first.id);assert.equal(firstAttempt.taskId,vocab.id);assert.equal(firstAttempt.blockId,answerBlock.id);assert.equal(firstAttempt.correct,true);await close();
 // The remaining answers are deterministic fixtures through the real action API.
 // This avoids dozens of repetitive UI clicks without faking task completion.
 for(const id of answerBlock.questionIds.slice(1)){const q=qby(id);await action({type:'answer',attemptId:'fixture-vocab-'+id,questionId:id,taskId:vocab.id,blockId:answerBlock.id,answer:q.answer,error:'无',seconds:15});}
 await page.reload();await work(vocab);assert.ok(await page.locator(`.workblock.is-done [data-block="${answerBlock.id}"]`).count());
 pass('a real UI answer retains task/block provenance; full question block is recognized');

 step='output blocks and whole task completion';
 for(const block of vocab.blocks.filter(b=>b.kind!=='questions'))await saveOutput(vocab,block,'まず条件を確認してから判断する。計画を変更する理由を説明する。各词的读音和中文含义已经遮住选项逐个写出，混淆词还需要明天回忆。'.repeat(Math.ceil((block.minChars||20)/70)));
 await page.locator('#work-complete').click();assert.equal(await page.locator('#task-status option[value="yes"]').isDisabled(),false);await page.locator('#task-status').selectOption('yes');await page.locator('#actual-minutes').fill('14.4');await page.locator('#task-note').fill('完成词项快测、遮住选项的回忆以及短句输出。');await page.locator('#complete-form .btn').first().click();await page.locator('.modal').waitFor({state:'detached'});
 s=await json('/api/state');assert.equal(s.records[vocab.id].completed,true);assert.equal(s.records[vocab.id].minutes,14.4);assert.equal(s.records[vocab.id].source,'self-report');assert.equal(s.records[vocab.id].evidenceComplete,true);const earned=s.points;assert.ok(earned>0);
 await page.locator(`[data-complete="${vocab.id}"]`).click();await page.locator('#complete-form .btn').first().click();await page.locator('.modal').waitFor({state:'detached'});assert.equal((await json('/api/state')).points,earned);
 pass('saved output blocks permit genuine task completion; decimal minutes and rewards are idempotent');

 step='review prioritizes an actual wrong answer';
 // Physics now requires its planned knowledge warm-up before question practice.
 // The complete recall/lesson/check UI is exercised independently in learning-browser.mjs.
 for(const card of initial.learningSession.cards.filter(c=>physics.blocks.some(b=>b.kind==='learning'&&b.cardIds.includes(c.id))))await action({type:'learningAnswer',cardId:card.id,recallText:card.answer,recallRating:'remembered',checkAnswer:card.check.answer,userNote:'隔离浏览器测试的物理预热 fixture；不修改真实学习记录。',seconds:0,requestId:'fixture-physics-learning-'+card.id});await page.reload();await page.locator('[data-study]').first().waitFor();
 await work(physics);const physicsAnswer=physics.blocks.find(b=>b.kind==='questions'),wrong=qby(physicsAnswer.questionIds.at(-1));await page.locator(`[data-block="${physicsAnswer.id}"]`).click();await page.locator(`[data-qindex="${physicsAnswer.questionIds.length-1}"]`).click();if(wrong.selfGrade){await page.locator('#written-response').fill('我把波的传播方向与质点运动方向混淆，先写下选项1作为独立尝试。');await page.locator('#reveal-answer').click();await page.locator('#error-kind').selectOption('读题');await page.locator('#grade-wrong').click();}else{await page.locator(`[data-option="${(wrong.answer+1)%wrong.options.length}"]`).click();await page.locator('#error-kind').selectOption('读题');await page.locator('#submit-answer').click();}await page.locator('#recall-open').waitFor();await close();
 await work(physics);const review=physics.blocks.find(b=>b.kind==='review');await page.locator(`[data-block="${review.id}"]`).click();await page.locator('.block-references > summary').click();const firstReference=page.locator('.block-references > details > summary').first();assert.equal(await firstReference.innerText(),wrong.title||wrong.prompt);
 await page.locator('#block-output').fill('先看清楚图中的横轴与方向，依据题设限定进行列式。原来的错误是把不同物理量混淆；遮住解析后已经重新写出判断依据。'.repeat(3));await page.locator('#block-minutes').fill('2.5');await page.locator('#block-form button:not([type])').click();await page.locator('.workblocks').waitFor();s=await json('/api/state');assert.equal(s.blockRecords[physics.id+':'+review.id].questionIds[0],wrong.id);await close();
 pass('correction material prioritizes the actual wrong question and stores selected question IDs');

 step='workload audit';
 await nav('audit');assert.equal(await page.locator('.audit-table tbody tr').count(),plan.tasks.length);const auditText=await page.locator('#view').innerText();assert.ok(auditText.includes('词项不与数学大题组相加'));assert.ok(auditText.includes('作答估计'));assert.ok(auditText.includes(String(plan.audit.estimatedMinutes)));await page.screenshot({path:path.join(dir,'audit.png'),fullPage:true});
 pass('audit page separates real question units, answer estimates, output blocks and budgets');

 step='daily report and real coach preview';
 await nav('report');await page.locator('#fatigue').selectOption('3');await page.locator('#available').fill('240');await page.locator('#reflection').fill('词汇提取比预计快，波的读图还有混淆。今天认真完成了词汇回忆和物理订正，明天继续练引导衔接，保持实际用时记录。');await page.locator('#report-form button').click();await page.locator('#undo-adjust').waitFor();await page.waitForFunction(()=>document.querySelector('#report-output')?.value.includes('任务块产出'));
 await page.locator('#copy-report').click();assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes('日语分域'));s=await json('/api/state');assert.equal(s.reports[s.today].minutes,14.4);assert.ok(s.reports[s.today].completion>0&&s.reports[s.today].completion<1);
 const tomorrow=new Date(Date.parse(s.today+'T12:00:00Z')+86400000).toISOString().slice(0,10),proposal={fromDate:tomorrow,toDate:tomorrow,allocations:{japanese:80,math:65,physics:55,chemistry:40},focus:{physics:'wave'},note:'保留听力练习，按照题设给定变量推进，重点记录停顿的位置。'};
 const previewResponse=page.waitForResponse(r=>r.url()===base+'/api/action'&&r.request().postDataJSON()?.type==='previewCoach');await page.locator('#coach-open').click();await page.locator('#coach-json').fill(JSON.stringify(proposal));await page.locator('#coach-preview').click();const previewPayload=await(await previewResponse).json();assert.ok(previewPayload.preview.tasks.every(t=>t.blocks.length));assert.equal(previewPayload.preview.tasks.reduce((n,t)=>n+t.minutes,0),240);await page.locator('#coach-apply').waitFor();
 const previewText=await page.locator('#coach-result').innerText();assert.match(previewText,/题组|词项|项作答|项练习|道题/,'coach dialog must display actual scheduled work, not only allocations');assert.match(previewText,/审核|评审|覆盖|待补/,'coach dialog must display the supply review');
 const before=await json('/api/state');assert.equal(before.coachPlans.length,0);await page.locator('#coach-apply').click();await page.locator('.modal').waitFor({state:'detached'});const after=await json('/api/state');assert.equal(after.coachPlans.length,1);assert.deepEqual(after.attempts,before.attempts);assert.deepEqual(after.records,before.records);const next=await json('/api/plan?date='+tomorrow);assert.equal(next.tasks.reduce((n,t)=>n+t.minutes,0),240);
 pass('report uses real evidence and imported coach preview displays actual work before applying to tomorrow');

 step='media playback';
 await nav('today');await page.locator('#wallpaper-mode').selectOption('motion');await page.waitForFunction(()=>document.querySelector('#wallpaper')?.currentTime>0);await work(vocab);assert.equal(await page.locator('#wallpaper').evaluate(v=>v.paused),true);await close();await page.waitForFunction(()=>!document.querySelector('#wallpaper')?.paused);
 if(await page.locator('#bgm').evaluate(a=>a.paused))await page.locator('#music-toggle').click();await page.waitForFunction(()=>!document.querySelector('#bgm').paused&&document.querySelector('#bgm').currentTime>0);const listening=qby('o-2018_1-l13');await nav('practice');await page.locator('#search').fill(listening.title);await page.locator(`[data-question="${listening.id}"]`).click();await page.locator('#question-audio').evaluate(a=>a.play());await page.waitForFunction(()=>document.querySelector('#question-audio')?.currentTime>0);assert.equal(await page.locator('#bgm').evaluate(a=>a.volume),0);await page.locator('#question-audio').evaluate(a=>a.pause());assert.ok(await page.locator('#bgm').evaluate(a=>a.volume)>0);await close();
 pass('wallpaper pauses during work and official audio plays with automatic background-music ducking');

 step='mobile layout';
 await page.setViewportSize({width:390,height:844});for(const name of ['today','plan','audit','practice','review','guides','report','rewards','settings']){await nav(name);await page.waitForTimeout(70);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow: '+name);}
 await work(vocab);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow: workbench');await page.screenshot({path:path.join(dir,'mobile-workbench.png'),fullPage:true});await close();await nav('today');await page.screenshot({path:path.join(dir,'mobile-today.png'),fullPage:true});
 pass('all nine pages and the task workbench fit a 390px viewport');

 step='persistence and errors';
 await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:path.join(dir,'dashboard.png'),fullPage:true});const persisted=await json('/api/state');await stopServer();await startServer();const restored=await json('/api/state');for(const key of ['attempts','blockRecords','records','coachPlans','points'])assert.deepEqual(restored[key],persisted[key],key);
 await page.reload();await page.locator('[data-study]').first().waitFor();assert.deepEqual(errors,[]);pass('server restart retains learning evidence and the browser has no JavaScript or media errors');
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:true,passed:results,errors,at:new Date().toISOString(),data},null,2));console.log('ARTIFACTS',dir);
}catch(error){
 if(page){try{await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true});fs.writeFileSync(path.join(dir,'failure-page.txt'),await page.locator('body').innerText());}catch{}}
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:false,step,error:String(error.stack||error),passed:results,errors,at:new Date().toISOString(),data},null,2));console.error('FAILED STEP',step,'ARTIFACTS',dir);throw error;
}finally{fs.writeFileSync(path.join(dir,'server.log'),logs.join(''));if(browser)await browser.close();await stopServer();}
