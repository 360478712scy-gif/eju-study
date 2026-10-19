import {getVocabContent} from './vocab-content.js';
import {playWord,playExample,stopPronunciation,getPronunciationRate,setPronunciationRate} from './pronunciation.js';
import {createStudyClock} from './study-clock.js';

const LABELS={reading:'看词写读音',meaning:'辨认真正的词义',cloze:'换个语境应用'};
const $=s=>document.querySelector(s);
const formatTime=n=>`${Math.floor(n/60)}:${String(Math.floor(n)%60).padStart(2,'0')}`;

export function createVocabularyUI({getState,getBank,openModal,act,esc,on,all,notify,returnToTask,nextBlock,navigate,request}){
  const state=()=>getState(),rows=()=>state().vocabulary?.attempts||[];
  let session=null,clock=null,search='';
  const supported=(id,mode)=>{const c=getVocabContent(id);return !!c&&(mode==='reading'?/\p{Script=Han}/u.test(c.word):mode==='meaning'?Array.isArray(c.meaningOptions):!!c.cloze);};
  function stopClock(){clock?.stop();clock=null;}
  function remember(){if(session)localStorage.setItem(session.key,JSON.stringify(session));}
  function feedbackRow(id){const rowId=session?.submitted?.[id];return rows().find(r=>r.id===rowId);}
  function openBlock(task,block,{supplement=false}={}){
    stopClock();stopPronunciation();
    const ids=[...new Set(block.questionIds||[])].filter(id=>supported(id,block.mode));
    if(!ids.length){notify('这一组暂时没有已审核的练习，原记录仍保留。');return;}
    const key=`eju-vocab-session:${state().today}:${supplement?'supplement':task?.id||'practice'}:${block.id}:${block.mode}:${ids.join(',')}`;
    let old;try{old=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    session=old&&old.ids?.join(',')===ids.join(',')?old:{key,ids,index:0,mode:block.mode,submitted:{},drafts:{},helped:{},requestIds:{},seconds:{}};
    session.taskId=supplement?null:task?.id||null;session.blockId=session.taskId?block.id:null;
    session.returnTaskId=task?.id||null;session.returnBlockId=block.returnBlockId||block.id;session.repair=block.id==='repair';session.title=block.title||LABELS[block.mode];session.date=state().today;
    remember();if(session.repair&&!session.repairStudied)showRepair();else showQuestion();
  }
  function showRepair(){
    const current=session;
    openModal('订正后再回忆',`<section id="vocab-repair-read"><div class="vocab-repair-list">${current.ids.map(id=>{const c=getVocabContent(id);return `<article><b>${esc(c.word)}</b><span>${esc(c.reading)}</span><p>${esc(c.meaning)}</p><button class="btn line small" data-vocab-word="${id}">听读音</button></article>`;}).join('')}</div><div class="vocab-footer"><button class="linkbutton" id="vocab-repair-back">返回任务</button><button class="btn" id="vocab-repair-start">遮住答案，开始复测</button></div></section>`,true);
    bindAudio();const sentinel=$('#vocab-repair-read');
    clock=createStudyClock({storageKey:current.key+':review-time',isActive:()=>sentinel.isConnected,initialSeconds:0});
    on('#vocab-repair-back','click',()=>{stopClock();returnToTask(current.returnTaskId);});
    on('#vocab-repair-start','click',()=>{const seconds=clock?.seconds()||0;stopClock();current.seconds[current.ids[0]]=(current.seconds[current.ids[0]]||0)+seconds;current.repairStudied=true;remember();showQuestion();});
  }
  function showQuestion(){
    stopClock();if(!session)return;
    const current=session,id=current.ids[current.index],c=getVocabContent(id),row=feedbackRow(id),mode=current.mode;
    if(!c)return;
    const options=mode==='meaning'?c.meaningOptions:mode==='cloze'?c.cloze.options:null;
    const stem=mode==='cloze'?c.cloze.prompt:c.word;
    openModal(current.title,`<section id="vocab-exercise" data-vocab-id="${esc(id)}"><div class="row between"><span class="tag">${current.index+1} / ${current.ids.length} · ${LABELS[mode]}</span><span class="vocab-clock" aria-label="本题前台用时">${formatTime(row?.seconds||current.seconds[id]||0)}</span></div><div class="vocab-stem ${mode==='cloze'?'is-context':''}">${esc(stem)}</div>${mode==='reading'&&c.readingContext?`<p class="vocab-reading-context">${esc(c.readingContext)}</p>`:''}${row?feedbackHTML(c,row):`<form id="vocab-answer-form">${mode==='reading'?`<div class="field"><label for="vocab-response">用假名写读音</label><input id="vocab-response" class="text vocab-reading-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入平假名或片假名" value="${esc(current.drafts[id]??'')}" aria-label="日语假名读音"></div>`:`<div class="vocab-choices">${options.map((text,i)=>`<label><input type="radio" name="vocab-choice" value="${i}" ${current.drafts[id]===i?'checked':''}><span>${esc(text)}</span></label>`).join('')}</div>`}</form>`}<div class="vocab-footer"><button class="linkbutton" id="vocab-back">返回</button>${mode!=='reading'?`<label class="vocab-auto"><input id="jp-auto-next" type="checkbox" ${localStorage.getItem('eju-jp-auto-next')==='true'?'checked':''}>选后自动下一题</label>`:''}<div class="row">${row?`<button class="btn" id="vocab-next">${current.index===current.ids.length-1?'完成本板块':'下一题'} <kbd>Enter</kbd></button>`:`<button type="button" class="btn line" id="vocab-forgot">想不起来</button><button type="submit" form="vocab-answer-form" class="btn" id="vocab-submit">提交</button>`}</div></div></section>`,true);
    if(row){bindAudio(id);on('#vocab-next','click',()=>{if(current!==session)return;if(current.index<current.ids.length-1){current.index++;remember();showQuestion();}else finish();});}
    else{
      const sentinel=$('#vocab-exercise');
      clock=createStudyClock({storageKey:current.key+':time:'+id,initialSeconds:current.seconds[id]||0,isActive:()=>sentinel.isConnected&&session===current&&!feedbackRow(id),onTick:seconds=>{current.seconds[id]=seconds;const label=sentinel.querySelector('.vocab-clock');if(label)label.textContent=formatTime(seconds);}});
      const input=$('#vocab-response');input?.focus();
      on('#vocab-response','input',e=>{current.drafts[id]=e.target.value;remember();});
      on('#vocab-response','keydown',e=>{if(e.key==='Enter'&&(e.isComposing||e.keyCode===229))e.preventDefault();});
      for(const radio of all('[name="vocab-choice"]'))radio.addEventListener('change',()=>{current.drafts[id]=Number(radio.value);remember();if(localStorage.getItem('eju-jp-auto-next')==='true')submit(false,{advance:true});});
      on('#vocab-answer-form','submit',async e=>{e.preventDefault();await submit(false);});
      on('#vocab-forgot','click',()=>submit(true));

    }
    on('#jp-auto-next','change',event=>localStorage.setItem('eju-jp-auto-next',String(event.target.checked)));
    on('#vocab-back','click',()=>{stopClock();remember();stopPronunciation();if(current.returnTaskId)returnToTask(current.returnTaskId);else navigate('today');});
  }
  async function submit(skipped,{advance=false}={}){
    const current=session,id=current.ids[current.index],button=$('#vocab-submit');if(!button||button.disabled||feedbackRow(id))return;
    const response=skipped?null:current.mode==='reading'?$('#vocab-response').value:current.drafts[id];
    if(!skipped&&(current.mode==='reading'?!String(response||'').trim():!Number.isInteger(response))){notify(current.mode==='reading'?'先写假名，或点“想不起来”。':'先选一项，或点“想不起来”。');return;}
    current.seconds[id]=clock?.seconds()??current.seconds[id]??0;stopClock();
    current.requestIds[id] ||= crypto.randomUUID();remember();button.disabled=true;$('#vocab-forgot').disabled=true;
    try{
      await act({type:'vocabAnswer',attemptId:current.requestIds[id],questionId:id,mode:current.mode,response,skipped,seconds:current.seconds[id],helped:!!current.helped[id]||current.repair,taskId:current.taskId,blockId:current.blockId});
      current.submitted[id]=current.requestIds[id];remember();
      if(session===current&&$('#vocab-exercise')?.dataset.vocabId===id){showQuestion();if(advance)setTimeout(()=>{if(session===current&&$('#vocab-exercise')?.dataset.vocabId===id)$('#vocab-next')?.click();},450);}
    }catch(error){notify(error.message);if(session===current)showQuestion();}
  }
  function feedbackHTML(c,row){
    const own=row.correct?'':`<p>你的${row.mode==='reading'?'读音':'答案'}：${esc(row.skipped?'想不起来':row.mode==='reading'?row.response:answerText(c,row))}</p>`;
    const explanation=row.mode==='cloze'?(row.explanation||c.meaning):c.meaning;
    return `<div class="vocab-feedback ${row.correct?'is-correct':'needs-review'}"><strong>${row.correct?(row.helped?'提示后答对':'独立答对'):'这次还需要复习'}</strong>${own}<p class="vocab-standard">${esc(row.word||c.word)} <b>${esc(row.mode==='reading'&&c.acceptedReadings?c.acceptedReadings.join(' ／ '):row.reading||c.reading)}</b></p>${row.mode==='reading'?'':`<p>标准答案：${esc(row.expected)}</p>`}<p>${esc(explanation)}</p><div class="row"><button class="btn soft small" data-vocab-word="${esc(row.questionId)}">听标准读音</button><button class="btn line small" data-vocab-example="${esc(row.questionId)}">听例句</button>${rateHTML()}</div></div>`;
  }
  function rateHTML(){return `<label class="small muted">语速 <select data-vocab-rate aria-label="词汇读音语速">${[.8,1,1.2].map(n=>`<option value="${n}" ${getPronunciationRate()===n?'selected':''}>${n} ×</option>`).join('')}</select></label>`;}
  function bindAudio(){
    for(const button of all('[data-vocab-word]'))button.onclick=()=>playWord(button.dataset.vocabWord).catch(e=>notify(e.message));
    for(const button of all('[data-vocab-example]'))button.onclick=()=>playExample(button.dataset.vocabExample).catch(e=>notify(e.message));
    for(const select of all('[data-vocab-rate]'))select.onchange=()=>{const rate=Number(select.value);setPronunciationRate(rate);localStorage.setItem('eju-pronunciation-rate',String(rate));};
  }
  function finish(){
    stopClock();stopPronunciation();const current=session,done=current.ids.map(feedbackRow).filter(Boolean),wrong=done.filter(r=>!r.correct||r.helped);
    const task=state().plans[state().today]?.tasks.find(t=>t.id===current.returnTaskId),index=task?.blocks.findIndex(b=>b.id===current.returnBlockId),next=index>=0?task.blocks[index+1]:null;
    const attemptIds=done.map(r=>r.id),report=Object.values(state().vocabulary?.reports||{}).find(r=>r.attemptIds?.length===attemptIds.length&&attemptIds.every(id=>r.attemptIds.includes(id)));
    const draftKey='eju-vocab-self:'+current.key;
    const savedSelf=Object.values(state().vocabulary?.selfReports||{}).find(r=>r.attemptIds?.length===attemptIds.length&&attemptIds.every(id=>r.attemptIds.includes(id)))||state().vocabulary?.selfReports?.[report?.reportKey];
    const own=localStorage.getItem(draftKey)??savedSelf?.text??'';
    openModal('本板块完成',`<section id="vocab-summary"><div class="vocab-summary"><b>${done.filter(r=>r.correct&&!r.helped).length} / ${current.ids.length}</b><span>独立答对 · ${formatTime(done.reduce((n,r)=>n+(r.seconds||0),0))}</span></div>${wrong.length?`<div class="vocab-result-list">${wrong.map(r=>`<div><b>${esc(r.word)}</b><span>${esc(r.reading)}</span><small>${r.correct?'订正后答对':'待复习'}</small></div>`).join('')}</div>`:''}<div class="vocab-report-grid"><section><h3>我的汇报</h3><textarea id="vocab-self-report" placeholder="这组哪里卡住了？（选填）">${esc(own)}</textarea><button class="btn line small" id="vocab-save-self">保存我的汇报</button><span id="vocab-self-status"></span></section><section><h3>AI 汇报</h3><div id="vocab-ai-report">${aiReportHTML(report)}</div></section></div><div class="vocab-footer"><button class="linkbutton" id="vocab-finish-notebook">词汇笔记</button><button class="btn" id="vocab-next-block">${next?'下一板块 · '+esc(next.title):task?'记录本项成果':'返回今日学习'} <kbd>Enter</kbd></button></div></section>`,true);
    const panel=$('#vocab-ai-report'),selfPanel=$('#vocab-self-status');
    let savedText=savedSelf?.text||'',saving=null;
    async function saveSelf(){
      const text=$('#vocab-self-report')?.value??'';
      if(text===savedText)return true;
      if(saving)return saving;
      saving=(async()=>{try{await act({type:'vocabSelfReport',attemptIds,text});savedText=text;localStorage.removeItem(draftKey);if(selfPanel.isConnected)selfPanel.textContent=' 已保存';return true;}catch(error){notify(error.message);if(selfPanel.isConnected)selfPanel.textContent=' 未保存，请重试';return false;}finally{saving=null;}})();
      return saving;
    }
    on('#vocab-next-block','click',async event=>{const button=event.currentTarget;button.disabled=true;if(!await saveSelf()){button.disabled=false;return;}if(current.returnTaskId)nextBlock(current.returnTaskId,current.returnBlockId);else navigate('today');});
    on('#vocab-finish-notebook','click',async()=>{if(await saveSelf())navigate('notebook');});
    on('#vocab-self-report','input',e=>localStorage.setItem(draftKey,e.target.value));
    on('#vocab-save-self','click',saveSelf);
    if(done.length===current.ids.length)generateReport(attemptIds,current,panel);
  }
  function aiReportHTML(job){
    if(job?.status==='completed'&&job.result){const r=job.result;return `<p>${esc(r.summary)}</p>${[['做得好',r.strengths],['需要补',r.weaknesses],['下一步',r.nextSteps]].map(([label,items])=>items?.length?`<h4>${label}</h4><ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'').join('')}`;}
    if(['failed','cancelled','timed_out'].includes(job?.status))return `<p>AI 汇报暂未生成，答题记录已保存。</p><button class="btn line small" id="vocab-ai-retry">重试</button>`;
    return '<p class="vocab-report-status">正在根据答案和用时生成，可先继续下一板块。</p>';
  }
  async function generateReport(attemptIds,current,panel,{retry=false}={}){
    try{
      let job=await request('/api/ai/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'vocabReport',attemptIds,taskId:current.taskId,blockId:current.blockId,...(retry?{retry:true}:{})})});
      for(let count=0;count<180;count++){
        if(!panel.isConnected)return;
        panel.innerHTML=aiReportHTML(job);
        if(['completed','failed','cancelled','timed_out'].includes(job.status)){if(job.status!=='completed')panel.querySelector('#vocab-ai-retry')?.addEventListener('click',()=>generateReport(attemptIds,current,panel,{retry:true}));return;}
        await new Promise(resolve=>setTimeout(resolve,1000));job=await request('/api/ai/job?id='+encodeURIComponent(job.id));
      }
      if(panel.isConnected)panel.innerHTML='<p>仍在生成，可稍后到词汇笔记查看。</p>';
    }catch(error){if(panel.isConnected){panel.innerHTML='<p>AI 汇报暂未生成，答题记录已保存。</p><button class="btn line small" id="vocab-ai-retry">重试</button>';panel.querySelector('button').onclick=()=>generateReport(attemptIds,current,panel,{retry:true});}}
  }
  function supplementIds(mode='reading',limit=10){
    const today=state().today,old=(state().attempts||[]).filter(a=>a.subject==='japanese'&&a.topic==='vocab');
    const known=new Set(old.map(a=>a.questionId));
    const wrong=old.filter(a=>!a.correct).map(a=>a.questionId);
    const recalled=Object.values(state().blockRecords||{}).filter(b=>b.blockId==='recall').flatMap(b=>b.questionIds||[]);
    const due=rows().filter(a=>a.mode===mode&&(!a.correct||a.helped||a.reviewDue<=today)).map(a=>a.questionId).reverse();
    const priority=['vx290','vx291',...wrong,...due,...recalled,...known,...getBank().filter(q=>q.topic==='vocab').map(q=>q.id)];
    return [...new Set(priority)].filter(id=>supported(id,mode)).slice(0,limit);
  }
  function openSupplement(mode='reading',ids=supplementIds(mode),task=null,{fresh=false}={}){openBlock(task,{id:'supplement-'+mode+(fresh?'-'+crypto.randomUUID():''),title:LABELS[mode],mode,questionIds:ids},{supplement:true});}
  function openLegacy(task,block){
    const mode=block.id==='use'?'cloze':block.kind==='questions'?'meaning':'reading';const ids=mode==='reading'?(block.questionIds||[]):task.questionIds;
    openBlock(task,{id:block.id,returnBlockId:block.id,title:LABELS[mode],mode,questionIds:ids.filter(id=>supported(id,mode)).slice(0,mode==='cloze'?4:mode==='meaning'?40:10)},{supplement:true});
  }
  function todayPanel(){
    const old=state().attempts.filter(a=>a.topic==='vocab'),todayRows=rows().filter(a=>a.date===state().today),hasOld=old.length>0;
    if(!hasOld&&!rows().length)return '';
    const reading=todayRows.filter(r=>r.mode==='reading');
    return `<section class="card vocab-today"><div><h3>今天练：看字想起读音</h3>${reading.length?`<p>已练 ${reading.length} 次 · 独立答对 ${reading.filter(r=>r.correct&&!r.helped).length} 次</p>`:''}</div><div class="row"><button class="btn soft" id="vocab-supplement">补练 10 词</button><button class="linkbutton" id="vocab-open-notebook">词汇笔记</button></div></section>`;
  }
  function notebookView(){
    const distinct=new Set(rows().map(r=>r.questionId));
    return `<section class="card vocab-notebook"><div class="card-head"><h2>词汇笔记 · ${distinct.size} 词</h2><button class="linkbutton" id="vocab-notebook-practice">练一组读音</button></div><input id="vocab-note-search" class="text" value="${esc(search)}" placeholder="查词、假名或中文义" aria-label="查找词汇笔记"><div id="vocab-note-list">${notebookRows()}</div></section>${reportsHTML()}`;
  }
  function reportsHTML(){
    const reports=Object.values(state().vocabulary?.reports||{}).slice().reverse(),self=state().vocabulary?.selfReports||{};
    if(!reports.length&&!Object.keys(self).length)return '';
    const keys=[...new Set([...reports.map(r=>r.reportKey||r.key),...Object.keys(self)])].filter(Boolean);
    return `<section class="card vocab-notebook"><h2>词汇汇报</h2>${keys.map(key=>{const r=reports.find(r=>(r.reportKey||r.key)===key),own=self[key];return `<details class="vocab-saved-report"><summary>${esc(r?.date||r?.createdAt?.slice(0,10)||own?.date||'词汇练习')} · ${r?.attemptIds?.length||own?.attemptIds?.length||0} 次作答</summary><div class="vocab-report-grid"><section><h3>我的汇报</h3><p>${esc(own?.text||'尚未填写')}</p></section><section><h3>AI 汇报</h3>${aiReportHTML(r)}</section></div></details>`;}).join('')}</section>`;
  }
  function notebookRows(){
    const ids=[...new Set(rows().slice().reverse().map(r=>r.questionId))].filter(id=>{const c=getVocabContent(id);return !search||[c?.word,c?.reading,c?.meaning].join(' ').toLowerCase().includes(search.toLowerCase());});
    return ids.map(id=>{const c=getVocabContent(id),latest=rows().filter(r=>r.questionId===id).at(-1);return `<article class="vocab-note-row"><div><h3>${esc(c?.word||latest.word)} <span>${esc(c?.reading||latest.reading)}</span></h3><p>${esc(c?.meaning||latest.explanation)}</p><small>${latest.date} · ${LABELS[latest.mode]} · ${latest.correct&&!latest.helped?'独立答对':'待无提示验证'}</small></div><button class="btn line small" data-vocab-note="${esc(id)}">查看记录</button></article>`;}).join('')||'<p class="empty">完成一题新版词汇练习，就会自动出现在这里。</p>';
  }
  function openNote(id){
    const c=getVocabContent(id),history=rows().filter(r=>r.questionId===id).slice().reverse();if(!c||!history.length)return;
    stopClock();openModal('词汇笔记 · '+c.word,`<div class="vocab-stem">${esc(c.word)} <small>${esc(c.reading)}</small></div><p class="note">${esc(c.meaning)}</p><div class="row"><button class="btn soft small" data-vocab-word="${esc(id)}">听词音</button><button class="btn line small" data-vocab-example="${esc(id)}">听例句</button>${rateHTML()}</div><div class="vocab-history">${history.map(r=>`<article><div class="row between"><b>${r.date} · ${LABELS[r.mode]}</b><span>${formatTime(r.seconds||0)}</span></div><p>${r.correct?(r.helped?'提示后答对':'独立答对'):'本次未答对'} · 我的答案：${esc(r.skipped?'想不起来':r.mode==='reading'?r.response:answerText(c,r))}</p><p>标准答案：${esc(r.expected)}</p><p>${esc(r.explanation||'')}</p></article>`).join('')}</div><button class="btn" id="vocab-note-retry">${supported(id,'reading')?'再回忆一次读音':'换语境复习'}</button>`,true);
    bindAudio();on('#vocab-note-retry','click',()=>openSupplement(supported(id,'reading')?'reading':'cloze',[id],null,{fresh:true}));
  }
  function answerText(c,r){return (r.mode==='meaning'?c.meaningOptions:c.cloze?.options)?.[r.response]??r.response;}
  function openPractice(ids){
    const meanings=ids.filter(id=>supported(id,'meaning'));
    if(meanings.length)return openSupplement('meaning',meanings);
    return openSupplement('reading',ids.filter(id=>supported(id,'reading')));
  }
  function bind(){
    on('#vocab-supplement','click',()=>openSupplement());on('#vocab-open-notebook','click',()=>navigate('notebook'));on('#vocab-notebook-practice','click',()=>openSupplement());
    const bindNotes=()=>{for(const button of all('[data-vocab-note]'))button.onclick=()=>openNote(button.dataset.vocabNote);};bindNotes();
    on('#vocab-note-search','input',e=>{search=e.target.value;$('#vocab-note-list').innerHTML=notebookRows();bindNotes();});
  }
  return {openBlock,openSupplement,openLegacy,openPractice,todayPanel,notebookView,bind,stopClock};
}
