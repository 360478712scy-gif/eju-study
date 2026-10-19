import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

// Real cards and real UI throughout; all writes remain in an isolated temporary directory.
const root=path.resolve(import.meta.dirname,'..'),port=18766,base=`http://127.0.0.1:${port}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eju-learning-browser-')),data=path.join(dir,'state');
const results=[],errors=[],logs=[],requests=[];
let server,browser,page,step='startup';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pass=text=>{results.push(text);console.log('PASS',text);};
async function readState(){const response=await fetch(base+'/api/state');assert.equal(response.status,200);return response.json();}
async function startServer(){
 server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EJU_DATA_DIR:data},stdio:'pipe'});
 server.stdout.on('data',b=>logs.push(b.toString()));server.stderr.on('data',b=>logs.push(b.toString()));
 for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error('Isolated server exited: '+logs.join(''));try{const response=await fetch(base+'/api/health');if(response.ok)return;}catch{}await wait(100);}
 throw Error('Isolated server did not become ready: '+logs.join(''));
}
async function stopServer(){if(!server||server.exitCode!==null)return;const child=server;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');resolve();},2000).unref();});}
async function nav(name){await page.locator(`.nav [data-page="${name}"]`).click();await page.waitForFunction(n=>document.querySelector(`.nav [data-page="${n}"]`)?.classList.contains('active')&&document.querySelector('#view')?.children.length>0,name);}
async function close(){if(await page.locator('#close-modal').count())await page.locator('#close-modal').click();}
async function assertFits(label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow: '+label);if(await page.locator('.modal').count())assert.ok(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'modal overflow: '+label);}

try{
 assert.ok(fs.existsSync(path.join(root,'public/learning-cards.js')),'Real learning cards must exist before this test; no mock content is supplied.');
 let occupied=false;try{await fetch(base+'/api/health',{signal:AbortSignal.timeout(400)});occupied=true;}catch{}assert.equal(occupied,false,'Port 18766 is already occupied; refusing to use an unrelated server.');
 await startServer();
 browser=await chromium.launch({headless:true,executablePath:process.env.EJU_CHROMIUM_PATH||'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1440,height:1080}});page=await context.newPage();
 page.on('pageerror',e=>errors.push({kind:'pageerror',message:e.message}));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push({kind:'console',message:m.text()});});page.on('request',request=>requests.push(request.url()));
 await page.goto(base);await page.locator('.nav [data-page="learning"]').waitFor();
 const initial=await readState(),cards=initial.learningSession.cards,today=initial.today,tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 assert.ok(cards.length>0);const card=cards[0],originalNote='我先把条件和适用范围写出来，再用例子检查；不把看懂讲解误认为已经能独立回忆。';

 step='daily planned knowledge and terms';
 await nav('learning');assert.equal(await page.locator('[data-learn-card]').count(),cards.length);assert.match(await page.locator('.learning-overview').innerText(),/已包含在三科预算/);
 const plannedIds=initial.plans[today].tasks.flatMap(t=>(t.blocks||[]).filter(b=>b.kind==='learning').flatMap(b=>b.cardIds));assert.deepEqual(new Set(cards.map(c=>c.id)),new Set(plannedIds));
 await page.locator(`[data-learn-card="${card.id}"]`).click();await page.locator('#learning-recall-form').waitFor();assert.equal(await page.locator('.learning-answer').count(),0);assert.equal(await page.locator('#learning-recall').inputValue(),'');
 await page.locator('#learning-recall-form .btn').click();assert.equal(await page.locator('#learning-recall-form').count(),1,'empty recall cannot advance to the lesson');
 await page.locator('#learning-recall').fill('不记得');await page.locator('#learning-rating').selectOption('forgot');
 for(let i=0;i<card.terms.length;i++)await page.locator(`[data-term-recall="${i}"]`).fill(i===0?'不认识':card.terms[i].zh);
 await page.locator('#learning-recall-form .btn').click();await page.locator('#learning-check').waitFor();assert.equal(await page.locator('.learning-answer').innerText(),card.answer);assert.equal(await page.locator('.terms-table > div').count(),card.terms.length);assert.equal(await page.locator('.worked-example').evaluate(el=>el.open),true);assert.ok((await page.locator('.worked-example').innerText()).includes(card.workedExample.answer));
 pass('planned cards require original recall and term input before displaying the real lesson and worked example');

 step='different application question and automatic notebook';
 await page.locator('#learning-check').click();await page.locator('#learning-check-form').waitFor();assert.equal(await page.locator('.learning-answer').count(),0);assert.equal(await page.locator('.learning-prompt').innerText(),card.check.prompt);assert.notEqual(card.check.prompt,card.workedExample.prompt);
 const wrong=(card.check.answer+1)%card.check.options.length;await page.locator(`input[name="checkAnswer"][value="${wrong}"]`).check();await page.locator('#learning-note').fill(originalNote);await page.locator('#learning-check-form button:not([type])').click();await page.locator('#notebook-edit').waitFor();assert.match(await page.locator('.modal-head').innerText(),/已存入笔记本/);
 let s=await readState(),entry=s.learning.notebook.find(e=>e.cardId===card.id&&e.date===today);assert.ok(entry);assert.equal(s.learning.notebook.length,1);assert.equal(entry.recallRating,'forgot');assert.ok(entry.recallText.includes('不记得'));assert.ok(entry.recallText.includes(card.terms[0].ja));assert.equal(entry.check.selectedAnswer,wrong);assert.equal(entry.check.correct,false);assert.equal(entry.userNote,originalNote);assert.deepEqual(entry.cardSnapshot,card);assert.equal(s.learning.cardState[card.id].due,tomorrow);assert.equal(s.learning.cardState[card.id].streak,0);const entryId=entry.id,snapshot=structuredClone(entry.cardSnapshot),firstHistory=structuredClone(entry.history[0]);
 pass('a wrong application answer is recorded honestly with a full knowledge snapshot and next-day review');

 step='refresh and personal-note editing';
 await page.reload();await page.locator('.nav [data-page="notebook"]').waitFor();await nav('notebook');await page.locator(`[data-notebook-entry="${entryId}"]`).click();await page.locator('#notebook-note').waitFor();assert.equal(await page.locator('#notebook-note').inputValue(),originalNote);assert.ok((await page.locator('.notebook-source').innerText()).includes(card.answer));
 const amended='补充自己的方法：先判断条件是否满足，再确认公式中的符号、方向和单位。正文与例题保留原样。';await page.locator('#notebook-note').fill(amended);await page.locator('#notebook-edit button:not([type])').click();await page.locator('#notebook-note').waitFor();s=await readState();entry=s.learning.notebook.find(e=>e.id===entryId);assert.equal(entry.userNote,amended);assert.deepEqual(entry.cardSnapshot,snapshot);assert.deepEqual(entry.history[0],firstHistory);await close();
 pass('refresh restores the notebook and personal edits do not change the original lesson or recall evidence');

 step='search by Japanese term, subject and date';
 await nav('notebook');await page.locator('#notebook-search').fill(card.terms[0].ja);await page.locator('#notebook-subject').selectOption(card.subject);await page.locator('#notebook-date').fill(today);await page.locator('#notebook-date').press('Tab');assert.equal(await page.locator('[data-notebook-entry]').count(),1);
 const other=['math','physics','chemistry'].find(x=>x!==card.subject);await page.locator('#notebook-subject').selectOption(other);assert.equal(await page.locator('[data-notebook-entry]').count(),0);await page.locator('#notebook-subject').selectOption(card.subject);await page.locator('#notebook-date').fill(tomorrow);await page.locator('#notebook-date').press('Tab');assert.equal(await page.locator('[data-notebook-entry]').count(),0);await page.locator('#notebook-date').fill(today);await page.locator('#notebook-date').press('Tab');assert.equal(await page.locator('[data-notebook-entry]').count(),1);
 pass('Japanese-term search combines correctly with subject and date filters');

 step='same-day relearning';
 await page.locator(`[data-notebook-entry="${entryId}"]`).click();await page.locator('#notebook-relearn').click();await page.locator('#learning-recall').fill('现在能先回忆条件，再写出关键关系，并解释单位和符号的含义。');await page.locator('#learning-rating').selectOption('remembered');for(let i=0;i<card.terms.length;i++)await page.locator(`[data-term-recall="${i}"]`).fill(card.terms[i].zh);await page.locator('#learning-recall-form .btn').click();if(await page.locator('#learning-check').count())await page.locator('#learning-check').click();await page.locator('#learning-check-form').waitFor();assert.equal(await page.locator('.learning-answer').count(),0);await page.locator(`input[name="checkAnswer"][value="${card.check.answer}"]`).check();await page.locator('#learning-check-form button:not([type])').click();await page.locator('#notebook-edit').waitFor();
 s=await readState();entry=s.learning.notebook.find(e=>e.id===entryId);assert.equal(s.learning.notebook.length,1);assert.equal(entry.attemptsToday,2);assert.equal(entry.history.length,2);assert.equal(entry.history[0].checkCorrect,false);assert.equal(entry.history[1].checkCorrect,true);assert.equal(entry.userNote,amended);assert.equal(s.learning.cardState[card.id].due,tomorrow);assert.equal(s.learning.cardState[card.id].streak,0);assert.deepEqual(entry.cardSnapshot,snapshot);await close();
 pass('same-day successful relearning updates one notebook entry without extending the review interval');

 step='portable notebook export';
 await nav('notebook');const downloaded=page.waitForEvent('download');await page.locator('#notebook-export').click();const download=await downloaded,backup=path.join(dir,'notebook-export.json');await download.saveAs(backup);const exported=JSON.parse(fs.readFileSync(backup,'utf8'));const exportedEntry=exported.learning.notebook.find(e=>e.id===entryId);assert.deepEqual(exportedEntry.cardSnapshot,snapshot);assert.equal(exportedEntry.history.length,2);assert.equal(exportedEntry.userNote,amended);
 pass('downloaded JSON includes the complete lesson, term/example snapshot and both attempts');

 step='390px knowledge and notebook views';
 await page.setViewportSize({width:390,height:844});await nav('learning');await assertFits('daily knowledge');await page.screenshot({path:path.join(dir,'mobile-learning.png'),fullPage:true});await nav('notebook');await assertFits('notebook');await page.screenshot({path:path.join(dir,'mobile-notebook.png'),fullPage:true});
 await nav('learning');const unfinished=cards.find(c=>c.id!==card.id)||card;await page.locator(`[data-learn-card="${unfinished.id}"]`).click();if(await page.locator('#notebook-relearn').count())await page.locator('#notebook-relearn').click();await assertFits('recall modal');await page.locator('#learning-recall').fill('不记得');await page.locator('#learning-recall-form .btn').click();await assertFits('lesson modal');await page.screenshot({path:path.join(dir,'mobile-lesson.png'),fullPage:true});await page.locator('#learning-check').click();await assertFits('application modal');await close();
 pass('knowledge, notebook, and all three study stages fit a 390px viewport');

 step='server restart preserves learning state';
 const persisted=await readState();await stopServer();await startServer();const restored=await readState();assert.deepEqual(restored.learning,persisted.learning);await page.reload();await page.locator('.nav [data-page="notebook"]').waitFor();await nav('notebook');await page.locator(`[data-notebook-entry="${entryId}"]`).click();assert.equal(await page.locator('#notebook-note').inputValue(),amended);assert.ok((await page.locator('.notebook-source').innerText()).includes(card.terms[0].ja));assert.deepEqual(errors,[]);assert.equal(requests.some(url=>url.includes('/api/ai/start')),false);
 pass('restart retains the complete notebook and no JavaScript errors or live AI calls occur');
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:true,passed:results,errors,data,at:new Date().toISOString()},null,2));console.log('ARTIFACTS',dir);
}catch(error){
 if(page)try{await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true});fs.writeFileSync(path.join(dir,'failure-page.txt'),await page.locator('body').innerText());}catch{}
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({ok:false,step,error:String(error.stack||error),passed:results,errors,data,at:new Date().toISOString()},null,2));console.error('FAILED STEP',step,'ARTIFACTS',dir);throw error;
}finally{fs.writeFileSync(path.join(dir,'server.log'),logs.join(''));if(browser)await browser.close();await stopServer();}
