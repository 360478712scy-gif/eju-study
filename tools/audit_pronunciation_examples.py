#!/usr/bin/env python3
"""Read-only acoustic contrasts for the 35 text-reviewed high-risk example sentences.
Not listening or transcription. A match may reflect dictionary auto-correction.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib, importlib.util, itertools, json, subprocess, threading
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/pronunciation-audit-20261006'
AUDIO=OUT/'example-audio'; AUDIO.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('acoustic',ROOT/'tools/audit_pronunciation_acoustics.py')
acoustic=importlib.util.module_from_spec(spec);spec.loader.exec_module(acoustic)
risks=json.loads((OUT/'text-review.json').read_text())['exampleRisks']
WRONG={
 'vx007':{'十分':['じゅうぶん']},'vx008':{'十分':['じゅっぷん']},
 'vx103':{'十分':['じゅっぷん']},'vx197':{'十分':['じゅっぷん']},
 'vx128':{'十回':['じゅうかい']},'vx133':{'一分':['いちぶん','いちふん']},
 'vx290':{'四人':['よんにん','しにん']},'vx153':{'一人暮らし':['いちにんぐらし']},
 'vx180':{'一社':['いちしゃ'],'市場':['いちば']},'vx194':{'市場':['いちば']},
 'vx187':{'生物':['なまもの']},'vx189':{'生物':['なまもの'],'一種類':['いちしゅるい']},
 'vx195':{'生物':['なまもの']},'vx190':{'生物多様性':['なまものたようせい']},
 'vx207':{'分別':['ふんべつ']},'vx124':{'試薬':['しゃく']},
 'vx268':{'一週間':['いちしゅうかん']},'vx280':{'人手':['じんしゅ']},
}
samples={}; groups=[]
def sample(text):
 key=hashlib.sha256(text.encode()).hexdigest()[:24];samples[key]=text;return key
for risk in risks:
 sentence=risk['example'];variants=[]
 spans=risk['span'].split('・');readings=risk['expected'].split('・')
 assert len(spans)==len(readings),(risk['id'],spans,readings)
 for choices in itertools.product(*(r.split('／') for r in readings)):
  for script in ['hiragana','katakana']:
   text=sentence
   for span,reading in zip(spans,choices):text=text.replace(span,acoustic.kata(reading) if script=='katakana' else reading)
   variants.append({'kind':'expected-'+script,'replacements':dict(zip(spans,choices)),'sample':sample(text)})
 for span,readings in WRONG.get(risk['id'],{}).items():
  for reading in readings:variants.append({'kind':'deliberately-wrong','span':span,'reading':reading,'sample':sample(sentence.replace(span,reading))})
 groups.append({**risk,'baseline':sample(sentence),'variants':variants})

local=threading.local();workers=[];lock=threading.Lock()
def render(item):
 key,text=item;wav=AUDIO/(key+'.wav')
 if wav.exists():return
 if not hasattr(local,'process'):
  local.process=subprocess.Popen([str(OUT/'render_batch')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
  with lock:workers.append(local.process)
 p=local.process;aiff=AUDIO/(key+'.aiff')
 p.stdin.write(json.dumps({'text':text,'path':str(aiff)},ensure_ascii=False)+'\n');p.stdin.flush()
 result=json.loads(p.stdout.readline());assert result['ok'],result
 subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16',str(aiff),str(wav)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 aiff.unlink()
try:
 with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(render,samples.items()))
finally:
 for p in workers:p.stdin.close();p.wait(timeout=10)

for group in groups:
 for variant in group['variants']:
  variant['comparison']=acoustic.compare(AUDIO/(group['baseline']+'.wav'),AUDIO/(variant['sample']+'.wav'))
 group['status']='contrast-audited-not-listened'
report={'scope':{'examples':len(groups),'waveforms':len(samples)},'humanListening':False,'phoneticTranscription':False,
 'limits':'Only targeted spans are contrasted. Dictionary normalization and prosody prevent these metrics from certifying sentence pronunciation.',
 'groups':groups,'samples':samples}
(OUT/'example-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for g in groups:
 strong=[v for v in g['variants'] if v['comparison']['nearIdentical']]
 print(g['id'],g['span'],[(v['kind'],v.get('reading') or v['replacements']) for v in strong])
print('Saved',OUT/'example-review.json',report['scope'])
