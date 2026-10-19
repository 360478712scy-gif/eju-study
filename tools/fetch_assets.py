import subprocess, urllib.request, urllib.parse, json, re, pathlib, concurrent.futures, hashlib
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]; PUB=ROOT/'public'
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.href=None;self.label=''
 def handle_starttag(self,t,a):
  if t=='a':self.href=dict(a).get('href');self.label=''
 def handle_data(self,d):
  if self.href:self.label+=d
 def handle_endtag(self,t):
  if t=='a' and self.href:self.links.append((self.href,self.label.strip()));self.href=None

def get(url):
 return subprocess.check_output(['curl','-fsSL','--retry','2','--max-time','90',url])
assets=[]
for year in ['2021_1','2020_2','2018_1']:
 source=f'https://www.jasso.go.jp/ryugaku/eju/examinee/pastpaper_sample/pastpaper_{year}.html'
 parser=Links();parser.feed(get(source).decode())
 seen=set()
 for href,label in parser.links:
  url=urllib.parse.urljoin(source,href)
  if url in seen:continue
  seen.add(url)
  kind=None
  if '.pdf' in href:
   if label in ['理科（日本語版）*','理科（日本語版）※','理科（日本語版）']:kind='science'
   elif label in ['数学（日本語版）*','数学（日本語版）※','数学（日本語版）']:kind='math'
   elif label=='正解':kind='answers'
   elif label.startswith('日本語（記述'):kind='japanese'
   elif label in ['聴読解問題スクリプト','聴解問題スクリプト']:kind='script-'+str(len(assets))
  if kind:
   assets.append({'id':f'{year}-{kind}','title':f'{year.replace("_","年第")}回 · {label.rstrip("*※")}','subject':kind,'url':url,'source':source,'path':f'/assets/papers/{year}-{kind}.pdf','license':'© JASSO。官方公开原件，仅在本机供个人学习；公开版本可能缺题。旧题需配合2026考纲。'})
  if year=='2018_1' and '.wav' in href and re.match(r'聴解\d+番|聴読解4番',label):
   n=re.search(r'\d+',label).group()
   assets.append({'id':f'2018-audio-{n}','title':f'2018年第1回 · {label.split(" (")[0]}','subject':'audio','url':url,'source':source,'path':f'/assets/listening/official-{n}.wav','license':'© JASSO。官方公开音频，原文件未改动，仅供个人学习。'})
for i in ['01','02','03']:
 title='Meditation Impromptu '+i
 assets.append({'id':'music-'+i,'title':title,'subject':'music','url':'https://incompetech.com/music/royalty-free/mp3-royaltyfree/'+urllib.parse.quote(title)+'.mp3','path':f'/assets/music/meditation-{i}.mp3','source':'https://incompetech.com/music/royalty-free/index.html?Search=Search&SearchTitle=Meditation%20Impromptu','license':'Kevin MacLeod (incompetech.com) — Creative Commons Attribution 4.0, https://creativecommons.org/licenses/by/4.0/ . Original recording; no changes.'})
def download(a):
 try:
  p=PUB/a['path'].lstrip('/');p.parent.mkdir(parents=True,exist_ok=True)
  data=p.read_bytes() if p.exists() else get(a['url'])
  if a['path'].endswith('.pdf') and not data.startswith(b'%PDF'):raise ValueError('not PDF')
  p.write_bytes(data);a['bytes']=len(data);a['sha256']=hashlib.sha256(data).hexdigest();a['available']=True
 except Exception as e:a['available']=False;a['error']=str(e)
 return a
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:assets=list(ex.map(download,assets))
(PUB/'assets/manifest.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2))
print(json.dumps([{'id':a['id'],'ok':a['available'],'bytes':a.get('bytes'),'error':a.get('error')} for a in assets],ensure_ascii=False))
