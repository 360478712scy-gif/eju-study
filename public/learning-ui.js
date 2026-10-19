import {SUBJECTS,TOPICS} from './content.js';
export function createLearningUI({getState,openModal,closeModal,act,esc,on,all,render,navigate,download}){
  let subject='all',search='',dateFilter='',stage=null;
  const state=()=>getState(),cards=()=>state().learningSession?.cards||[];
  const completed=id=>state().learning?.reviews?.some(r=>r.cardId===id&&r.date===state().today);
  const badge=rating=>({forgot:'忘记了',partial:'记得一部分',remembered:'能独立回忆'}[rating]||rating);
  function todayView(){
    const session=state().learningSession,done=cards().filter(c=>completed(c.id)).length;
    return `<div class="page-head"><div><h1>知识复习</h1></div><button class="btn" id="learning-next">${done===cards().length?'回看今天的卡片':'开始今天的复习'}</button></div><div class="learning-overview card"><strong>${done} / ${cards().length}</strong><span>今日知识卡 · 约 ${session?.estimatedMinutes||0} 分钟</span></div>${['math','physics','chemistry'].map(sub=>`<section class="learning-subject"><h2>${SUBJECTS[sub]}</h2><div class="grid2">${cards().filter(c=>c.subject===sub).map(c=>`<article class="card learning-tile"><span class="tag">${TOPICS[c.topic]||c.topic}</span><h3>${esc(c.title)}</h3><p>${esc(c.recallPrompt)}</p><div class="row between"><span>${completed(c.id)?'✓ 已存笔记':'待复习'}</span><button class="btn soft small" data-learn-card="${c.id}">${completed(c.id)?'回看笔记':'开始这张'}</button></div></article>`).join('')}</div></section>`).join('')}`;
  }
  function bind(){
    for(const el of all('[data-learn-card]'))el.onclick=()=>openCard(el.dataset.learnCard);
    on('#learning-next','click',()=>openCard((cards().find(c=>!completed(c.id))||cards()[0])?.id));
    for(const el of all('[data-notebook-entry]'))el.onclick=()=>openEntry(el.dataset.notebookEntry);
    on('#notebook-subject','change',e=>{subject=e.target.value;render();});
    on('#notebook-date','change',e=>{dateFilter=e.target.value;render();});
    let searchComposing=false;const refreshSearch=(value,n)=>{search=value;render();const f=document.querySelector('#notebook-search');if(f){f.focus();f.setSelectionRange(n,n);}};
    on('#notebook-search','compositionstart',()=>{searchComposing=true;});
    on('#notebook-search','compositionend',e=>{searchComposing=false;const value=e.target.value,n=e.target.selectionStart;queueMicrotask(()=>{if(document.querySelector('#notebook-search'))refreshSearch(value,n);});});
    on('#notebook-search','input',e=>{search=e.target.value;if(!searchComposing&&!e.isComposing)refreshSearch(search,e.target.selectionStart);});
    on('#notebook-export','click',()=>download('澄学笔记本-'+state().today+'.json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),learning:state().learning,vocabulary:state().vocabulary||{attempts:[],mastery:{}},practiceNotes:state().blockRecords,attempts:state().attempts.filter(a=>a.note||a.reflection)},null,2)));
  }
  function openCard(id,{force=false}={}){
    const c=cards().find(c=>c.id===id)||state().learning?.notebook?.find(e=>e.cardId===id)?.cardSnapshot;if(!c)return;
    const old=state().learning?.notebook?.find(e=>e.cardId===id&&e.date===state().today);
    if(old&&!force)return openEntry(old.id);
    const key='eju-learning-draft-'+state().today+'-'+id;
    let draft={};try{draft=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
    stage={card:c,key,startedAt:Date.now(),draft,requestId:crypto.randomUUID()};
    openModal(c.title,`<div class="learning-steps"><b>1 回忆</b><span>2 补学</span><span>3 练习</span></div><div class="learning-prompt">${esc(c.recallPrompt)}</div><form id="learning-recall-form"><div class="field"><label for="learning-recall">你的回忆</label><textarea id="learning-recall" required minlength="2" placeholder="想不起来可写“不记得”">${esc(draft.recallText||'')}</textarea></div><div class="field"><label for="learning-rating">回忆状态</label><select id="learning-rating">${['forgot','partial','remembered'].map(r=>`<option value="${r}" ${draft.recallRating===r?'selected':''}>${badge(r)}</option>`).join('')}</select></div><h3>术语词义</h3><div class="term-recall">${c.terms.map((t,i)=>`<label><b>${esc(t.ja)}</b><input class="text" data-term-recall="${i}" placeholder="写中文义／不认识" value="${esc(draft.termRecalls?.[i]||'')}"></label>`).join('')}</div><button class="btn" style="margin-top:20px">核对答案</button></form>`,true);
    const cache=()=>{stage.draft={...stage.draft,recallText:document.querySelector('#learning-recall').value,recallRating:document.querySelector('#learning-rating').value,termRecalls:all('[data-term-recall]').map(e=>e.value)};localStorage.setItem(key,JSON.stringify(stage.draft));};
    for(const el of all('#learning-recall-form textarea,#learning-recall-form input,#learning-recall-form select'))el.addEventListener('input',cache);
    on('#learning-recall-form','submit',e=>{e.preventDefault();cache();if(stage.draft.recallRating==='remembered')showCheck();else showLesson();});
  }
  function cardBody(c){return `<div class="learning-answer">${esc(c.answer)}</div><ul class="knowledge-points">${c.keyPoints.map(k=>`<li>${esc(k)}</li>`).join('')}</ul><div class="row pronunciation-caption"><span>日语合成发音</span><label>语速 <select data-pron-rate aria-label="日语发音速度"><option value="0.8">0.8 ×</option><option value="1" selected>1.0 ×</option><option value="1.2">1.2 ×</option></select></label></div><div class="terms-table">${c.terms.map(t=>`<div><ruby>${esc(t.ja)}<rt>${esc(t.reading)}</rt></ruby><strong>${esc(t.zh)}</strong><button type="button" class="pron-term-button" data-pron-term="${esc(t.ja)}" aria-label="听${esc(t.ja)}的日语发音">听发音</button><p>${esc(t.context)}</p></div>`).join('')}</div><details class="worked-example"><summary>例题：${esc(c.workedExample.prompt)}</summary><ol>${c.workedExample.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><div class="formula">${esc(c.workedExample.answer)}</div></details><div class="note warm"><strong>易错区别</strong><ul>${c.pitfalls.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>`;}
  function showLesson(){
    const c=stage.card,d=stage.draft;
    openModal(c.title,`<div class="learning-steps"><span>1 回忆 ✓</span><b>2 补学</b><span>3 练习</span></div>${cardBody(c)}<div class="row" style="margin-top:24px"><button class="btn" id="learning-check">开始练习</button></div>`,true);
    if(d.recallRating!=='remembered')document.querySelector('.worked-example').open=true;
    on('#learning-check','click',showCheck);
  }
  function showCheck(){
    const c=stage.card;
    openModal('练习 · '+c.title,`<div class="learning-steps"><span>1 回忆 ✓</span><span>2 补学 ✓</span><b>3 练习</b></div><div class="learning-prompt">${esc(c.check.prompt)}</div><form id="learning-check-form"><div class="learning-options">${c.check.options.map((o,i)=>`<label><input type="radio" name="checkAnswer" value="${i}" required><span>${esc(o)}</span></label>`).join('')}</div><div class="field"><label for="learning-note">笔记（可选）</label><textarea id="learning-note" placeholder="写下要记住的一点">${esc(stage.draft.userNote||'')}</textarea></div><div class="row"><button class="btn">提交并存笔记</button><button type="button" id="learning-review-again" class="btn line">看讲解</button></div></form>`,true);
    on('#learning-note','input',e=>{stage.draft.userNote=e.target.value;localStorage.setItem(stage.key,JSON.stringify(stage.draft));});
    on('#learning-review-again','click',()=>{stage.draft.revisited=true;showLesson();});
    on('#learning-check-form','submit',async e=>{
      e.preventDefault();const selected=Number(new FormData(e.target).get('checkAnswer'));
      const termText=c.terms.map((t,i)=>`${t.ja}：${stage.draft.termRecalls?.[i]||'未回忆'}`).join('；');
      await act({type:'learningAnswer',cardId:c.id,recallText:stage.draft.recallText+'\n术语回忆：'+termText,recallRating:stage.draft.revisited?'partial':stage.draft.recallRating,checkAnswer:selected,userNote:document.querySelector('#learning-note').value,seconds:Math.round((Date.now()-stage.startedAt)/1000),requestId:stage.requestId});
      localStorage.removeItem(stage.key);const entry=state().learning.notebook.find(e=>e.cardId===c.id&&e.date===state().today);stage=null;openEntry(entry.id,true);
    });
  }
  function openEntry(id,justSaved=false){
    const e=state().learning?.notebook?.find(e=>e.id===id);if(!e)return;const c=e.cardSnapshot;
    openModal((justSaved?'已存入笔记本 · ':'')+e.title,`<div class="row"><span class="tag">${e.date}</span><span class="tag">${badge(e.recallRating)}</span><span class="tag">${e.check.correct?'应用题通过':'待订正'}</span></div><div class="note ${e.check.correct?'':'warm'}" style="margin-top:18px">${esc(c.check.explanation)}<br>正确选项：${esc(c.check.options[c.check.answer])}</div><details class="notebook-source" ${justSaved?'':'open'}><summary>知识点、术语与例题</summary>${cardBody(c)}</details><details style="margin:18px 0"><summary>我的原始回忆与验证</summary><p class="preserve-lines">${esc(e.recallText)}</p><p>${esc(c.check.prompt)}</p><p>我的选择：${esc(c.check.options[e.check.selectedAnswer])}</p></details><form id="notebook-edit"><div class="field"><label for="notebook-note">我的笔记</label><textarea id="notebook-note">${esc(localStorage.getItem('eju-notebook-draft-'+id)??e.userNote??'')}</textarea></div><div class="row"><button class="btn soft">保存补充</button><button type="button" class="btn line" id="notebook-relearn">再复习一次</button><button type="button" class="btn" id="learning-continue">${cards().some(c=>!completed(c.id))?'下一张':'返回今日复习'}</button></div></form>`,true);
    on('#notebook-note','input',event=>localStorage.setItem('eju-notebook-draft-'+id,event.target.value));
    on('#notebook-edit','submit',async event=>{event.preventDefault();await act({type:'learningNote',entryId:id,userNote:document.querySelector('#notebook-note').value});localStorage.removeItem('eju-notebook-draft-'+id);openEntry(id);});
    on('#notebook-relearn','click',()=>openCard(c.id,{force:true}));
    on('#learning-continue','click',()=>{const next=cards().find(c=>!completed(c.id));if(next)openCard(next.id);else{closeModal();navigate('learning');}});
  }
  function notebookView(){
    const entries=(state().learning?.notebook||[]).filter(e=>(subject==='all'||e.subject===subject)&&(!dateFilter||e.date===dateFilter)&&(!search||JSON.stringify([e.title,e.userNote,e.cardSnapshot.terms,e.cardSnapshot.keyPoints,e.recallText]).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>b.date.localeCompare(a.date));
    const practice=Object.values(state().blockRecords||{}).filter(e=>(!dateFilter||e.date===dateFilter)&&(!search||e.text.includes(search))&&(subject==='all'||state().plans[e.date]?.tasks.find(t=>t.id===e.taskId)?.subject===subject));
    return `<div class="page-head"><div><h1>我的笔记本</h1></div><button class="btn line" id="notebook-export">导出笔记备份</button></div><div class="card"><div class="notebook-toolbar"><input id="notebook-search" class="text" value="${esc(search)}" placeholder="查知识点、日文术语或自己的笔记" aria-label="查找笔记"><select id="notebook-subject" aria-label="笔记科目"><option value="all">全部科目</option>${Object.entries(SUBJECTS).map(([k,v])=>`<option value="${k}" ${subject===k?'selected':''}>${v}</option>`).join('')}</select><input id="notebook-date" class="text" type="date" value="${dateFilter}" aria-label="笔记日期"></div>${entries.length?entries.map(e=>`<article class="notebook-row"><div><span class="tag">${e.date} · ${SUBJECTS[e.subject]}</span><h3>${esc(e.title)}</h3><p>${esc(e.userNote||e.cardSnapshot.keyPoints[0])}</p><span class="small muted">${e.cardSnapshot.terms.map(t=>esc(t.ja)).join(' / ')} · ${e.check.correct?'验证通过':'待再练'}</span></div><button class="btn soft small" data-notebook-entry="${e.id}">打开笔记</button></article>`).join(''):'<div class="empty">暂无符合条件的笔记。</div>'}</div><details class="card" style="margin-top:20px"><summary>题目订正与词汇回忆 · ${practice.length} 条</summary>${practice.sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<article class="list-item"><h3>${e.date} · ${esc(state().plans[e.date]?.tasks.find(t=>t.id===e.taskId)?.title||e.blockId)}</h3><p class="preserve-lines">${esc(e.text)}</p></article>`).join('')||'<p>暂无记录。</p>'}</details>`;
  }
  return {todayView,notebookView,bind,openCard,openEntry};
}
