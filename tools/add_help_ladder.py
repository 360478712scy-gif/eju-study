from pathlib import Path
p=Path('public/content.js');s=p.read_text().replace("export const GUIDES=[", """export const GUIDES=[
{id:'askai',subject:'all',title:'遇到不会的：让 AI 给提示，不替你思考',summary:'尝试 → 提示 → 闭卷复述 → 次日重做',steps:['先独立尝试约90秒，写出已知、所求、用过的公式和卡住的一步。已经在纸上认真试过就不必机械等时间。','先问“我的这一步为什么不成立”或“下一步该观察哪个条件”，不要一开始索要整题答案。','每次只看一级提示，关闭提示后自己继续写两步。仍卡住，再问下一层。','如果最终看了完整解答，合上后用自己的话写关键转折，再独立重做；照抄不算复述。','第二天换成无提示作答。提示后正确单独记录，只有后续独立正确才累积掌握次数。','AI的解释也可能出错。官方真题先以官方答案核对；有冲突时把题号、原图和过程一起发来。'],example:'提问模板：我知道____，尝试了____，卡在____。请先判断我的思路，最多给一个提示，不要直接给最终答案。',trap:'一次看完整解析后产生“我会了”的熟悉感；把收藏和抄写当成检索能力。'},""");p.write_text(s)
p=Path('engine.mjs');s=p.read_text();s=s.replace("const streak=correct?prior.streak+1:0;const due=addDays(date,correct?", "const independent=!a.hinted;const streak=correct&&independent?prior.streak+1:0;const due=addDays(date,correct&&independent?")
s=s.replace("selfGrade:!!q.selfGrade", "selfGrade:!!q.selfGrade,hinted:!!a.hinted,reflection:''")
s=s.replace("if(correct&&prior.wrong)award", "if(correct&&independent&&prior.wrong)award")
s=s.replace("else if(a.type==='report'){", "else if(a.type==='reflection'){const item=s.attempts.find(x=>x.id===a.attemptId);assert(item,'找不到这次作答');assert(typeof a.text==='string'&&a.text.trim().length>=5&&a.text.length<=3000,'请用自己的话至少写5个字');item.reflection=a.text;}\n else if(a.type==='report'){")
s=s.replace("q=>state.mastery", "q=>state.mastery")
s=s.replace("\\n\\n主观汇报：", "\\n\\n提示使用与吸收：\\n${todayAnswers.filter(a=>a.hinted||a.reflection).map(a=>`${a.questionId}：${a.hinted?'提示后作答':'独立作答'}；闭卷复述：${a.reflection||'尚未填写'}`).join('\\n')||'暂无提示/复述记录'}\\n\\n主观汇报：")
p.write_text(s)
p=Path('public/app.js');s=p.read_text();s=s.replace("elapsed:{},startedAt:","elapsed:{},hints:{},helpDraft:{},startedAt:")
s=s.replace("seconds:session.elapsed?.[q.id]||0,", "seconds:session.elapsed?.[q.id]||0,hinted:!!session.hints?.[q.id],")
s=s.replace("先独立作答。提交后显示答案、原文与复盘提示。", "先独立作答。卡住时先尝试提示；看懂之后再闭卷复述。")
s=s.replace("<div class=\"divider\"></div><div class=\"row\"><button class=\"btn line small\" id=\"qprev\"", "${!answered?'<div class=\"divider\"></div><button class=\"btn line\" id=\"help-open\">卡住了 · 先给我提示</button><div id=\"help-area\"></div>':'<div class=\"divider\"></div><button class=\"btn soft\" id=\"recall-open\">遮住解析，自己复述</button><div id=\"recall-area\"></div>'}<div class=\"divider\"></div><div class=\"row\"><button class=\"btn line small\" id=\"qprev\"")
s=s.replace("on('#audio-rate','change'", "on('#help-open','click',()=>helpLadder(q));on('#recall-open','click',()=>recallPanel(q));on('#audio-rate','change'")
s=s.replace("${response.correct?'已保存本次作答。':'已收进错题本，明天再回忆一次。'}", "${response.correct?(response.hinted?'提示后做对：明天再无提示重做，暂不计为独立掌握。':'已保存本次独立作答。'):'已收进错题本，明天再回忆一次。'}")
s=s.replace("state.mastery[q.id]?.wrong>0", "(state.mastery[q.id]?.wrong>0||state.attempts.some(a=>a.questionId===q.id&&a.hinted))")
s=s.replace("bank.filter(q=>state.mastery[q.id]?.wrong)", "bank.filter(q=>state.mastery[q.id]?.wrong||state.attempts.some(a=>a.questionId===q.id&&a.hinted))")
s += r'''
function helpLadder(q){
 $('#help-area').innerHTML=`<div class="note warm" style="margin-top:12px">先用约90秒尝试。如果你已在纸上做过，直接写出卡点，不必等计时。</div><div class="field" style="margin-top:12px"><label for="help-attempt">我知道什么？尝试了什么？具体卡在哪里？</label><textarea id="help-attempt" placeholder="已知…，要求…，我用了…，但…">${esc(session.helpDraft?.[q.id]||'')}</textarea></div><div class="row"><button class="btn soft small" id="hint-one">提示 1 · 看条件</button><button class="btn line small" id="hint-two" disabled>提示 2 · 找工具</button></div><div id="hint-text"></div><button id="ask-ai-card" class="linkbutton" style="margin-top:12px">仍不会，生成只问下一步的提问卡</button>`;
 const capture=()=>{const t=$('#help-attempt').value.trim();if(t.length<8)throw Error('先简短写下自己的尝试与卡点（至少8个字）。');session.helpDraft ||= {};session.helpDraft[q.id]=t;session.hints ||= {};session.hints[q.id]=true;saveSession();return t;};
 on('#hint-one','click',()=>{capture();$('#hint-text').innerHTML='<div class="note" style="margin-top:12px">只处理当前所求：圈出限制条件、单位、正负方向或否定词。数学先说出当前空格需要哪个中间量，听力先区分最初提案和最终决定。</div>';$('#hint-two').disabled=false;});
 on('#hint-two','click',()=>{capture();const g=GUIDES.find(g=>g.id===q.topic);$('#hint-text').innerHTML=`<div class="note" style="margin-top:12px">${esc(g?.steps[0]||'沿题目给出的变量与已知结论列出一条关系。先完成一个能确认的小步骤。')}<br>现在收起提示，自己向下写两步。</div>`;});
 on('#ask-ai-card','click',async()=>{const t=capture();const text=`我在准备EJU，有高考基础，主要是知识遗忘和题型不适应。\n题目：${q.title||q.prompt}\n编号：${q.id}\n来源：${q.sourceUrl||q.source}${q.page?'，PDF第'+q.page+'页':''}\n我的尝试和卡点：${t}\n请先检查我的思路，只给一个下一步提示，不要直接提供完整解答或最终答案。等我回复尝试后，再决定是否给下一层提示。最后请让我闭卷复述关键转折。`;await navigator.clipboard.writeText(text);toast('提问卡已复制。粘贴到本聊天；不会自动发送。');});
}
function recallPanel(q){
 $$('.explanation,details,.question-img').forEach(e=>e.style.display='none');$('#recall-area').innerHTML=`<p class="small muted" style="margin:12px 0">解析和题图暂时遮住。用自己的话写：关键条件 → 关键转折 → 为什么这样做。然后试着在纸上重做。</p><div class="field"><textarea id="recall-text" placeholder="这道题真正的关键是…，因为…">${esc(session.responses[q.id]?.reflection||'')}</textarea></div><button id="save-recall" class="btn small">保存闭卷复述</button><button id="restore-explanation" class="linkbutton" style="margin-left:10px">再次核对解析</button>`;
 on('#save-recall','click',async()=>{const text=$('#recall-text').value;await act({type:'reflection',attemptId:session.responses[q.id].id,text});session.responses[q.id]=state.attempts.find(a=>a.id===session.responses[q.id].id);saveSession();toast('复述已保存。明天无提示重做，检查是否真正吸收。');});
 on('#restore-explanation','click',()=>{$$('.explanation,details,.question-img').forEach(e=>e.style.display='');});
}
'''
p.write_text(s)
