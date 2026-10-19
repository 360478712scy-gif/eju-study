import {vocabBlockProgress} from './vocab-learning.js';
import {createStudyClock} from './study-clock.js';
export function workloadLabel(t){const c=t.coverage||{};return c['math-group']?`${c['math-group']} 个官方题组${c.short?` + ${c.short} 道基础小题`:''}`:c.vocab?`${c.vocab} 个词项`:`${t.questionIds?.length??t.questionCount??0} 项作答`;}
export function reviewReferenceIds(task,block,record,attempts,date){
  if(block.kind!=='review'||block.fixedReferences)return [...(block.questionIds||[])];
  if(record?.date===date&&Array.isArray(record.questionIds))return [...record.questionIds];
  return (task.questionIds||[]).map(id=>{const a=attempts.findLast(a=>a.date===date&&a.taskId===task.id&&a.questionId===id);return {id,rank:!a?5:!a.correct?0:a.hinted?1:a.overtime?2:3};}).sort((a,b)=>a.rank-b.rank).slice(0,block.questionIds?.length||0).map(x=>x.id);
}
export function createWorkloadUI({getState,getBank,openModal,act,esc,on,all,wireAudio,openLearning,openVocab,openLegacyVocab,startSession,completeDialog,navigate}) {
  const state=()=>getState(),question=id=>getBank().find(q=>q.id===id);
  let blockClock=null,activeBlock=null;
  const clockText=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds)%60).padStart(2,'0')}`;
  function stopBlockClock(){const seconds=blockClock?.stop()||0;blockClock=null;if(activeBlock)activeBlock.running=false;return seconds;}
  function evidence(t,b){
    if(b.kind==='vocab')return vocabBlockProgress(state(),t,b,state().today).complete;
    if(b.kind==='learning')return b.cardIds?.length>0&&b.cardIds.every(id=>state().learning?.reviews?.some(r=>r.date===state().today&&r.cardId===id));
    if(b.kind==='questions')return b.questionIds.every(id=>state().attempts.some(a=>a.date===state().today&&a.taskId===t.id&&a.blockId===b.id&&a.questionId===id));
    if(b.kind==='report')return (state().reports[state().today]?.note?.trim().length||0)>=(b.minChars||20);
    const record=state().blockRecords?.[t.id+':'+b.id];
    if(record?.date!==state().today||(record.text?.trim().length||0)<(b.minChars||20))return false;
    if(b.kind==='review'){
      const ids=record.questionIds||[],assigned=b.questionIds||[];
      return new Set(ids).size===ids.length&&ids.length>=assigned.length&&ids.every(id=>t.questionIds?.includes(id)||(t.referenceQuestionIds?.includes(id)&&assigned.includes(id)))&&(!b.fixedReferences||(ids.every(id=>assigned.includes(id))&&assigned.every(id=>ids.includes(id))));
    }
    return true;
  }
  function title(q){return q.title||q.prompt||q.id;}
  function nextBlock(taskId,blockId){
    const task=state().plans[state().today]?.tasks.find(t=>t.id===taskId);
    const index=task?.blocks?.findIndex(b=>b.id===blockId)??-1;
    return index>=0&&task.blocks[index+1]?{task,block:task.blocks[index+1]}:null;
  }
  function startBlock(task,block){
    stopBlockClock();activeBlock=null;
    if(!task||!block)return;
    const t=state().plans[state().today]?.tasks.find(t=>t.id===task.id)||task,b=t.blocks?.find(b=>b.id===block.id)||block;
    if(b.kind==='vocab')return openVocab(t,b);
    if(t.topic==='vocab'&&(['questions','recall'].includes(b.kind)||b.id==='use')&&openLegacyVocab)return openLegacyVocab(t,b);
    if(b.kind==='learning')return openLearning(b.cardIds.find(id=>!state().learning?.reviews?.some(r=>r.date===state().today&&r.cardId===id))||b.cardIds[0]);
    if(b.kind==='questions'){
      const warm=t.blocks.find(x=>x.kind==='learning');
      if(warm&&!evidence(t,warm))return openLearning(warm.cardIds.find(id=>!state().learning?.reviews?.some(r=>r.date===state().today&&r.cardId===id)));
      return startSession(b.questionIds,t.id,t.reviewLinks||{},b.id);
    }
    if(b.kind==='report')return navigate('report');
    return blockDialog(t,b);
  }
  function workbench(id){
    stopBlockClock();activeBlock=null;
    const t=state().plans[state().today].tasks.find(t=>t.id===id);if(!t)return;
    openModal(t.title,`<div class="workbench-lead"><strong>${t.minutes} <small>分钟预算</small></strong><span>${workloadLabel(t)} · ${t.newCount||0} 项未做过</span></div><div class="workblocks">${(t.blocks||[]).map((b,i)=>`<section class="workblock ${evidence(t,b)?'is-done':''}"><div class="block-number">${evidence(t,b)?'✓':i+1}</div><div class="block-body"><div class="row between"><h3>${esc(b.title)}</h3><span class="tag">约 ${b.minutes} 分钟${['questions','vocab'].includes(b.kind)?` · ${b.questionIds?.length||0} 项`:''}</span></div><button class="btn ${evidence(t,b)?'line':'soft'} small" data-block="${b.id}">${evidence(t,b)?'查看／补充':['questions','vocab'].includes(b.kind)?'开始作答':b.kind==='report'?'去复盘':'开始'}</button></div></section>`).join('')}</div><div class="row workbench-bottom"><button class="btn" id="work-complete">记录成果</button>${t.reserveQuestionIds?.length?'<button class="btn line" id="work-reserve">补一组题</button>':''}</div>`,true);
    for(const el of all('[data-block]'))el.onclick=()=>startBlock(t,t.blocks.find(b=>b.id===el.dataset.block));
    on('#work-complete','click',()=>completeDialog(t.id));
    on('#work-reserve','click',()=>startSession(t.reserveQuestionIds.filter(id=>!state().attempts.some(a=>a.questionId===id&&a.date===state().today))));
  }
  function blockDialog(t,b){
    stopBlockClock();
    const stored=state().blockRecords?.[t.id+':'+b.id],record=stored?.date===state().today?stored:null;
    const previousMinutes=Number.isFinite(record?.minutes)?record.minutes:0;
    const cleanText=String(record?.text||'').replace(/\n\n〔用时来源：[^\n]*〕$/,'');
    const owner={running:true};activeBlock=owner;
    const reviewIds=reviewReferenceIds(t,b,record,state().attempts,state().today);
    const references=b.kind==='recall'&&t.topic==='vocab'?[]:reviewIds.map(question).filter(Boolean);
    const unresolvedHtml=b.kind==='review'&&reviewIds.length?`<div class="field" style="margin-top:20px"><span>仍未解决</span>${reviewIds.map(id=>`<label style="display:flex;align-items:baseline;gap:10px"><input type="checkbox" data-unresolved-question="${esc(id)}" ${record?.unresolvedQuestionIds?.includes(id)?'checked':''} style="width:auto;flex:0 0 auto"><span style="overflow-wrap:anywhere">${esc(title(question(id)||{id}))}</span></label>`).join('')}</div>`:'';
    openModal(b.title,`${b.instruction?`<div class="note">${esc(b.instruction)}</div>`:''}${references.length?`<details class="block-references"><summary>材料 · ${references.length} 项</summary>${references.map(q=>`<details><summary>${esc(title(q))}</summary>${q.audio?`<audio controls preload="none" src="${esc(q.audio)}"></audio>`:''}<p>${esc(q.prompt)}</p>${(q.images||[]).map(src=>`<img class="question-img" src="${src}" alt="指定原题">`).join('')}${q.explanation?`<p>${esc(q.explanation)}</p>`:''}${(q.answerImages||[]).map(src=>`<img class="question-img" src="${src}" alt="官方答案">`).join('')}${q.transcript?`<p style="white-space:pre-wrap">${esc(q.transcript)}</p>`:''}${(q.transcriptImages||[]).map(src=>`<img class="question-img" src="${src}" alt="官方原文">`).join('')}</details>`).join('')}</details>`:''}<form id="block-form">${unresolvedHtml}<div class="field" style="margin-top:20px"><label for="block-output">${b.kind==='writing'?'记述原文':'你的记录'}</label><textarea id="block-output" minlength="${b.minChars||20}" required placeholder="${b.kind==='review'?'题号 · 卡点 · 依据 · 复做结果':'写下练习结果'}" style="min-height:${b.kind==='writing'?300:170}px">${esc(cleanText)}</textarea></div><div class="row between"><span>本次用时 <strong id="block-clock">0:00</strong></span>${previousMinutes?`<span>此前已记录 ${previousMinutes} 分钟</span>`:''}</div><div class="field"><label for="block-minutes">本块累计分钟</label><input id="block-minutes" type="number" readonly min="0.1" max="240" step="0.1" value="${previousMinutes||0.1}"></div><details><summary>补充纸上用时</summary><div class="field"><label for="block-paper-minutes">未计入上方计时的分钟数</label><input id="block-paper-minutes" type="number" min="0" max="240" step="0.1" value="0"></div></details><p id="block-error" class="note warm" role="alert" hidden></p><div class="row" style="margin-top:20px"><button class="btn">保存并继续</button><button type="button" class="linkbutton" id="block-back">返回任务</button></div></form>`,true);
    wireAudio();
    const draftKey='eju-block-draft-'+t.id+':'+b.id,timeKey=`eju-block-clock:${state().today}:${t.id}:${b.id}:${record?.at||'new'}`;
    const form=document.querySelector('#block-form'),area=form.querySelector('#block-output'),paper=form.querySelector('#block-paper-minutes'),total=form.querySelector('#block-minutes'),elapsed=form.querySelector('#block-clock'),errorBox=form.querySelector('#block-error'),submit=form.querySelector('button:not([type])');
    const savedDraft=localStorage.getItem(draftKey);if(savedDraft!==null)area.value=savedDraft;
    const savedPaper=Number(localStorage.getItem(draftKey+':paper'));if(Number.isFinite(savedPaper)&&savedPaper>=0&&savedPaper<=240)paper.value=savedPaper;
    const update=seconds=>{elapsed.textContent=clockText(seconds);total.value=Math.max(.1,Math.round((previousMinutes+seconds/60+(Number(paper.value)||0))*10)/10);};
    const startClock=()=>{owner.running=true;blockClock=createStudyClock({storageKey:timeKey,isActive:()=>activeBlock===owner&&owner.running&&form.isConnected,onTick:update});};
    area.addEventListener('input',()=>{area.setCustomValidity('');localStorage.setItem(draftKey,area.value);});
    paper.addEventListener('input',()=>{localStorage.setItem(draftKey+':paper',paper.value);update(blockClock?.seconds()||0);});
    startClock();
    on('#block-back','click',()=>workbench(t.id));
    on('#block-form','submit',async e=>{
      e.preventDefault();if(submit.disabled)return;
      area.setCustomValidity(area.value.trim().length<(b.minChars||20)?`请写至少 ${b.minChars||20} 字的练习记录。`:'');
      if(!form.reportValidity())return;
      const seconds=stopBlockClock(),paperMinutes=Number(paper.value)||0,minutes=Math.max(.1,Math.round((previousMinutes+seconds/60+paperMinutes)*10)/10);
      if(minutes>240){errorBox.textContent='本块累计用时不能超过 240 分钟。';errorBox.hidden=false;startClock();return;}
      const text=area.value.trim()+`\n\n〔用时来源：前台自动计时 ${seconds.toFixed(1)} 秒；本次纸上补充 ${paperMinutes} 分钟；此前已记录 ${previousMinutes} 分钟〕`;
      const unresolvedQuestionIds=all('[data-unresolved-question]:checked').map(el=>el.dataset.unresolvedQuestion);
      submit.disabled=true;errorBox.hidden=true;
      try{
        await act({type:'saveBlock',taskId:t.id,blockId:b.id,text,minutes,questionIds:reviewIds,unresolvedQuestionIds});
        localStorage.removeItem(draftKey);localStorage.removeItem(draftKey+':paper');localStorage.removeItem(timeKey);
        if(activeBlock===owner&&form.isConnected)blockSaved(t,b);
      }catch(error){
        if(activeBlock===owner&&form.isConnected){errorBox.textContent=error.message||'保存失败，请重试。';errorBox.hidden=false;submit.disabled=false;startClock();}
      }
    });
  }
  function blockSaved(t,b){
    stopBlockClock();activeBlock=null;
    const next=nextBlock(t.id,b.id);
    openModal('已保存',`<div class="row"><button class="btn" id="block-next">${next?'下一板块 · '+esc(next.block.title):'记录本项成果'}</button><button class="linkbutton" id="block-saved-back">返回任务</button></div>`);
    on('#block-next','click',()=>{const latest=nextBlock(t.id,b.id);if(latest)startBlock(latest.task,latest.block);else completeDialog(t.id);});
    on('#block-saved-back','click',()=>workbench(t.id));
  }
  function auditView(){
    const p=state().plans[state().today],a=p.audit,bank=getBank();
    const count=(sub,topic)=>bank.filter(q=>q.subject===sub&&q.official&&(!topic||q.topic===topic)).length;
    return `<div class="page-head"><div><h1>计划评审</h1></div></div><div class="audit-cards"><div class="card"><strong class="audit-number">${p.budget}</strong><p>分钟预算</p></div><div class="card"><strong class="audit-number">${a?.estimatedMinutes??'—'}</strong><p>分钟具体练习估计</p></div><div class="card"><strong class="audit-number">${a?.issues?.length??'—'}</strong><p>需要留意的供给问题</p></div></div><div class="card audit-table-wrap"><h2>今天具体做什么</h2><table class="audit-table"><thead><tr><th>任务</th><th>作答量</th><th>作答估计</th><th>订正／产出</th><th>预算</th></tr></thead><tbody>${(a?.rows||[]).map(r=>`<tr><td>${esc(r.title)}</td><td>${workloadLabel(r)}</td><td>${r.questionMinutes} 分</td><td>${r.outputMinutes} 分</td><td>${r.budget} 分</td></tr>`).join('')}</tbody></table><p class="note">${esc(a?.note||'旧版计划还没有逐块工作量核算。')}</p>${(a?.issues||[]).map(x=>`<p class="note warm">${esc(x.message)}</p>`).join('')}</div><div class="grid2" style="margin-top:20px"><div class="card"><h2>题库数量</h2><ul class="audit-list"><li>数学：${count('math')} 个官方大题组</li><li>物理：${count('physics')} 道官方小题</li><li>化学：${count('chemistry')} 道官方小题</li><li>日语：${count('japanese','listening')} 道官方听力、${count('japanese','reading')} 道官方阅读</li><li>词汇：${bank.filter(q=>q.topic==='vocab').length} 个词项</li></ul></div><details class="card"><summary>评审规则</summary><ul class="audit-list"><li>每块有题目或可记录的具体产出。</li><li>真题训练不靠基础短题填满时间。</li><li>缺少同考点新题时明确报缺。</li><li>同题重复、借助提示，不扩充独立首答样本。</li><li>至少 5 道同题型首次独立正确后校准用时。</li><li>奖励依据已完成的练习。</li></ul></details></div>`;
  }
  return {workbench,auditView,evidence,startBlock,nextBlock,stopBlockClock};
}
