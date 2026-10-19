import {createCoach} from './ai/coach.mjs';
import {REWARDS,achievements} from './rewards.mjs';
import {enrichBank,reviewQueue} from './public/transfer.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {QUESTIONS} from './public/content.js';
import {initialState,ensurePlan,buildPlan,applyAction,makeReport,today,validDate,stats,validateCoach} from './engine.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.EJU_DATA_DIR||path.join(root,'data');fs.mkdirSync(data,{recursive:true});
const file=path.join(data,'state.json');
let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):initialState();
if(state.version!==1||!state.records||!state.plans)throw new Error('学习记录格式异常，原文件已保留；请从data/backups恢复。');
const official=fs.existsSync(path.join(root,'public/official.json'))?JSON.parse(fs.readFileSync(path.join(root,'public/official.json'),'utf8')):[];
const bank=enrichBank([...official,...QUESTIONS]);
function save(next){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});if(fs.existsSync(file)){const backups=path.join(data,'backups');fs.mkdirSync(backups,{recursive:true});fs.copyFileSync(file,path.join(backups,`state-${Date.now()}-${next.revision}.json`));const entries=fs.readdirSync(backups).sort();for(const f of entries.slice(0,-30))fs.unlinkSync(path.join(backups,f));}fs.renameSync(tmp,file);state=next;}
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function getState(){const d=today();if(!state.plans[d]){let next=structuredClone(state);ensurePlan(next,bank,d);save(next);}return {...state,today:d,stats:stats(state,bank,d),reviewQueue:reviewQueue(state,bank,d),achievements:achievements(state),rewardCatalog:REWARDS};}
const coach=createCoach({root,data,getState,bank});
const port=Number(process.env.PORT||18763);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ico':'image/x-icon','.jpg':'image/jpeg','.mp4':'video/mp4'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!['127.0.0.1','localhost','[::1]'].some(h=>req.headers.host===`${h}:${port}`))return send(res,403,{error:'仅允许本机访问'});
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{app:'eju-study',version:1});
  if(req.method==='GET'&&url.pathname==='/api/ai/status')return send(res,200,coach.status());
  if(req.method==='GET'&&url.pathname==='/api/ai/job')return send(res,200,coach.get(url.searchParams.get('id')||''));
  if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,getState());
  if(req.method==='GET'&&url.pathname==='/api/questions')return send(res,200,bank);
  if(req.method==='GET'&&url.pathname==='/api/plan'){const date=url.searchParams.get('date');if(!validDate(date)||date<'2026-10-06'||date>'2026-11-08')throw new Error('日期超出备考范围');return send(res,200,state.plans[date]||buildPlan(state,bank,date));}
  if(req.method==='GET'&&url.pathname==='/api/report'){const date=url.searchParams.get('date')||today();if(!validDate(date))throw new Error('日期无效');return send(res,200,{text:makeReport(state,bank,date)});}
  if(req.method==='GET'&&url.pathname==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="eju-study-backup.json"');return send(res,200,state);}
  if(req.method==='POST'&&['/api/action','/api/ai/start','/api/ai/cancel'].includes(url.pathname)){
   if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return send(res,403,{error:'请求来源不被允许'});
   if(!(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'需要JSON请求'});
   let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>100000)throw new Error('内容过大');body+=chunk;}
   const action=JSON.parse(body);
   if(url.pathname==='/api/ai/start')return send(res,202,coach.start(action));
   if(url.pathname==='/api/ai/cancel')return send(res,200,coach.cancel(action.id));
   if(action.type==='previewCoach')return send(res,200,{plan:validateCoach(action.plan)});
   const next=structuredClone(state);applyAction(next,bank,action);save(next);return send(res,200,getState());
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'请求方法不支持'});
  let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';const target=path.resolve(root,'public','.'+name),publicRoot=path.join(root,'public')+path.sep;if(!target.startsWith(publicRoot)||!fs.existsSync(target)||!fs.statSync(target).isFile())return send(res,404,{error:'资源不存在'});
  const st=fs.statSync(target),headers={'Content-Type':mime[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
  const range=req.headers.range;if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});return res.end();}const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),st.size-1):st.size-1;if(start>=st.size||end<start){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});return res.end();}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':end-start+1});if(req.method==='HEAD')return res.end();return fs.createReadStream(target,{start,end}).pipe(res);}
  res.writeHead(200,{...headers,'Content-Length':st.size});if(req.method==='HEAD')return res.end();fs.createReadStream(target).pipe(res);
 }catch(err){send(res,400,{error:err.message||'操作未完成，记录保持不变'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`澄学 EJU http://127.0.0.1:${port}  ${today()}  ${bank.length} questions`));
