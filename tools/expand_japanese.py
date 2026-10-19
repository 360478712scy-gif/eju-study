from pathlib import Path
import re,subprocess,json,concurrent.futures,hashlib,wave
from urllib.parse import urljoin
import fitz
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/assets/japanese-expanded';OUT.mkdir(parents=True,exist_ok=True)
years=['2017_2','2017_1','2016_2','2016_1']
resources=[]
def fetch(row):
 p=OUT/row['filename']
 if not p.exists():subprocess.run(['curl','-fsSL','--retry','2','--max-time','150',row['url'],'-o',str(p)],check=True)
 row['path']='/assets/japanese-expanded/'+p.name;row['sha256']=hashlib.sha256(p.read_bytes()).hexdigest();row['bytes']=p.stat().st_size
 return row
for year in years:
 url='https://www.jasso.go.jp/ryugaku/eju/examinee/pastpaper_sample/pastpaper_'+year+'.html';html=Path('/tmp/eju-'+year+'.html').read_text();links=list(dict.fromkeys(urljoin(url,u) for u in re.findall(r'href="([^"]+)"',html)))
 def choose(pattern):return next(x for x in reversed(links) if re.search(pattern,x))
 for kind,pat in [('question',r'question_jafl(?:_1)?\.pdf$'),('answer',year+r'answer(?:5|_1)?\.pdf$'),('script',r'script_jaf_l(?:_1)?\.pdf$')]:
  resources.append(dict(year=year,kind=kind,url=choose(pat),filename=f'{year}-{kind}.pdf',source=url))
 # Hearing-only clips: no diagram matching ambiguity. Unauthorized gaps stay excluded.
 for link in links:
  match=re.search(r'/\d{3}al(\d+)(?:_\d+)?\.wav$',link)
  if match:
   number=int(match[1]);existing=[r for r in resources if r['year']==year and r['kind']=='audio' and r['number']==number]
   if existing:continue
   resources.append(dict(year=year,kind='audio',number=number,url=link,filename=f'{year}-l{number}.wav',source=url))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for i,r in enumerate(ex.map(fetch,resources),1):
  if i%10==0:print('Downloaded',i,'/',len(resources),flush=True)
(OUT/'sources.json').write_text(json.dumps(resources,ensure_ascii=False,indent=2))
for year in years:
 for kind in ['question','answer','script']:
  d=fitz.open(OUT/f'{year}-{kind}.pdf');p=OUT/f'{year}-{kind}-text.txt';p.write_text('\n'.join(f'\n=== PAGE {i+1} ===\n'+page.get_text() for i,page in enumerate(d)))
 print(year,'PDFs extracted',flush=True)
